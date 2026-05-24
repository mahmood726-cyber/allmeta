"""Tests for shared/everything-model.js — joint outcome × time × RoB."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "everything-model.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_fit_basic_convergence():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", time: "2020", outcome: "primary", yi: -0.30, vi: 0.01 }},
          {{ study: "S2", time: "2020", outcome: "primary", yi: -0.25, vi: 0.012 }},
          {{ study: "S3", time: "2021", outcome: "primary", yi: -0.40, vi: 0.014 }},
          {{ study: "S4", time: "2022", outcome: "primary", yi: -0.20, vi: 0.011 }},
          {{ study: "S5", time: "2023", outcome: "primary", yi: -0.35, vi: 0.013 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          ok: r.ok, converged: r.converged, n_iter: r.n_iter,
          mu: r.mu.primary.estimate, tau2: r.tau2_delta,
        }}));
    """)
    assert out["ok"] is True
    assert -0.5 < out["mu"] < -0.1
    assert out["tau2"] > 0


def test_fit_separates_two_outcomes():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", time: "2020", outcome: "A", yi: -0.30, vi: 0.01 }},
          {{ study: "S1", time: "2020", outcome: "B", yi:  0.40, vi: 0.01 }},
          {{ study: "S2", time: "2020", outcome: "A", yi: -0.35, vi: 0.01 }},
          {{ study: "S2", time: "2020", outcome: "B", yi:  0.35, vi: 0.01 }},
          {{ study: "S3", time: "2021", outcome: "A", yi: -0.28, vi: 0.01 }},
          {{ study: "S3", time: "2021", outcome: "B", yi:  0.38, vi: 0.01 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          mu_A: r.mu.A.estimate,
          mu_B: r.mu.B.estimate,
        }}));
    """)
    # μ_A should be near -0.3; μ_B near +0.4.
    assert out["mu_A"] < -0.15
    assert out["mu_B"] >  0.15


def test_fit_estimates_time_effect():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", time: "2020", outcome: "X", yi: -0.30, vi: 0.005 }},
          {{ study: "S2", time: "2020", outcome: "X", yi: -0.32, vi: 0.005 }},
          {{ study: "S3", time: "2023", outcome: "X", yi: -0.60, vi: 0.005 }},
          {{ study: "S4", time: "2023", outcome: "X", yi: -0.58, vi: 0.005 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          gamma_2020: r.gamma["2020"].estimate,
          gamma_2023: r.gamma["2023"].estimate,
          ref_is_2020: r.gamma["2020"].is_reference,
        }}));
    """)
    # First-seen time is the reference (γ ≡ 0); later time should be ~-0.28.
    assert out["ref_is_2020"] is True
    assert out["gamma_2020"] == 0
    assert out["gamma_2023"] < -0.15


def test_fit_shrinks_study_random_effects():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // 6 close-together studies + 1 outlier; τ² stays small, outlier δ inflates.
        const rows = [
          {{ study: "c1", time: "2020", outcome: "X", yi: -0.30, vi: 0.01 }},
          {{ study: "c2", time: "2020", outcome: "X", yi: -0.32, vi: 0.01 }},
          {{ study: "c3", time: "2020", outcome: "X", yi: -0.28, vi: 0.01 }},
          {{ study: "c4", time: "2020", outcome: "X", yi: -0.30, vi: 0.01 }},
          {{ study: "c5", time: "2020", outcome: "X", yi: -0.31, vi: 0.01 }},
          {{ study: "c6", time: "2020", outcome: "X", yi: -0.29, vi: 0.01 }},
          {{ study: "outlier", time: "2020", outcome: "X", yi:  1.50, vi: 0.02 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          delta_outlier: r.delta.outlier.estimate,
          mean_common_abs: (Math.abs(r.delta.c1.estimate) + Math.abs(r.delta.c2.estimate) +
                            Math.abs(r.delta.c3.estimate) + Math.abs(r.delta.c4.estimate) +
                            Math.abs(r.delta.c5.estimate) + Math.abs(r.delta.c6.estimate)) / 6,
          mu_X: r.mu.X.estimate,
        }}));
    """)
    # Outlier δ should be substantially larger than the average common study δ.
    assert abs(out["delta_outlier"]) > out["mean_common_abs"] * 3
    # μ_X stays near the consensus value (-0.3) thanks to shrinkage.
    assert out["mu_X"] < 0


def test_fit_handles_missing_rows_per_study():
    # S1 contributes (X, primary, 2020); S2 contributes (X, primary, 2021) only.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", time: "2020", outcome: "primary", yi: -0.30, vi: 0.01 }},
          {{ study: "S1", time: "2020", outcome: "secondary", yi: -0.20, vi: 0.01 }},
          {{ study: "S2", time: "2021", outcome: "primary", yi: -0.40, vi: 0.012 }},
          {{ study: "S3", time: "2020", outcome: "primary", yi: -0.25, vi: 0.011 }},
          {{ study: "S3", time: "2020", outcome: "secondary", yi: -0.15, vi: 0.011 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          ok: r.ok,
          n_studies: r.studies.length,
          n_outcomes: r.outcomes.length,
          mu_primary: r.mu.primary.estimate,
          mu_secondary: r.mu.secondary.estimate,
        }}));
    """)
    assert out["ok"] is True
    assert out["n_studies"] == 3
    assert out["n_outcomes"] == 2


def test_biasShift_applies_when_biasScale_set():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // Custom bias map: high RoB studies overestimate by 0.20 on the
        // effect scale.
        const biasMap = {{ low: 0, high: 0.20 }};
        const rows = [
          {{ study: "S1", time: "2020", outcome: "X", yi: -0.30, vi: 0.01, rob: "low" }},
          {{ study: "S2", time: "2020", outcome: "X", yi: -0.30, vi: 0.01, rob: "low" }},
          {{ study: "S3", time: "2020", outcome: "X", yi: -0.10, vi: 0.01, rob: "high" }},  // bias shifts up
        ];
        const noBias = M.fit(rows, {{ biasMap: biasMap, biasScale: 0 }});
        const withBias = M.fit(rows, {{ biasMap: biasMap, biasScale: 1 }});
        console.log(JSON.stringify({{
          mu_noBias: noBias.mu.X.estimate,
          mu_withBias: withBias.mu.X.estimate,
        }}));
    """)
    # With bias correction, the high-RoB study's effect is treated as
    # "true effect + 0.20", so it pulls μ more negative.
    assert out["mu_withBias"] < out["mu_noBias"]
