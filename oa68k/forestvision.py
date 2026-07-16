"""Stage F4 — the vision extraction contract, and the checks that police it.

WHAT THIS MODULE IS. It holds (a) the exact schema a vision model must return for
one forest plot, (b) the prompt that asks for it, and (c) the deterministic checks
that decide whether a returned row is trustworthy. It does NOT call a model — the
caller supplies the model output — so every check here is testable offline against
hand-built fixtures, and the accuracy numbers we report are reproducible.

WHY A SELF-CHECK EXISTS AT ALL. A forest plot is **over-determined**: for a
dichotomous outcome the per-arm events/N fully determine the effect estimate and
its confidence interval. So the plot states the same quantity twice — once as
counts, once as a plotted effect + CI. If a vision model misreads a digit, the
recomputed effect stops matching the printed effect. That gives us a check that
needs NO external ground truth and therefore covers the whole corpus, not just
the sliver with registry links. It is a **necessary, not sufficient** condition:
a consistent misread of both fields would pass. It is used to catch errors, never
to certify truth — the registry comparison is what measures truth.

The three-way split we report per row:
  `arith_ok`     recomputed effect+CI matches the printed effect+CI in tolerance
  `arith_fail`   they disagree -> at least one field was misread (a real error)
  `arith_na`     not checkable (continuous outcome without SDs, effect not shown,
                 counts absent). NOT a pass — reported as its own category, since
                 folding un-checkable rows into "ok" would inflate accuracy.

Tolerances are on the LOG scale for ratio measures because that is the scale the
estimate is computed and plotted on; comparing RR=0.50 to RR=0.55 on the natural
scale mis-weights the same relative error at different magnitudes.
"""
from __future__ import annotations

import math

# --- Zero-cell handling. The 0.5 correction is applied ONLY when a cell is zero
# (per the standing stats rule: unconditional correction biases the OR toward 1).
# It is applied for the CHECK only; the extracted counts are never mutated.
_CORR = 0.5

SCHEMA = {
    "type": "object",
    "required": ["figure_kind", "outcome", "effect_measure", "rows", "reading_notes"],
    "properties": {
        "figure_kind": {
            "type": "string",
            "enum": ["forest_dichotomous", "forest_continuous", "forest_generic",
                     "forest_multipanel", "not_a_forest_plot", "unreadable"],
            "description": (
                "forest_generic = effect+CI plotted but NO per-arm counts shown "
                "(the plot cannot yield a 2x2). not_a_forest_plot = funnel/SROC/"
                "PRISMA/KM/subgroup-of-one-trial. unreadable = resolution or "
                "cropping prevents confident reading."),
        },
        "outcome": {"type": ["string", "null"],
                    "description": "Outcome name from caption/axis/header, verbatim."},
        "timepoint": {"type": ["string", "null"]},
        "effect_measure": {"type": ["string", "null"],
                           "description": "RR|OR|HR|RD|MD|SMD|IV|other, as printed."},
        "scale": {"type": ["string", "null"], "enum": ["log", "linear", None]},
        "rows": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["label", "row_type"],
                "properties": {
                    "label": {"type": "string"},
                    "row_type": {
                        "type": "string",
                        "enum": ["study", "subgroup_header", "subtotal", "total",
                                 "heterogeneity", "other"],
                        "description": (
                            "THE CRITICAL FIELD. A subgroup header ('1.1.1 "
                            "Depression at post-test') and a 'Subtotal (95% CI)' "
                            "diamond are NOT studies. Mislabelling either as a "
                            "study injects a phantom trial and double-counts the "
                            "pooled estimate as primary data."),
                    },
                    "subgroup": {"type": ["string", "null"],
                                 "description": "Enclosing subgroup, if any."},
                    "events_t": {"type": ["number", "null"]},
                    "n_t": {"type": ["number", "null"]},
                    "events_c": {"type": ["number", "null"]},
                    "n_c": {"type": ["number", "null"]},
                    "mean_t": {"type": ["number", "null"]},
                    "sd_t": {"type": ["number", "null"]},
                    "mean_c": {"type": ["number", "null"]},
                    "sd_c": {"type": ["number", "null"]},
                    "effect": {"type": ["number", "null"]},
                    "ci_low": {"type": ["number", "null"]},
                    "ci_high": {"type": ["number", "null"]},
                    "weight_pct": {"type": ["number", "null"]},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
        },
        "reading_notes": {
            "type": "string",
            "description": "Anything that made a value uncertain: overlap, crop, "
                           "low DPI, panel layout, ambiguous column header.",
        },
    },
}

