"""OUTCOME TYPE — the stratum that is the mission, not a stratum.

Brief: "Outcome type is the one I'd put first among the unmeasured four — D10
made us blind to binary, and a gold set that inherits that blindness is
worthless for malaria/TB primaries. That's not a stratum, it's the mission."

WHAT IS MEASURED: the effect measure named in each forest plot's own CAPTION.
  BINARY-family      risk ratio / odds ratio / risk difference / hazard ratio
                     / RR / OR / RD / HR / relative risk / incidence rate ratio
  CONTINUOUS-family  mean difference / standardised mean difference / WMD / SMD
  PROPORTION         pooled prevalence / pooled proportion / single-arm rate
  UNSTATED           the caption names no effect measure

⚠️ THIS IS A PROXY AND I AM LABELLING IT ONE. The caption is not the plot. A
caption saying "forest plot of outcomes" tells us nothing; a caption naming an
OR does not guarantee the plot prints a 2×2 (the brief's own 24.8% says most
rows print effect+CI only). So:
  - UNSTATED is reported as its own class, NEVER folded into either family.
  - This measures WHAT THE META POOLED, not WHAT THE PLOT PRINTS. The second
    needs vision on the figure and is NOT MEASURED here.
  - Direct evidence of the gap, from the seeded meta-frame draw last turn:
    PMC12716514 caption/plot = binary 2×2 (MRA Yes/No vs Control Yes/No)
    PMC12602386 caption/plot = continuous (Mean/SD/Total, SMD)
    n=2. Both real. Prevalence is exactly what this script estimates.

§0c: a green count can be the defect. If BINARY came back at ~100% that would
not be good news — it would mean the classifier is matching "OR" the English
word, which is the EXACT bug OA-REACHABILITY §7 already caught once
("the regex matched \\bOR\\b case-insensitively and was counting the English
word *or*"). So OR/RR/HR bare-abbreviation matching is CASE-SENSITIVE and
word-bounded here, and the naked-"or" trap is regression-tested below.

Run: python outcometype.py
Out: outcometype.json
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter

import config as C

# Spelled-out measures — case-insensitive is safe, no English-word collision.
BIN_WORDS = re.compile(
    r"\b(risk ratio|relative risk|odds ratio|risk difference|hazard ratio|"
    r"rate ratio|incidence rate ratio|peto)\b", re.I)
CONT_WORDS = re.compile(
    r"\b(mean difference|standardi[sz]ed mean difference|weighted mean difference|"
    r"standardi[sz]ed mean diff)\b", re.I)
PROP_WORDS = re.compile(
    r"\b(pooled prevalence|pooled proportion|pooled incidence|prevalence of|"
    r"pooled rate)\b", re.I)

# ⚠️ Bare abbreviations: CASE-SENSITIVE and word-bounded. `OR` the measure is
# upper-case; `or` the conjunction is not. This is the OA-REACHABILITY §7 bug.
BIN_ABBR = re.compile(r"\b(RR|OR|RD|HR|IRR|aOR|aHR)\b")
CONT_ABBR = re.compile(r"\b(SMD|WMD|MD)\b")


def classify(cap: str) -> str:
    b = bool(BIN_WORDS.search(cap)) or bool(BIN_ABBR.search(cap))
    c = bool(CONT_WORDS.search(cap)) or bool(CONT_ABBR.search(cap))
    p = bool(PROP_WORDS.search(cap))
    if b and c:
        return "BOTH"
    if b:
        return "BINARY"
    if c:
        return "CONTINUOUS"
    if p:
        return "PROPORTION"
    return "UNSTATED"


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def selftest():
    """⚠️ MUTATION TEST — a gate that only passes has never been tested (§0c).
    The naked-'or' trap must NOT fire BINARY."""
    cases = [
        ("Forest plot of mortality or morbidity outcomes", "UNSTATED",
         "the English word 'or' MUST NOT match the OR measure"),
        ("Forest plot showing pooled OR for mortality", "BINARY", "upper-case OR is the measure"),
        ("Forest plot of standardised mean difference in HbA1c", "CONTINUOUS", "SMD spelled out"),
        ("Forest plot (random-effects) of pooled prevalence", "PROPORTION", "prevalence"),
        ("Forest plot", "UNSTATED", "no measure named"),
        ("Forest plot of RR and SMD across outcomes", "BOTH", "both families named"),
    ]
    bad = []
    for cap, want, why in cases:
        got = classify(cap)
        if got != want:
            bad.append(f"    FAIL: {cap!r} -> {got}, want {want}  ({why})")
    print("MUTATION TEST — the naked-'or' trap (OA-REACHABILITY §7 caught it once)")
    if bad:
        print("\n".join(bad))
        raise SystemExit("🛑 classifier self-test FAILED — do not trust the counts below")
    print(f"   {len(cases)}/{len(cases)} pass, including the naked-'or' trap  ✅\n")


def main():
    selftest()

    metas = set()
    with open(os.path.join(C.DATA, f"harvest.{C.NODE}.jsonl"), encoding="utf-8") as f:
        for ln in f:
            try:
                r = json.loads(ln)
            except Exception:
                continue
            v = r.get("pmcid")
            if v and str(v).startswith("PMC"):
                metas.add(v)

    caps, per_meta = [], {}
    with open(os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl"), encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            if r["pmcid"] not in metas:
                continue
            fam = set()
            for g in r["figs"]:
                if g["kind"] != "forest":
                    continue
                c = classify(g.get("caption", "") + " " + g.get("label", ""))
                caps.append(c)
                fam.add(c)
            if fam:
                per_meta[r["pmcid"]] = fam

    n = len(caps)
    cc = Counter(caps)
    print("=" * 78)
    print("OUTCOME TYPE — from the forest plot's own caption (a PROXY, labelled)")
    print("=" * 78)
    print(f"\nforest figures in OA metas: {n:,}   distinct metas: {len(per_meta):,}\n")
    print(f"{'class':14s} {'n':>7s} {'%':>7s}  {'95% CI':>16s}")
    print("-" * 78)
    out = {"n_figures": n, "n_metas": len(per_meta), "classes": {}}
    for k in ("BINARY", "CONTINUOUS", "BOTH", "PROPORTION", "UNSTATED"):
        v = cc[k]
        lo, hi = wilson(v, n)
        print(f"{k:14s} {v:7,d} {100*v/n:6.1f}%  [{100*lo:5.1f}, {100*hi:5.1f}]")
        out["classes"][k] = {"n": v, "pct": 100 * v / n, "ci95": [100 * lo, 100 * hi]}

    binf = cc["BINARY"] + cc["BOTH"]
    conf = cc["CONTINUOUS"] + cc["BOTH"]
    stated = n - cc["UNSTATED"]
    print("-" * 78)
    print(f"""
