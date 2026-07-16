"""Stage 3 — PARSE + DETECT: structure signals, trial links, error patterns.

Reads each harvested XML from cache and records, per meta, ONLY what can be pulled
reliably without solving the (unsolved) primary-outcome table-selection problem:

  * n_tables        - count of structured tables (JATS <table-wrap> or BioC table)
  * ncts            - distinct NCT accessions cited (regex; the link-layer seed)
  * n_fraction_cells- count of explicit "x/N" fractions in text/tables
  * e1_candidates   - fractions where numerator == denominator with N>=20 and
                      NOT in the seroconversion/cure allow-list -> candidate E1
                      (events==denominator; high-RECALL, NOT confirmed) per the
                      OA-META-AUDIT taxonomy. A difference is not an error; this is
                      discovery, adjudicated later against source.
  * usable_for_mirror = has >=1 table AND cites >=1 NCT (a meta whose included
                      trials are registry-linkable -> instantly Tier-1 ready).

This is deliberately conservative: it flags candidates and links, it does NOT claim
gold 2x2 extraction (the table-selection wall is named across the prior art).

Run:  python parse_detect.py --limit 150
"""
from __future__ import annotations

import argparse
import json
import re
import os

import config as C
from net import append_jsonl, load_done_keys

NCT_RE = re.compile(rb"NCT\d{8}")
# "x/N" or "x / N" integer fractions, bounded to avoid ReDoS
FRAC_RE = re.compile(r"\b(\d{1,6})\s*/\s*(\d{1,6})\b")
ALLOW_100PCT = re.compile(r"seroconver|serocon|cure|clearance|eradicat|success",
                          re.IGNORECASE)


def analyse(xml_bytes: bytes) -> dict:
    ncts = sorted({m.decode() for m in NCT_RE.findall(xml_bytes)})
    text = xml_bytes.decode("utf-8", errors="replace")
    # structure: JATS table-wrap OR BioC passage infon type=table
    n_tables = text.count("<table-wrap") or text.lower().count(">table<")
    e1 = []
    n_frac = 0
    for m in FRAC_RE.finditer(text):
        a, n = int(m.group(1)), int(m.group(2))
        if n == 0 or a > n:                    # a>n is E5 territory (impossible cell)
            if a > n and n >= 20:
                e1.append({"kind": "E5_events_gt_N", "a": a, "n": n})
            continue
        n_frac += 1
        if a == n and n >= 20:
            ctx = text[max(0, m.start() - 60):m.end() + 60]
            if not ALLOW_100PCT.search(ctx):
                e1.append({"kind": "E1_events_eq_N", "a": a, "n": n})
    return {"n_tables": n_tables, "ncts": ncts, "n_nct": len(ncts),
            "n_fraction_cells": n_frac, "e1_candidates": e1[:50],
            "n_e1": len([e for e in e1 if e["kind"] == "E1_events_eq_N"]),
            "n_e5": len([e for e in e1 if e["kind"] == "E5_events_gt_N"]),
            "usable_for_mirror": bool(n_tables >= 1 and len(ncts) >= 1)}


def run(limit: int) -> dict:
    done = load_done_keys(C.DETECT_LEDGER, "pmcid")
    n = 0
    agg = {"metas": 0, "usable_for_mirror": 0, "total_ncts": 0,
           "e1_candidates": 0, "e5_candidates": 0, "with_table": 0}
    if not os.path.exists(C.HARVEST_LEDGER):
        print("[detect] no harvest ledger yet"); return agg
    with open(C.HARVEST_LEDGER, "r", encoding="utf-8") as f:
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
                res = analyse(xf.read())
            res["pmcid"] = pmcid
            res["pmid"] = rec.get("pmid")
            append_jsonl(C.DETECT_LEDGER, res)
            n += 1
            agg["metas"] += 1
            agg["usable_for_mirror"] += int(res["usable_for_mirror"])
            agg["total_ncts"] += res["n_nct"]
            agg["e1_candidates"] += res["n_e1"]
            agg["e5_candidates"] += res["n_e5"]
            agg["with_table"] += int(res["n_tables"] >= 1)
    print(f"[detect] {agg}")
    return agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200)
    a = ap.parse_args()
    run(a.limit)
