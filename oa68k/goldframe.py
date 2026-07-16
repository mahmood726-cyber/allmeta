"""GOLD SET stage 0 — the frame, and the honest n.

WHY THIS EXISTS. The brief asks us to build the forest gold set and quotes
"58.6% of metas have a locatable forest plot". figscan.py has already scanned
13,315 cached articles. But a naive count over that ledger gives 40.2%, not
58.6%, and the difference is NOT noise -- it is a DENOMINATOR:

    figscan globs the WHOLE cache (`glob(CACHE/*.xml)`).
    The cache holds TWO populations:
      (a) OA meta-analyses, from OA_META_QUERY
          '(SRC:MED) AND (PUB_TYPE:"Meta-Analysis") AND (OPEN_ACCESS:y) AND (HAS_FT:y)'
          -> these are the 68k corpus, ledgered in harvest.pc1.jsonl
      (b) LINKED RCT FULL TEXTS, pulled by the fulltext_linked_rct process
          (see data/.fulltext_linked_rct.pc1.lock) -> NOT in harvest.pc1.jsonl

    Measured: 8,817 of figscan's 13,315 are in harvest (metas); 4,498 are not.

An RCT paper does not have a forest plot, so mixing (b) into the denominator
DILUTES the coverage rate. "40.2% of metas have a forest plot" would be FALSE --
it is 40.2% of a mixed population that is not the gold set's frame.

This script computes the rate on each frame separately and refuses to emit one
blended number (1.2 of the prereg: report per regime, never blended -- that
pathology produced the struck 0.67 and the "27%").

WHAT IT REFUSES TO CLAIM. `unknown` (28,345 figures) means "the caption carried
no positive forest evidence". figscan is deliberately conservative and would
rather MISS a forest plot than fabricate one. So every rate here is a LOWER
BOUND on forest prevalence, and it is reported as such -- never as "X% have no
forest plot".

Run:  python goldframe.py
Out:  goldframe.json
"""
from __future__ import annotations

import json
import math
import os

import config as C


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def main():
    lp = os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl")
    hp = os.path.join(C.DATA, f"harvest.{C.NODE}.jsonl")

    metas = set()
    with open(hp, encoding="utf-8") as f:
        for ln in f:
            try:
                r = json.loads(ln)
            except Exception:
                continue
            for k in ("pmcid", "id"):
                v = r.get(k)
                if v and str(v).startswith("PMC"):
                    metas.add(v)

    frames = {"meta": [], "not_in_harvest": []}
    rows = []
    with open(lp, encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            rows.append(r)
            frames["meta" if r["pmcid"] in metas else "not_in_harvest"].append(r)

    out = {"figscan_ledger": lp, "n_scanned": len(rows),
           "harvest_metas_known": len(metas), "frames": {}}

    print("=" * 78)
    print("GOLD-SET FRAME — the denominator decides the headline")
    print("=" * 78)
    print(f"\nfigscan scanned          : {len(rows):,} cached articles")
    print(f"harvest.pc1.jsonl metas  : {len(metas):,}")
    print(f"  of figscan, IN harvest : {len(frames['meta']):,}  <- OA meta-analyses = THE FRAME")
    print(f"  of figscan, NOT in it  : {len(frames['not_in_harvest']):,}  <- linked RCT full texts, NOT metas")
    print("\nAn RCT paper has no forest plot. Mixing them in DILUTES the rate.\n")

    print(f"{'frame':16s} {'n':>7s} {'>=1 forest':>11s} {'rate':>7s}  {'95% CI (Wilson)':>18s} {'forest figs':>11s}")
    print("-" * 78)
    for name, rs in (("meta (THE FRAME)", frames["meta"]),
                     ("not_in_harvest", frames["not_in_harvest"]),
                     ("BLENDED (wrong)", rows)):
        n = len(rs)
        k = sum(1 for r in rs if any(g["kind"] == "forest" for g in r["figs"]))
        nf = sum(1 for r in rs for g in r["figs"] if g["kind"] == "forest")
        lo, hi = wilson(k, n)
        print(f"{name:16s} {n:7,d} {k:11,d} {100*k/n:6.1f}%  [{100*lo:5.1f}%, {100*hi:5.1f}%] {nf:11,d}")
        key = name.split()[0]
        out["frames"][key] = {"n": n, "papers_with_forest": k, "rate": k / n,
                              "ci95": [lo, hi], "forest_figures": nf}

    m = out["frames"]["meta"]
    print("-" * 78)
    print(f"""
 THE HONEST n, and it is the one to quote:

   {m['papers_with_forest']:,} of {m['n']:,} OA metas ({100*m['rate']:.1f}%, 95% CI
   [{100*m['ci95'][0]:.1f}%, {100*m['ci95'][1]:.1f}%]) carry >= 1 caption-identified forest plot,
   yielding {m['forest_figures']:,} forest figures.

 This is a LOWER BOUND. `unknown` = "no positive forest evidence in the caption",
 not "not a forest plot"; figscan is deliberately conservative. Papers whose
 forest figure has an empty or unhelpful caption are counted as MISSES here.

 THE BLENDED RATE IS THE ONE NOT TO QUOTE. It is a real number about a
 population that is not the gold set's frame.
""")

    with open(os.path.join(C.HERE, "goldframe.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print("wrote goldframe.json")


if __name__ == "__main__":
    main()
