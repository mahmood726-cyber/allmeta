"""FOREST-PLOT RATE **PER ERA** — the hole I named in my own pre-registration.

PREREG-goldset-strata-2026-07-16.md §6, verbatim: "If the forest-plot rate
varies sharply by era (NOT MEASURED — the 58.5% is measured only on the recent
corpus; this is the biggest hole in the allocation above)."

WHY IT MATTERS BEFORE DRAWING, NOT AFTER: the frozen allocation
(≤2014=84 · 2015-19=226 · 2020-22=278 · 2023-26=413) assumes the 58.5%
forest rate holds across eras. There is a strong prior that it does NOT —
forest plots as standard practice, figure-rendering conventions, and PRISMA-era
reporting norms all changed across 1990-2026. **If the rate collapses in older
strata, the ≤2014 allocation of 84 may be unreachable — and per the frozen
floor rule that is a HOLE TO REPORT, never a stratum to fill from elsewhere.**

SAMPLING — §0c is the whole reason this is written the way it is:
  - The frame is the FULL seeded id list per era (eraseed.py paged ALL 67,762,
    not the first N). Only a full list can be sampled randomly.
  - The draw is `random.Random(2026).sample(...)` from that full list, AFTER a
    deterministic sort. It is NOT the first-N by cursorMark — that would move
    the recency defect down one level instead of fixing it.
  - Restricted to records WITH a pmcid (98.6-99.9% per era; measured) because a
    JATS fetch needs one. That restriction is stated, not silent.

CLASSIFIER: imported from figscan.py — the SAME code that produced the 58.5%.
A second classifier could disagree with the first, and then neither number
means anything. Reuse, don't reimplement.

Run:  python forestrate_era.py [--n 300]
Out:  forestrate_era.json  (+ caches JATS into data/cache/ for reuse)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.request
from collections import Counter

import config as C
import figscan

ERAS = ["le2014", "2015-19", "2020-22", "2023-26"]
UA = "oa68k-goldset/1.0 (mailto:mahmood726@gmail.com)"
EFETCH = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
          "?db=pmc&id={pmcid}&rettype=xml&retmode=text")


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def newcombe(k1, n1, k2, n2, z=1.96):
    if not n1 or not n2:
        return (float("nan"), float("nan"))
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1, z)
    l2, u2 = wilson(k2, n2, z)
    d = p1 - p2
    return (d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
            d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2))


def fetch_jats(pmcid: str) -> bytes | None:
    fp = os.path.join(C.DATA, "cache", f"{pmcid}.xml")
    if os.path.exists(fp) and os.path.getsize(fp) > 2000:
        return open(fp, "rb").read()
    url = EFETCH.format(pmcid=pmcid.replace("PMC", ""))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
            if b and b"<" in b[:200] and len(b) > 2000:
                os.makedirs(os.path.dirname(fp), exist_ok=True)
                with open(fp, "wb") as f:
                    f.write(b)
                return b
            return None
        except Exception:
            if a == 2:
                return None
            time.sleep(2 ** a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    a = ap.parse_args()

    led = os.path.join(C.DATA, f"eraseed.{C.NODE}.jsonl")
    if not os.path.exists(led):
        raise SystemExit("no eraseed ledger — run `python eraseed.py` first")
    pool = {e: [] for e in ERAS}
    with open(led, encoding="utf-8") as f:
        for ln in f:
            r = json.loads(ln)
            if r.get("pmcid") and r["era"] in pool:
                pool[r["era"]].append(r)

    print("=" * 78)
    print("FOREST-PLOT RATE PER ERA — the hole named in my own prereg (§6)")
    print("=" * 78)
    print(f"\nframe: the FULL seeded id list per era (eraseed.py paged all 67,762).")
    print(f"draw : random.Random(2026).sample() from that full list — NOT first-N.")
    print(f"       (first-N by cursorMark would move the recency defect down a level)")
    print(f"class: figscan.scan_xml — the SAME code that produced the 58.5%.\n")

    out = {"n_per_era": a.n, "seed": 2026, "eras": {}}
    res = {}
    for e in ERAS:
        rng = random.Random(2026)
        p = sorted(pool[e], key=lambda r: r["pmcid"])     # deterministic before shuffle
        samp = rng.sample(p, min(a.n, len(p)))
        got = fore = 0
        t0 = time.time()
        for i, r in enumerate(samp):
            b = fetch_jats(r["pmcid"])
            if not b:
                continue
            got += 1
            try:
                figs = figscan.scan_xml(r["pmcid"], b)
            except Exception:
                continue
            if any(g["kind"] == "forest" for g in figs):
                fore += 1
            if (i + 1) % 100 == 0:
                print(f"  {e:8s} {i+1:4d}/{len(samp)}  fetched {got:4d}  forest {fore:4d}"
                      f"  ({time.time()-t0:.0f}s)", flush=True)
            time.sleep(0.34)          # unkeyed NCBI: 3 req/s
        lo, hi = wilson(fore, got)
        res[e] = (fore, got)
        out["eras"][e] = {"pool": len(p), "sampled": len(samp), "fetched": got,
                          "with_forest": fore, "rate": (fore / got if got else None),
                          "ci95": [lo, hi]}
        print(f"  {e:8s} DONE  fetched {got}/{len(samp)}  forest {fore}  "
              f"= {100*fore/got if got else 0:.1f}% [{100*lo:.1f}, {100*hi:.1f}]\n", flush=True)

    print("=" * 78)
    print("RESULT")
    print("=" * 78)
    print(f"\n{'era':10s} {'fetched':>8s} {'forest':>7s} {'rate':>7s}  {'95% CI':>16s}"
          f"  {'prereg n':>9s} {'reachable?':>11s}")
    print("-" * 78)
    ALLOC = {"le2014": 84, "2015-19": 226, "2020-22": 278, "2023-26": 413}
    POOLCC = {"le2014": 4289, "2015-19": 10709, "2020-22": 12939, "2023-26": 17414}
    for e in ERAS:
        fore, got = res[e]
        if not got:
            continue
        r = fore / got
        lo, hi = wilson(fore, got)
        avail = POOLCC[e] * lo          # conservative: CI LOWER bound
        ok = "✅" if avail >= ALLOC[e] else "🛑 HOLE"
        print(f"{e:10s} {got:8d} {fore:7d} {100*r:6.1f}%  [{100*lo:5.1f},{100*hi:5.1f}]"
              f"  {ALLOC[e]:9d} {ok:>11s}")
        out["eras"][e]["prereg_alloc"] = ALLOC[e]
        out["eras"][e]["ccby_with_forest_lowerbound"] = avail
        out["eras"][e]["allocation_reachable"] = bool(avail >= ALLOC[e])

    # the contrast that decides whether the 58.5% was era-blind
    f1, n1 = res["le2014"]
    f2, n2 = res["2023-26"]
    if n1 and n2:
        d = f1 / n1 - f2 / n2
        lo, hi = newcombe(f1, n1, f2, n2)
        sig = "SIGNIFICANT" if (lo > 0 or hi < 0) else "not significant"
        print("-" * 78)
        print(f"\n⭐ ≤2014 minus 2023-26: {100*d:+.1f} pp  95% CI [{100*lo:+.1f}, {100*hi:+.1f}]"
              f"  — {sig}")
        out["contrast_le2014_minus_2023"] = {"delta_pp": 100 * d,
                                             "ci95_pp": [100 * lo, 100 * hi],
                                             "significant": bool(lo > 0 or hi < 0)}
        if lo > 0 or hi < 0:
            print("""
   ⇒ THE 58.5% IS ERA-DEPENDENT. It was measured on a 99.9%-recent corpus and
     is NOT a property of the literature. Every downstream number that used it
     — including the ND-free ceiling of 26,525 — inherits that and must be
     re-derived per era.""")
        else:
            print("""
   ⇒ The forest rate does NOT differ detectably between the oldest and newest
     strata at this n. The 58.5% survives as roughly era-invariant, and the
     frozen allocation stands. ⚠️ Absence of a detected difference at n=%d is
     NOT proof of no difference — state the CI, not the null.""" % a.n)

    json.dump(out, open(os.path.join(C.HERE, "forestrate_era.json"), "w",
                        encoding="utf-8"), indent=2)
    print("\nwrote forestrate_era.json")


if __name__ == "__main__":
    main()
