"""FOREST PLOT AS BEHAVIOURAL RECORD — the inclusion record, recovered.

MAHMOOD (2026-07-16): the forest plot is not only a data source, it is a
BEHAVIOURAL RECORD, because **YOU CANNOT HIDE AN INCLUSION**. An excluded trial
vanishes silently and leaves no trace anywhere. But every INCLUDED trial is
NAMED, DATED, WEIGHTED and PRINTED on the plot. So the plot is a record of what
the authors actually DID — checkable against the review's own stated criteria
and against CT.gov.

WHY THIS MODULE COSTS NOTHING. The 36-figure batch of 2026-07-16 already read
the whole plot: every study label, every weight, every heterogeneity line, every
printed subtotal. It was scored only for 2x2 accuracy, so the behavioural layer
was BOUGHT AND NEVER BANKED. This module extracts it from the stored calls. NO
NEW VISION CALL IS MADE — `extract()` never touches a model, so every number it
produces is reproducible from disk.

THE POINT OF THE ROLE TAG. These records are `BEHAVIOURAL_RECORD`, never
`RECOVERY`. They answer a question about THE REVIEW, not about the trial. Mixing
them into a recovery numerator would score us for "recovering" a number we read
off the answer key.

WHAT IS PARSEABLE — measured, not assumed (2026-07-16, n=36 figures):
    study rows with a NAME     468/468 = 100.0%   (the inclusion record)
    ...with a YEAR in-label    277/468 =  59.2%
    ...with a WEIGHT           341/468 =  72.9%
    I2   from heterogeneity     58/72  =  80.6%
    tau2 from heterogeneity     43/72  =  59.7%
    effect_measure              32/36  =  88.9%
The gaps are REAL and are reported as nulls. A year absent from the label is
absent from the PLOT — the model did not drop it, the publisher did not print
it. Do not impute.

Run:  python behaviour.py            # extract + summary, re-runnable
      python behaviour.py --store    # also append to the vision store
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
from collections import Counter

import config as C

VERSION = "behaviour/1.0@2026-07-16"

# --- Heterogeneity is printed as free text on the plot and was stored verbatim
# in the row label. These regexes read it back. Both the unicode (I², Tau²) and
# ascii (I2, Tau2) forms appear across templates -> both are matched. A pattern
# that matched only one silently halves the yield.
_I2 = re.compile(r"I\s*[²2]\s*=\s*(-?\d+(?:\.\d+)?)\s*%")
_TAU2 = re.compile(r"[Tt]au\s*[²2]\s*=\s*(\d+(?:\.\d+)?)")
_CHI2 = re.compile(r"Chi\s*[²2]\s*=\s*(\d+(?:\.\d+)?)")
_DF = re.compile(r"\bdf\s*=\s*(\d+)")
_P = re.compile(r"\(\s*P\s*[=<>]\s*([\d.]+)\s*\)")
# A 4-digit year in a study label. Bounded {1,80} elsewhere per the ReDoS rule;
# this one is anchored and cannot backtrack.
_YEAR = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
# RevMan/Stata print the model in the column header, e.g. "IV, Random, 95% CI"
# or "M-H, Fixed, 95% CI". It is usually NOT in a field we stored -> we look in
# reading_notes and effect_measure, and null out when absent rather than guess.
_MODEL = re.compile(r"\b(random|fixed)[- ]?effects?\b|\b(M-H|IV|Peto),?\s*(Random|Fixed)\b",
                    re.IGNORECASE)


def _num(rx, s):
    m = rx.search(s or "")
    return float(m.group(1)) if m else None


def _year(label):
    m = _YEAR.search(label or "")
    return int(m.group(1)) if m else None


def _model(fig):
    """Fixed vs random, IF printed. Searched in reading_notes (where the column
    header text lands) — never inferred from the presence of tau2, which would
    be a guess dressed as a reading."""
    hay = " ".join(str(fig.get(k) or "") for k in ("reading_notes", "effect_measure"))
    m = _MODEL.search(hay)
    if not m:
        return None
    g = [x for x in m.groups() if x]
    return " ".join(g).lower() if g else None


def extract_one(fig):
    """One figure -> its behavioural record. Never calls a model."""
    rows = fig.get("rows") or []
    studies = [r for r in rows if r.get("row_type") == "study"]
    het_rows = [r for r in rows if r.get("row_type") == "heterogeneity"]
    tot_rows = [r for r in rows if r.get("row_type") in ("subtotal", "total")]

    trials = []
    for r in studies:
        lab = r.get("label")
        trials.append({
            "label": lab,
            "year": _year(lab),
            "weight_pct": r.get("weight_pct"),
            "subgroup": r.get("subgroup"),
            "effect": r.get("effect"),
            "ci_low": r.get("ci_low"), "ci_high": r.get("ci_high"),
            "confidence": r.get("confidence"),
        })

    het = []
    for r in het_rows:
        s = r.get("label") or ""
        het.append({"subgroup": r.get("subgroup"), "text": s,
                    "i2_pct": _num(_I2, s), "tau2": _num(_TAU2, s),
                    "chi2": _num(_CHI2, s), "df": _num(_DF, s), "p": _num(_P, s)})

    # Weight concentration: an error in a trial carrying 40% of the weight
    # matters 40x one carrying 1%. This is the triage field.
    ws = [t["weight_pct"] for t in trials if t["weight_pct"] is not None]
    ws_sorted = sorted(ws, reverse=True)
    top = ws_sorted[0] if ws_sorted else None

    return {
        "pmcid": fig.get("pmcid"),
        "image_path": fig.get("image_path"),
        "figure_kind": fig.get("figure_kind"),
        "effect_measure": fig.get("effect_measure"),
        "scale": fig.get("scale"),
        "model": _model(fig),
        "outcome": fig.get("outcome"),
        "n_trials": len(trials),
        "trials": trials,                       # THE INCLUSION RECORD
        "subgroups": sorted({t["subgroup"] for t in trials if t["subgroup"]}),
        "heterogeneity": het,
        "printed_subtotals": [
            {"label": r.get("label"), "subgroup": r.get("subgroup"),
             "effect": r.get("effect"), "n_t": r.get("n_t"), "n_c": r.get("n_c")}
            for r in tot_rows],
        "weight_top_pct": top,
        "weight_sum_pct": round(sum(ws), 1) if ws else None,
        "n_weighted": len(ws),
        "extractor_version": VERSION,
    }


def double_count_candidates(rec, figrows=None):
    """Trials entered TWICE under different names, inside one published plot.

    THE INSTRUMENT. You cannot hide an inclusion: a trial double-entered under
    two labels is PRINTED TWICE, carrying identical statistics. That is a
    real defect INSIDE a published meta-analysis (it double-weights one trial),
    and it is visible only from the plot.

    Precedent: PMC12472900 prints 'Chih-Chiang et al. (2008)' and 'Chiu et al.
    (2008)' with byte-identical statistics -> almost certainly Chiu C-C entered
    under given name AND surname.

    ⚠️ THE FALSE-POSITIVE THIS MUST SUPPRESS — found the hard way, 2026-07-16.
    Rare-event trials produce IDENTICAL ROUNDED effects by coincidence:
    PMC12399406 prints Jabbour (0/231 vs 1/233) and 'None 2014' (0/481 vs
    1/484) — genuinely DIFFERENT trials, both rounding to RR 0.34 [0.01, 8.21]
    at weight 1.9. Matching on (effect, CI, weight) alone flags it. It is NOT a
    double-count.

    So: when per-arm counts are present and DIFFER, the match is REFUTED.
    When counts are absent (continuous/SMD plots) we cannot discriminate and
    the candidate is reported as UNRESOLVED, never as a finding. This returns
    CANDIDATES for adjudication — never a verdict.
    """
    from collections import defaultdict
    idx = defaultdict(list)
    for t in rec["trials"]:
        key = (t["effect"], t["ci_low"], t["ci_high"], t["weight_pct"])
        if key[0] is None:
            continue
        idx[key].append(t)

    counts = {}
    for r in (figrows or []):
        if r.get("row_type") == "study":
            counts[r.get("label")] = (r.get("events_t"), r.get("n_t"),
                                      r.get("events_c"), r.get("n_c"))

    out = []
    for key, ts in idx.items():
        labels = {t["label"] for t in ts}
        if len(ts) < 2 or len(labels) < 2:
            continue
        cs = [counts.get(t["label"]) for t in ts]
        known = [c for c in cs if c and any(v is not None for v in c)]
        if len(known) >= 2 and len({tuple(c) for c in known}) > 1:
            verdict = "REFUTED_different_counts"   # rare-event rounding coincidence
        elif len(known) >= 2:
            verdict = "CANDIDATE_identical_counts_too"
        else:
            verdict = "UNRESOLVED_no_counts_to_discriminate"
        out.append({"pmcid": rec["pmcid"], "labels": sorted(labels),
                    "effect": key[0], "ci": [key[1], key[2]], "weight_pct": key[3],
                    "counts": {t["label"]: counts.get(t["label"]) for t in ts},
                    "verdict": verdict})
    return out


def load_batch():
    figs = []
    for f in sorted(glob.glob(os.path.join(C.DATA, "vision_out_*.json"))):
        figs += json.load(open(f, encoding="utf-8"))
    return figs


def summarise(recs):
    trials = [t for r in recs for t in r["trials"]]
    n = len(trials)
    yr = sum(1 for t in trials if t["year"] is not None)
    wt = sum(1 for t in trials if t["weight_pct"] is not None)
    het = [h for r in recs for h in r["heterogeneity"]]
    i2 = [h["i2_pct"] for h in het if h["i2_pct"] is not None]
    tau = [h["tau2"] for h in het if h["tau2"] is not None]
    print("=== BEHAVIOURAL RECORD — extracted from stored calls, NO new vision ===")
    print("figures                :", len(recs))
    print("TRIAL INCLUSIONS       :", n, "  <- the record that cannot be hidden")
    print("  with a year          : %d/%d = %.1f%%" % (yr, n, 100 * yr / n if n else 0))
    print("  with a weight        : %d/%d = %.1f%%" % (wt, n, 100 * wt / n if n else 0))
    print("distinct trial labels  :", len({t["label"] for t in trials}))
    print("heterogeneity lines    :", len(het))
    print("  I2 parsed            : %d/%d = %.1f%%" % (len(i2), len(het), 100 * len(i2) / len(het) if het else 0))
    print("  tau2 parsed          : %d/%d = %.1f%%" % (len(tau), len(het), 100 * len(tau) / len(het) if het else 0))
    if i2:
        i2s = sorted(i2)
        print("  I2 median            : %.0f%%  (min %.0f, max %.0f)" % (i2s[len(i2s) // 2], i2s[0], i2s[-1]))
        print("  I2 > 75%% (high het)  : %d/%d" % (sum(1 for x in i2 if x > 75), len(i2)))
    print("printed subtotals      :", sum(len(r["printed_subtotals"]) for r in recs), " <- free checksums")
    print("figures w/ model known :", sum(1 for r in recs if r["model"]), "/", len(recs))
    print("figures w/ measure     :", sum(1 for r in recs if r["effect_measure"]), "/", len(recs))
    # weight concentration
    tops = [r["weight_top_pct"] for r in recs if r["weight_top_pct"] is not None]
    if tops:
        tops.sort()
        print("heaviest single trial   : median %.1f%%  max %.1f%%" % (tops[len(tops) // 2], tops[-1]))
        print("  figures where ONE trial carries >40%%: %d/%d" % (sum(1 for x in tops if x > 40), len(tops)))
    # duplicate inclusions WITHIN one plot (non-independence)
    dup = 0
    for r in recs:
        c = Counter(t["label"] for t in r["trials"])
        dup += sum(1 for k, v in c.items() if v > 1)
    print("duplicated labels within a single plot:", dup, " <- non-independent rows")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--store", action="store_true",
                    help="append each record to the vision store as BEHAVIOURAL_RECORD")
    a = ap.parse_args()

    figs = load_batch()
    recs = [extract_one(f) for f in figs]
    recs = [r for r in recs if r["n_trials"] > 0]
    out = os.path.join(C.DATA, "behaviour.json")
    json.dump(recs, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    summarise(recs)
    print("\nwrote:", out)

    if a.store:
        import visionstore as vs
        n = skip = 0
        for r in recs:
            ip = r["image_path"]
            if not ip or not os.path.exists(ip):
                continue
            rec = vs.record(
                image_path=ip, role="BEHAVIOURAL_RECORD",
                model_id="unrecorded_claude_code_subagent_2026-07-16",
                prompt_version="forestvision.PROMPT@2026-07-16(unpinned)",
                raw_response="[DERIVED — no new vision call. Extracted by %s from the "
                             "stored 2026-07-16 batch, whose own raw text was not "
                             "retained. The behavioural layer was BOUGHT with that "
                             "batch and is banked here.]" % VERSION,
                parsed=r, parser_version=VERSION,
                source_kind="forest_figure_behaviour", source_id=r["pmcid"],
                # No allow_duplicate: the store keys idempotency on (sha, ROLE),
                # so this coexists with the figure's ANSWER_KEY record and a
                # re-run is still a no-op.
                notes="BEHAVIOURAL_RECORD: the inclusion record (trial list, years, "
                      "weights, subgroups, heterogeneity, printed subtotals). NOT "
                      "recovery — never enters a recovery numerator.",
            )
            n += 1 if rec else 0
            skip += 0 if rec else 1
        print("stored as BEHAVIOURAL_RECORD:", n, "| skipped:", skip)


if __name__ == "__main__":
    main()
