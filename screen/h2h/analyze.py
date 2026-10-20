"""Pre-registered analysis (PROTOCOL.md section 7). Written and committed before any held-out run.

Inputs: per-review result JSONs from each tool, each holding per-seed screening orders. Metrics are recomputed from
the orders with core.metrics_from_order (never taken from a tool's own summary). Every result file is validated
against the registered priors (dataset digest, ID hash, starting-record prefix, all 10 seeds) and an expected
tool/configuration before it is used.

Estimand (all analyses unless labelled otherwise): the CLUSTER-WEIGHTED mean difference. Per review, each tool's
outcome is the mean over the 10 seeds; d_r = Screen - comparator; a cluster's d_c is the mean of its member reviews'
d_r; the estimand is the mean of d_c over clusters (each cluster weight 1).

  python h2h/analyze.py --screen R/screen --u4 R/asreview/elas_u4 --u3 R/asreview/elas_u3 \
      --set h2h/sets/primary.txt --clusters h2h/sets/clusters.json --out R/analysis_primary.json
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy import stats

import core

MARGIN = 0.02
OUTCOMES = ["wss95", "recall_at_10pct", "recall_at_20pct", "prop_last"]
# Worst-case outcomes assigned to a (tool, review, seed) that failed twice (PROTOCOL 8): no review is ever dropped.
WORST = {"wss95": -0.05, "recall_at_10pct": 0.0, "recall_at_20pct": 0.0, "prop_last": 1.0}
HERE = Path(__file__).resolve().parent
MIN_SUCCESS = 0.95  # PROTOCOL 8: confirmatory claims need >= 95% successful (review, seed) runs for EACH tool


def read_set(p):
    return [x.strip() for x in Path(p).read_text().splitlines() if x.strip() and not x.startswith("#")]


def best_case(y: np.ndarray, prior: list) -> dict:
    """AMENDMENT 1 (2026-10-20): a failed COMPARATOR run is scored with the best order possible from its starting
    records (every remaining relevant record next), so a comparator failure can never move the result toward Screen."""
    rest = [int(i) for i in np.flatnonzero(y) if int(i) not in set(prior)]
    return core.metrics_from_order(list(prior) + rest, y)


def validate_and_score(res_dir: Path, review: str, y: np.ndarray, pri: dict, expect: dict, check=None,
                       fail_score: str = "worst") -> dict:
    d = json.loads(Path(res_dir, f"{review}.json").read_text())
    if d.get("review", review) != review:
        raise SystemExit(f"{res_dir}/{review}: file is for review {d.get('review')}")
    for k, v in expect.items():
        if d.get(k) != v:
            raise SystemExit(f"{res_dir}/{review}: expected {k}={v!r}, found {d.get(k)!r}")
    if d.get("ids_sha256") != pri["ids_sha256"]:
        raise SystemExit(f"{res_dir}/{review}: dataset ID hash differs from the registered priors")
    if d.get("dataset_sha256") != pri["dataset_sha256"]:
        raise SystemExit(f"{res_dir}/{review}: dataset digest missing or differs from the registered priors")
    all_failed = bool(d.get("runs")) and all(r.get("failed") for r in d["runs"].values())
    if check and not all_failed:  # AMENDMENT 1: a review whose every seed failed has no run provenance to check
        msg = check(d)
        if msg:
            raise SystemExit(f"{res_dir}/{review}: {msg}")
    per, failed = [], []
    for s in map(str, core.SEEDS):
        run = d["runs"].get(s)
        if run is None:
            raise SystemExit(f"{res_dir}/{review}: seed {s} missing (a failed run must be recorded as failed)")
        if run.get("failed"):
            if run.get("attempts", 0) < 2:
                raise SystemExit(f"{res_dir}/{review}: seed {s} failed after fewer than 2 attempts")
            per.append(dict(WORST) if fail_score == "worst" else best_case(y, pri["priors"][s])); failed.append(s); continue
        order = run["order"]
        if order[: len(pri["priors"][s])] != pri["priors"][s]:
            raise SystemExit(f"{res_dir}/{review}: seed {s} does not start from the registered starting records")
        per.append(core.metrics_from_order(order, y))
    out = {o: float(np.mean([m[o] for m in per])) for o in OUTCOMES}
    out["seed101"] = {o: per[0][o] for o in OUTCOMES}
    out["failed_seeds"] = failed
    return out


def summarize(d: np.ndarray) -> dict:
    d = np.asarray(d, dtype=float)
    if len(d) < 2 or not np.all(np.isfinite(d)):
        raise SystemExit("inference needs >= 2 finite cluster differences")
    k = len(d); m = float(d.mean()); sd = float(d.std(ddof=1)); se = sd / math.sqrt(k); tc = float(stats.t.ppf(0.975, k - 1))
    r = {"k": k, "mean": m, "sd": sd, "se": se, "ci95": [m - tc * se, m + tc * se],
         "n_pos": int((d > 0).sum()), "n_neg": int((d < 0).sum()), "n_zero": int((d == 0).sum())}
    # zero variance: the t statistic is +/-inf (or undefined at m == 0); p-values are then 0 or 1 by definition
    r["p_two_sided_vs0"] = float(2 * stats.t.sf(abs(m / se), k - 1)) if se > 0 else (0.0 if m != 0 else 1.0)
    return r


def p_one_sided_gt(r: dict, minus: float) -> float:
    """p for H0: mean <= -minus (one-sided t, df = k - 1)."""
    if r["se"] > 0:
        return float(stats.t.sf((r["mean"] + minus) / r["se"], r["k"] - 1))
    return 0.0 if r["mean"] + minus > 0 else 1.0


def holm(ps: list[float]) -> list[float]:
    if not all(np.isfinite(ps)):
        raise SystemExit("Holm needs finite p-values")
    order = np.argsort(ps); adj = [0.0] * len(ps); run = 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - rank) * ps[i])); adj[i] = run
    return adj


def hodges_lehmann_ci(d: np.ndarray, alpha=0.05):
    """HL estimate and its distribution-free CI from Walsh averages (normal approximation to the signed-rank
    critical value; assumes symmetric differences about the pseudo-median)."""
    n = len(d); w = np.sort((np.add.outer(d, d)[np.triu_indices(n)]) / 2); M = len(w)
    z = stats.norm.ppf(1 - alpha / 2)
    c = int(math.floor(n * (n + 1) / 4 - z * math.sqrt(n * (n + 1) * (2 * n + 1) / 24)))
    c = max(c, 0)
    return float(np.median(w)), [float(w[c]), float(w[M - 1 - c])]


def check_partition(clusters, reviews):
    flat = [r for c in clusters for r in c]
    if len(flat) != len(set(flat)):
        raise SystemExit("cluster file: a review appears in more than one cluster")
    if set(flat) != set(reviews):
        raise SystemExit(f"cluster file does not partition the analysis set exactly: "
                         f"missing {sorted(set(reviews) - set(flat))[:5]}, extra {sorted(set(flat) - set(reviews))[:5]}")


def cluster_means(rev_val: dict, clusters) -> np.ndarray:
    return np.asarray([np.mean([rev_val[r] for r in c]) for c in clusters])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", required=True); ap.add_argument("--u4", required=True); ap.add_argument("--u3", required=True)
    ap.add_argument("--set", required=True); ap.add_argument("--clusters", required=True)
    ap.add_argument("--cluster-key", default="clusters", help="'clusters' or 'clusters_primary_plus_devoverlap'")
    ap.add_argument("--screen-config", required=True, help="the frozen candidate's config name recorded in its result files")
    ap.add_argument("--screen-rank-sha256", required=True, help="sha256 of the frozen rank-core.js (FREEZE.md)")
    ap.add_argument("--screen-emb-onnx-sha256", default=None, help="sha256 of the frozen embedding weights, if any (FREEZE.md)")
    ap.add_argument("--screen-freeze-json", default=None,
                    help="AMENDMENT 1: JSON {cfg, emb} from FREEZE.md; every result file's cfg and emb recipe must equal it")
    ap.add_argument("--priors", default=str(HERE / "priors"))
    ap.add_argument("--data-dir", default=str(core.DATA_DIR)); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    frozen = json.loads(Path(a.screen_freeze_json).read_text()) if a.screen_freeze_json else None
    reviews = read_set(a.set)
    allc = json.loads(Path(a.clusters).read_text())[a.cluster_key]
    S = set(reviews)
    clusters = [[r for r in c if r in S] for c in allc]
    clusters = [c for c in clusters if c]  # restricting to a registered subset (e.g. the official-test reviews)
    check_partition(clusters, reviews)
    reg = json.loads((HERE / "sets" / "comparator_configs.json").read_text())

    def asr_check(ai):
        def f(d):
            env = d.get("environment", {})
            if env.get("asreview") != reg["asreview"]:
                return f"ASReview {env.get('asreview')} != registered {reg['asreview']}"
            if env.get("ai_config") != reg[ai]:
                return f"{ai} configuration differs from the registered one"
            return None
        return f

    def screen_check(d):
        if d.get("rank_core_sha256") != a.screen_rank_sha256:
            return "rank-core.js hash differs from the frozen candidate"
        onnx = (d.get("emb") or {}).get("onnx_sha256")
        if onnx != a.screen_emb_onnx_sha256:
            return f"embedding weights {onnx} differ from the frozen {a.screen_emb_onnx_sha256}"
        if frozen is not None:  # AMENDMENT 1: the settings, not only the names and hashes, must be the frozen ones
            if d.get("cfg") != frozen["cfg"]:
                return f"ranker settings {d.get('cfg')} differ from the frozen {frozen['cfg']}"
            for k, v in (frozen.get("emb") or {}).items():
                if (d.get("emb") or {}).get(k) != v:
                    return f"embedding recipe field {k}={(d.get('emb') or {}).get(k)!r} differs from the frozen {v!r}"
        return None

    per = {}
    for r in reviews:
        _, y, _ = core.load_review(r, Path(a.data_dir))
        pri = json.loads(Path(a.priors, f"{r}.json").read_text())
        if core.dataset_digest(r, Path(a.data_dir)) != pri["dataset_sha256"]:
            raise SystemExit(f"{r}: data on disk differ from the data the priors were registered on")
        per[r] = {"screen": validate_and_score(Path(a.screen), r, y, pri, {"tool": "screen", "config": a.screen_config}, screen_check),
                  "u4": validate_and_score(Path(a.u4), r, y, pri, {"tool": "asreview", "ai": "elas_u4"}, asr_check("elas_u4"), "best"),
                  "u3": validate_and_score(Path(a.u3), r, y, pri, {"tool": "asreview", "ai": "elas_u3"}, asr_check("elas_u3"), "best"),
                  "R": int(y.sum()), "N": int(len(y))}

    def rev_diff(outcome, comp, seed101=False):
        return {r: (per[r]["screen"]["seed101"][outcome] - per[r][comp]["seed101"][outcome]) if seed101
                else per[r]["screen"][outcome] - per[r][comp][outcome] for r in reviews}

    out = {"set": a.set, "clusters_file": a.clusters, "cluster_key": a.cluster_key, "n_reviews": len(reviews),
           "n_clusters": len(clusters), "margin": MARGIN, "estimand": "cluster-weighted mean difference",
           "failed_seeds": {t: {r: per[r][t]["failed_seeds"] for r in reviews if per[r][t]["failed_seeds"]} for t in ("screen", "u4", "u3")},
           "per_review": per}
    n_runs = len(reviews) * len(core.SEEDS)
    succ = {t: 1 - sum(len(per[r][t]["failed_seeds"]) for r in reviews) / n_runs for t in ("screen", "u4", "u3")}
    out["success_fraction"] = succ
    out["confirmatory_valid"] = bool(all(v >= MIN_SUCCESS for v in succ.values()))
    # 7.1 primary: H1 then H2 (fixed sequence)
    rd = rev_diff("wss95", "u4"); d = cluster_means(rd, clusters); P = summarize(d)
    P["p_one_sided_H1_noninferiority"] = p_one_sided_gt(P, MARGIN)
    P["H1_accepted"] = bool(P["ci95"][0] > -MARGIN)
    P["p_one_sided_H2_superiority"] = p_one_sided_gt(P, 0.0)
    P["H2_accepted"] = bool(P["H1_accepted"] and P["ci95"][0] > 0)
    if not out["confirmatory_valid"]:  # too many failed runs: no confirmatory claim either way (PROTOCOL 8)
        P["H1_accepted"] = P["H2_accepted"] = None
        P["withheld"] = f"success fraction below {MIN_SUCCESS}: {succ}"
    rv = np.asarray(list(rd.values()))
    P["reviews_screen_higher_lower_equal_of"] = [int((rv > 0).sum()), int((rv < 0).sum()), int((rv == 0).sum()), len(rv)]
    P["reviews_losing_more_than_margin"] = int((rv < -MARGIN).sum())
    out["primary_wss95_vs_u4"] = P
    # 7.3 secondary family (Holm), cluster-weighted
    fam = [("wss95", "u3"), ("recall_at_10pct", "u4"), ("recall_at_20pct", "u4"), ("prop_last", "u4")]
    Sx = {f"{o}_vs_{c}": summarize(cluster_means(rev_diff(o, c), clusters)) for o, c in fam}
    for k_, adj in zip(Sx, holm([Sx[k]["p_two_sided_vs0"] for k in Sx])):
        Sx[k_]["p_holm"] = adj
    out["secondary"] = Sx
    # 7.4 sensitivity (descriptive)
    sens = {}
    hl, hlci = hodges_lehmann_ci(d)
    if np.any(d != 0):
        w = stats.wilcoxon(d, zero_method="wilcox", alternative="two-sided"); wstat, wp = float(w.statistic), float(w.pvalue)
    else:  # every difference is exactly zero: no evidence of a shift by definition
        wstat, wp = 0.0, 1.0
    sens["wilcoxon_clusters"] = {"statistic": wstat, "p": wp, "hodges_lehmann": hl, "hl_ci95": hlci,
                                 "estimand": "pseudo-median of cluster-level WSS@95 differences (symmetry assumed)",
                                 "hl_ci_method": "Walsh-average order statistics at the normal-approximation signed-rank critical value; no tie correction"}
    rng = np.random.default_rng(20261019)
    boots = np.array([d[rng.integers(0, len(d), len(d))].mean() for _ in range(10000)])
    sens["bootstrap_clusters_ci95"] = [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))]
    sens["unit_review_dependence_ignoring"] = summarize(rv)
    sens["leave_one_cluster_out_range"] = [float(min(np.delete(d, i).mean() for i in range(len(d)))),
                                           float(max(np.delete(d, i).mean() for i in range(len(d))))]
    loro = []
    for r in reviews:  # leave one review out, cluster membership otherwise retained
        cl2 = [[x for x in c if x != r] for c in clusters]; cl2 = [c for c in cl2 if c]
        loro.append(cluster_means({k: v for k, v in rd.items() if k != r}, cl2).mean())
    sens["leave_one_review_out_range"] = [float(min(loro)), float(max(loro))]
    sens["single_seed_101"] = summarize(cluster_means(rev_diff("wss95", "u4", seed101=True), clusters))
    big = [c2 for c2 in ([[r for r in c if per[r]["R"] >= 20] for c in clusters]) if c2]
    sens["R_ge_20_only"] = summarize(cluster_means(rd, big)) if len(big) >= 2 else None
    out["sensitivity"] = sens
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=1))
    print(json.dumps({"n_reviews": len(reviews), "n_clusters": len(clusters), "primary": P,
                      "secondary": {k: {kk: v[kk] for kk in ("mean", "ci95", "p_holm")} for k, v in Sx.items()},
                      "sensitivity": {k: v for k, v in sens.items() if k != "unit_review_dependence_ignoring"}}, indent=1))


if __name__ == "__main__":
    main()
