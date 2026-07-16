"""GOLD-SET FRAME — §0b enforced AT INGEST, with an executable how_drawn.

⚠️ THIS SCRIPT IS DESIGNED TO FAIL RIGHT NOW, AND ITS FAILING IS THE POINT.

Mahmood, 2026-07-16: "If we draw 'the first thousand we can reach', WE WILL HAVE
BUILT ANOTHER PAIRWISE70 — a convenience corpus that silently decides what we
can conclude — at the exact moment we learned not to."

He is right, and I have already done it twice today:
  (a) `ht_regime.py` Part 2 — inferred a cause from a summary statistic instead
      of reading the nine tables that were on disk.
  (b) Sampling the forest figures — I took "the first two in dict order",
      landed in the 2.3% non-meta stratum, and was one step from reporting
      "0/2 forest figures carry a 2x2" as a property of the corpus. It was a
      property of my draw.
So this frame is not documented, it is EXECUTED.

=============================================================================
THE FOUR §0b GATES (METHODS-CONTRACT §0b, as amended 2026-07-16)
=============================================================================
1. `how_drawn` is EXECUTABLE CODE, not a path. -> `draw()` below IS the frame.
   "It was to hand" cannot be written here. Pairwise70 has no answer to this.
2. `must_contain` asserts the mission's populations AT INGEST, via REGISTRY /
   MeSH fields — never outcome text (that is D12: a disease-word regex over
   drug-word text returns zero and looks exactly like evidence of absence).
   -> `must_contain()` below. It fails BEFORE the first number exists, which is
      the only moment the discovery is free.
3. The loader PRINTS ITS OWN DISCARD RATE. `export_rich.R` silently threw away
   92% of outcomes and nobody knew for two days. -> every step prints its drop.
4. State what the frame structurally CANNOT contain. -> STRUCTURAL_EXCLUSIONS.

Run: python goldsample.py
Out: goldsample.json (only if the gates pass — they do not yet)
"""
from __future__ import annotations

import json
import os
import sys

import config as C

# ---------------------------------------------------------------- gate 4
STRUCTURAL_EXCLUSIONS = [
    "PUBLICATION TYPE: the corpus is `PUB_TYPE:\"Meta-Analysis\"` (OA_META_QUERY). "
    "A systematic review WITHOUT a meta-analysis tag is not here, nor is any "
    "pooled analysis PubMed failed to tag. Prevalence of that miss: NOT MEASURED.",
    "OPEN ACCESS: `OPEN_ACCESS:y AND HAS_FT:y`. Paywalled metas are structurally "
    "absent. Per OA-REACHABILITY §4.1 OA tracks FUNDER (Wellcome 83.4% / Gates "
    "77.7% vs NIH 52.7%) ⇒ this frame is BIASED TOWARD Gates/Wellcome/MRC-funded "
    "work, which is malaria-rich and NCD-poor. That bias runs IN FAVOUR of the "
    "mission and must be declared when quoting any disease mix.",
    "SOURCE: `SRC:MED` — PubMed-indexed only. Non-indexed regional journals "
    "(much African/Asian output) are absent.",
    "LANGUAGE: not filtered by us, but PubMed indexing skews English. NOT MEASURED.",
    "FIGURE FORMAT: raster only. Pronesti 2025 (CochraneForest) took the SVG "
    "subset of Cochrane CDSR; we take non-Cochrane raster. Metas whose plots are "
    "vector-only in a format figfetch cannot land are absent.",
    "CAPTION-DEPENDENT: `figscan` classifies from caption text and is deliberately "
    "conservative. A forest plot with an empty or unhelpful caption is a MISS "
    "(28,345 figures sit in `unknown`). Every rate is a LOWER BOUND.",
    "TB WARNING (from the audit lane): TB is 73% KEY-ABSENT, so ANY NCT-joined "
    "frame under-counts TB most. This frame is not NCT-joined (it is meta-level), "
    "but any downstream join to trials WILL inherit that, and TB will look "
    "thinner than it is. Name it; do not discover it.",
]

# Mission populations. Counted via MeSH (controlled vocabulary), never outcome text.
MISSION = ["malaria", "tb", "hiv", "ncd"]