PROMPT = """You are reading ONE figure from a published meta-analysis. Extract it
faithfully into the given JSON schema. This feeds an evidence database, so a
fabricated number is far worse than a missing one.

RULES — each exists because it is a known failure mode:

1. TRANSCRIBE, DO NOT COMPUTE. Report only numbers printed in the figure. If a
   column is not shown, the field is null. Never derive events from a percentage,
   never infer N from a weight, never reconstruct a CI you cannot read.

2. ROW TYPE IS THE MOST IMPORTANT FIELD. Forest plots interleave:
     - study rows (real trials)
     - subgroup headers, often numbered "1.1.1 <name>" — NOT a study
     - "Subtotal (95% CI)" / "Total (95% CI)" diamonds — pooled, NOT a study
     - heterogeneity lines ("Tau2=..., I2=...") — NOT a study
   Classify every visible row. Do not silently skip rows.

3. MULTI-PANEL. If the image holds several panels (A/B/C...), extract ONLY panels
   that are per-study forest plots, and set figure_kind=forest_multipanel. A
   leave-one-out / sensitivity panel, a funnel plot, or a Kaplan-Meier curve is
   NOT a per-study forest plot — exclude it and say so in reading_notes.

4. SUBGROUP-OF-ONE-TRIAL PLOTS. A plot whose rows are subgroups of a SINGLE trial
   (age bands, sex, region) is not a meta-analysis forest plot. Set
   figure_kind=not_a_forest_plot.

5. UNCERTAINTY IS DATA. Set confidence per row. If digits overlap, are cut off, or
   are too coarse to resolve, use confidence="low" and null the unreadable field —
   do not guess a plausible digit.

6. SCALE. Note whether the effect axis is log or linear.

Return ONLY the JSON object."""


def _lci(e: float, lo: float, hi: float) -> tuple[float, float, float]:
    return math.log(e), math.log(lo), math.log(hi)


def recompute_dichotomous(r: dict, measure: str) -> dict | None:
    """Effect + 95% CI implied by the row's own counts. None if not computable."""
    a, n1, c, n2 = r.get("events_t"), r.get("n_t"), r.get("events_c"), r.get("n_c")
    if None in (a, n1, c, n2):
        return None
    try:
        a, n1, c, n2 = float(a), float(n1), float(c), float(n2)
    except (TypeError, ValueError):
        return None
    if n1 <= 0 or n2 <= 0 or a < 0 or c < 0 or a > n1 or c > n2:
        return None
    b, d = n1 - a, n2 - c
    m = (measure or "").upper()
    zero = 0 in (a, b, c, d)
    if m in ("OR", "PETO OR"):
        aa, bb, cc, dd = (a + _CORR, b + _CORR, c + _CORR, d + _CORR) if zero \
            else (a, b, c, d)
        est = (aa * dd) / (bb * cc)
        se = math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd)
        return {"est": est, "lo": est * math.exp(-1.96 * se),
                "hi": est * math.exp(1.96 * se), "log": True}
    if m in ("RR", "RISK RATIO"):
        aa, cc = (a + _CORR, c + _CORR) if zero else (a, c)
        nn1, nn2 = (n1 + 1, n2 + 1) if zero else (n1, n2)
        if aa <= 0 or cc <= 0:
            return None
        est = (aa / nn1) / (cc / nn2)
        se = math.sqrt(1 / aa - 1 / nn1 + 1 / cc - 1 / nn2)
        return {"est": est, "lo": est * math.exp(-1.96 * se),
                "hi": est * math.exp(1.96 * se), "log": True}
    if m in ("RD", "RISK DIFFERENCE"):
        p1, p2 = a / n1, c / n2
        est = p1 - p2
        se = math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
        return {"est": est, "lo": est - 1.96 * se, "hi": est + 1.96 * se,
                "log": False}
    return None


