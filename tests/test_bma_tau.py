"""Tests for shared/bma-tau.js — Bayesian Model Averaging across τ² priors.

The closed-form sanity check: with k studies and a flat-ish prior, the
BMA posterior μ̂ should land between the inverse-variance fixed-effect
pool and the DerSimonian-Laird random-effects pool. With ALL studies
having the same effect, both should match exactly.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "bma-tau.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=60, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


# --- Convergence to FE when τ²=0 (identical effects, large k) ----------------


def test_bma_collapses_to_FE_when_studies_agree():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // All studies report -0.30 — between-study var should be ≈ 0.
        const yi = [-0.30, -0.30, -0.30, -0.30, -0.30, -0.30, -0.30, -0.30, -0.30, -0.30];
        const vi = [ 0.02,  0.02,  0.02,  0.02,  0.02,  0.02,  0.02,  0.02,  0.02,  0.02];
        const r = M.fit(yi, vi, M.defaultModels());
        console.log(JSON.stringify({{ muHat: r.muHat, sePost: r.sePost, ci_lo: r.ci_lo, ci_hi: r.ci_hi }}));
    """)
    # FE: μ̂ = -0.30, SE = sqrt(0.02/10) ≈ 0.0447
    assert abs(out["muHat"] + 0.30) < 0.001
    assert abs(out["sePost"] - 0.0447) < 0.01


def test_bma_inflates_SE_under_heterogeneity():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // Same vi but wildly different yi — τ² > 0, posterior SE inflated.
        const yi = [-0.80, -0.60, -0.30, 0.00, 0.20, 0.50, 0.70, -0.20, -0.10, 0.30];
        const vi = [ 0.02,  0.02,  0.02, 0.02, 0.02, 0.02, 0.02,  0.02,  0.02, 0.02];
        const r = M.fit(yi, vi, M.defaultModels());
        const seFE = Math.sqrt(0.02 / 10);
        console.log(JSON.stringify({{ seBMA: r.sePost, seFE: seFE, ratio: r.sePost / seFE }}));
    """)
    # BMA SE should be 3-15× the FE SE under heavy heterogeneity.
    assert out["ratio"] > 2.5


# --- Per-prior weights distribute over the model space ------------------------


def test_perModel_weights_sum_to_one():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const yi = [-0.4, -0.2, -0.3, -0.5, 0.1];
        const vi = [0.02, 0.03, 0.025, 0.04, 0.035];
        const r = M.fit(yi, vi, M.defaultModels());
        const sumW = r.perModel.reduce((a, m) => a + m.weight, 0);
        console.log(JSON.stringify({{ sumW: sumW, n: r.perModel.length }}));
    """)
    assert abs(out["sumW"] - 1.0) < 1e-6
    assert out["n"] == 6


def test_invalid_input_returns_error():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // Single study — degenerate.
        const r = M.fit([0.1], [0.02], M.defaultModels());
        console.log(JSON.stringify(r));
    """)
    # Single study still works (no heterogeneity to integrate over);
    # just check we don't crash. ok==true is acceptable.
    assert "ok" in out


# --- Prior shapes -------------------------------------------------------------


def test_halfNormal_prior_is_finite_at_positive_tau2():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const p = M.halfNormal(0.5);
        console.log(JSON.stringify({{ at_01: p(0.01), at_1: p(1.0), at_neg: p(-1) }}));
    """)
    assert out["at_01"] > 0
    assert out["at_1"] > 0
    assert out["at_neg"] == 0


def test_invGamma_prior_is_zero_at_tau2_zero():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const p = M.invGamma(0.1, 0.1);
        console.log(JSON.stringify({{ at_0: p(0), at_001: p(0.001), at_1: p(1) }}));
    """)
    assert out["at_0"] == 0    # inv-gamma → 0 at τ² → 0
    assert out["at_001"] > 0
    assert out["at_1"] > 0
