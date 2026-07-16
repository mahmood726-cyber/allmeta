"""Stage T4 — DTA 2x2 detection over OA full-text tables. PRECISION-first.

Why this exists: the DTA corpus (MeSH "Sensitivity and Specificity", 11,757 OA
papers) is a CANDIDATE set, not a gold set. That MeSH term is indexed on anything
touching diagnostic-accuracy concepts, so a spot check of harvested tables turned
up VirGen genome-release statistics, JEV/DEN-2 binding-pocket residues and
MEDLINE search strategies alongside real accuracy tables. "Harvested a DTA paper"
therefore does NOT mean "found a 2x2", and the two counts must never be conflated.

The design mirrors the 68k lane's detect3 lesson, measured twice there: a number
means what its COLUMN says it means. So a table is flagged ONLY on positive
column-header (or caption) evidence, and never on the mere presence of digits.
This detector is built to MISS rather than to cry wolf, because a false DTA claim
is the expensive mistake — it puts a fabricated 2x2 into a synthesis.

Three accepted shapes, in descending order of directness:

  explicit_counts  headers name >=3 of TP/FP/FN/TN (or the spelled-out forms).
                   The 2x2 is literally in the table.
  sens_spec        headers name BOTH sensitivity and specificity. The 2x2 is
                   recoverable only if an N is present, so we record whether one
                   is — sens/spec without N cannot be back-computed to counts.
  cross_tab        caption/headers signal a reference/gold standard cross-tab
                   (test result x true disease status).

Explicit NEGATIVE guards kill the known look-alikes: search strategies, hit
counts, train/test splits, genome/family statistics, PCR primer tables. A table
matching a negative guard is rejected even if it also matches a positive rule —
precision beats recall here, by design.

Every flag records the evidence string that triggered it, so a human can
adjudicate without re-reading the paper. Nothing here decides truth; it decides
"worth a look".

Run:  python dta_detect.py --corpus dta
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
from datetime import date

import config as C

# ---- positive column semantics -------------------------------------------
RE_TP = re.compile(r"\b(tp|true[\s-]*positives?)\b", re.I)
RE_FP = re.compile(r"\b(fp|false[\s-]*positives?)\b", re.I)
RE_FN = re.compile(r"\b(fn|false[\s-]*negatives?)\b", re.I)
RE_TN = re.compile(r"\b(tn|true[\s-]*negatives?)\b", re.I)
RE_SENS = re.compile(r"\bsensitivit(y|ies)\b|\bse\s*\(%\)|\brecall\b", re.I)
RE_SPEC = re.compile(r"\bspecificit(y|ies)\b|\bsp\s*\(%\)", re.I)
RE_PPV = re.compile(r"\bppv\b|positive predictive value", re.I)
RE_NPV = re.compile(r"\bnpv\b|negative predictive value", re.I)
RE_REFSTD = re.compile(r"reference standard|gold standard|true (disease|status)|"
                       r"disease (present|absent)|confirmed (cases?|infection)",
                       re.I)
RE_N = re.compile(r"\b(n|no\.?|number|total|sample size)\b", re.I)

# ---- negative guards: the measured look-alikes ---------------------------
RE_NEG = re.compile(
    r"search (strategy|terms?)|medline|embase|abstracts? reviewed|"
    r"\bhits?\b|papers included|inclusion criteria|"
    r"train(ing)?[\s/-]*(and[\s/-]*)?test|validation split|"
    r"\bprimers?\b|nucleotide|binding pocket|residues?|"
    r"genom(e|es|ic)|famil(y|ies)|release|accession|"
    r"baseline characteristics|demographics?",
    re.I)


def classify_table(headers: list[str], caption: str = "",
                   n_rows: int = 0) -> dict:
    """Return a precision-first verdict for one table. Never raises."""
    hay_h = " | ".join(h or "" for h in (headers or []))
    hay_c = caption or ""
    hay = f"{hay_h} || {hay_c}"
    out = {"is_dta_2x2": False, "kind": None, "evidence": [], "rejected_by": None}

    if not hay_h.strip():
        # No headers => no column semantics => we cannot attribute a cell to a
        # column, so we decline rather than guess. (This is the exact failure the
        # JATS <thead>/<td> fix addressed; a header-less table is not evidence of
        # absence, it is absence of evidence.)
        out["rejected_by"] = "no_headers"
        return out

    neg = RE_NEG.search(hay)
    if neg:
        out["rejected_by"] = f"negative_guard:{neg.group(0)[:40]}"
        return out

    cells = [RE_TP.search(hay_h), RE_FP.search(hay_h),
             RE_FN.search(hay_h), RE_TN.search(hay_h)]
    n_cells = sum(1 for c in cells if c)
    if n_cells >= 3:
        out.update(is_dta_2x2=True, kind="explicit_counts")
        out["evidence"] = [c.group(0) for c in cells if c]
        return out

    has_se, has_sp = RE_SENS.search(hay_h), RE_SPEC.search(hay_h)
    if has_se and has_sp:
        out.update(is_dta_2x2=True, kind="sens_spec")
        out["evidence"] = [has_se.group(0), has_sp.group(0)]
        # sens/spec alone cannot be back-computed to a 2x2 without a denominator.
        out["has_n"] = bool(RE_N.search(hay_h))
        out["recoverable_2x2"] = out["has_n"]
        for extra in (RE_PPV.search(hay_h), RE_NPV.search(hay_h)):
            if extra:
                out["evidence"].append(extra.group(0))
        return out

    ref = RE_REFSTD.search(hay)
    if ref and n_rows >= 2 and (has_se or has_sp or n_cells >= 2):
        out.update(is_dta_2x2=True, kind="cross_tab")
        out["evidence"] = [ref.group(0)]
        return out

    out["rejected_by"] = "no_positive_column_evidence"
    return out


def run(corpus: str = "dta") -> dict:
    import duckdb
    import fulltext

    tdir = fulltext.tables_dir(corpus)
    files = sorted(glob.glob(os.path.join(tdir, "*.parquet")))
    if not files:
        raise FileNotFoundError(
            f"no harvested tables for corpus '{corpus}' — run "
            f"fulltext.py --corpus {corpus} first")
    lst = "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in files) + "]"
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT pmcid, pmid, table_index, caption, headers, n_rows, locator "
        f"FROM read_parquet({lst})").fetchall()

    today = date.today().isoformat()
    out_rows, agg = [], {"tables": 0, "flagged": 0, "by_kind": {},
                         "rejected": {}, "papers_with_2x2": set()}
    for pmcid, pmid, ti, cap, hdrs, n_rows, loc in rows:
        agg["tables"] += 1
        v = classify_table((hdrs or "").split(" | "), cap or "", n_rows or 0)
        if v["is_dta_2x2"]:
            agg["flagged"] += 1
            agg["by_kind"][v["kind"]] = agg["by_kind"].get(v["kind"], 0) + 1
            agg["papers_with_2x2"].add(pmcid)
        else:
            k = (v["rejected_by"] or "?").split(":")[0]
            agg["rejected"][k] = agg["rejected"].get(k, 0) + 1
        out_rows.append({
            "pmcid": pmcid, "pmid": pmid, "table_index": ti,
            "caption": (cap or "")[:300], "headers": (hdrs or "")[:400],
            "n_rows": n_rows,
            "is_dta_2x2": v["is_dta_2x2"], "kind": v["kind"],
            "evidence": " | ".join(v["evidence"]),
            "recoverable_2x2": v.get("recoverable_2x2"),
            "rejected_by": v["rejected_by"],
            "corpus": corpus, "source_tier": "oa_fulltext",
            "locator": loc, "extracted_at": today,
            "method": "column-semantic precision-first candidate flag",
            "confidence": "candidate — NOT an extracted 2x2; needs adjudication",
        })

    dst_dir = os.path.join(C.STORE, f"dta_flags_{corpus}")
    os.makedirs(dst_dir, exist_ok=True)
    import pyarrow as pa
    import pyarrow.parquet as pq
    dst = os.path.join(dst_dir, "flags.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(out_rows), tmp, compression="zstd")
    os.replace(tmp, dst)

    agg["papers_with_2x2"] = len(agg["papers_with_2x2"])
    agg["note"] = ("flags are CANDIDATES for adjudication, not extracted 2x2 "
                   "tables; papers_with_2x2 counts papers with >=1 flagged table")
    print(f"[dta_detect] {json.dumps(agg, indent=2)}")
    return agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="dta")
    a = ap.parse_args()
    run(a.corpus)
