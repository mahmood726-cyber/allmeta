"""Stage 3-v3 — COLUMN-SEMANTIC error detection over JATS tables (Phase 2).

The v1/v2 lesson, measured twice: an `x/y` string is only an events/N cell if its
COLUMN says so. Adjudicating v2's table-scoped E5 output showed the "impossible
cells" were overwhelmingly:

    80/20, 70/30          -> ML train/test split ratios (prediction-model reviews)
    5405/3395, 2703/1515  -> case/control or male/female counts
    400/100 mg            -> combination dosing

None are 2x2 cells. So v3 flags a cell ONLY when positive evidence from its column
header (or the row/caption context) says the column holds events over participants,
and never on a column whose header marks it as a split/demographic/dose. This is a
PRECISION-first detector: it is designed to miss rather than to cry wolf, because a
false error claim against a published review is the expensive mistake.

Writes detect3.<node>.jsonl. Requires the efetch JATS tier (v2's BioC input has no
column headers to read).

Run:  python detect3.py --limit 5000
"""
from __future__ import annotations

import argparse
import json
import os
import re

import config as C
import jats
from net import append_jsonl, load_done_keys
from linkmap import LinkMap

NCT_RE = re.compile(r"NCT\d{8}")
FRAC_RE = re.compile(r"^\s*(\d{1,6})\s*/\s*(\d{1,6})\s*$")        # a WHOLE cell
FRAC_IN = re.compile(r"\b(\d{1,6})\s*/\s*(\d{1,6})\b")

# Positive evidence: this column holds events over participants.
EVENTS_HDR = re.compile(
    r"\bn\s*/\s*n\b|\bn\s*/\s*total\b|\bevents?\s*/\s*|/\s*total\b|"
    r"\bno\.?\s*/\s*|\bevents?\b|\bn\s*\(%\)|\bincidence\b|"
    r"\bnumerator\b|\bresponders?\b|\bevent rate\b", re.IGNORECASE)

# Negative evidence: never an events/N column, regardless of shape.
# `case/control` is here, not in EVENTS_HDR: the only candidate that survived the
# precision-first sweep was `Case/Control 183/150` in a genetic-association meta —
# i.e. 183 cases vs 150 controls, a DESIGN descriptor, not events over participants.
# It was the detector's 1-of-1 false positive; blocking it closes that class.
NOT_EVENTS_HDR = re.compile(
    r"train|test|split|validation|cohort size|male\s*/\s*female|female\s*/\s*male|"
    r"\bsex\b|\bgender\b|\bm\s*/\s*f\b|dose|mg\b|ratio|\bage\b|year|"
    r"country|centre|center|design|model|reference|author|study id|"
    r"case\s*/\s*control|control\s*/\s*case|sample size|"
    r"follow[- ]?up|duration|\bmean\b|\bsd\b|\bci\b|\bp[- ]?value\b|allocation",
    re.IGNORECASE)

ALLOW_100PCT = re.compile(r"seroconver|cure|clearance|eradicat|success|complet|"
                          r"adherence|coverage|uptake|response", re.IGNORECASE)


def classify_column(header: str) -> str:
    """'events_n' | 'excluded' | 'unknown' — positive evidence required to test."""
    h = header or ""
    if NOT_EVENTS_HDR.search(h):
        return "excluded"
    if EVENTS_HDR.search(h):
        return "events_n"
    return "unknown"


def scan_table(tbl: dict) -> tuple[list, list, dict]:
    """E1/E5 candidates from cells in positively-identified events/N columns."""
    e1, e5 = [], []
    headers = tbl.get("headers") or []
    stats = {"cells_tested": 0, "cells_skipped_unknown_col": 0,
             "cells_skipped_excluded_col": 0}
    kinds = [classify_column(h) for h in headers]
    ctx = f"{tbl.get('label','')} {tbl.get('caption','')}"
    for row in tbl.get("rows") or []:
        for i, cell in enumerate(row):
            m = FRAC_RE.match(cell or "")
            if not m:
                continue
            kind = kinds[i] if i < len(kinds) else "unknown"
            if kind == "excluded":
                stats["cells_skipped_excluded_col"] += 1
                continue
            if kind != "events_n":
                stats["cells_skipped_unknown_col"] += 1
                continue
            a, n = int(m.group(1)), int(m.group(2))
            if n == 0:
                continue
            stats["cells_tested"] += 1
            hdr = headers[i] if i < len(headers) else ""
            rec = {"a": a, "n": n, "column": hdr[:80], "table": ctx[:100],
                   "row": " | ".join(row)[:160]}
            if a > n and n >= 20:
                e5.append(rec)
            elif a == n and n >= 20 and not ALLOW_100PCT.search(ctx + " " + hdr):
                e1.append(rec)
    return e1, e5, stats


