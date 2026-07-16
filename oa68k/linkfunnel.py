"""Phase-2 diagnostic — WHY does a meta fail to yield a poolable linked trial?

"6% / 73% linked" is a single number that hides five different failure modes with
five different fixes. This walks the funnel and attributes every meta to the FIRST
stage it fails at, so effort goes where the loss actually is:

  S0 harvested            - has cached JATS
  S1 has_tables           - carries >=1 structured table (else: narrative review)
  S2 has_ref_pmids        - JATS <ref-list> exposes pub-id pmid (else: parse/format loss)
  S3 refs_map_to_nct      - >=1 cited PMID resolves to an NCT via study_references
                            DERIVED/RESULT (else: trials unregistered / pre-2005 /
                            not in the AACT snapshot -- a CEILING, not a bug)
  S4 nct_has_results      - >=1 linked trial has posted registry results
  S5 poolable_2x2         - >=1 linked trial yields a poolable registry 2x2

Stages S3-S5 are mostly CEILINGS (the data does not exist to be linked), while
S1-S2 are addressable extraction losses. Reporting them as one rate confuses the
two and invites optimising the wrong thing.

Run:  python linkfunnel.py
"""
from __future__ import annotations

import json
import os

import config as C


def load_preextract() -> dict:
    """nct -> (has_results, poolable)."""
    out = {}
    for p in C.node_ledgers("preextract"):
        with open(p, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                r = json.loads(ln)
                out[r.get("nct_id")] = (bool(r.get("results_posted")),
                                        bool(r.get("poolable_registry_2x2")))
    return out


def run() -> dict:
    stem = "detect3" if C.node_ledgers("detect3") else "detect2"
    pre = load_preextract()
    f = {"metas": 0, "no_tables": 0, "no_ref_pmids": 0, "refs_no_nct": 0,
         "nct_no_results": 0, "results_not_poolable": 0, "poolable": 0}
    for path in C.node_ledgers(stem):
        with open(path, encoding="utf-8") as fh:
            for ln in fh:
                if not ln.strip():
                    continue
                r = json.loads(ln)
                f["metas"] += 1
                if not r.get("n_tables"):
                    f["no_tables"] += 1
                    continue
                if not r.get("n_ref_pmids"):
                    f["no_ref_pmids"] += 1
                    continue
                ncts = r.get("ncts") or []
                if not ncts:
                    f["refs_no_nct"] += 1
                    continue
                flags = [pre.get(n) for n in ncts if n in pre]
                if not flags or not any(a for a, _ in flags):
                    f["nct_no_results"] += 1
                    continue
                if not any(b for _, b in flags):
                    f["results_not_poolable"] += 1
                    continue
                f["poolable"] += 1
    return f


if __name__ == "__main__":
    f = run()
    n = max(f["metas"], 1)
    print(f"=== LINK FUNNEL over {f['metas']:,} detected metas ===\n")
    order = [("no_tables", "S1 no structured table (narrative review)", "extraction/none"),
             ("no_ref_pmids", "S2 no ref PMIDs in JATS", "EXTRACTION LOSS - fixable"),
             ("refs_no_nct", "S3 refs cite no registered trial", "CEILING - unregistered/pre-2005"),
             ("nct_no_results", "S4 linked trials have no posted results", "CEILING - registry gap"),
             ("results_not_poolable", "S5 results posted but no poolable 2x2", "CEILING - continuous/none"),
             ("poolable", "** yields >=1 poolable registry 2x2 **", "SUCCESS")]
    for k, label, kind in order:
        print(f"  {f[k]:>7,}  {f[k]/n:6.2%}  {label:44} [{kind}]")
