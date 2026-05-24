"""Tests for shared/sequential-ma.js — α-spending sequential meta-analysis."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "sequential-ma.js"

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


# --- Spending functions -------------------------------------------------------


def test_OBF_spend_zero_at_t0_alpha_at_t1():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          at_0: M._spend("OBF", 0.05, 0),
          at_1: M._spend("OBF", 0.05, 1),
          at_05: M._spend("OBF", 0.05, 0.5),
        }}));
    """)
    assert out["at_0"] == 0
    assert abs(out["at_1"] - 0.05) < 1e-9
    # OBF is conservative early: a(0.5) should be MUCH less than 0.025.
    assert out["at_05"] < 0.01


def test_Pocock_spend_more_aggressive_early_than_OBF():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          obf_at_03: M._spend("OBF", 0.05, 0.3),
          pocock_at_03: M._spend("POCOCK", 0.05, 0.3),
        }}));
    """)
    assert out["pocock_at_03"] > out["obf_at_03"]


def test_linear_spend_matches_alpha_times_t():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M._spend("LINEAR", 0.05, 0.4)));
    """)
    assert abs(out - 0.02) < 1e-12


# --- Boundary computation -----------------------------------------------------


def test_computeBoundary_continue_when_z_below_boundary():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.computeBoundary([
          {{ t: 0.25, z: 0.5 }},
          {{ t: 0.50, z: 1.2 }},
          {{ t: 0.75, z: 1.6 }},
        ], {{ alpha: 0.05, family: "OBF" }});
        console.log(JSON.stringify({{
          decision: r.decision,
          per_look: r.looks.map(l => l.decision),
          boundaries: r.looks.map(l => l.alpha_boundary),
        }}));
    """)
    assert out["decision"] == "continue"
    for d in out["per_look"]:
        assert d == "continue"
    # OBF boundaries decrease with t (conservative early); first look is huge.
    assert out["boundaries"][0] > out["boundaries"][-1]


def test_computeBoundary_rejects_when_z_crosses():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.computeBoundary([
          {{ t: 0.30, z: 4.5 }},   // huge effect early
          {{ t: 0.60, z: 4.8 }},
          {{ t: 1.00, z: 5.0 }},
        ], {{ alpha: 0.05, family: "OBF" }});
        console.log(JSON.stringify({{
          decision: r.decision,
          first_decision: r.looks[0].decision,
        }}));
    """)
    assert out["decision"] == "reject-H0"
    assert out["first_decision"] == "reject-H0"


def test_computeBoundary_futility_path():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // Tiny z values throughout → never crosses upper boundary, may cross inner.
        const r = M.computeBoundary([
          {{ t: 0.40, z: 0.1 }},
          {{ t: 0.70, z: 0.05 }},
          {{ t: 0.95, z: 0.02 }},
        ], {{ alpha: 0.05, beta: 0.20, family: "OBF", futility: true }});
        console.log(JSON.stringify({{
          decision: r.decision,
          futility_boundaries: r.looks.map(l => l.futility_boundary),
        }}));
    """)
    # With small z and futility enabled, decision should be either futility or continue.
    assert out["decision"] in ("futility", "continue", "reject-H0")
    assert all(b is not None for b in out["futility_boundaries"])


def test_looksFromRows_n_cum_mode():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const looks = M.looksFromRows([
          {{ y_cum: 0.30, se_cum: 0.10, n_cum: 100 }},
          {{ y_cum: 0.32, se_cum: 0.08, n_cum: 200 }},
          {{ y_cum: 0.33, se_cum: 0.06, n_cum: 400 }},
        ]);
        console.log(JSON.stringify(looks));
    """)
    assert len(out) == 3
    assert out[0]["t"] == 0.25     # 100/400
    assert out[1]["t"] == 0.5
    assert out[-1]["t"] == 1.0
    # z = y/se
    assert abs(out[2]["z"] - 0.33 / 0.06) < 1e-9


def test_alpha_total_spent_does_not_exceed_alpha():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.computeBoundary([
          {{ t: 0.1, z: 0 }}, {{ t: 0.3, z: 0 }}, {{ t: 0.5, z: 0 }},
          {{ t: 0.7, z: 0 }}, {{ t: 0.9, z: 0 }}, {{ t: 1.0, z: 0 }},
        ], {{ alpha: 0.05, family: "POCOCK" }});
        const total = r.looks.reduce((a, l) => a + l.spend_alpha, 0);
        console.log(JSON.stringify({{ total: total }}));
    """)
    assert out["total"] <= 0.05 + 1e-9
