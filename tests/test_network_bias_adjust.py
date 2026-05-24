"""Tests for shared/network-bias-adjust.js — Chaimani-style adjustments."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "network-bias-adjust.js"

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


def test_buildPooledMap_normalises_orientation():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const pooled = M.buildPooledMap([
          {{ trtA: "A", trtB: "B", mu: -0.30 }},   // sorted "A|B" => keep sign
          {{ trtA: "C", trtB: "A", mu:  0.40 }},   // sorted "A|C" => flip sign
        ]);
        console.log(JSON.stringify(pooled));
    """)
    assert abs(out["A|B"] - (-0.30)) < 1e-12
    assert abs(out["A|C"] - (-0.40)) < 1e-12   # flipped


def test_transformForFunnel_centres_each_contrast_at_zero():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ trtA: "A", trtB: "B", y: -0.25, se: 0.10 }},   // pooled A|B = -0.30
          {{ trtA: "A", trtB: "B", y: -0.35, se: 0.12 }},
          {{ trtA: "B", trtB: "A", y:  0.32, se: 0.11 }},   // flipped orientation
        ];
        const pooled = {{ "A|B": -0.30 }};
        const adj = M.transformForFunnel(rows, pooled);
        console.log(JSON.stringify(adj.map(r => ({{ y_adj: r.y_adj, contrast: r.contrast }}))));
    """)
    # First row: -0.25 - (-0.30) = +0.05
    assert abs(out[0]["y_adj"] - 0.05) < 1e-9
    # Second row: -0.35 - (-0.30) = -0.05
    assert abs(out[1]["y_adj"] - (-0.05)) < 1e-9
    # Third row: y oriented as A→B is -0.32 (sign flip), -0.32 - (-0.30) = -0.02
    assert abs(out[2]["y_adj"] - (-0.02)) < 1e-9


def test_poolWithBias_zero_bias_equals_iv_pool():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ y: -0.30, se: 0.10, bias: 0 }},
          {{ y: -0.25, se: 0.12, bias: 0 }},
          {{ y: -0.40, se: 0.15, bias: 0 }},
        ];
        const r = M.poolWithBias(rows);
        // IV pool: μ = sum(w*y)/sum(w), w = 1/SE²
        const w = rows.map(r => 1 / (r.se * r.se));
        const sw = w.reduce((a, b) => a + b, 0);
        const swy = rows.reduce((a, row, i) => a + w[i] * row.y, 0);
        const mu_check = swy / sw;
        console.log(JSON.stringify({{ mu: r.mu, mu_check: mu_check }}));
    """)
    assert abs(out["mu"] - out["mu_check"]) < 1e-12


def test_poolWithBias_bias_1_excludes_study():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ y: -0.30, se: 0.10, bias: 0 }},
          {{ y:  0.50, se: 0.10, bias: 1.0 }},   // fully excluded
          {{ y: -0.30, se: 0.10, bias: 0 }},
        ];
        const r = M.poolWithBias(rows);
        console.log(JSON.stringify({{ mu: r.mu, k_eff: r.k_effective }}));
    """)
    # μ should be -0.30 (the two unbiased agree); bias-1 excluded.
    assert abs(out["mu"] - (-0.30)) < 1e-9
    assert abs(out["k_eff"] - 2) < 1e-9


def test_poolWithBias_partial_bias_pulls_toward_unbiased():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rowsNo = [
          {{ y: -0.30, se: 0.10 }},
          {{ y:  0.50, se: 0.10 }},
        ];
        const rowsDown = [
          {{ y: -0.30, se: 0.10, bias: 0 }},
          {{ y:  0.50, se: 0.10, bias: 0.7 }},   // downweight the outlier 70%
        ];
        const a = M.poolWithBias(rowsNo);
        const b = M.poolWithBias(rowsDown);
        console.log(JSON.stringify({{ no: a.mu, down: b.mu }}));
    """)
    # Naive: midway between -0.30 and 0.50 ≈ +0.10. With 70% downweight on
    # the outlier, downweighted pool should be much closer to -0.30.
    assert abs(out["no"] - 0.10) < 0.05
    assert out["down"] < out["no"]


def test_biasFromRob_default_map():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          low: M.biasFromRob("low"),
          some: M.biasFromRob("some"),
          high: M.biasFromRob("high"),
          unknown: M.biasFromRob("not-in-map"),
        }}));
    """)
    assert out["low"] == 0
    assert out["some"] == 0.25
    assert out["high"] == 0.5
    assert out["unknown"] == 0


def test_poolWithBias_returns_error_when_all_excluded():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.poolWithBias([
          {{ y: 0, se: 0.1, bias: 1 }},
          {{ y: 1, se: 0.1, bias: 1 }},
        ]);
        console.log(JSON.stringify(r));
    """)
    assert out["ok"] is False
