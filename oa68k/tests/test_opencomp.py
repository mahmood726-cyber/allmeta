# -*- coding: utf-8 -*-
"""Checks on the open-access comparator frame (oa68k/OPEN-COMPARATOR-PROTOCOL.md).

Each check_* function takes the list of parsed JSONL rows and returns a list of
failure strings. Empty list == pass.

A CHECK NOT WATCHED TO FAIL IS NOT A CHECK. Every check here has its violation
planted into the REAL emitted frame by oa68k/opencomp_plant.py, watched to fail,
then restored and re-asserted. The pytest cases below are the synthetic mirror of
that, so the checks stay live in CI after the planting transcript is history.
"""
import io
import json
import os

import pytest

PARTITION = ("EXCLUDED_DESIGN", "EXCLUDED_NMA", "EXCLUDED_NO_ENUMERATION",
             "UNRETRIEVABLE", "EXAMINED")
NOT_RETRIEVED = ("NOT_RETRIEVED_NO_FULLTEXT_RECORD", "NOT_RETRIEVED_BLOCKED",
                 "NOT_RETRIEVED_NETWORK_ERROR", "NOT_ATTEMPTED")
CONTENT_FIELDS = ("enumerates_included_studies", "enumerated_count",
                  "enumeration_via", "prospero_registered", "match_status",
                  "matched_topics", "overlap_detail")

FRAME = os.environ.get("OPENCOMP_FRAME",
                       r"F:\claude-temp\pend\opencomp_frame_cardiology.jsonl")


def load(path=None):
    path = path or FRAME
    with io.open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


# ------------------------------------------------------------------ the checks
def check_partition(rows):
    """Every row sits in exactly one partition cell and the cells sum to candidates."""
    bad = []
    counts = {}
    for r in rows:
        d = r.get("disposition")
        if d not in PARTITION:
            bad.append("pmid %s: disposition %r outside the partition" % (r.get("pmid"), d))
        counts[d] = counts.get(d, 0) + 1
    total = sum(counts.get(k, 0) for k in PARTITION)
    if total != len(rows):
        bad.append("partition sums to %d but the file holds %d rows" % (total, len(rows)))
    prov = rows[0].get("provenance", {}) if rows else {}
    declared = prov.get("partition_counts") or {}
    for k in PARTITION:
        if declared.get(k, 0) != counts.get(k, 0):
            bad.append("provenance.partition_counts[%s]=%s but the file holds %s"
                       % (k, declared.get(k), counts.get(k, 0)))
    return bad


def check_provenance_in_every_row(rows):
    """Every row carries the FULL provenance, so any subset survives on its own."""
    bad = []
    if not rows:
        return ["no rows"]
    keys = set(rows[0].get("provenance") or {})
    if not keys:
        return ["row 0 carries no provenance"]
    for r in rows:
        p = r.get("provenance")
        if not p:
            bad.append("pmid %s: no provenance" % r.get("pmid"))
        elif set(p) != keys:
            bad.append("pmid %s: provenance keys differ (missing %s)"
                       % (r.get("pmid"), sorted(keys - set(p))[:4]))
    return bad


def check_no_empty_strings(rows):
    """null means UNOBTAINABLE. '' is never a value in this file."""
    bad = []

    def walk(o, path, pmid):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, "%s.%s" % (path, k), pmid)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, "%s[%d]" % (path, i), pmid)
        elif o == "":
            bad.append("pmid %s: empty string at %s" % (pmid, path))

    for r in rows:
        walk(r, "", r.get("pmid"))
    return bad


def check_absence_requires_retrieval(rows):
    """A row we never read may not carry ANY claim about the paper's content."""
    bad = []
    for r in rows:
        st = (r.get("retrieval") or {}).get("status")
        if st not in NOT_RETRIEVED:
            continue
        if (r.get("retrieval") or {}).get("may_speak_about_content"):
            bad.append("pmid %s: %s but may_speak_about_content is true" % (r.get("pmid"), st))
        for f in CONTENT_FIELDS:
            if r.get(f) is not None:
                bad.append("pmid %s: %s but %s=%r -- an absence claim on a paper we "
                           "never read" % (r.get("pmid"), st, f, r.get(f)))
    return bad


def check_licence_is_not_retrieval(rows):
    """licence_open and retrieval.status are separate facts and must not collapse."""
    bad = []
    for r in rows:
        st = (r.get("retrieval") or {}).get("status")
        if st in NOT_RETRIEVED and st != "NOT_ATTEMPTED" and r.get("disposition") == "EXAMINED":
            bad.append("pmid %s: %s yet disposition EXAMINED -- a paper we did not get "
                       "counted as one we read" % (r.get("pmid"), st))
        if st and st.startswith("RETRIEVED") and not r.get("pmcid"):
            bad.append("pmid %s: retrieval %s with no pmcid to have fetched"
                       % (r.get("pmid"), st))
        if r.get("licence_open") and st == "NOT_ATTEMPTED" and r.get("disposition") == "UNRETRIEVABLE":
            bad.append("pmid %s: UNRETRIEVABLE but retrieval was never attempted"
                       % r.get("pmid"))
    prov = rows[0].get("provenance", {}) if rows else {}
    declared = prov.get("licence_open_but_unretrievable")
    actual = sum(1 for r in rows
                 if r.get("licence_open")
                 and (r.get("retrieval") or {}).get("status") in NOT_RETRIEVED
                 and (r.get("retrieval") or {}).get("status") != "NOT_ATTEMPTED")
    if declared != actual:
        bad.append("provenance.licence_open_but_unretrievable=%s but the file holds %d"
                   % (declared, actual))
    return bad


