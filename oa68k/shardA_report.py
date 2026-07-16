"""SHARD-A CHECKPOINT — what the run has actually banked, re-runnable from disk.

THE FIELD THIS EXISTS FOR IS ABSTENTION. A tested text parser was 47.1% wrong
with EVERY error emitted at `confidence="high"` — no gradient, therefore no
reject option, therefore unusable at any coverage. The question here is whether
vision ABSTAINS where that parser confabulated. So the abstention rate is not a
quality complaint about this run, it is the measurement. A run with zero
abstentions has not proven it is right; it has only failed to report a gradient.

WHAT IS COUNTED, AND THE DISTINCTION THAT MAKES IT MEAN ANYTHING:
    null      the plot NEVER PRINTED this field. A publisher's omission.
    abstain   the plot printed it and the model COULD NOT READ IT.
Folding those together would report a publisher's omission as a model failure and
vice versa. They are counted separately and never summed.

Coverage numbers here describe WHAT WAS READ. They are not accuracy: nothing in
this module compares a value to an external truth. `forestvision.check_extraction`
supplies the only self-check that needs no ground truth (the plot states the same
quantity twice), and it is reported as its own three-way split — `arith_na` is NOT
a pass.

Run:  python shardA_report.py
"""
from __future__ import annotations

import json
import os
from collections import Counter

import forestvision
import visionshard as SH

ARM_FIELDS = ("events_t", "n_t", "events_c", "n_c",
              "mean_t", "sd_t", "mean_c", "sd_c")
EFFECT_FIELDS = ("effect", "ci_low", "ci_high", "weight_pct")
HET_FIELDS = ("i2_pct", "tau2", "chi2", "df", "p")


def load():
    if not os.path.exists(SH.SHARD):
        return []
    return [json.loads(l) for l in open(SH.SHARD, encoding="utf-8") if l.strip()]


def main() -> int:
    recs = load()
    ak = [r for r in recs if r["role"] == "ANSWER_KEY"]
    if not ak:
        print("nothing banked yet")
        return 0

    # MULTI-OBSERVATION IMAGES. An image read independently twice contributes TWO
    # ANSWER_KEYs, so "figures" and "observations" stop being the same number.
    # Counting observations as figures would silently inflate every row total
    # (one image here contributes 56 rows in one reading and 148 in the other).
    #
    # The report does NOT pick a winner. Picking by row count would reward
    # confabulation — the reading that invents the most rows would win — and
    # picking the latest would encode "newest is best", which is not true in
    # general. The disagreement is surfaced and left for the arbitration recorded
    # in each record's `notes`.
    by_sha = {}
    for r in ak:
        by_sha.setdefault(r["image_sha256"], []).append(r)
    multi = {s: v for s, v in by_sha.items() if len(v) > 1}

    kinds = Counter(r["parsed"].get("figure_kind") for r in ak)
    conf = Counter()
    field_present = Counter()
    field_abstain = Counter()
    n_studies = 0
    rows_by_conf = Counter()

    for r in ak:
        p = r["parsed"]
        for row in p.get("rows") or []:
            if row.get("row_type") != "study":
                continue
            n_studies += 1
            rows_by_conf[row.get("confidence")] += 1
            fc = row.get("field_confidence") or {}
            for f in ARM_FIELDS + EFFECT_FIELDS + ("label", "year"):
                if row.get(f) is not None:
                    field_present[f] += 1
                if fc.get(f) == "abstain":
                    field_abstain[f] += 1
        h = p.get("heterogeneity") or {}
        for f in HET_FIELDS:
            if h.get(f) is not None:
                field_present["het." + f] += 1
        if h.get("confidence") == "abstain":
            field_abstain["het"] += 1
        for f in ("effect_measure", "model", "outcome", "scale"):
            if p.get(f) is not None:
                field_present["fig." + f] += 1
        conf[r.get("prompt_version")] += 1

    print("=== SHARD-A CHECKPOINT ===")
    print("distinct figures     :", len(by_sha))
    print("observations         :", len(ak), "(an image read twice contributes 2)")
    print("study rows           :", n_studies, "— across OBSERVATIONS, not figures")
    if multi:
        print()
        print("!! MULTI-OBSERVATION IMAGES — read independently more than once.")
        print("   Row counts below double-count these. No winner is picked here;")
        print("   the arbitration is in each record's `notes`.")
        for s, v in multi.items():
            rows = [sum(1 for x in (r["parsed"].get("rows") or [])
                        if x.get("row_type") == "study") for r in v]
            print("   %s %s: %d observations, study rows %s"
                  % (v[0].get("source_id"), s[:12], len(v), rows))
        print()
    print("repeat-reads flagged :", sum(1 for r in ak if r.get("also_in_owner_ledger")))
    print("prompt versions      :", dict(conf))
    print("figure_kind          :", dict(kinds))
    print()
    print("--- ABSTENTION (the reject option; the point of the run) ---")
    print("row confidence       :", dict(rows_by_conf))
    tot = sum(rows_by_conf.values()) or 1
    ab = rows_by_conf.get("abstain", 0)
    print("row abstention rate  : %.2f%% (%d/%d)" % (100.0 * ab / tot, ab, tot))
    print("per-field abstains   :", dict(field_abstain) or "none emitted")
    print()
    print("--- FIELD CAPTURE (what was READ; not accuracy) ---")
    print("    denominator = %d study rows. A gap is a NULL — the plot did not"
          % n_studies)
    print("    print it. Nulls are never imputed and never merged with abstains.")
    for f in ("label", "year") + ARM_FIELDS + EFFECT_FIELDS:
        n = field_present.get(f, 0)
        print("    %-12s %5d  %5.1f%%" % (f, n, 100.0 * n / (n_studies or 1)))
    print("  per-figure (denominator = %d figures):" % len(ak))
    for f in ("fig.effect_measure", "fig.model", "fig.outcome", "fig.scale",
              "het.i2_pct", "het.tau2", "het.chi2", "het.df", "het.p"):
        n = field_present.get(f, 0)
        print("    %-18s %4d  %5.1f%%" % (f, n, 100.0 * n / len(ak)))

    print()
    print("--- ARITHMETIC SELF-CHECK (no external truth needed) ---")
    print("    arith_na is NOT a pass: it means the plot printed no counts to")
    print("    check against, i.e. no 2x2 is recoverable from those pixels.")
    agg = Counter()
    for r in ak:
        try:
            c = forestvision.check_extraction(r["parsed"])
        except Exception:
            agg["check_error"] += 1
            continue
        for k, v in (c.get("row_checks") or {}).items():
            agg[k] += v
    print("   ", dict(agg) or "n/a")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
