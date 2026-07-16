"""THE KEY-ABSENT vs DATA-ABSENT AUDIT — the table that decides this lane's priority.

Runs the widened multi-registry key over the cached OA JATS and answers, with
measured numbers:

  * Of metas our NCT join scores UNLINKED, how many actually cite a registration
    ID from some OTHER registry (PACTR/ISRCTN/CTRI/...)?  -> KEY-ABSENT: our fault.
  * How many cite no registration of any registry at all?  -> DATA-ABSENT.
  * Link rate NCT-ONLY vs WIDENED. The delta IS the finding.

Also reports malaria / TB / NCD separately, because a global average hides exactly
the hole that matters: an NCT-only join links industry cardiology fine and African
malaria/TB at ~zero, and that would be our engineering limit masquerading as a
property of the evidence base.

Disease tagging is on the meta's own title/abstract text and is deliberately coarse
and REPORTED AS SUCH — it is a triage lens, not a classifier.

Run:  python keyaudit.py [--limit N]
"""
from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict

import config as C
import jats
import registry_ids as R

MALARIA = re.compile(r"\bmalaria|plasmodium|artemisinin|artesunate|chemoprevention\b", re.I)
TB = re.compile(r"\btuberculosis|\bTB\b|mycobacterium tuberculosis|rifampicin|isoniazid|bedaquiline\b", re.I)
NCD = re.compile(
    r"\bhypertension|blood pressure|diabet|cardiovascular|heart failure|myocardial|"
    r"stroke|chronic kidney|\bCKD\b|atrial fibrillation|dyslipid|cholesterol|statin|"
    r"obesity|cancer|carcinom|oncolog|rheumatic heart|ischaem|ischem|COPD|asthma\b", re.I)


def disease_of(text: str) -> list[str]:
    t = text[:6000]
    tags = []
    if MALARIA.search(t):
        tags.append("malaria")
    if TB.search(t):
        tags.append("TB")
    if NCD.search(t):
        tags.append("NCD")
    return tags or ["other"]


def run(limit: int) -> dict:
    cls = Counter()
    by_disease = defaultdict(Counter)
    reg_hits = Counter()
    nonnct_examples = []
    n = 0

    for hpath in C.node_ledgers("harvest"):
        with open(hpath, encoding="utf-8") as f:
            for line in f:
                if n >= limit:
                    break
                rec = json.loads(line)
                if rec.get("status") != "XML":
                    continue
                p = rec.get("path")
                if not p or not os.path.exists(p):
                    continue
                with open(p, "rb") as xf:
                    raw = xf.read()
                text = jats.all_text(raw)
                if not text:
                    continue
                n += 1
                ids = R.find_all(text)
                for k, v in ids.items():
                    reg_hits[k] += len(v)
                c = R.classify(ids)
                cls[c] += 1
                for d in disease_of(text):
                    by_disease[d][c] += 1
                if c == "KEY-ABSENT" and len(nonnct_examples) < 12:
                    nonnct_examples.append({
                        "pmcid": rec.get("pmcid"),
                        "registries": R.non_nct_registries(ids),
                        "sample_id": next(iter(ids.values()))[0],
                        "disease": disease_of(text),
                    })
    return {"n": n, "classes": cls, "by_disease": by_disease,
            "registry_hits": reg_hits, "examples": nonnct_examples}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100000)
    a = ap.parse_args()
    r = run(a.limit)
    n = max(r["n"], 1)

    print(f"=== KEY-ABSENT vs DATA-ABSENT over {r['n']:,} cached OA metas ===\n")
    for k in ("NCT-LINKABLE", "KEY-ABSENT", "DATA-ABSENT"):
        print(f"  {r['classes'][k]:>7,}  {r['classes'][k]/n:6.2%}  {k}")

    nct = r["classes"]["NCT-LINKABLE"]
    widened = nct + r["classes"]["KEY-ABSENT"]
    print(f"\n=== LINK RATE: NCT-ONLY vs WIDENED (the delta is the finding) ===")
    print(f"  NCT-only : {nct:>7,}  {nct/n:6.2%}")
    print(f"  widened  : {widened:>7,}  {widened/n:6.2%}")
    print(f"  DELTA    : {widened-nct:>7,}  +{(widened-nct)/n:.2%} recoverable by widening the key alone")

    print(f"\n=== registration IDs found, by registry ===")
    for k, v in r["registry_hits"].most_common():
        tag = "  <- African/LMIC-first" if k in R.AFRICAN_LMIC else ""
        print(f"  {k:9} {v:>7,}{tag}")

    print(f"\n=== BY DISEASE (malaria / TB / NCD reported separately) ===")
    for d in ("malaria", "TB", "NCD", "other"):
        c = r["by_disease"].get(d)
        if not c:
            continue
        tot = sum(c.values())
        nl, ka = c["NCT-LINKABLE"], c["KEY-ABSENT"]
        print(f"  {d:8} n={tot:>6,}  NCT-only={nl/tot:6.2%}  widened={(nl+ka)/tot:6.2%}"
              f"  key-absent={ka/tot:6.2%}")

    if r["examples"]:
        print(f"\n=== KEY-ABSENT examples (registered, but NOT on CT.gov) ===")
        for e in r["examples"][:8]:
            print(f"  {e['pmcid']:14} {','.join(e['registries']):22} {e['sample_id']:24} {e['disease']}")
