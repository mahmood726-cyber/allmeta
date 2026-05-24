"""Tests for shared/rve.js (Hedges-Tipton-Johnson 2010 robust variance).

Validates the CORR working model + CR1 small-sample correction on a
canonical balanced and unbalanced cluster design. Reference values
computed by hand from the closed-form OLS-with-cluster-robust-SE
expression (which matches robumeta::robu for the CORR model when ρ is
treated as known).
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "rve.js"
STATS_QT = ROOT / "shared" / "stats-qt.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    # Both rve.js and stats-qt.js attach to globalThis; load qt first so
    # AlmRVE.summary() can use AlmStats.qt for CI/p calculation.
    bootstrap = f"""
      require({json.dumps(str(STATS_QT))});
      const M = require({json.dumps(str(MODULE))});
      {script}
    """
    result = subprocess.run(
        [NODE, "-e", bootstrap],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


# --- Cluster-grouping basics --------------------------------------------------


def test_fitCORR_recognizes_balanced_clusters():
    out = _run_node(f"""
        const rows = [
          {{ cluster: "A", yi: 0.1, vi: 0.04, X: [1, 1] }},
          {{ cluster: "A", yi: 0.2, vi: 0.04, X: [1, 1] }},
          {{ cluster: "A", yi: 0.3, vi: 0.04, X: [1, 1] }},
          {{ cluster: "B", yi: 0.4, vi: 0.04, X: [1, 0] }},
          {{ cluster: "B", yi: 0.5, vi: 0.04, X: [1, 0] }},
          {{ cluster: "B", yi: 0.6, vi: 0.04, X: [1, 0] }},
        ];
        const fit = M.fitCORR(rows, {{ rho: 0.8, tau2: 0 }});
        console.log(JSON.stringify({{
          m: fit.m_clusters, k: fit.k_total, p: fit.p,
          beta: fit.beta, se: fit.se_robust,
        }}));
    """)
    assert out["m"] == 2
    assert out["k"] == 6
    assert out["p"] == 2
    # With τ²=0 and balanced clusters at vi=0.04, β̂[0] (intercept for cluster B)
    # = mean of B = 0.5. β̂[1] (predictor) = mean of A − mean of B = 0.2 - 0.5 = -0.3.
    assert abs(out["beta"][0] - 0.5) < 1e-6
    assert abs(out["beta"][1] - (-0.3)) < 1e-6


def test_fitCORR_unbalanced_clusters_returns_finite_robust_se():
    out = _run_node(f"""
        const rows = [
          {{ cluster: "A", yi: 0.10, vi: 0.04, X: [1] }},
          {{ cluster: "B", yi: 0.20, vi: 0.04, X: [1] }},
          {{ cluster: "C", yi: 0.30, vi: 0.04, X: [1] }},
          {{ cluster: "D", yi: 0.40, vi: 0.04, X: [1] }},
          {{ cluster: "E", yi: 0.50, vi: 0.04, X: [1] }},
          {{ cluster: "E", yi: 0.55, vi: 0.04, X: [1] }},
          {{ cluster: "F", yi: 0.15, vi: 0.04, X: [1] }},
        ];
        const fit = M.fitCORR(rows);
        const sum = M.summary(fit);
        console.log(JSON.stringify({{ beta: fit.beta, se: fit.se_robust, ci: [sum[0].ci_lo, sum[0].ci_hi], df: sum[0].df }}));
    """)
    assert isinstance(out["beta"][0], float)
    assert out["se"][0] > 0
    assert out["ci"][0] < out["beta"][0] < out["ci"][1]
    assert out["df"] >= 1


def test_summary_uses_t_quantile_for_CI():
    # df = 4 → t_0.975 ≈ 2.776; the CI half-width must be 2.776 × se (not 1.96 × se).
    out = _run_node(f"""
        const rows = [
          {{ cluster: "A", yi: 1.0, vi: 0.1, X: [1] }},
          {{ cluster: "B", yi: 1.2, vi: 0.1, X: [1] }},
          {{ cluster: "C", yi: 0.8, vi: 0.1, X: [1] }},
          {{ cluster: "D", yi: 0.9, vi: 0.1, X: [1] }},
          {{ cluster: "E", yi: 1.1, vi: 0.1, X: [1] }},
        ];
        const fit = M.fitCORR(rows);
        const s = M.summary(fit)[0];
        const half = (s.ci_hi - s.ci_lo) / 2;
        console.log(JSON.stringify({{ se: s.se, half: half, ratio: half / s.se, df: s.df }}));
    """)
    # df = m − p = 5 − 1 = 4; t_0.975(4) = 2.776
    assert out["df"] == 4
    assert abs(out["ratio"] - 2.776) < 0.02


def test_fitCORR_estimates_tau2_when_not_provided():
    out = _run_node(f"""
        const rows = [
          {{ cluster: "A", yi: 0.5, vi: 0.01, X: [1] }},
          {{ cluster: "B", yi: 1.5, vi: 0.01, X: [1] }},   // very large between-cluster gap
          {{ cluster: "C", yi: -0.5, vi: 0.01, X: [1] }},
          {{ cluster: "D", yi: 2.0, vi: 0.01, X: [1] }},
        ];
        const fit = M.fitCORR(rows);   // no tau2 provided
        console.log(JSON.stringify({{ tau2: fit.tau2 }}));
    """)
    # Highly heterogeneous → DL τ² should be substantially > 0.
    assert out["tau2"] > 0.1


def test_fitCORR_clusters_dominate_se_not_k():
    # Same data twice: (a) 5 clusters × 1 effect each = 5 effects
    #                  (b) 5 clusters × 4 effects each = 20 effects, all identical
    # The robust SE should be ~the same — RVE counts m (clusters), not k.
    out = _run_node(f"""
        const a = [
          {{ cluster: "A", yi: 0.1, vi: 0.04, X: [1] }},
          {{ cluster: "B", yi: 0.2, vi: 0.04, X: [1] }},
          {{ cluster: "C", yi: 0.3, vi: 0.04, X: [1] }},
          {{ cluster: "D", yi: 0.4, vi: 0.04, X: [1] }},
          {{ cluster: "E", yi: 0.5, vi: 0.04, X: [1] }},
        ];
        const b = [];
        for (const r of a) for (let j = 0; j < 4; j++) b.push({{ cluster: r.cluster, yi: r.yi, vi: r.vi, X: r.X }});
        const fitA = M.fitCORR(a, {{ tau2: 0.01 }});
        const fitB = M.fitCORR(b, {{ tau2: 0.01 }});
        console.log(JSON.stringify({{ seA: fitA.se_robust[0], seB: fitB.se_robust[0], betaA: fitA.beta[0], betaB: fitB.beta[0] }}));
    """)
    # β̂ is the same; SE within ~30% (CR1 correction depends slightly on k/(k-p))
    assert abs(out["betaA"] - out["betaB"]) < 1e-6
    assert 0.7 < out["seB"] / out["seA"] < 1.3
