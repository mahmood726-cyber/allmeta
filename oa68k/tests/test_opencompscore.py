# -*- coding: utf-8 -*-
"""Checks on the scoring harness gates (oa68k/SCORING-PROTOCOL.md).

A CHECK NOT WATCHED TO FAIL IS NOT A CHECK. opencompscore_plant.py plants each of these
violations into the real pair file and the real gate inputs, watches each fail, and
restores. These pytest cases are the synthetic mirror that keeps them live in CI.
"""
import io
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import opencompscore as S  # noqa: E402


def _v(**kw):
    v = {"pair_id": "sglt2-hf__39844146", "criterion": "S3", "judge_family": "openai",
         "payload_sha256_a": "a" * 64, "payload_sha256_b": "b" * 64,
         "a": {"satisfied": True, "quote": "per-trial event counts are given",
               "absence_checked_in": None},
         "b": {"satisfied": False, "quote": None,
               "absence_checked_in": ["Methods", "Results"]},
         "label": "A_BETTER",
         "reason": "x" * 130}
    v.update(kw)
    return v


PA = ["Results. per-trial event counts are given for every included study."]
PB = ["Results. only a pooled estimate is reported."]


# ---------------------------------------------------------------- gate 1: the label
def test_clean_verdict_passes_all_gates():
    v = _v()
    assert S.gate_payload_identity(v) is None
    assert S.gate_label(v) is None
    assert S.gate_quote(v, PA, PB) is None


def test_label_contradicting_its_own_finding_is_discarded():
    v = _v(label="B_BETTER")
    r = S.gate_label(v)
    assert r and r.startswith("DISCARD_LABEL_CONTRADICTS_ITS_OWN_FINDING")


def test_both_satisfied_and_neither_satisfied_are_different_labels():
    assert S.derive_label(True, True) == "TIE_BOTH_SATISFY"
    assert S.derive_label(False, False) == "TIE_NEITHER_SATISFIES"
    assert S.derive_label(True, True) != S.derive_label(False, False)


def test_not_scoreable_on_either_side_forces_not_scoreable():
    assert S.derive_label("NOT_SCOREABLE_SINGLE_STUDY", True) == "NOT_SCOREABLE"
    v = _v(a={"satisfied": "NOT_SCOREABLE_SINGLE_STUDY", "quote": None,
              "absence_checked_in": None}, label="NOT_SCOREABLE")
    assert S.gate_label(v) is None


def test_an_invented_not_scoreable_reason_is_rejected():
    v = _v(a={"satisfied": "NOT_SCOREABLE_BECAUSE_I_SAY_SO", "quote": None,
              "absence_checked_in": None}, label="NOT_SCOREABLE")
    assert S.gate_label(v).startswith("DISCARD_UNKNOWN_NOT_SCOREABLE_REASON")


def test_a_bare_label_with_no_reason_is_discarded():
    assert S.gate_label(_v(reason="too short")).startswith("DISCARD_REASON_TOO_SHORT")


# ---------------------------------------------------------------- gate 2: the quote
def test_quote_absent_from_the_payload_is_discarded_and_the_quote_is_kept():
    v = _v(a={"satisfied": True, "quote": "a sentence that is nowhere on the page",
              "absence_checked_in": None})
    r = S.gate_quote(v, PA, PB)
    assert r.startswith("DISCARD_QUOTE_NOT_IN_PAYLOAD")
    assert "nowhere on the page" in r, "the discard must carry the offending quote"


def test_quote_is_checked_against_the_WHOLE_payload_not_a_window():
    """The prior harness showed a window and gated against the same window: 82% of true
    quotes were recorded as fabrications. A quote in a later section must PASS."""
    long_a = ["chapter one filler", "chapter two: per-trial event counts are given"]
    v = _v(a={"satisfied": True, "quote": "per-trial event counts are given",
              "absence_checked_in": None})
    assert S.gate_quote(v, long_a, PB) is None
    # and gating against only the first section would have wrongly discarded it
    assert S.gate_quote(v, long_a[:1], PB).startswith("DISCARD_QUOTE_NOT_IN_PAYLOAD")


