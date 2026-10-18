"""Tests for shared/cross-design.js — RCT + observational synthesis."""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from fractions import Fraction
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
    # Exclusion must apply to heterogeneity as well as the final weights.
    assert out["diff"] < 1e-12


# Deliberately synthetic regression inputs, not clinical observations.
RCTS = [dict(yi=-0.2, vi=0.01, design="rct"),
        dict(yi=0.5, vi=0.25, design="rct")]
OBS = [dict(yi=-4, vi=0.01, design="obs"),
       dict(yi=6, vi=0.02, design="obs")]
FIELDS = ("mu", "sePost", "ci_lo", "ci_hi", "tau2")


def _exact_dl(rows):
    """Independent rational-arithmetic DL oracle; floating point only for sqrt."""
    y = [Fraction(str(r["yi"])) for r in rows]
    v = [Fraction(str(r["vi"])) for r in rows]
    w = [1 / x for x in v]
    sw = sum(w)
    mean = sum(a * b for a, b in zip(w, y)) / sw
    q = sum(a * (b - mean) ** 2 for a, b in zip(w, y))
    c = sw - sum(a * a for a in w) / sw
    tau = max(Fraction(0), (q - len(rows) + 1) / c) if c else Fraction(0)
    wr = [1 / (x + tau) for x in v]
    mu = float(sum(a * b for a, b in zip(wr, y)) / sum(wr))
    se = math.sqrt(float(1 / sum(wr)))
    z = 1.959963984540054
    return dict(mu=mu, sePost=se, ci_lo=mu-z*se, ci_hi=mu+z*se, tau2=float(tau))


@pytest.mark.parametrize("obs", [[], OBS, OBS[::-1], OBS * 10,
    [dict(yi=-1e100, vi=1e-10, design="obs"),
     dict(yi=1e100, vi=1e10, design="obs")]])
@pytest.mark.parametrize("rcts", [RCTS, RCTS[::-1], RCTS[:1],
    [dict(yi=0, vi=0.01, design="rct"), dict(yi=0, vi=0.25, design="rct")]])
def test_alpha_zero_matches_independent_exact_dl(rcts, obs):
    rows = rcts + obs
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = {json.dumps(rows)};
        const before = JSON.stringify(rows);
        const fit = M.fitAll(rows, {{alpha: 0}}).powerPrior;
        console.log(JSON.stringify({{fit, unchanged: JSON.stringify(rows) === before}}));
    """)
    assert out["unchanged"]
    for field, expected in _exact_dl(rcts).items():
        assert out["fit"][field] == pytest.approx(expected, abs=1e-12, rel=1e-12)
    assert out["fit"]["k_rct"] == len(rcts)
    assert out["fit"]["k_obs"] == len(obs)


@pytest.mark.parametrize("rows", [[], OBS])
def test_alpha_zero_without_rcts_is_not_estimable(rows):
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.fit_powerPrior({json.dumps(rows)}, 0)));
    """)
    for field in FIELDS[:-1]:
        assert out[field] is None
    assert out["tau2"] == 0
    assert out["warning"]


def test_alpha_one_matches_independent_exact_dl_all_fields():
    rows = RCTS + OBS
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.fit_powerPrior({json.dumps(rows)}, 1)));
    """)
    for field, expected in _exact_dl(rows).items():
        assert out[field] == pytest.approx(expected, abs=1e-12, rel=1e-12)


@pytest.mark.parametrize("alpha", [0.000001, 0.25, 0.5, 0.75])
def test_positive_alpha_preserves_existing_weighting(alpha):
    rows = RCTS + OBS
    tau = _exact_dl(rows)["tau2"]
    weights = [(alpha if r["design"] == "obs" else 1) / (r["vi"] + tau) for r in rows]
    mu = sum(w * r["yi"] for w, r in zip(weights, rows)) / sum(weights)
    se = math.sqrt(1 / sum(weights))
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.fit_powerPrior({json.dumps(rows)}, {alpha})));
    """)
    assert out["tau2"] == pytest.approx(tau, abs=1e-12)
    assert out["mu"] == pytest.approx(mu, abs=1e-12)
    assert out["sePost"] == pytest.approx(se, abs=1e-12)


def test_pinned_metafor_reference_cases():
    reference = json.loads((ROOT / "tests/fixtures/cross-design-alpha0-oracle.json").read_text(encoding="utf-8"))
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const cases = {json.dumps(reference['cases'])};
        console.log(JSON.stringify(cases.map(c => M.fit_powerPrior(c.rows, c.alpha))));
    """)
    for case, actual in zip(reference["cases"], out):
        for field, expected in case["expected"].items():
            assert actual[field] == pytest.approx(expected, abs=1e-6, rel=0), (case["id"], field)


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
