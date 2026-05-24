"""Tests for shared/cross-network-synthesis.js."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "cross-network-synthesis.js"

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


def test_fit_rct_only_matches_iv_pool():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([
          {{ contrast: "A_vs_B", yi: -0.30, vi: 0.020, design: "rct" }},
          {{ contrast: "A_vs_B", yi: -0.25, vi: 0.025, design: "rct" }},
          {{ contrast: "A_vs_B", yi: -0.40, vi: 0.018, design: "rct" }},
        ]);
        const c = r.contrasts["A_vs_B"];
        console.log(JSON.stringify({{
          mu_anchor: c.mu_anchor, mu_synthesis: c.mu_synthesis,
          delta_ipd: c.delta_ipd, delta_obs: c.delta_obs,
          k_rct: c.k_rct, k_ipd: c.k_ipd, k_obs: c.k_obs,
        }}));
    """)
    # With only RCTs, anchor === synthesis (no bias offsets to apply).
    assert abs(out["mu_anchor"] - out["mu_synthesis"]) < 1e-9
    assert out["delta_ipd"] == 0
    assert out["delta_obs"] == 0
    assert out["k_rct"] == 3


def test_fit_detects_observational_bias():
    # RCTs say -0.30; obs studies systematically more negative (-0.55ish).
    # δ_obs should be approximately -0.25.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([
          {{ contrast: "T_vs_C", yi: -0.30, vi: 0.020, design: "rct" }},
          {{ contrast: "T_vs_C", yi: -0.28, vi: 0.025, design: "rct" }},
          {{ contrast: "T_vs_C", yi: -0.32, vi: 0.018, design: "rct" }},
          {{ contrast: "T_vs_C", yi: -0.55, vi: 0.014, design: "obs" }},
          {{ contrast: "T_vs_C", yi: -0.58, vi: 0.010, design: "obs" }},
          {{ contrast: "T_vs_C", yi: -0.50, vi: 0.012, design: "obs" }},
        ]);
        const c = r.contrasts["T_vs_C"];
        console.log(JSON.stringify({{
          mu_anchor: c.mu_anchor, mu_synthesis: c.mu_synthesis,
          delta_obs: c.delta_obs, sigma2_obs: c.sigma2_obs,
        }}));
    """)
    # δ_obs should be substantially negative (obs more extreme).
    assert out["delta_obs"] < -0.15
    # The synthesis should sit BETWEEN the anchor and the naive obs-included
    # mean — closer to the anchor because of the bias correction.
    assert -0.40 < out["mu_synthesis"] < -0.28


def test_fit_ipd_bias_offset_estimated():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([
          {{ contrast: "T_vs_C", yi: -0.30, vi: 0.020, design: "rct" }},
          {{ contrast: "T_vs_C", yi: -0.40, vi: 0.018, design: "rct" }},
          {{ contrast: "T_vs_C", yi: -0.32, vi: 0.008, design: "ipd" }},  // smaller v (more info)
          {{ contrast: "T_vs_C", yi: -0.31, vi: 0.009, design: "ipd" }},
        ]);
        const c = r.contrasts["T_vs_C"];
        console.log(JSON.stringify({{
          mu_synthesis: c.mu_synthesis, delta_ipd: c.delta_ipd,
          k_ipd: c.k_ipd, sigma2_ipd: c.sigma2_ipd,
        }}));
    """)
    assert out["k_ipd"] == 2
    # δ_ipd should be small (IPD agrees with RCTs).
    assert abs(out["delta_ipd"]) < 0.10


def test_fit_handles_multiple_contrasts():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([
          {{ contrast: "A_vs_B", yi: -0.30, vi: 0.02, design: "rct" }},
          {{ contrast: "A_vs_B", yi: -0.35, vi: 0.02, design: "rct" }},
          {{ contrast: "A_vs_C", yi: -0.45, vi: 0.025, design: "rct" }},
          {{ contrast: "A_vs_C", yi: -0.50, vi: 0.025, design: "obs" }},
        ]);
        console.log(JSON.stringify({{
          n_contrasts: r.n_contrasts,
          a_vs_b: r.contrasts["A_vs_B"].mu_synthesis,
          a_vs_c: r.contrasts["A_vs_C"].mu_synthesis,
          ab_k_obs: r.contrasts["A_vs_B"].k_obs,
          ac_k_obs: r.contrasts["A_vs_C"].k_obs,
        }}));
    """)
    assert out["n_contrasts"] == 2
    assert out["ab_k_obs"] == 0
    assert out["ac_k_obs"] == 1
    assert -0.50 < out["a_vs_b"] < -0.20
    assert -0.55 < out["a_vs_c"] < -0.35


def test_fit_warns_when_no_rct_anchor():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([
          {{ contrast: "T_vs_C", yi: -0.50, vi: 0.02, design: "obs" }},
          {{ contrast: "T_vs_C", yi: -0.55, vi: 0.025, design: "obs" }},
        ]);
        console.log(JSON.stringify({{
          warnings: r.warnings,
          k_rct: r.contrasts["T_vs_C"].k_rct,
        }}));
    """)
    assert out["k_rct"] == 0
    assert any("no RCT" in w for w in out["warnings"])
