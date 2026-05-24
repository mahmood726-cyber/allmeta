"""Tests for shared/cross-design.js — RCT + observational synthesis."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "cross-design.js"

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


# --- Naive pool ---------------------------------------------------------------


def test_naive_pool_equals_iv_pool_under_DL():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.020, design: "rct" }},
          {{ yi: -0.25, vi: 0.025, design: "rct" }},
          {{ yi: -0.40, vi: 0.018, design: "rct" }},
          {{ yi: -0.55, vi: 0.014, design: "obs" }},
          {{ yi: -0.50, vi: 0.012, design: "obs" }},
        ];
        const r = M.fit_naive(rows);
        console.log(JSON.stringify({{ mu: r.mu, k_rct: r.k_rct, k_obs: r.k_obs }}));
    """)
    assert out["k_rct"] == 3
    assert out["k_obs"] == 2
    # Naive pool is pulled toward the obs studies (smaller vi → more weight).
    assert -0.45 < out["mu"] < -0.30


# --- Power prior --------------------------------------------------------------


def test_power_prior_alpha_zero_equals_RCT_only():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.020, design: "rct" }},
          {{ yi: -0.40, vi: 0.018, design: "rct" }},
          {{ yi: -0.55, vi: 0.014, design: "obs" }},
          {{ yi: -0.50, vi: 0.012, design: "obs" }},
        ];
        const a0 = M.fit_powerPrior(rows, 0.0);
        const rctOnly = M.fit_naive(rows.filter(r => r.design === "rct"));
        console.log(JSON.stringify({{ a0_mu: a0.mu, rct_mu: rctOnly.mu, diff: Math.abs(a0.mu - rctOnly.mu) }}));
    """)
    # α=0 ⇒ obs contribute 0 weight ⇒ μ̂ = RCT-only pool (within τ²-DL rounding).
    assert out["diff"] < 0.01


def test_power_prior_alpha_one_equals_naive():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.020, design: "rct" }},
          {{ yi: -0.40, vi: 0.018, design: "rct" }},
          {{ yi: -0.55, vi: 0.014, design: "obs" }},
          {{ yi: -0.50, vi: 0.012, design: "obs" }},
        ];
        const a1 = M.fit_powerPrior(rows, 1.0);
        const naive = M.fit_naive(rows);
        console.log(JSON.stringify({{ diff: Math.abs(a1.mu - naive.mu) }}));
    """)
    assert out["diff"] < 1e-9


# --- Design-bias RE -----------------------------------------------------------


def test_designBias_RE_anchors_on_RCTs():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.020, design: "rct" }},
          {{ yi: -0.32, vi: 0.018, design: "rct" }},
          {{ yi: -0.28, vi: 0.025, design: "rct" }},
          {{ yi: -0.70, vi: 0.010, design: "obs" }},   // observational pulls strongly toward -0.70
          {{ yi: -0.65, vi: 0.008, design: "obs" }},
        ];
        const db = M.fit_designBias(rows);
        const naive = M.fit_naive(rows);
        console.log(JSON.stringify({{
          db_mu: db.mu, naive_mu: naive.mu,
          delta: db.deltaObs,
        }}));
    """)
    # Design-bias μ̂ should sit near the RCT-only mean (≈ -0.30), not the
    # naive mean (pulled toward -0.50ish by the obs studies).
    assert -0.34 < out["db_mu"] < -0.28
    assert out["naive_mu"] < out["db_mu"]   # naive pulled lower
    # δ_obs captures the obs-vs-RCT gap (negative, around -0.35).
    assert out["delta"] < -0.2


def test_designBias_falls_back_when_no_RCTs():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.5, vi: 0.02, design: "obs" }},
          {{ yi: -0.6, vi: 0.03, design: "obs" }},
        ];
        const db = M.fit_designBias(rows);
        console.log(JSON.stringify({{ warning: db.warning, mu: db.mu }}));
    """)
    assert "No RCTs" in out["warning"]


# --- fitAll bundles -----------------------------------------------------------


def test_fitAll_returns_three_methods():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.3, vi: 0.02, design: "rct" }},
          {{ yi: -0.4, vi: 0.018, design: "rct" }},
          {{ yi: -0.5, vi: 0.012, design: "obs" }},
        ];
        const r = M.fitAll(rows, {{ alpha: 0.3 }});
        console.log(JSON.stringify({{
          methods: Object.keys(r),
          alpha: r.powerPrior.alpha,
        }}));
    """)
    assert set(out["methods"]) == {"naive", "powerPrior", "designBias"}
    assert abs(out["alpha"] - 0.3) < 1e-9
