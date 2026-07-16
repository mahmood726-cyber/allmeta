"""Stage R3 — ISRCTN: the trials an NCT join structurally cannot see.

WHY THIS IS THE HIGHEST-VALUE REGISTRY WORK. Measured elsewhere: 138/211 = 65% of
ISRCTN RCTs carry NO NCT (malaria 64%, TB 73%, HIV 62%), and AACT's
`id_information` holds only 0-4 cross-registration ids per disease area. So an
NCT-keyed pipeline does not merely under-cover African-registered trials — it
cannot see them at all. Cross-registration between registries runs 3.5-4.2%, so
registries are ADDITIVE, not duplicates. "The key, not the data."

This is also the one population where the trial population IS the target
population: the first malaria hit is a Nigerian community-nutrition trial. For
NCD especially, where 96.9% of CT.gov cardiometabolic trials have no African
site, African-registered trials are the only records that do not need transport.

ACCESS — checked before the first request:
  isrctn.com/robots.txt for `User-agent: *` disallows exactly one path: /search.
  We use the documented API at /api/query — NOT the search portal — so we are
  inside robots. No credential, no data-use agreement, no scraping.
  (Contrast ICTRP, whose portal is robots-Disallow: / — bulk download only, and
  that download is Mahmood's to accept, not ours.)

WHAT WE TAKE, AND THE RUNG IT ENTERS ON:
  `source_type = "registry_isrctn"` — the source_type vocabulary is OPEN, not a
  closed enum: FDA/EPAR review packages are expected to arrive as a harms layer
  RICHER than the registry, so nothing here may assume CT.gov is the deepest AE
  source.
  `model_ready_effect = False` — ISRCTN is a PROTOCOL registry. It publishes the
  registered primary outcome, not arm-level events/N. It therefore cannot supply
  a poolable effect, and saying so is the point: these records supply the
  REGISTERED PRIMARY OUTCOME (the protocol half of the switch check) and the
  COMPLETENESS DENOMINATOR (the trial existed, so its absence from the literature
  is measurable). Marking them model-ready would fabricate poolability.

THE CROSSWALK, AND ITS ABSENCE: `externalRefs/clinicalTrialsGovNumber` is the
declared NCT. Empty = KEY-ABSENT, measured directly rather than inferred — this
is the same quantity the reachability lane measured at 65%, and we can now report
it over the whole registry instead of a 211-trial sample.

Run:  python isrctn.py --probe
      python isrctn.py --ingest --q malaria --q tuberculosis
      python isrctn.py --ingest-all
"""
from __future__ import annotations

import argparse
import json
import os
import xml.etree.ElementTree as ET
from datetime import date

import config as C
import geo
from net import PoliteSession, append_jsonl, load_done_keys

ISRCTN_API = "https://www.isrctn.com/api/query/format/default"
ISRCTN_DIR = os.path.join(C.STORE, "isrctn")
ISRCTN_LEDGER = os.path.join(C.DATA, f"isrctn.{C.NODE}.jsonl")

PAGE = 100          # API page size; polite and well within any sane limit

# Disease queries, priority order. Free text — ISRCTN has no MeSH.
QUERIES = [
    "malaria", "tuberculosis", "HIV",
    "hypertension", "diabetes", "heart failure", "stroke",
    "chronic kidney disease", "rheumatic heart disease", "cancer",
]


def _t(el, path: str) -> str:
    """Namespace-agnostic first-match text."""
    if el is None:
        return ""
    for e in el.iter():
        if e.tag.split("}")[-1] == path:
            return (e.text or "").strip()
    return ""


def _all(el, path: str) -> list[str]:
    out = []
    if el is None:
        return out
    for e in el.iter():
        if e.tag.split("}")[-1] == path:
            v = (e.text or "").strip()
            if v:
                out.append(v)
    return out


