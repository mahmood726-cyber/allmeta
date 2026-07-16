"""INTER-READER AGREEMENT — where two lanes read the SAME image independently.

WHY THIS IS THE MOST VALUABLE BYPRODUCT OF A BUG. On 2026-07-16 shards A and B
collided: both were told to "prioritise MALARIA, TB, NCD", so both marched onto
the same figures and paid twice. That is a real waste. But it also produced the
one thing a store with a strict never-read-twice rule can NEVER produce:

    TWO INDEPENDENT VISION READS OF THE SAME PIXELS.

A vision call is non-reproducible — re-running returns a different answer. That
is exactly why the store forbids re-reads. The consequence, rarely stated: a
single-read store has NO measure of its own reliability. Every number in it is
unreplicated. `confidence:"high"` is the model's SELF-report, and the parser we
benchmarked was 47.1% wrong while emitting "high" on every single error — so we
already know self-reported confidence can be worthless. Independent agreement is
the only external check available.

    DO NOT LET THE MERGE DEDUPE THESE. A merge that keeps one row per (sha, role)
    silently throws away the only reliability evidence in the store, and it will
    look like tidying up.

WHAT AGREEMENT DOES AND DOES NOT MEAN. Two Claude subagents are NOT independent
in the way two human raters are: same model, same weights, same prompt. Agreement
therefore bounds reliability OPTIMISTICALLY — correlated errors agree with each
other. Disagreement is strong evidence of unreliability; agreement is weak
evidence of correctness. Report it as such and never upgrade it to "validated".

Usage: python compare_dupes.py
"""
from __future__ import annotations

import glob
import json
import os
from collections import defaultdict

STORE = os.path.join("data", "visionstore")
TOL = 1e-9