def analyse(xml_bytes: bytes, lm: LinkMap | None = None) -> dict:
    tables = jats.parse_tables(xml_bytes)
    e1: list = []
    e5: list = []
    agg = {"cells_tested": 0, "cells_skipped_unknown_col": 0,
           "cells_skipped_excluded_col": 0}
    n_hdr_tables = 0
    for t in tables:
        if t.get("headers"):
            n_hdr_tables += 1
        a, b, s = scan_table(t)
        e1 += a
        e5 += b
        for k in agg:
            agg[k] += s[k]

    pmids = jats.ref_pmids(xml_bytes)
    text = jats.all_text(xml_bytes)
    direct = set(NCT_RE.findall(text))
    linked = lm.ncts_for(pmids) if lm else set()
    ncts = sorted(direct | linked)

    return {
        "n_tables": len(tables),
        "n_tables_with_headers": n_hdr_tables,
        "n_ref_pmids": len(pmids),
        "ncts_direct": sorted(direct),
        "ncts_linked": sorted(linked - direct),
        "ncts": ncts,
        "n_nct": len(ncts),
        "e1": e1[:30], "n_e1": len(e1),
        "e5": e5[:30], "n_e5": len(e5),
        **agg,
        # necessary-but-not-sufficient for mirror-readiness (refs ⊋ included set)
        "cites_registry_linked_trial": bool(tables and ncts),
    }


def ledger_path() -> str:
    return os.path.join(C.DATA, f"detect3.{C.NODE}.jsonl")


def run(limit: int) -> dict:
    lm = None
    try:
        lm = LinkMap()
        print(f"[detect3] {lm.describe()}")
    except FileNotFoundError as e:
        print(f"[detect3] WARNING no link layer ({e}) — direct NCT only")

    out_path = ledger_path()
    done = load_done_keys(out_path, "pmcid")
    agg = {"metas": 0, "with_tables": 0, "with_headers": 0, "cites_linked": 0,
           "e1": 0, "e5": 0, "cells_tested": 0,
           "skipped_unknown": 0, "skipped_excluded": 0, "ncts_linked": 0}
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
                if rec.get("tier") != "efetch_pmc_jats":
                    continue          # v3 needs structured tables; skip BioC rows
                p = rec.get("path")
                if not p or not os.path.exists(p):
                    continue
                with open(p, "rb") as xf:
                    res = analyse(xf.read(), lm)
                res["pmcid"] = pmcid
                res["pmid"] = rec.get("pmid")
                append_jsonl(out_path, res)
                done.add(pmcid)
                n += 1
                agg["metas"] += 1
                agg["with_tables"] += int(res["n_tables"] > 0)
                agg["with_headers"] += int(res["n_tables_with_headers"] > 0)
                agg["cites_linked"] += int(res["cites_registry_linked_trial"])
                agg["e1"] += res["n_e1"]
                agg["e5"] += res["n_e5"]
                agg["cells_tested"] += res["cells_tested"]
                agg["skipped_unknown"] += res["cells_skipped_unknown_col"]
                agg["skipped_excluded"] += res["cells_skipped_excluded_col"]
                agg["ncts_linked"] += len(res["ncts_linked"])
                if n % 250 == 0:
                    print(f"[detect3] {n} metas...", flush=True)
    print(f"[detect3] {agg}")
    return agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100000)
    a = ap.parse_args()
    run(a.limit)
