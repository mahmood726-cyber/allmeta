"""Stage F5 — score vision-read forest rows against AACT registry ground truth.

THE COMPARISON THIS MAKES, AND THE ONE IT REFUSES TO MAKE.

Makes: **arm size (N per arm)**. A trial's randomised arm sizes are a stable
property of the trial. The registry states them (`result_groups.count` on the
participant-flow, or `enrollment` as a whole-trial fallback), and the forest plot
prints them per arm. If the vision read of `n_t`/`n_c` disagrees with the
registry, that is a real, attributable discrepancy. This is exactly the
"registry-vs-published arm-size disagreement" the 68k plan (R4) named as the live
mining direction once the x/N-cell premise died.

Refuses: **naive events comparison**. A registry trial posts MANY outcomes; a
forest plot shows ONE, at one timepoint, often with a different definition,
population (ITT vs PP) and follow-up than any registered outcome. Comparing the
plot's events to an arbitrary registry outcome measures OUTCOME MATCHING, not
reading accuracy, and every mismatch would be uninterpretable — is the model
misreading, or are these simply different quantities? So events are compared ONLY
where an outcome-matching step has tied the plot's outcome to a specific registry
outcome; otherwise the row is scored `events_not_comparable` and reported as its
own category. Folding those into "mismatch" would slander the reader; folding
them into "match" would fake accuracy. They get their own line.

DENOMINATOR DISCIPLINE. A row enters the accuracy denominator only if:
  - its label resolved to exactly ONE pmid (ambiguous -> excluded, see refmatch)
  - that pmid resolved to exactly ONE nct via DERIVED/RESULT (never BACKGROUND)
  - the registry actually holds the field being compared
Everything excluded is counted and reported. An accuracy figure whose denominator
is unstated is not a measurement.
"""
from __future__ import annotations

import glob
import json
import os

import config as C


def _pq(table: str) -> str | None:
    fs = sorted(glob.glob(os.path.join(C.STORE, table, "*.parquet")))
    if not fs:
        return None
    return "read_parquet([" + ",".join(
        "'" + f.replace(os.sep, "/") + "'" for f in fs) + "])"


def label_to_nct(pmcid: str, labels: list[str]) -> dict:
    """Resolve forest row labels -> pmid -> nct, per meta. Fail-closed on ambiguity."""
    import duckdb
    import refmatch as RM

    xmlp = os.path.join(C.CACHE, pmcid + ".xml")
    if not os.path.isfile(xmlp):
        return {"error": "no cached JATS for this meta"}
    refs = RM.ref_entries(open(xmlp, "rb").read())
    per: dict[str, dict] = {}
    for lab in labels:
        per[lab] = RM.match_label(lab, refs)

    pmids = sorted({m["pmid"] for m in per.values() if m.get("pmid")})
    if not pmids:
        return {"matches": per, "nct": {}}

    sr = C.ext_table("study_references")
    T = _pq("trials")
    if not sr or not T:
        return {"matches": per, "nct": {}, "error": "AACT ext/store missing"}
    con = duckdb.connect()
    con.execute("SET memory_limit='2GB'")
    con.execute("CREATE TABLE want(pmid VARCHAR)")
    con.executemany("INSERT INTO want VALUES (?)", [(p,) for p in pmids])
    rows = con.execute(f"""
        SELECT w.pmid, s.nct_id, t.enrollment, t.results_posted, t.number_of_arms
        FROM want w
        JOIN read_parquet('{sr.replace(os.sep, "/")}') s ON trim(s.pmid) = w.pmid
        JOIN {T} t ON t.nct_id = s.nct_id
        WHERE upper(s.reference_type) IN ('DERIVED','RESULT')
    """).fetchall()
    by_pmid: dict[str, list] = {}
    for pmid, nct, enr, rp, na in rows:
        by_pmid.setdefault(pmid, []).append(
            {"nct_id": nct, "enrollment": enr, "results_posted": rp,
             "number_of_arms": na})
    out = {}
    for pmid, cands in by_pmid.items():
        ncts = {c["nct_id"] for c in cands}
        if len(ncts) > 1:
            # One paper reporting several trials (a pooled report). Which arm
            # sizes belong to this forest row is undecidable from the label.
            out[pmid] = {"status": "ambiguous_nct", "n": len(ncts)}
        else:
            out[pmid] = {"status": "ok", **cands[0]}
    return {"matches": per, "nct": out}


# NOTE — what per-arm ground truth does NOT exist here, verified against the
# store schema rather than assumed. An earlier draft of this module queried
# `trial_results.arm_title` / `.participants` to get registry arm sizes. Those
# columns do not exist: `trial_results` carries outcome MEASUREMENTS
# (param_value_num, dispersion_*) keyed on result_group_id, with `group_title`
# for arm identity but no participant count; `trial_arms` carries arm identity
# (title/type/interventions) with no count either. The only N the store holds is
# `trials.enrollment` — a WHOLE-TRIAL total that cannot be split per arm.
#
# Consequence, stated rather than papered over: at this layer the arm-size check
# is total-N-vs-enrollment only. A true per-arm registry comparison needs
# AACT's participant-flow counts (`baseline_counts` / `participant_flows`), which
# the ext-conversion list mentions but which is not yet in the store as counts.
# That is a gap in the ground truth, not a result — do not report a per-arm
# accuracy number until it is closed.


def score_arm_sizes(read_rows: list[dict], nct_info: dict) -> dict:
    """Compare vision-read total N against the registry's enrollment.

    TOTAL N, not per-arm, is the honest comparison at this layer: the forest plot
    lists the two arms it pooled, but a trial may have >2 arms and a review may
    pool only a subset (or only the subgroup that met eligibility). So a per-arm
    mismatch is often correct behaviour by the review, not a misread. Total N vs
    enrollment has the same caveat but is interpretable: we report the exact
    distribution of the discrepancy, and flag only EXACT equality as a match.
    """
    res = {"exact": 0, "within_5pct": 0, "mismatch": 0, "no_ground_truth": 0,
           "deltas": []}
    for r in read_rows:
        nt, nc = r.get("n_t"), r.get("n_c")
        gt = r.get("_registry_enrollment")
        if gt is None or nt is None or nc is None:
            res["no_ground_truth"] += 1
            continue
        read_total = float(nt) + float(nc)
        gt = float(gt)
        d = read_total - gt
        res["deltas"].append({"label": r.get("label"), "read": read_total,
                              "registry": gt, "delta": d})
        if abs(d) < 0.5:
            res["exact"] += 1
        elif gt > 0 and abs(d) / gt <= 0.05:
            res["within_5pct"] += 1
        else:
            res["mismatch"] += 1
    return res