def load():
    by_key = defaultdict(list)
    for f in sorted(glob.glob(os.path.join(STORE, "calls*.jsonl"))):
        lane = os.path.basename(f)
        for line in open(f, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            r["_lane"] = lane
            by_key[(r["image_sha256"], r.get("role"))].append(r)
    return by_key


def _norm_label(s):
    """Join key. Labels are printed text, so the two lanes render the same trial
    as 'Baptista et al., 1997' and 'Baptista et al. 1997'. Punctuation and the
    trailing year are cosmetic; dropping them is NOT massaging the data, it is
    refusing to score a comma as a disagreement."""
    import re
    s = (s or "").strip().lower()
    s = re.sub(r"[.,;:]", " ", s)
    s = re.sub(r"\b(19|20)\d{2}\b", " ", s)     # year lives in its own field
    s = re.sub(r"\bet al\b", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def studies(parsed):
    """Study rows keyed by normalised label, ACROSS BOTH LANE SCHEMAS.

    THE TWO LANES DO NOT SHARE A SCHEMA and nobody agreed one:
        shard B : rows[] with row_type=="study", weight  ("weight")
        shard A : trials[] (already study-only),  weight_pct
    A first cut of this script only understood B's schema, found 0 study rows in
    every A record, and duly reported "70% disagreement on figure_kind". That
    number was an artefact of the comparator, not a property of the data — a
    fabricated finding, produced by the very tool built to catch fabrication.
    Check that a comparator can SEE both sides before believing anything it says
    about how much they differ. Row ORDER is never a key; label is.
    """
    out = {}
    if not isinstance(parsed, dict):
        return out
    rows = []
    if isinstance(parsed.get("rows"), list):          # shard B
        rows = [r for r in parsed["rows"]
                if isinstance(r, dict) and r.get("row_type") == "study"]
    elif isinstance(parsed.get("trials"), list):      # shard A
        rows = [dict(r, weight=r.get("weight_pct"))
                for r in parsed["trials"] if isinstance(r, dict)]
    for r in rows:
        k = _norm_label(r.get("label"))
        if k:
            out[k] = r
    return out


def is_forest(parsed):
    """Collapse the two lanes' figure_kind VOCABULARIES to the one question they
    both actually answer: is this a per-study meta-analysis forest plot?
      shard A : forest_continuous | forest_binary | forest_... | not_a_forest_plot
      shard B : forest_per_study | forest_multipanel | not_a_forest_plot
    Comparing the raw strings scores a vocabulary difference as a reading
    disagreement. Only the shared question is comparable."""
    if not isinstance(parsed, dict):
        return None
    k = (parsed.get("figure_kind") or "").lower()
    if not k:
        return None
    if "not_a_forest" in k or "not a forest" in k:
        return False
    return "forest" in k


def num(a, b):
    if a is None and b is None:
        return "both_null"
    if a is None or b is None:
        return "one_null"          # one abstained, one answered — NOT agreement
    try:
        return "same" if abs(float(a) - float(b)) <= TOL else "DIFF"
    except (TypeError, ValueError):
        return "same" if str(a) == str(b) else "DIFF"


def main() -> int:
    by_key = load()
    dupes = {k: v for k, v in by_key.items()
             if len({r["_lane"] for r in v}) > 1}
    if not dupes:
        print("No cross-lane duplicate reads found.")
        return 0

    imgs = sorted({k[0] for k in dupes})
    print("=== CROSS-LANE DUPLICATE READS ===")
    print("images read by >1 lane :", len(imgs))
    print("(sha, role) duplicated :", len(dupes))
    print()

    FIELDS = ["effect", "ci_low", "ci_high", "weight",
              "events_t", "n_t", "events_c", "n_c"]
    tally = defaultdict(lambda: defaultdict(int))
    label_sets = []
    fig_lines = []

    for (sha, role), recs in sorted(dupes.items()):
        if role != "BEHAVIOURAL_RECORD":
            continue            # the trial list lives here; avoids double-count
        lanes = {}
        for r in recs:
            lanes.setdefault(r["_lane"], r)
        if len(lanes) < 2:
            continue
        (l1, r1), (l2, r2) = sorted(lanes.items())[:2]
        s1, s2 = studies(r1.get("parsed")), studies(r2.get("parsed"))
        shared = set(s1) & set(s2)
        only1, only2 = set(s1) - set(s2), set(s2) - set(s1)
        label_sets.append((sha, len(s1), len(s2), len(shared), len(only1), len(only2)))
        for lab in shared:
            for f in FIELDS:
                tally[f][num(s1[lab].get(f), s2[lab].get(f))] += 1
        for f in ("effect_measure", "model", "figure_kind"):
            v1 = (r1.get("parsed") or {}).get(f)
            v2 = (r2.get("parsed") or {}).get(f)
            tally["FIG:" + f][num(v1, v2)] += 1
        fig_lines.append((sha[:12], (r1.get("source_id") or "")[:34],
                          len(s1), len(s2), len(shared), len(only1) + len(only2)))

    print("--- TRIAL LIST (did the two reads find the SAME studies?) ---")
    print("%-14s %-34s %5s %5s %6s %6s" %
          ("sha", "source", "A#", "B#", "both", "only1"))
    for row in fig_lines:
        print("%-14s %-34s %5d %5d %6d %6d" % row)

    print("\n--- FIELD AGREEMENT over studies BOTH reads found ---")
    print("%-22s %7s %7s %9s %9s  %s" %
          ("field", "same", "DIFF", "both_null", "one_null", "disagree%"))
    for f, c in tally.items():
        same, diff = c["same"], c["DIFF"]
        one = c["one_null"]
        den = same + diff
        pct = ("%.1f%%" % (100.0 * diff / den)) if den else "n/a"
        print("%-22s %7d %7d %9d %9d  %s" %
              (f, same, diff, c["both_null"], one, pct))

    print("""
READ THIS BEFORE QUOTING ANY NUMBER ABOVE
  * `one_null` is NOT agreement. It is one lane abstaining where the other
    answered — the single most interesting cell here, because it says the reject
    option is not stable across reads.
  * `both_null` is usually COLUMN ABSENCE (the figure never printed that field),
    not two reads agreeing on a hard call. It inflates any naive "agreement rate"
    and is therefore excluded from disagree%.
  * Same model + same prompt => correlated errors. Agreement here BOUNDS
    reliability optimistically. Disagreement is strong evidence of a problem;
    agreement is weak evidence of correctness. Never call this "validated".""")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