def draw():
    """⭐ how_drawn — EXECUTABLE. This function IS the frame definition.

    Every step prints what it drops (gate 3). No step is 'it was to hand'.
    """
    steps = []

    # step 1 — the OA meta harvest ledger. The population of record.
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
    steps.append(("harvest ledger (PUB_TYPE:Meta-Analysis, OA, has-FT)", len(metas), 0))

    # step 2 — restrict to papers figscan has actually scanned.
    scanned, figs_of = set(), {}
    with open(os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl"), encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            scanned.add(r["pmcid"])
            figs_of[r["pmcid"]] = r["figs"]
    a = metas & scanned
    steps.append(("∩ scanned by figscan", len(a), len(metas) - len(a)))

    # step 3 — keep only metas with ≥1 caption-classified forest figure.
    b = {p for p in a if any(g["kind"] == "forest" for g in figs_of.get(p, []))}
    steps.append(("∩ ≥1 caption-classified forest figure", len(b), len(a) - len(b)))

    # step 4 — keep only those whose figure BYTES actually landed.
    landed = set()
    fp = os.path.join(C.DATA, f"figfetch.{C.NODE}.jsonl")
    if os.path.exists(fp):
        with open(fp, encoding="utf-8") as f:
            for ln in f:
                r = json.loads(ln)
                if r.get("fetched") and os.path.exists(r.get("path", "")):
                    landed.add(r["pmcid"])
    c = b & landed
    steps.append(("∩ figure bytes on disk (figfetch)", len(c), len(b) - len(c)))

    return c, steps


def mesh_tags(pmcids):
    """⭐ must_contain's counter. MUST use MeSH / a controlled vocabulary.

    §0 lesson 2 + D12: a disease-word regex over the paper's TEXT is exactly the
    defect that produced '0 malaria/TB pairs' — Cochrane malaria trials print
    only drug names, so `malaria|plasmodium|falciparum` returned 1 of 1,099
    cells. We will NOT tag disease from title/abstract/outcome text here.

    The harvest ledger carries only {pmcid, pmid, doi, status, tier, bytes,
    tiers_tried, path} — MEASURED, no MeSH field exists. So this returns None
    and must_contain FAILS CLOSED. That is correct: we cannot yet stratify by
    disease, therefore we cannot yet draw the sample.
    """
    return None


def must_contain(pmcids):
    """⭐ Gate 2 — assert the mission's populations BEFORE the first number.

    Fails LOUDLY at ingest, not as a zero three weeks later.
    """
    tags = mesh_tags(pmcids)
    if tags is None:
        raise SystemExit(
            "\n" + "=" * 78 + "\n"
            "🛑 must_contain CANNOT BE EVALUATED — FRAME NOT DRAWN, BY DESIGN.\n"
            + "=" * 78 + "\n"
            "\n  The mission's populations cannot be counted, because NO MeSH /\n"
            "  controlled-vocabulary disease field exists for these metas on disk.\n"
            "  Measured: harvest.pc1.jsonl carries only\n"
            "      {pmcid, pmid, doi, status, tier, bytes, tiers_tried, path}\n"
            "\n  I will NOT substitute a title/abstract keyword regex. That is D12 —\n"
            "  the exact defect that produced the '0 malaria/TB pairs' headline and\n"
            "  tagged 1 of 1,099 cells. A disease-word search over text we have not\n"
            "  established uses disease words returns zero and looks like evidence\n"
            "  of absence.\n"
            "\n  ⇒ THE GATE IS WORKING. This is §0b firing at ingest, at the only\n"
            "    moment the discovery is free — BEFORE a number exists to be wrong.\n"
            "\n  TO UNBLOCK (one step, ~50 min, no key needed):\n"
            "    Pull MeSH headings per PMID from PubMed E-utilities efetch\n"
            "    (8,817 PMIDs, unkeyed 3 req/s ⇒ ~50 min; NCBI_API_KEY makes it\n"
            "    ~9 min at 10 req/s). Persist to data/mesh.<node>.jsonl. Then map\n"
            "    MeSH → {malaria, tb, hiv, ncd} with the SAME term lists\n"
            "    OA-REACHABILITY §1 already froze, and re-run this script.\n"
            "\n  Until then: NO SAMPLE IS DRAWN. Drawing 'the first thousand we can\n"
            "  reach' now is exactly the Pairwise70 failure, and it is the one\n"
            "  thing Mahmood explicitly said not to do.\n"
        )
    for pop in MISSION:
        n = tags.get(pop, 0)
        assert n > 0, f"must_contain FAILED: {pop} = 0 in the drawn frame"
    return tags


def main():
    print("=" * 78)
    print("GOLD-SET FRAME — §0b enforced at ingest")
    print("=" * 78)
    print("\n⭐ how_drawn (EXECUTABLE — the function `draw()` IS the frame):\n")
    frame, steps = draw()
    print(f"{'step':52s} {'kept':>7s} {'dropped':>8s} {'drop%':>7s}")
    print("-" * 78)
    prev = None
    for name, kept, dropped in steps:
        pct = (100 * dropped / (kept + dropped)) if (kept + dropped) else 0
        print(f"{name:52s} {kept:7,d} {dropped:8,d} {pct:6.1f}%")
        prev = kept
    print("-" * 78)
    print(f"\n⭐ GATE 3 — cumulative discard: {steps[0][1]:,} → {frame and len(frame):,} "
          f"= {100*(1-len(frame)/steps[0][1]):.1f}% DISCARDED and PRINTED.")
    print("  (`export_rich.R` discarded 92% silently. This one says so.)")

    print("\n" + "=" * 78)
    print("⭐ GATE 4 — what this frame STRUCTURALLY CANNOT CONTAIN")
    print("=" * 78)
    for i, s in enumerate(STRUCTURAL_EXCLUSIONS, 1):
        print(f"\n {i}. {s}")

    print("\n" + "=" * 78)
    print("⭐ GATE 2 — must_contain, evaluated NOW (before any number exists)")
    print("=" * 78)
    must_contain(frame)          # <-- exits here, by design

    json.dump({"frame": sorted(frame)},
              open(os.path.join(C.HERE, "goldsample.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
