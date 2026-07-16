"""ROUTE 3 — THE LICENCE COUNT. Runs FIRST, before anything is built.

Mahmood: "if we are not allowed to share openly we can share the bits we are
allowed to share, and keep the rest in a private GitHub repo."
The brief: "Run the licence audit as a COUNT before building anything... If 90%
is CC-BY, the private remainder is a footnote. If it's 40%, that is a different
artefact and we must know BEFORE we spend the budget."

WHAT THIS MEASURES: the licence each publisher DECLARES, read from the article's
own JATS `<permissions><license><ali:license_ref>` — the NISO Access & Licence
Indicators standard. This is the publisher's own machine-readable assertion,
not our inference and not a third party's guess. Free, on-disk, no network.

WHAT IT DOES NOT DO — READ THIS BEFORE QUOTING ANY NUMBER BELOW:
  - It does NOT establish that we may redistribute extracted VALUES. That is a
    legal question (copyright in facts; EU sui generis database rights) that
    this script cannot answer and I will not assert. See ROUTE 1 in the
    deliverable: the question and the evidence, not a verdict.
  - A CC-BY article licence covers the ARTICLE. Figures can carry their own
    credit line ("third party material ... unless indicated otherwise in a
    credit line") — the CC-BY boilerplate in these very files says so verbatim.
    So an article-level CC-BY is NECESSARY, NOT SUFFICIENT, for the figure.
  - `specific-use="textmining"` appears on the license_ref. Recorded, not
    interpreted.
  - Articles with no license_ref are counted as UNKNOWN, never as permissive.
    Fail closed.

Run: python licenceaudit.py
Out: licenceaudit.json
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter

import config as C

LICREF = re.compile(r'<ali:license_ref[^>]*>([^<]+)</ali:license_ref>', re.I)
LICATTR = re.compile(r'content-type="([^"]+)"', re.I)
PERMS = re.compile(r"<permissions>.*?</permissions>", re.S | re.I)


def classify(url: str) -> str:
    """Map a Creative Commons URL to a licence class. Conservative: anything
    unrecognised is OTHER, never permissive."""
    u = (url or "").lower()
    if "/publicdomain/zero" in u or "cc0" in u:
        return "CC0"
    m = re.search(r"creativecommons\.org/licenses/([a-z\-]+)/", u)
    if not m:
        return "OTHER/UNRECOGNISED"
    code = m.group(1)
    return {
        "by": "CC-BY", "by-sa": "CC-BY-SA",
        "by-nc": "CC-BY-NC", "by-nc-sa": "CC-BY-NC-SA",
        "by-nd": "CC-BY-ND", "by-nc-nd": "CC-BY-NC-ND",
    }.get(code, f"CC-{code.upper()}")


# Redistribution posture PER CLASS. This is about what the LICENCE PERMITS for
# the article; it is NOT a ruling on extracted values (see docstring).
POSTURE = {
    "CC0":          ("SHAREABLE", "public domain dedication"),
    "CC-BY":        ("SHAREABLE", "derivatives redistributable WITH ATTRIBUTION"),
    "CC-BY-SA":     ("SHAREABLE*", "redistributable but SHARE-ALIKE: the derivative must carry the same licence — a mixed-licence gold set cannot be uniformly CC-BY"),
    "CC-BY-NC":     ("NON-COMMERCIAL", "redistributable for NON-COMMERCIAL use only — fits our mission, but downstream commercial re-use is barred, which limits who can adopt the benchmark"),
    "CC-BY-NC-SA":  ("NON-COMMERCIAL*", "non-commercial AND share-alike"),
    "CC-BY-ND":     ("⚠️ NO-DERIVATIVES", "NoDerivs — a derived dataset is arguably exactly what ND forbids"),
    "CC-BY-NC-ND":  ("⚠️ NO-DERIVATIVES", "non-commercial AND NoDerivs — the most restrictive common OA licence"),
    "OTHER/UNRECOGNISED": ("⚠️ UNKNOWN", "not a recognised CC URL — treat as NOT shareable until read by a human"),
    "NO_LICENSE_REF": ("⚠️ UNKNOWN", "no machine-readable licence in the JATS — fail closed"),
}


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def main():
    # ---- the frame: OA metas that figscan has scanned AND that carry a forest
    # plot. Same executable draw as goldsample.py steps 1-3. This is the
    # population the gold set would come from.
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
    forest = set()
    with open(os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl"), encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            if r["pmcid"] in metas and any(g["kind"] == "forest" for g in r["figs"]):
                forest.add(r["pmcid"])

    cls = Counter()
    textmining = Counter()
    missing_file = 0
    for p in sorted(forest):
        fp = os.path.join(C.DATA, "cache", f"{p}.xml")
        if not os.path.exists(fp):
            missing_file += 1
            continue
        head = open(fp, encoding="utf-8", errors="replace").read(120000)
        perms = PERMS.search(head)
        blob = perms.group(0) if perms else head
        m = LICREF.search(blob)
        if not m:
            cls["NO_LICENSE_REF"] += 1
            continue
        c = classify(m.group(1))
        cls[c] += 1
        a = LICATTR.search(m.group(0))
        textmining[a.group(1) if a else "none"] += 1

    n = sum(cls.values())
    print("=" * 78)
    print("LICENCE AUDIT — the count that runs BEFORE anything is built")
    print("=" * 78)
    print(f"""
