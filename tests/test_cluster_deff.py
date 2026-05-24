"""Tests for shared/cluster-deff.js — cluster RCT design-effect adjustment."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "cluster-deff.js"

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


def test_computeDeff_canonical():
    # m̄=10, ICC=0.05 → DEFF = 1 + 9*0.05 = 1.45
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.computeDeff({{ m_bar: 10, icc: 0.05 }})));
    """)
    assert abs(out - 1.45) < 1e-12


def test_computeDeff_m1_returns_1():
    # No clustering when each "cluster" has 1 member.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.computeDeff({{ m_bar: 1, icc: 0.5 }})));
    """)
    assert out == 1.0


def test_adjustSE_inflates():
    # SE inflates by sqrt(DEFF).
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const se0 = 0.1;
        const se1 = M.adjustSE({{ se: se0, m_bar: 10, icc: 0.05 }});
        console.log(JSON.stringify({{ se0: se0, se1: se1, ratio: se1 / se0 }}));
    """)
    assert abs(out["ratio"] - (1.45 ** 0.5)) < 1e-9


def test_adjustN_deflates():
    # Effective N = N / DEFF.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.adjustN({{ n: 1000, m_bar: 10, icc: 0.05 }})));
    """)
    assert abs(out - (1000 / 1.45)) < 1e-9


def test_adjustRows_leaves_individually_randomised_unchanged():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.3, vi: 0.01, m_bar: 1, icc: 0.05 }},   // individual RCT
          {{ yi: -0.4, vi: 0.02 }},                          // no clustering info
          {{ yi: -0.5, vi: 0.015, m_bar: 12, icc: 0.05 }}, // cluster RCT
        ];
        const adj = M.adjustRows(rows);
        console.log(JSON.stringify(adj.map(r => ({{ vi: r.vi, deff: r.deff }}))));
    """)
    assert out[0]["vi"] == 0.01 and out[0].get("deff") is None
    assert out[1]["vi"] == 0.02 and out[1].get("deff") is None
    assert abs(out[2]["deff"] - (1 + 11 * 0.05)) < 1e-9
    assert abs(out[2]["vi"] - 0.015 * (1 + 11 * 0.05)) < 1e-9


def test_rejects_invalid_icc():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        try {{ M.computeDeff({{ m_bar: 10, icc: 1.5 }}); console.log('"no-throw"'); }}
        catch (e) {{ console.log(JSON.stringify(e.message)); }}
    """)
    assert "icc" in out


def test_default_icc_applied_when_missing():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [{{ yi: 0.3, vi: 0.01, m_bar: 10 }}];
        const adj = M.adjustRows(rows, 0.10);
        console.log(JSON.stringify({{ vi: adj[0].vi, deff: adj[0].deff }}));
    """)
    # DEFF = 1 + 9 * 0.10 = 1.9
    assert abs(out["deff"] - 1.9) < 1e-9
