"""Tests for shared/nma-meta-regression.js — NMR with treatment × covariate interactions."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "nma-meta-regression.js"

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


def test_fit_simple_3treat_with_covariate():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ trtA: "A", trtB: "B", yi: -0.30, sei: 0.10, covariate: 50 }},
          {{ trtA: "A", trtB: "B", yi: -0.25, sei: 0.12, covariate: 55 }},
          {{ trtA: "A", trtB: "B", yi: -0.40, sei: 0.11, covariate: 45 }},
          {{ trtA: "A", trtB: "C", yi: -0.45, sei: 0.13, covariate: 50 }},
          {{ trtA: "A", trtB: "C", yi: -0.50, sei: 0.12, covariate: 60 }},
          {{ trtA: "B", trtB: "C", yi: -0.15, sei: 0.14, covariate: 55 }},
          {{ trtA: "A", trtB: "B", yi: -0.35, sei: 0.10, covariate: 65 }},
          {{ trtA: "A", trtB: "C", yi: -0.48, sei: 0.11, covariate: 70 }},
        ];
        const fit = M.fit(rows, ["A", "B", "C"]);
        console.log(JSON.stringify({{
          ok: fit.ok,
          beta_B: fit.beta_at_mean.B.estimate,
          beta_C: fit.beta_at_mean.C.estimate,
          gamma_B: fit.gamma.B.estimate,
          gamma_C: fit.gamma.C.estimate,
          xMean: fit.xMean,
          tau2: fit.tau2,
        }}));
    """)
    assert out["ok"] is True
    # Both pooled effects negative (data driven that way).
    assert out["beta_B"] < 0
    assert out["beta_C"] < 0
    assert 45 < out["xMean"] < 65
    # γ̂s are finite numbers (interaction magnitudes will be small but defined).
    assert isinstance(out["gamma_B"], (int, float))
    assert isinstance(out["gamma_C"], (int, float))


def test_fit_zero_covariate_variance_handled_via_xMean_centring():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ trtA: "A", trtB: "B", yi: -0.30, sei: 0.10, covariate: 50 }},
          {{ trtA: "A", trtB: "B", yi: -0.25, sei: 0.12, covariate: 50 }},
          {{ trtA: "A", trtB: "B", yi: -0.40, sei: 0.11, covariate: 50 }},
          {{ trtA: "A", trtB: "C", yi: -0.45, sei: 0.13, covariate: 50 }},
          {{ trtA: "A", trtB: "C", yi: -0.50, sei: 0.12, covariate: 50 }},
          {{ trtA: "B", trtB: "C", yi: -0.15, sei: 0.14, covariate: 50 }},
        ];
        // All rows have identical covariate → x_i − x̄ = 0; the interaction
        // columns are zero. The augmented design matrix is rank-deficient
        // (γ unidentified) — should throw a clean error rather than NaN out.
        try {{
          const fit = M.fit(rows, ["A", "B", "C"]);
          console.log(JSON.stringify({{ ok: fit.ok }}));
        }} catch (e) {{
          console.log(JSON.stringify({{ caught: true, msg: e.message }}));
        }}
    """)
    assert out.get("caught") is True or out.get("ok") is False


def test_predictions_at_specified_covariate_values():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ trtA: "A", trtB: "B", yi: -0.30, sei: 0.10, covariate: 40 }},
          {{ trtA: "A", trtB: "B", yi: -0.20, sei: 0.10, covariate: 60 }},
          {{ trtA: "A", trtB: "B", yi: -0.40, sei: 0.10, covariate: 30 }},
          {{ trtA: "A", trtB: "B", yi: -0.15, sei: 0.10, covariate: 70 }},
          {{ trtA: "A", trtB: "C", yi: -0.50, sei: 0.10, covariate: 40 }},
          {{ trtA: "A", trtB: "C", yi: -0.40, sei: 0.10, covariate: 60 }},
          {{ trtA: "A", trtB: "C", yi: -0.60, sei: 0.10, covariate: 30 }},
          {{ trtA: "B", trtB: "C", yi: -0.20, sei: 0.10, covariate: 50 }},
        ];
        const fit = M.fit(rows, ["A", "B", "C"], {{ predictAt: [30, 50, 70] }});
        const preds = fit.predictions.map(p => ({{
          x: p.x,
          B: p.perTreatment.B.estimate,
          C: p.perTreatment.C.estimate,
        }}));
        console.log(JSON.stringify({{ n_preds: preds.length, preds: preds, xMean: fit.xMean }}));
    """)
    assert out["n_preds"] == 3
    # Predictions at distinct covariate values should differ (γ ≠ 0 here
    # because effect decreases with covariate per the seeded data).
    estimates_B = [p["B"] for p in out["preds"]]
    assert max(estimates_B) - min(estimates_B) > 0.05


def test_fit_requires_at_least_2p_rows():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        try {{
          // 3 treatments → p=2 → need ≥ 4 valid rows; supply only 2.
          M.fit([
            {{ trtA: "A", trtB: "B", yi: -0.3, sei: 0.1, covariate: 50 }},
            {{ trtA: "A", trtB: "C", yi: -0.4, sei: 0.1, covariate: 55 }},
          ], ["A", "B", "C"]);
          console.log(JSON.stringify({{ caught: false }}));
        }} catch (e) {{
          console.log(JSON.stringify({{ caught: true, msg: e.message }}));
        }}
    """)
    assert out["caught"] is True
    assert "rows" in out["msg"].lower()


def test_tau2_PM_returns_zero_when_no_heterogeneity():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // All rows agree on the same contrast (no τ²) within sampling noise.
        const X = [[1, 5], [1, -5], [1, 0], [1, 2], [1, -2]];  // (intercept + covariate)
        const y = [-0.30, -0.30, -0.30, -0.30, -0.30];
        const v = [0.01, 0.01, 0.01, 0.01, 0.01];
        console.log(JSON.stringify(M._tau2_PM(X, y, v)));
    """)
    assert out == 0