def test_an_absence_claim_must_name_where_it_looked():
    v = _v(b={"satisfied": False, "quote": None, "absence_checked_in": []})
    assert S.gate_quote(v, PA, PB).startswith("DISCARD_ABSENCE_WITHOUT_SECTIONS_SEARCHED")


def test_a_satisfied_finding_without_a_quote_is_discarded():
    v = _v(a={"satisfied": True, "quote": None, "absence_checked_in": None})
    assert S.gate_quote(v, PA, PB).startswith("DISCARD_NO_QUOTE_FOR_A_SATISFIED_FINDING")


# ---------------------------------------------------------------- gate 3: identity
def test_a_verdict_without_payload_hashes_is_refused():
    v = _v(payload_sha256_a=None)
    assert S.gate_payload_identity(v).startswith("DISCARD_NO_PAYLOAD_IDENTITY")


# ---------------------------------------------------------------- the judge call
def test_empty_artefact_at_rc0_is_void_not_a_judgement():
    r = S.verify_judge_artefact(0, "   ", "openai")
    assert r == "JUDGE_CALL_VOID:EMPTY_ARTEFACT_AT_RC0"


def test_a_reply_that_only_says_OK_is_not_a_check():
    assert S.verify_judge_artefact(0, "OK", "google").startswith("JUDGE_CALL_VOID")


def test_agy_defaulting_to_gpt_oss_is_caught_as_the_wrong_family():
    """agy's persisted default is GPT-OSS 120B -- OpenAI family, same as Codex. An
    unpinned call must NOT be counted as a third family."""
    reply = 'I am GPT-OSS 120B (Medium). {"label": "A_BETTER"}'
    assert S.verify_judge_artefact(0, reply, "google").startswith("JUDGE_CALL_VOID")
    assert S.verify_judge_artefact(0, reply, "openai") is None


def test_a_pinned_gemini_reply_passes_google():
    assert S.verify_judge_artefact(0, "Gemini 3.1 Pro here. {}", "google") is None


def test_nonzero_rc_is_void():
    assert S.verify_judge_artefact(1, "Gemini 3.1 Pro", "google").startswith(
        "JUDGE_CALL_VOID:RC=")


# ---------------------------------------------------------------- payload handling
def test_sectioning_splits_but_never_cuts():
    t = "x" * 50000
    secs = S.section_payload(t, max_chars=24000)
    assert sum(len(s) for s in secs) == len(t)
    assert "".join(secs) == t


def test_write_verified_refuses_empty(tmp_path):
    p = str(tmp_path / "x.txt")
    with pytest.raises(SystemExit):
        S.write_verified(p, "   ")


# ---------------------------------------------------------------- the real pair file
PAIRS = S.PAIRS


@pytest.mark.skipif(not os.path.exists(PAIRS), reason="pairs not built in this checkout")
def test_real_pairs_keep_the_join_a_filter():
    rows = [json.loads(l) for l in io.open(PAIRS, encoding="utf-8") if l.strip()]
    assert rows, "pair file is empty"
    for p in rows:
        assert p["join_tiers"], "pair %s admitted by no join" % p["pair_id"]
        assert set(p["join_tiers"]) <= {"frozen", "nct_pmid", "cited_pmid"}
        assert p["key_used"], "pair %s lost which key produced the match" % p["pair_id"]
        assert set(p["key_used"].values()) <= {"nct", "cited_pmid", "acronym"}
        assert p["our_payload_sha256"] and p["our_payload_chars"] > 0
        assert p["provenance"]["counted_criteria"] == S.COUNTED
    # every pair admitted by a strict tier must also be admitted by a looser one
    for p in rows:
        if "cited_pmid" in p["join_tiers"]:
            assert "nct_pmid" in p["join_tiers"] and "frozen" in p["join_tiers"]
        if "nct_pmid" in p["join_tiers"]:
            assert "frozen" in p["join_tiers"]