FRAME (executable, same draw as goldsample.py steps 1-3):
  OA metas in harvest ledger .................. {len(metas):,}
  ∩ figscan-scanned with ≥1 forest figure ..... {len(forest):,}
  ∩ JATS present on disk ...................... {n:,}   (missing: {missing_file})

SOURCE: each article's own <permissions><license><ali:license_ref> (NISO ALI).
        The publisher's machine-readable declaration — not our inference.
""")
    print(f"{'licence':22s} {'n':>6s} {'%':>7s}  {'95% CI':>16s}  posture")
    print("-" * 78)
    out = {"frame": {"harvest_metas": len(metas), "with_forest": len(forest),
                     "jats_on_disk": n, "missing_jats": missing_file},
           "source": "JATS <ali:license_ref> (NISO ALI) — publisher's own declaration",
           "classes": {}}
    for k, v in cls.most_common():
        lo, hi = wilson(v, n)
        post, why = POSTURE.get(k, ("?", ""))
        print(f"{k:22s} {v:6,d} {100*v/n:6.1f}%  [{100*lo:5.1f},{100*hi:5.1f}]  {post}")
        out["classes"][k] = {"n": v, "pct": 100 * v / n, "ci95": [100 * lo, 100 * hi],
                             "posture": post, "why": why}

    share = sum(cls[k] for k in ("CC0", "CC-BY"))
    nc = sum(cls[k] for k in ("CC-BY-NC", "CC-BY-NC-SA"))
    nd = sum(cls[k] for k in ("CC-BY-ND", "CC-BY-NC-ND"))
    sa = cls["CC-BY-SA"]
    unk = cls["NO_LICENSE_REF"] + cls["OTHER/UNRECOGNISED"]
    lo, hi = wilson(share, n)
    print("-" * 78)
    print(f"""
⭐ THE NUMBER THE BRIEF ASKED FOR:
   CC-BY or CC0 (cleanly redistributable, attribution only)
       {share:,}/{n:,} = {100*share/n:.1f}%  95% CI [{100*lo:.1f}%, {100*hi:.1f}%]

   share-alike (CC-BY-SA) .................... {sa:,}  ({100*sa/n:.1f}%)
   non-commercial (NC family) ................ {nc:,}  ({100*nc/n:.1f}%)
   ⚠️ NO-DERIVATIVES (ND family) ............. {nd:,}  ({100*nd/n:.1f}%)
   ⚠️ unknown / no licence_ref ............... {unk:,}  ({100*unk/n:.1f}%)
""")
    out["summary"] = {
        "cc_by_or_cc0": {"k": share, "n": n, "pct": 100 * share / n, "ci95": [100 * lo, 100 * hi]},
        "share_alike": sa, "non_commercial": nc, "no_derivatives": nd, "unknown": unk,
    }
    print("license_ref content-type attribute (recorded, NOT interpreted):")
    for k, v in textmining.most_common(5):
        print(f"   {k:24s} {v:6,d}")
    out["license_ref_content_type"] = dict(textmining)

    verdict = ("FOOTNOTE" if 100 * share / n >= 85 else
               "MATERIAL" if 100 * share / n >= 60 else "DIFFERENT ARTEFACT")
    print(f"""
=============================================================================
VERDICT ON MAHMOOD'S FALLBACK: the private remainder is a {verdict}
=============================================================================
 The brief's own test: "If 90% is CC-BY, the private remainder is a footnote.
 If it's 40%, that is a different artefact." Measured: {100*share/n:.1f}%.
""")
    out["fallback_verdict"] = verdict

    print("""=============================================================================
⚠️ WHAT THIS COUNT DOES **NOT** LICENCE — do not overread it (§17)
=============================================================================
 1. IT IS AN ARTICLE-LICENCE COUNT, NOT A FIGURE-LICENCE COUNT. The CC-BY
    boilerplate in these very files says, verbatim: "The images or other third
    party material in this article are included in the article's Creative
    Commons license, UNLESS INDICATED OTHERWISE IN A CREDIT LINE to the
    material." ⇒ article-level CC-BY is NECESSARY, NOT SUFFICIENT, for a
    figure. Per-figure credit lines are NOT parsed here. NOT MEASURED.
 2. IT SAYS NOTHING ABOUT WHETHER EXTRACTED VALUES ARE COPYRIGHTABLE. That is
    ROUTE 1 and it is a legal question. This script deliberately does not
    answer it.
 3. UNKNOWN IS NOT PERMISSIVE. Every article without a machine-readable
    license_ref is counted as UNKNOWN and must be treated as NOT shareable
    until a human reads it. Fail closed.
 4. THE FRAME IS OA-ONLY AND THEREFORE FUNDER-BIASED (Wellcome 83.4% /
    Gates 77.7% OA vs NIH 52.7%) ⇒ this licence mix is a property of the
    OA meta population, NOT of the biomedical literature.
""")
    json.dump(out, open(os.path.join(C.HERE, "licenceaudit.json"), "w",
                        encoding="utf-8"), indent=2)
    print("wrote licenceaudit.json")


if __name__ == "__main__":
    main()