def check_denominator_composition_recorded(rows):
    """A coverage fraction needs its denominator's COMPOSITION on the record."""
    bad = []
    prov = rows[0].get("provenance", {}) if rows else {}
    for k in ("denominator_name", "denominator_composition", "denominator_value",
              "denominator_per_topic_query_hits", "context_count_not_a_denominator"):
        if not prov.get(k):
            bad.append("provenance lacks %s" % k)
    comp = prov.get("denominator_composition") or ""
    if len(comp) < 120:
        bad.append("denominator_composition is a label, not a composition (%d chars)" % len(comp))
    if prov.get("denominator_value") != len(rows):
        bad.append("denominator_value=%s but the file holds %d rows"
                   % (prov.get("denominator_value"), len(rows)))
    return bad


def check_eligible_implies_every_criterion(rows):
    """eligible_comparator is a conjunction and must never be asserted alone."""
    bad = []
    for r in rows:
        if not r.get("eligible_comparator"):
            continue
        if r.get("disposition") != "EXAMINED":
            bad.append("pmid %s: eligible but disposition %s" % (r.get("pmid"), r.get("disposition")))
        if not r.get("licence_open"):
            bad.append("pmid %s: eligible but licence_open=%r" % (r.get("pmid"), r.get("licence_open")))
        if not r.get("prospero_registered"):
            bad.append("pmid %s: eligible but not PROSPERO-registered" % r.get("pmid"))
        if r.get("match_status") != "MATCHED":
            bad.append("pmid %s: eligible but match_status=%r" % (r.get("pmid"), r.get("match_status")))
        if not r.get("enumerates_included_studies"):
            bad.append("pmid %s: eligible but does not enumerate its included studies"
                       % r.get("pmid"))
    return bad


def check_pmid_unique(rows):
    ids = [r.get("pmid") for r in rows]
    if len(ids) == len(set(ids)):
        return []
    from collections import Counter
    return ["duplicate pmid: %s" % [p for p, n in Counter(ids).items() if n > 1][:5]]


ALL_CHECKS = [check_partition, check_provenance_in_every_row, check_no_empty_strings,
              check_absence_requires_retrieval, check_licence_is_not_retrieval,
              check_denominator_composition_recorded,
              check_eligible_implies_every_criterion, check_pmid_unique]


# ------------------------------------------------------------------ synthetic mirror
def _good_row(**kw):
    prov = {"denominator_name": "candidates",
            "denominator_composition": "x" * 200,
            "denominator_value": 1,
            "denominator_per_topic_query_hits": {"sglt2-hf": 1},
            "context_count_not_a_denominator": "context only",
            "partition_counts": {k: 0 for k in PARTITION},
            "licence_open_but_unretrievable": 0}
    prov["partition_counts"]["EXAMINED"] = 1
    r = {"pmid": "1", "disposition": "EXAMINED", "licence_open": True, "pmcid": "PMC1",
         "retrieval": {"status": "RETRIEVED", "fulltext_bytes": 9999,
                       "may_speak_about_content": True},
         "enumerates_included_studies": True, "enumerated_count": 4,
         "enumeration_via": "included_studies_table", "prospero_registered": True,
         "match_status": "MATCHED", "matched_topics": ["sglt2-hf"],
         "overlap_detail": {}, "eligible_comparator": True, "provenance": prov}
    r.update(kw)
    return r


def test_clean_row_passes_every_check():
    rows = [_good_row()]
    for c in ALL_CHECKS:
        assert c(rows) == [], "%s fired on a clean row: %s" % (c.__name__, c(rows))


def test_partition_catches_a_stray_disposition():
    r = _good_row(disposition="SKIPPED")
    assert check_partition([r])


def test_provenance_catches_a_stripped_row():
    a, b = _good_row(pmid="1"), _good_row(pmid="2")
    b.pop("provenance")
    assert check_provenance_in_every_row([a, b])


def test_empty_string_is_caught():
    assert check_no_empty_strings([_good_row(enumeration_via="")])


def test_absence_claim_on_an_unread_paper_is_caught():
    r = _good_row(disposition="UNRETRIEVABLE",
                  retrieval={"status": "NOT_RETRIEVED_BLOCKED", "fulltext_bytes": None,
                             "may_speak_about_content": False},
                  match_status="NO_COUNTERPART")
    assert any("never read" in x for x in check_absence_requires_retrieval([r]))


def test_licence_open_does_not_make_a_paper_retrieved():
    r = _good_row(retrieval={"status": "NOT_RETRIEVED_BLOCKED", "fulltext_bytes": None,
                             "may_speak_about_content": False})
    assert check_licence_is_not_retrieval([r])


def test_denominator_without_composition_is_caught():
    r = _good_row()
    r["provenance"] = dict(r["provenance"], denominator_composition="cardiology")
    assert check_denominator_composition_recorded([r])


def test_eligible_without_prospero_is_caught():
    assert check_eligible_implies_every_criterion([_good_row(prospero_registered=False)])


def test_duplicate_pmid_is_caught():
    assert check_pmid_unique([_good_row(), _good_row()])


@pytest.mark.skipif(not os.path.exists(FRAME), reason="frame not built in this checkout")
def test_real_frame_passes_every_check():
    rows = load()
    for c in ALL_CHECKS:
        assert c(rows) == [], "%s: %s" % (c.__name__, c(rows)[:5])