def _parse(trial) -> dict:
    today = date.today().isoformat()
    isrctn = _t(trial, "isrctn")
    ext = None
    parts = None
    design = None
    for e in trial:
        tag = e.tag.split("}")[-1]
        if tag == "externalRefs":
            ext = e
        elif tag == "participants":
            parts = e
        elif tag == "trialDesign":
            design = e

    countries = _all(parts, "recruitmentCountry") or _all(parts, "country")
    african = [c for c in countries if geo.is_african_country(c)]
    nct = _t(ext, "clinicalTrialsGovNumber")

    return {
        "registry_id": f"ISRCTN{isrctn}" if isrctn else None,
        "registry": "ISRCTN",
        # OPEN vocabulary — see module docstring. Not an enum.
        "source_type": "registry_isrctn",
        # ISRCTN is protocol-only: it publishes the registered outcome, not
        # arm-level events/N. Claiming otherwise would fabricate poolability.
        "model_ready_effect": False,
        "nct_id": nct or None,
        "key_absent_no_nct": not bool(nct),
        "doi": (_t(ext, "doi") or "").lower() or None,
        "eudract": _t(ext, "eudraCTNumber") or None,
        "title": _t(trial, "title")[:400] or None,
        "scientific_title": _t(trial, "scientificTitle")[:600] or None,
        "acronym": _t(trial, "acronym") or None,
        # THE PROTOCOL HALF OF THE SWITCH CHECK
        "registered_primary_outcome": " ~ ".join(_all(trial, "primaryOutcome"))[:2000]
                                      or None,
        "registered_secondary_outcomes":
            " ~ ".join(_all(trial, "secondaryOutcome"))[:2000] or None,
        "conditions": " | ".join(_all(trial, "condition"))[:500] or None,
        "interventions": " | ".join(_all(trial, "intervention"))[:1000] or None,
        "primary_study_design": _t(design, "primaryStudyDesign") or None,
        "secondary_study_design": _t(design, "secondaryStudyDesign") or None,
        "overall_end_date": _t(design, "overallEndDate")[:10] or None,
        "recruitment_start": _t(parts, "recruitmentStart")[:10] or None,
        "recruitment_end": _t(parts, "recruitmentEnd")[:10] or None,
        "target_enrolment": _t(parts, "targetEnrolment") or None,
        "final_enrolment": _t(parts, "totalFinalEnrolment") or None,
        "gender": _t(parts, "gender") or None,
        "age_range": _t(parts, "ageRange") or None,
        # transportability: for these trials the target population IS the trial
        # population — the reason they matter most for Kampala.
        "recruitment_countries": " | ".join(countries) or None,
        "n_countries": len(set(countries)),
        "african_countries": " | ".join(african) or None,
        "has_african_recruitment": bool(african),
        "publication_details": _t(trial, "publicationDetails")[:500] or None,
        "publication_stage": _t(trial, "publicationStage") or None,
        "source_tier": "registry",
        "licence": "ISRCTN public registry record (CC-BY per ISRCTN terms)",
        "locator": f"https://www.isrctn.com/ISRCTN{isrctn}" if isrctn else None,
        "extracted_at": today,
    }


def _fetch(sess, q: str, limit: int):
    """One request. `limit` is the ONLY paging control this API has.

    Measured 2026-07-16: ISRCTN's /api/query IGNORES `offset`, `page`, `start`,
    `from` and `skip` — every one of them returns the identical first page. An
    offset-walk therefore re-fetches page 1 forever and silently yields a
    first-page-only sample while LOOKING like it paged (our first run "fetched"
    1,100 records and got 197 distinct, and computed a key-absent rate off the
    repeat). Only a `limit` >= totalCount returns the whole set — verified
    limit=315 -> 315/315 distinct for malaria. So: probe the count, then ask for
    all of it in one request.
    """
    r = sess.get(ISRCTN_API, params={"q": q, "limit": limit})
    if r.status_code != 200:
        raise RuntimeError(f"ISRCTN {r.status_code} for q={q!r} limit={limit}")
    root = ET.fromstring(r.content)
    total = int(root.get("totalCount") or 0)
    trials = []
    for ft in root:
        for tr in ft:
            if tr.tag.split("}")[-1] == "trial":
                trials.append(tr)
    return total, trials


