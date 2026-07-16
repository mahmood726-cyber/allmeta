"""Coverage ledger — the standing job's scoreboard over the full 68k.

Reads the four JSONL ledgers and reports real counts (no extrapolation here):
  ingested          - OA metas in the seed list
  harvested_xml     - metas with a cached structured full text
  detected          - metas parsed
  usable_for_mirror - metas with >=1 table AND >=1 cited NCT (Tier-1 ready)
  distinct_ncts     - trials linked out of the corpus
  preextracted      - trials with a registry-direct record
  poolable_registry - trials whose registry record yields a poolable 2x2

Run:  python ledger.py
"""
from __future__ import annotations

import json
import os

import config as C


def _count(path: str) -> int:
    if not os.path.exists(path):
        return 0
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for ln in f if ln.strip())


def _lines(stem: str):
    for path in C.node_ledgers(stem):
        with open(path, encoding="utf-8") as f:
            for ln in f:
                if ln.strip():
                    yield json.loads(ln)


def report() -> dict:
    ingested = _count(C.SEED)
    # dedup metas across nodes by pmcid (disjoint shards ⇒ union; guard anyway)
    hz = {"harvested_xml": 0, "missed": 0}
    seen_h = set()
    for r in _lines("harvest"):
        if r.get("pmcid") in seen_h:
            continue
        seen_h.add(r.get("pmcid"))
        hz["harvested_xml" if r.get("status") == "XML" else "missed"] += 1

    # Prefer detect2 (table-scoped detectors + reference_type-filtered links).
    # v1's links are 74% BACKGROUND-contaminated and its E1/E5 are text-regex FPs,
    # so never mix the two.
    stem = "detect2" if C.node_ledgers("detect2") else "detect"
    det = {"detected": 0, "cites_registry_linked_trial": 0, "distinct_ncts": set(),
           "e1_candidates": 0, "e5_candidates": 0, "ref_pmids": 0,
           "prose_fractions_not_flagged": 0}
    seen_d = set()
    for r in _lines(stem):
        if r.get("pmcid") in seen_d:
            continue
        seen_d.add(r.get("pmcid"))
        det["detected"] += 1
        det["cites_registry_linked_trial"] += int(
            r.get("cites_registry_linked_trial", r.get("usable_for_mirror", False)))
        det["e1_candidates"] += r.get("n_e1", 0)
        det["e5_candidates"] += r.get("n_e5", 0)
        det["ref_pmids"] += r.get("n_ref_pmids", 0)
        det["prose_fractions_not_flagged"] += r.get("n_prose_fraction_cells", 0)
        det["distinct_ncts"].update(r.get("ncts", []))

    pre = {"preextracted": 0, "poolable_registry": 0, "in_snapshot": 0}
    seen_p = set()
    for r in _lines("preextract"):
        if r.get("nct_id") in seen_p:
            continue
        seen_p.add(r.get("nct_id"))
        pre["preextracted"] += 1
        pre["in_snapshot"] += int(r.get("in_aact_snapshot", True))
        pre["poolable_registry"] += int(r.get("poolable_registry_2x2", False))

    ledger = {
        "ingested": ingested,
        "target": 67759,
        **hz,
        "detector_version": stem,
        "detected": det["detected"],
        # NOT "mirror-ready": the reference list is a superset of the included set.
        "cites_registry_linked_trial": det["cites_registry_linked_trial"],
        "ref_pmids_cited": det["ref_pmids"],
        "distinct_ncts_linked": len(det["distinct_ncts"]),
        "e1_candidates_table_scoped": det["e1_candidates"],
        "e5_candidates_table_scoped": det["e5_candidates"],
        "prose_fractions_not_flagged": det["prose_fractions_not_flagged"],
        "preextracted_trials": pre["preextracted"],
        "preextracted_in_snapshot": pre["in_snapshot"],
        "poolable_registry_2x2": pre["poolable_registry"],
    }
    return ledger


if __name__ == "__main__":
    print(json.dumps(report(), indent=2))
