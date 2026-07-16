"""Stage 3-v2 — TABLE-SCOPED detection + reference link layer (Phase 2).

Fixes the two things v1 got wrong, both named in the Phase-1 report:

1. **E5/E1 were text-regex FP-dominated** (2,929 E5 "candidates" were mostly dosing
   ratios like `400/100 mg` in prose). v2 runs the arithmetic detectors ONLY inside
   structured TABLE passages (BioC `section_type=TABLE` / `type=table`), where an
   `x/N` genuinely is a cell. Prose fractions are counted separately and NEVER
   reported as error candidates.

2. **The 6% mirror rate was a pre-link floor** — it only saw NCT accessions printed
   in the text. v2 harvests the reference list's PMIDs (BioC REF passages carry
   `pub-id_pmid`) and maps PMID→NCT deterministically via the pico-map index.

Writes detect2.<node>.jsonl (v1's detect.<node>.jsonl is left intact for comparison).

Run:  python detect2.py --limit 5000
"""
from __future__ import annotations

import argparse
import json
import os
import re
import xml.etree.ElementTree as ET

import config as C
from net import append_jsonl, load_done_keys
from linkmap import LinkMap

NCT_RE = re.compile(r"NCT\d{8}")
FRAC_RE = re.compile(r"\b(\d{1,6})\s*/\s*(\d{1,6})\b")
ALLOW_100PCT = re.compile(r"seroconver|cure|clearance|eradicat|success|complet",
                          re.IGNORECASE)
TABLE_SECTIONS = {"TABLE"}
TABLE_TYPES = {"table", "table_caption"}


def _passages(xml_bytes: bytes):
    """Yield (section_type, type, text, infons) per BioC passage."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return
    for p in root.iter("passage"):
        infons = {i.get("key"): (i.text or "") for i in p.findall("infon")}
        t = p.find("text")
        yield (infons.get("section_type", ""), infons.get("type", ""),
               (t.text if t is not None and t.text else ""), infons)


def analyse(xml_bytes: bytes, lm: LinkMap | None = None) -> dict:
    table_text: list[str] = []
    ref_pmids: set[str] = set()
    prose_frac = 0
    n_tables = 0
    all_text: list[str] = []

    for sec, typ, text, infons in _passages(xml_bytes):
        all_text.append(text)
        is_table = (sec in TABLE_SECTIONS) or (typ in TABLE_TYPES)
        if typ == "table":
            n_tables += 1
        if is_table:
            table_text.append(text)
        else:
            prose_frac += len(FRAC_RE.findall(text))
        if sec == "REF":
            pm = infons.get("pub-id_pmid")
            if pm and pm.strip().isdigit():
                ref_pmids.add(pm.strip())

    # --- arithmetic detectors: TABLE CELLS ONLY ---
    e1, e5 = [], []
    n_table_frac = 0
    for txt in table_text:
        for m in FRAC_RE.finditer(txt):
            a, n = int(m.group(1)), int(m.group(2))
            if n == 0:
                continue
            if a > n:
                if n >= 20:
                    e5.append({"a": a, "n": n})
                continue
            n_table_frac += 1
            if a == n and n >= 20:
                ctx = txt[max(0, m.start() - 60):m.end() + 60]
                if not ALLOW_100PCT.search(ctx):
                    e1.append({"a": a, "n": n})

    doc = "\n".join(all_text)
    direct_ncts = set(NCT_RE.findall(doc))
    linked_ncts = lm.ncts_for(ref_pmids) if lm else set()
    all_ncts = sorted(direct_ncts | linked_ncts)

    # Fan-out diagnostic: a PMID mapping to many NCTs inflates the link count
    # (18.6% of index PMIDs map to >1 NCT; worst fan-out 301). Record it so the
    # inflation is measurable rather than silently baked into the totals.
    n_multi = 0
    lm_map = getattr(lm, "map", None)   # optional: any ncts_for()-shaped lm works
    if lm_map is not None:
        for p in ref_pmids:
            if len(lm_map.get(str(p), ())) > 1:
                n_multi += 1

    return {
        "n_tables": n_tables,
        "n_ref_pmids": len(ref_pmids),
        "n_pmids_multi_nct": n_multi,
        "ncts_direct": sorted(direct_ncts),
        "ncts_linked": sorted(linked_ncts - direct_ncts),
        "ncts": all_ncts,
        "n_nct": len(all_ncts),
        "n_table_fraction_cells": n_table_frac,
        "n_prose_fraction_cells": prose_frac,      # counted, NOT error candidates
        "e1_table": e1[:50], "n_e1": len(e1),
        "e5_table": e5[:50], "n_e5": len(e5),
        # HONEST NAME: the reference list is a SUPERSET of the included studies, so
        # this is "cites >=1 registry-linked trial" — necessary but NOT sufficient
        # for mirror-readiness. The included-set (via the included-studies table) is
        # Phase 4; do not report this as "Kampala-ready".
        "cites_registry_linked_trial": bool(n_tables >= 1 and len(all_ncts) >= 1),
    }


def ledger_path() -> str:
    return os.path.join(C.DATA, f"detect2.{C.NODE}.jsonl")


def run(limit: int) -> dict:
    lm = None
    try:
        lm = LinkMap()
        print(f"[detect2] link layer loaded: {len(lm)} PMIDs -> NCT")
    except FileNotFoundError as e:
        print(f"[detect2] WARNING link layer unavailable ({e}); "
              "falling back to direct-NCT only")

    out_path = ledger_path()
    done = load_done_keys(out_path, "pmcid")
    agg = {"metas": 0, "cites_linked_trial": 0, "with_table": 0,
           "e1": 0, "e5": 0, "ref_pmids": 0,
           "ncts_direct": 0, "ncts_linked": 0, "prose_frac": 0}
    n = 0
    for hpath in C.node_ledgers("harvest"):
        with open(hpath, encoding="utf-8") as f:
            for line in f:
                if n >= limit:
                    break
                rec = json.loads(line)
                pmcid = rec.get("pmcid")
                if rec.get("status") != "XML" or pmcid in done:
                    continue
                path = rec.get("path")
                if not path or not os.path.exists(path):
                    continue
                with open(path, "rb") as xf:
                    res = analyse(xf.read(), lm)
                res["pmcid"] = pmcid
                res["pmid"] = rec.get("pmid")
                append_jsonl(out_path, res)
                done.add(pmcid)
                n += 1
                agg["metas"] += 1
                agg["cites_linked_trial"] += int(res["cites_registry_linked_trial"])
                agg["with_table"] += int(res["n_tables"] >= 1)
                agg["e1"] += res["n_e1"]
                agg["e5"] += res["n_e5"]
                agg["ref_pmids"] += res["n_ref_pmids"]
                agg["ncts_direct"] += len(res["ncts_direct"])
                agg["ncts_linked"] += len(res["ncts_linked"])
                agg["prose_frac"] += res["n_prose_fraction_cells"]
                if n % 250 == 0:
                    print(f"[detect2] {n} metas...", flush=True)
    print(f"[detect2] {agg}")
    return agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100000)
    a = ap.parse_args()
    run(a.limit)
