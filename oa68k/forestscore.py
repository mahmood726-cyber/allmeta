"""Stage F6 — score the vision extractions. The number that decides go/no-go.

Two independent measurements, reported separately and never merged into one
"accuracy" figure, because they answer different questions:

  A. INTERNAL ARITHMETIC (whole batch, no ground truth needed).
     A dichotomous forest row prints its 2x2 AND the effect+CI those counts
     imply. Recompute one from the other. Disagreement = a real reading error,
     attributable to this row, with no outcome-matching confound. This is the
     strongest signal available at corpus scale.

  B. REGISTRY ARM-SIZE (the sliver with a resolvable NCT).
     Total N read from the plot vs `trials.enrollment`. Confounded — a review
     may pool a subset of arms or an eligible subgroup — so a mismatch is NOT
     automatically a misread, and this is reported as a distribution, not a
     pass rate.

The honest denominator is printed for both. `arith_na` is its own category and is
never folded into `ok`: an extractor that returned nothing at all would otherwise
score 100%.

Run:  python forestscore.py
"""
from __future__ import annotations

import glob
import json
import os
from collections import Counter

import config as C
import forestvision as FV


def load() -> list[dict]:
    docs = []
    for f in sorted(glob.glob(os.path.join(C.DATA, "vision_out_*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"[warn] {f}: {e}")
            continue
        docs.extend(d if isinstance(d, list) else [d])
    return docs


def score_checksum(docs: list[dict]) -> dict:
    """THE HEADLINE INSTRUMENT: the forest plot's own printed Subtotal/Total.

    A forest plot prints, for each subgroup, the arm totals it pooled. Those
    totals are a CHECKSUM the publisher computed over the same column we are
    reading. If a vision read gets one N wrong — or drops a study row, or types a
    subtotal as a study, or mixes two subgroups — the column stops summing to the
    printed total. One check therefore validates every row in the column at once,
    needs no registry link, and is available on any plot that prints a total.

    It is not a truth oracle: it cannot catch a compensating pair of errors
    (+3/-3), and it validates the N column specifically. But it is exact, it is
    attributable, and it covers far more of the corpus than the registry join.

    A column is only counted when EVERY study row in the scope has that N read
    (`len(vals) == len(studies)`); a partially-read column that happens to sum
    correctly would otherwise score as a pass.
    """
    from collections import Counter
    res = Counter()
    cells = 0
    cols_ok = 0
    figs = set()
    mismatches = []
    for d in docs:
        rows = d.get("rows") or []
        by: dict = {}
        for r in rows:
            sg = r.get("subgroup")
            by.setdefault(sg, {"study": [], "sub": []})
            if r.get("row_type") == "study":
                by[sg]["study"].append(r)
            elif r.get("row_type") in ("subtotal", "total"):
                by[sg]["sub"].append(r)
        for sg, v in by.items():
            # Exactly one total per scope, else the scope is ambiguous.
            if len(v["sub"]) != 1 or not v["study"]:
                continue
            s = v["sub"][0]
            for arm in ("n_t", "n_c"):
                p = s.get(arm)
                vals = [x.get(arm) for x in v["study"] if x.get(arm) is not None]
                if p is None or not vals or len(vals) != len(v["study"]):
                    res["not_checkable"] += 1
                    continue
                if abs(sum(vals) - float(p)) < 0.5:
                    res["reconciles"] += 1
                    cols_ok += 1
                    cells += len(vals)
                    figs.add(d.get("pmcid"))
                else:
                    res["mismatch"] += 1
                    mismatches.append({"pmcid": d.get("pmcid"), "subgroup": sg,
                                       "arm": arm, "sum_of_studies": sum(vals),
                                       "printed_total": p,
                                       "diff": sum(vals) - float(p),
                                       "n_studies": len(v["study"])})
    checkable = res["reconciles"] + res["mismatch"]
    return {"checkable_arm_columns": checkable,
            "reconciles": res["reconciles"], "mismatch": res["mismatch"],
            "not_checkable": res["not_checkable"],
            "reconcile_pct": (round(100 * res["reconciles"] / checkable, 1)
                              if checkable else None),
            "individual_N_cells_validated": cells,
            "figures_covered": sorted(figs),
            "mismatch_examples": mismatches[:10],
            "note": ("A reconciling column validates every study N in it at once. "
                     "Cannot catch compensating errors (+3/-3) and speaks only to "
                     "the N column.")}


def score_arithmetic(docs: list[dict]) -> dict:
    kinds = Counter(d.get("figure_kind") for d in docs)
    row_types = Counter()
    checks = Counter()
    fails = []
    struct_all = []
    n_study_rows = 0
    for d in docs:
        measure = d.get("effect_measure") or ""
        for r in d.get("rows") or []:
            row_types[r.get("row_type")] += 1
        out = FV.check_extraction(d)
        for s in out["structural"]:
            struct_all.append({"pmcid": d.get("pmcid"), **s})
        for r in out["rows_checked"]:
            if r.get("row_type") != "study":
                continue
            n_study_rows += 1
            st = r["_check"]["status"]
            checks[st] += 1
            if st == "arith_fail":
                fails.append({"pmcid": d.get("pmcid"),
                              "label": r.get("label"),
                              "measure": measure,
                              "confidence": r.get("confidence"),
                              **{k: v for k, v in r["_check"].items()
                                 if k in ("printed", "recomputed", "delta", "why")}})
    checkable = checks["arith_ok"] + checks["arith_fail"]
    return {
        "figures": len(docs),
        "figure_kinds": dict(kinds),
        "row_types": dict(row_types),
        "study_rows": n_study_rows,
        "arith": dict(checks),
        "checkable_rows": checkable,
        "arith_accuracy_pct": (round(100 * checks["arith_ok"] / checkable, 1)
                               if checkable else None),
        "arith_fail_examples": fails[:12],
        "structural": struct_all,
        "note": ("arith_accuracy denominator = rows where counts AND a printed "
                 "effect were both read (arith_ok+arith_fail). arith_na rows are "
                 "NOT counted as passes."),
    }


def score_registry(docs: list[dict], max_metas: int | None = None) -> dict:
    """Resolve study labels -> NCT and compare total N to registry enrollment."""
    import forestgold as FG
    per_meta = {}
    for d in docs:
        if d.get("figure_kind") in ("not_a_forest_plot", "unreadable"):
            continue
        labs = [r.get("label") for r in (d.get("rows") or [])
                if r.get("row_type") == "study" and r.get("label")]
        if not labs:
            continue
        per_meta.setdefault(d["pmcid"], {"labels": set(), "rows": []})
        per_meta[d["pmcid"]]["labels"].update(labs)
        per_meta[d["pmcid"]]["rows"].extend(
            [r for r in d["rows"] if r.get("row_type") == "study"])

    items = list(per_meta.items())[:max_metas] if max_metas else list(per_meta.items())
    link = Counter()
    scored = {"exact": 0, "within_5pct": 0, "mismatch": 0, "no_ground_truth": 0,
              "deltas": []}
    for pmcid, info in items:
        res = FG.label_to_nct(pmcid, sorted(info["labels"]))
        if res.get("error"):
            link["meta_error"] += 1
            continue
        matches, ncts = res["matches"], res.get("nct", {})
        rows = []
        for r in info["rows"]:
            m = matches.get(r.get("label")) or {"status": "unmatched"}
            link[m["status"]] += 1
            if m["status"] != "matched":
                continue
            nrec = ncts.get(m["pmid"])
            if not nrec or nrec.get("status") != "ok":
                link["pmid_to_nct_" + (nrec or {}).get("status", "none")] += 1
                continue
            link["resolved_to_nct"] += 1
            rows.append(dict(r, _registry_enrollment=nrec.get("enrollment"),
                             _nct=nrec["nct_id"]))
        s = FG.score_arm_sizes(rows, ncts)
        for k in ("exact", "within_5pct", "mismatch", "no_ground_truth"):
            scored[k] += s[k]
        for dd in s["deltas"]:
            scored["deltas"].append({"pmcid": pmcid, **dd})
    comparable = scored["exact"] + scored["within_5pct"] + scored["mismatch"]
    return {
        "metas_considered": len(items),
        "label_resolution": dict(link),
        "arm_size_vs_registry": {k: scored[k] for k in
                                 ("exact", "within_5pct", "mismatch",
                                  "no_ground_truth")},
        "comparable_rows": comparable,
        "exact_pct": (round(100 * scored["exact"] / comparable, 1)
                      if comparable else None),
        "within_5pct_cum": (round(100 * (scored["exact"] + scored["within_5pct"])
                                  / comparable, 1) if comparable else None),
        "delta_examples": sorted(scored["deltas"],
                                 key=lambda x: -abs(x["delta"]))[:12],
        "note": ("Total N (plot) vs trials.enrollment (registry). CONFOUNDED: a "
                 "review may pool a subset of arms or an eligible subgroup, so a "
                 "mismatch is not automatically a misread. Reported as a "
                 "distribution, not a pass rate."),
    }


if __name__ == "__main__":
    docs = load()
    print("=== 0. INTERNAL CHECKSUM (printed subtotal vs sum of study rows) ===")
    print(json.dumps(score_checksum(docs), indent=2)[:3000])
    a = score_arithmetic(docs)
    print("\n=== A. INTERNAL ARITHMETIC CONSISTENCY ===")
    print(json.dumps(a, indent=2)[:6000])
    print("\n=== B. REGISTRY ARM-SIZE COMPARISON ===")
    print(json.dumps(score_registry(docs), indent=2)[:6000])
