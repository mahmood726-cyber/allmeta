"""ERA × LICENCE — EXACT counts from EPMC. No sampling, no cursorMark.

§0c: "Harvest ORDER is a sampling frame. Nobody chose recency; cursorMark did."

⭐ SO THIS SCRIPT DOES NOT PAGE. Paging the first 1,000 of each era with
cursorMark would be the SAME convenience sample at smaller scale — the exact
defect §0c was written about, committed while measuring it. Instead every number
below is an EXACT `hitCount` from a facet query. There is no draw to be biased.

THE QUESTION: step 3 of the order is the era re-seed. Before running it we must
know whether fixing era makes the LICENCE problem better or worse — because if
older metas are less CC-BY (OA mandates strengthened over time), then breadth
and shareability fight harder as we widen, and the release design changes.

VALIDATION DONE BEFORE TRUSTING THE FIELD (§0c: a green count can be the defect):
  - `LICENSE:"cc by"` vs `LICENSE:"cc by-nc-nd"` overlap = 0  ⇒ classes DISJOINT,
    not a tokenised over-match. Tested, not assumed.
  - class counts sum to 97.1% of the total ⇒ ~2.9% carry no/unrecognised licence.
    Counted as UNKNOWN, never as permissive. Fail closed.
  - PMCID availability probed per era: 99.4-100% ⇒ the pre-2023 pool is really
    harvestable, not a phantom.

Run: python eraprobe.py
Out: eraprobe.json
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

import config as C

BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
Q = '(SRC:MED) AND (PUB_TYPE:"Meta-Analysis") AND (OPEN_ACCESS:y) AND (HAS_FT:y)'
ERAS = [("≤2014", 1990, 2014), ("2015-19", 2015, 2019),
        ("2020-22", 2020, 2022), ("2023-26", 2023, 2026)]
SHAREABLE = ["cc by", "cc0"]
OTHER = ["cc by-nc", "cc by-nc-nd", "cc by-nc-sa", "cc by-sa", "cc by-nd"]


def hits(q: str):
    u = BASE + "?" + urllib.parse.urlencode(
        {"query": q, "format": "json", "pageSize": 1, "resultType": "idlist"})
    for a in range(4):
        try:
            with urllib.request.urlopen(u, timeout=60) as r:
                return json.load(r)["hitCount"]
        except Exception:
            if a == 3:
                return None
            time.sleep(2 ** a)


def era_q(lo, hi):
    return f"{Q} AND (FIRST_PDATE:[{lo}-01-01 TO {hi}-12-31])"


def main():
    total = hits(Q)
    out = {"total_oa_metas": total, "method": "exact hitCount facets — no paging, no sampling",
           "eras": {}}

    print("=" * 78)
    print("ERA × LICENCE — exact counts (no draw, therefore no draw bias)")
    print("=" * 78)
    print(f"\nworld: {total:,} OA meta-analyses (SRC:MED, PUB_TYPE:Meta-Analysis, OA, has-FT)\n")
    print(f"{'era':10s} {'total':>7s} {'%world':>7s} {'CC-BY+CC0':>10s} {'share%':>7s} "
          f"{'ND family':>10s} {'ND%':>6s} {'unknown%':>9s}")
    print("-" * 78)

    rows = []
    for lab, lo, hi in ERAS:
        eq = era_q(lo, hi)
        n = hits(eq)
        time.sleep(0.3)
        sh = 0
        for l in SHAREABLE:
            sh += hits(f'{eq} AND (LICENSE:"{l}")') or 0
            time.sleep(0.25)
        nd = 0
        for l in ("cc by-nc-nd", "cc by-nd"):
            nd += hits(f'{eq} AND (LICENSE:"{l}")') or 0
            time.sleep(0.25)
        known = sh + nd
        for l in ("cc by-nc", "cc by-nc-sa", "cc by-sa"):
            known += hits(f'{eq} AND (LICENSE:"{l}")') or 0
            time.sleep(0.25)
        unk = n - known
        rows.append((lab, n, sh, nd, unk))
        print(f"{lab:10s} {n:7,d} {100*n/total:6.1f}% {sh:10,d} {100*sh/n:6.1f}% "
              f"{nd:10,d} {100*nd/n:5.1f}% {100*unk/n:8.1f}%")
        out["eras"][lab] = {"total": n, "pct_of_world": 100 * n / total,
                            "shareable": sh, "shareable_pct": 100 * sh / n,
                            "nd_family": nd, "nd_pct": 100 * nd / n,
                            "unknown": unk, "unknown_pct": 100 * unk / n}

    T = sum(r[1] for r in rows)
    S = sum(r[2] for r in rows)
    print("-" * 78)
    print(f"{'ALL':10s} {T:7,d} {100*T/total:6.1f}% {S:10,d} {100*S/T:6.1f}%")

    lo_sh = min(r[2] / r[1] for r in rows)
    hi_sh = max(r[2] / r[1] for r in rows)
    print(f"""
=============================================================================
⭐ DOES FIXING ERA MAKE THE LICENCE PROBLEM WORSE?
=============================================================================
 shareable (CC-BY+CC0) rate by era: {100*lo_sh:.1f}% – {100*hi_sh:.1f}%   spread {hi_sh/lo_sh:.2f}×
""")
    out["shareable_rate_range"] = [100 * lo_sh, 100 * hi_sh]
    out["shareable_rate_spread"] = hi_sh / lo_sh

    # what a proportional (world-shaped) era-stratified CC-BY draw could supply
    print(" IF WE SEED ALL FOUR ERAS, the shareable pool per stratum becomes:")
    for lab, n, sh, nd, unk in rows:
        print(f"   {lab:10s} {sh:7,d} CC-BY/CC0 metas available")
    print(f"   {'TOTAL':10s} {S:7,d}")
    print(f"""
 ⇒ An era-stratified, world-shaped, CC-BY-only gold set of n=1,000 needs, per
   stratum (proportional to the world's era mix):""")
    for lab, n, sh, nd, unk in rows:
        want = 1000 * n / total
        head = sh / want if want else float("inf")
        ok = "✅" if head >= 1 else "🛑 SHORT"
        print(f"   {lab:10s} want {want:6.0f}  have {sh:6,d}  headroom {head:6.1f}×  {ok}")
        out["eras"][lab]["want_for_n1000_proportional"] = want
        out["eras"][lab]["headroom"] = head

    print("""
=============================================================================
⚠️ WHAT THIS DOES NOT SHOW (§17)
=============================================================================
 - These are META-level counts. It does NOT say how many carry a forest plot
   (our corpus: 58.5% [57.5,59.5]) nor how many print a binary 2×2. The
   per-era forest rate is NOT MEASURED and could itself vary by era —
   older metas may plot differently. That is the next probe, not an assumption.
 - LICENCE IS ARTICLE-LEVEL, NOT FIGURE-LEVEL. Unchanged and still unparsed.
 - ~2.9% of records carry no/unrecognised licence. Counted UNKNOWN, never
   permissive.
 - This does not measure disease, outcome type, idiom, geography, or registry.
   Four of the seven axes remain unmeasured.
""")
    json.dump(out, open(os.path.join(C.HERE, "eraprobe.json"), "w",
                        encoding="utf-8"), indent=2)
    print("wrote eraprobe.json")


if __name__ == "__main__":
    main()
