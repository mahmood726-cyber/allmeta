"""AMENDMENT 2 analysis: the frozen Screen candidate vs ASReview ELAS u5 (pinned main commit).

Reuses analyze.py (imported, never edited): validate_and_score (Screen failures worst-case, comparator failures
best-case, Amendment 1), the cluster-weighted mean difference with its t interval (summarize), MARGIN = 0.02.

Family A2 (confirmatory, its own alpha; fixed sequence, so no adjustment inside it):
  H1-u5  Screen - u5 cluster-weighted mean WSS@95 > -0.02   (lower 95% limit > -0.02; one-sided alpha 0.025)
  H2-u5  ... > 0, tested only if H1-u5 is accepted.
on the set the u5 optimisation did not use: sets/official_test16.txt (the 15 SYNERGY+ test-split reviews in PRIMARY).
Descriptive only (no tests): the same difference on the other PRIMARY reviews, where u5 was optimised on the data
(in-sample for u5), and u5 - u4 on both sets. Screen results are the frozen held-out run (unchanged).

  python h2h/analyze_u5.py --screen R/screen --u5 R/asreview/elas_u5 --u4 R/asreview/elas_u4 \
      --screen-freeze-json h2h/FREEZE.json --data-dir ... --out A/u5.json
"""
import argparse
import json
from pathlib import Path

import numpy as np

import analyze as A
import core

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", required=True); ap.add_argument("--u5", required=True); ap.add_argument("--u4", required=True)
    ap.add_argument("--screen-freeze-json", required=True)
    ap.add_argument("--confirm-set", default=str(HERE / "sets" / "official_test16.txt"))
    ap.add_argument("--primary-set", default=str(HERE / "sets" / "primary.txt"))
    ap.add_argument("--clusters", default=str(HERE / "sets" / "clusters.json"))
    ap.add_argument("--priors", default=str(HERE / "priors"))
    ap.add_argument("--data-dir", default=str(core.DATA_DIR)); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    fz = json.loads(Path(a.screen_freeze_json).read_text())
    reg5 = json.loads((HERE / "sets" / "comparator_configs_u5.json").read_text())
    reg4 = json.loads((HERE / "sets" / "comparator_configs.json").read_text())

    def screen_check(d):
        if d.get("rank_core_sha256") != fz["rank_core_sha256"]:
            return "rank-core.js hash differs from the frozen candidate"
        if d.get("cfg") != fz["cfg"]:
            return "ranker settings differ from FREEZE.json"
        for k, v in fz["emb"].items():
            if (d.get("emb") or {}).get(k) != v:
                return f"embedding recipe field {k} differs from FREEZE.json"
        return None

    def asr_check(reg, ai):
        def f(d):
            env = d.get("environment", {})
            if env.get("asreview") != reg["asreview"]:
                return f"ASReview {env.get('asreview')} != registered {reg['asreview']}"
            if env.get("ai_config") != reg[ai]:
                return f"{ai} configuration differs from the registered one"
            return None
        return f

    conf = A.read_set(a.confirm_set); prim = A.read_set(a.primary_set)
    if not set(conf) <= set(prim):
        raise SystemExit("confirmatory set must be a subset of PRIMARY")
    allc = json.loads(Path(a.clusters).read_text())["clusters"]
    per = {}
    for r in prim:
        _, y, _ = core.load_review(r, Path(a.data_dir))
        pri = json.loads(Path(a.priors, f"{r}.json").read_text())
        if core.dataset_digest(r, Path(a.data_dir)) != pri["dataset_sha256"]:
            raise SystemExit(f"{r}: data on disk differ from the registered priors")
        per[r] = {"screen": A.validate_and_score(Path(a.screen), r, y, pri, {"tool": "screen", "config": fz["config"]}, screen_check),
                  "u5": A.validate_and_score(Path(a.u5), r, y, pri, {"tool": "asreview", "ai": "elas_u5"}, asr_check(reg5, "elas_u5"), "best"),
                  "u4": A.validate_and_score(Path(a.u4), r, y, pri, {"tool": "asreview", "ai": "elas_u4"}, asr_check(reg4, "elas_u4"), "best"),
                  "R": int(y.sum()), "N": int(len(y))}

    def family(revs, a_tool, b_tool):
        S = set(revs)
        cl = [c2 for c2 in ([[r for r in c if r in S] for c in allc]) if c2]
        A.check_partition(cl, revs)
        rd = {r: per[r][a_tool]["wss95"] - per[r][b_tool]["wss95"] for r in revs}
        P = A.summarize(A.cluster_means(rd, cl))
        rv = np.asarray(list(rd.values()))
        P["reviews_higher_lower_equal_of"] = [int((rv > 0).sum()), int((rv < 0).sum()), int((rv == 0).sum()), len(rv)]
        P["reviews_losing_more_than_margin"] = int((rv < -A.MARGIN).sum())
        P["mean_wss95"] = {t: float(np.mean([per[r][t]["wss95"] for r in revs])) for t in (a_tool, b_tool)}
        return P, rd

    out = {"family": "Amendment 2 (Screen vs ELAS u5)", "margin": A.MARGIN, "confirm_set": a.confirm_set,
           "asreview_u5": reg5["asreview"], "asreview_u5_commit": reg5["asreview_commit"]}
    n_runs = len(conf) * len(core.SEEDS)
    succ = {t: 1 - sum(len(per[r][t]["failed_seeds"]) for r in conf) / n_runs for t in ("screen", "u5")}
    P, rd = family(conf, "screen", "u5")
    P["p_one_sided_H1_noninferiority"] = A.p_one_sided_gt(P, A.MARGIN)
    P["H1_accepted"] = bool(P["ci95"][0] > -A.MARGIN)
    P["p_one_sided_H2_superiority"] = A.p_one_sided_gt(P, 0.0)
    P["H2_accepted"] = bool(P["H1_accepted"] and P["ci95"][0] > 0)
    if not all(v >= A.MIN_SUCCESS for v in succ.values()):
        P["H1_accepted"] = P["H2_accepted"] = None
        P["withheld"] = f"success fraction below {A.MIN_SUCCESS}: {succ}"
    out["success_fraction_confirm"] = succ
    out["confirmatory_screen_vs_u5_test15"] = P
    insample = [r for r in prim if r not in set(conf)]
    out["descriptive_screen_vs_u5_u5_in_sample"] = family(insample, "screen", "u5")[0]
    out["descriptive_screen_vs_u5_all_primary"] = family(prim, "screen", "u5")[0]
    out["descriptive_u5_vs_u4_test15"] = family(conf, "u5", "u4")[0]
    out["descriptive_u5_vs_u4_u5_in_sample"] = family(insample, "u5", "u4")[0]
    out["failed_seeds"] = {t: {r: per[r][t]["failed_seeds"] for r in prim if per[r][t]["failed_seeds"]} for t in ("screen", "u5", "u4")}
    out["per_review"] = per
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k not in ("per_review",)}, indent=1))


if __name__ == "__main__":
    main()