def probe() -> dict:
    sess = PoliteSession(min_interval=1.0, timeout=90)
    out = {}
    for q in QUERIES:
        total, _ = _fetch(sess, q, 1)
        out[q] = total
    print(json.dumps(out, indent=2))
    return out


def ingest(queries: list[str], max_per_query: int | None = None) -> dict:
    import pyarrow as pa
    import pyarrow.parquet as pq

    os.makedirs(ISRCTN_DIR, exist_ok=True)
    sess = PoliteSession(min_interval=1.0, timeout=90)
    done = load_done_keys(ISRCTN_LEDGER, "registry_id")
    rows, agg = [], {"fetched": 0, "new": 0, "key_absent": 0, "african": 0,
                     "with_primary_outcome": 0, "by_query": {}}

    for q in queries:
        # Two requests per query: one to learn the count, one to take it all.
        # (The API has no offset — see _fetch.)
        try:
            total, _ = _fetch(sess, q, 1)
            want = min(total, max_per_query) if max_per_query else total
            total, trials = _fetch(sess, q, max(want, 1))
        except Exception as e:
            print(f"[isrctn] {q!r} ERROR {str(e)[:140]}", flush=True)
            agg["by_query"][q] = {"total_in_registry": None, "seen": 0,
                                  "error": str(e)[:140]}
            continue
        got = len(trials)
        # Fail loud on a short read rather than quietly under-reporting a
        # registry: a partial pull that looks complete is how a coverage number
        # becomes a lie.
        if total and got < min(total, want) * 0.95:
            print(f"[isrctn] ⚠ {q!r} returned {got} of {total} — SHORT READ, "
                  f"treating as partial", flush=True)
        for tr in trials:
            rec = _parse(tr)
            agg["fetched"] += 1
            rid = rec.get("registry_id")
            if not rid or rid in done:
                continue
            done.add(rid)
            rows.append(rec)
            agg["new"] += 1
            agg["key_absent"] += int(rec["key_absent_no_nct"])
            agg["african"] += int(rec["has_african_recruitment"])
            agg["with_primary_outcome"] += int(
                bool(rec["registered_primary_outcome"]))
            append_jsonl(ISRCTN_LEDGER, {
                "registry_id": rid, "nct_id": rec["nct_id"],
                "key_absent_no_nct": rec["key_absent_no_nct"],
                "has_african_recruitment": rec["has_african_recruitment"],
                "query": q, "extracted_at": rec["extracted_at"]})
        print(f"[isrctn] {q:24s} {got}/{total} fetched "
              f"(new {agg['new']}, key-absent {agg['key_absent']}, "
              f"african {agg['african']})", flush=True)
        agg["by_query"][q] = {"total_in_registry": total, "seen": got}

    if rows:
        n = len([f for f in os.listdir(ISRCTN_DIR) if f.endswith(".parquet")])
        dst = os.path.join(ISRCTN_DIR, f"part_{n:05d}.parquet")
        tmp = dst + ".tmp"
        pq.write_table(pa.Table.from_pylist(rows), tmp, compression="zstd")
        os.replace(tmp, dst)
    agg["key_absent_pct"] = (round(100.0 * agg["key_absent"] / agg["new"], 1)
                             if agg["new"] else 0.0)
    agg["african_pct"] = (round(100.0 * agg["african"] / agg["new"], 1)
                          if agg["new"] else 0.0)
    print(f"[isrctn] {json.dumps(agg, indent=2)}")
    return agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--ingest", action="store_true")
    ap.add_argument("--q", action="append", default=[])
    ap.add_argument("--max-per-query", type=int, default=None)
    a = ap.parse_args()
    if a.probe:
        probe()
    elif a.ingest:
        ingest(a.q or QUERIES, a.max_per_query)
    else:
        ap.print_help()