⭐ THE MISSION QUESTION: is there enough BINARY to build a gold set that is
   not blind the way D10 made us blind?

   figures naming a BINARY measure ...... {binf:,}  ({100*binf/n:.1f}% of all forest figs)
   figures naming a CONTINUOUS measure .. {conf:,}  ({100*conf/n:.1f}%)
   captions naming NO measure ........... {cc['UNSTATED']:,}  ({100*cc['UNSTATED']/n:.1f}%)  <- NOT folded either way

   of the {stated:,} figures that DO name a measure:
       binary-family      {100*binf/stated:5.1f}%
       continuous-family  {100*conf/stated:5.1f}%
""")
    out["binary_family"] = binf
    out["continuous_family"] = conf
    out["stated"] = stated

    # metas that could supply BOTH strata
    both_ok = sum(1 for f in per_meta.values()
                  if ({"BINARY", "BOTH"} & f) and ({"CONTINUOUS", "BOTH"} & f))
    bin_only = sum(1 for f in per_meta.values()
                   if ({"BINARY", "BOTH"} & f) and not ({"CONTINUOUS", "BOTH"} & f))
    con_only = sum(1 for f in per_meta.values()
                   if ({"CONTINUOUS", "BOTH"} & f) and not ({"BINARY", "BOTH"} & f))
    none = len(per_meta) - both_ok - bin_only - con_only
    print(f"""   per META (a meta can carry several plots):
       binary only .......... {bin_only:,}
       continuous only ...... {con_only:,}
       both ................. {both_ok:,}
       neither named ........ {none:,}
""")
    out["per_meta"] = {"binary_only": bin_only, "continuous_only": con_only,
                       "both": both_ok, "neither": none}

    print("""=============================================================================
⚠️ WHAT THIS DOES NOT SHOW (§17)
=============================================================================
 - CAPTION ≠ PLOT. This measures what the meta POOLED, not what the plot
   PRINTS. A caption naming an OR does NOT mean the figure prints a 2×2 — the
   brief's own 24.8% says most rows print effect+CI only. The 2×2-printing
   rate per outcome class is NOT MEASURED and needs vision.
 - UNSTATED is a real class and is reported, never folded. A caption that
   names no measure is not evidence of either family.
 - The frame is the 99.9%-single-era harvest (§0c). This distribution is a
   property of THAT corpus and may not survive the era re-seed. Re-run after.
""")
    json.dump(out, open(os.path.join(C.HERE, "outcometype.json"), "w",
                        encoding="utf-8"), indent=2)
    print("wrote outcometype.json")


if __name__ == "__main__":
    main()