def check_row(r: dict, measure: str, tol_log: float = 0.15,
              tol_lin: float = 0.05) -> dict:
    """Is this row internally consistent with its own printed effect+CI?

    tol_log=0.15 on the log scale ~ a 16% relative discrepancy. It is deliberately
    loose: the printed CI comes from the review's own software (which may use Peto,
    Mantel-Haenszel, or a continuity correction we cannot know), so small method
    differences are expected and are NOT reading errors. A misread digit typically
    moves the estimate far more than 16%, so the check still separates them.
    """
    if r.get("row_type") != "study":
        return {"status": "arith_na", "why": "not a study row"}
    est, lo, hi = r.get("effect"), r.get("ci_low"), r.get("ci_high")
    if est is None:
        return {"status": "arith_na", "why": "no printed effect"}
    rc = recompute_dichotomous(r, measure)
    if rc is None:
        return {"status": "arith_na", "why": "counts absent or measure not 2x2-computable"}
    if rc["log"]:
        if est <= 0 or rc["est"] <= 0:
            return {"status": "arith_na", "why": "non-positive ratio"}
        d = abs(math.log(est) - math.log(rc["est"]))
        ok = d <= tol_log
    else:
        d = abs(est - rc["est"])
        ok = d <= tol_lin
    out = {"status": "arith_ok" if ok else "arith_fail",
           "printed": est, "recomputed": round(rc["est"], 4),
           "delta": round(d, 4)}
    # A CI check adds power: counts also determine the CI width. Only run it when
    # the point estimate agreed, so a failure is attributable.
    if ok and lo is not None and hi is not None and rc["log"] \
            and lo > 0 and hi > 0:
        dw = abs(math.log(hi / lo) - math.log(rc["hi"] / rc["lo"]))
        out["ci_width_delta_log"] = round(dw, 3)
        if dw > 0.6:
            out["status"] = "arith_fail"
            out["why"] = "CI width implied by counts disagrees with printed CI"
    return out


def check_extraction(doc: dict) -> dict:
    """Row-level checks + the structural sanity a whole figure must satisfy."""
    measure = doc.get("effect_measure") or ""
    rows = doc.get("rows") or []
    per = [dict(r, _check=check_row(r, measure)) for r in rows]
    tally: dict[str, int] = {}
    for r in per:
        s = r["_check"]["status"]
        tally[s] = tally.get(s, 0) + 1
    studies = [r for r in rows if r.get("row_type") == "study"]
    # Structural check: a "Total" row's N should equal the sum of the studies IT
    # POOLS. This catches a subtotal misread as a study (the sum would double) and
    # a dropped study row (the sum would fall short) — neither is visible row-wise.
    #
    # SCOPING IS THE WHOLE DIFFICULTY. A first cut summed every study row in the
    # figure against every total row. On a MULTI-PANEL figure (13 of the first 24
    # scored here) that is meaningless: panel B's Total was compared against the
    # studies of panels A+B+C combined, and it reported MISMATCH on figures that
    # were read perfectly. The check was manufacturing its own failures. A total
    # is therefore only compared against the studies sharing its `subgroup`, and
    # when panel/subgroup scoping cannot be established the check is SKIPPED
    # (`scope_unknown`) rather than run on a scope we know to be wrong — an
    # unscoped comparison is worse than none, because it looks like evidence.
    struct = []
    tot = [r for r in rows if r.get("row_type") == "total"]
    multi = (doc.get("figure_kind") == "forest_multipanel"
             or len({r.get("subgroup") for r in studies}) > 1
             or len(tot) > 1)
    for t in tot:
        scope = t.get("subgroup")
        if multi and scope is None:
            struct.append({"check": "total", "verdict": "scope_unknown",
                           "why": "multi-panel/subgrouped figure and this total "
                                  "names no subgroup — cannot know which studies "
                                  "it pools; not checked"})
            continue
        mine = [r for r in studies
                if scope is None or r.get("subgroup") == scope]
        for arm in ("n_t", "n_c"):
            tv = t.get(arm)
            sv = [r.get(arm) for r in mine if r.get(arm) is not None]
            if tv is None or not sv:
                continue
            if abs(sum(sv) - float(tv)) > 0.5:
                struct.append({"check": f"total {arm}", "scope": scope,
                               "printed_total": tv, "sum_of_studies": sum(sv),
                               "verdict": "MISMATCH — a row is missing, "
                                          "duplicated, or misclassified"})
            else:
                struct.append({"check": f"total {arm}", "scope": scope,
                               "verdict": "ok"})
    return {"n_rows": len(rows), "n_studies": len(studies),
            "row_checks": tally, "structural": struct,
            "figure_kind": doc.get("figure_kind"),
            "rows_checked": per}
