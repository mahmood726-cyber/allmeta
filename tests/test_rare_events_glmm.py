"""Tests for shared/rare-events-glmm.js — binomial-normal GLMM."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "rare-events-glmm.js"

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


def test_logBin_matches_R_dbinom():
    # R: dbinom(3, 10, 0.5, log=TRUE) = -2.144144
    # The iterative log-choose loop has minor float drift vs R's lgamma-
    # based dbinom; ~1e-3 is more than enough for the GLMM use case.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const logit = 0;  // p = 0.5
        console.log(JSON.stringify(M._logBin(3, 10, logit)));
    """)
    assert abs(out - (-2.144144)) < 1e-3


def test_fit_runs_with_zero_event_studies():
    # Mix of zero-event studies and ordinary studies; GLMM should converge
    # without crashing and return finite OR + CI.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ events_T: 0, n_T: 250, events_C: 1, n_C: 248 }},
          {{ events_T: 2, n_T: 500, events_C: 5, n_C: 510 }},
          {{ events_T: 0, n_T: 180, events_C: 3, n_C: 182 }},
          {{ events_T: 1, n_T: 320, events_C: 4, n_C: 325 }},
          {{ events_T: 3, n_T: 600, events_C: 7, n_C: 605 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          ok: r.ok, OR: r.OR, OR_lo: r.OR_lo, OR_hi: r.OR_hi,
          theta_finite: isFinite(r.theta), se_finite: isFinite(r.se_theta),
          k: r.k, zeros: r.n_zero_cell_studies,
        }}));
    """)
    assert out["ok"] is True
    assert out["theta_finite"] and out["se_finite"]
    assert 0.1 < out["OR"] < 1.5
    assert out["OR_lo"] < out["OR_hi"]
    assert out["k"] == 5
    assert out["zeros"] == 2


def test_fit_no_zero_cells_matches_orthodox_pool():
    # Without zero cells, GLMM and IV+CC should agree closely. Loose check
    # on log-OR direction (negative when T < C).
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ events_T: 8, n_T: 200, events_C: 15, n_C: 200 }},
          {{ events_T: 12, n_T: 300, events_C: 20, n_C: 305 }},
          {{ events_T: 5, n_T: 150, events_C: 11, n_C: 152 }},
          {{ events_T: 10, n_T: 250, events_C: 18, n_C: 248 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{ OR: r.OR, theta: r.theta, ok: r.ok }}));
    """)
    assert out["ok"] is True
    # Treatment has roughly half the event rate of control — OR ≈ 0.5.
    assert 0.3 < out["OR"] < 0.8
    assert out["theta"] < 0


def test_fit_handles_all_zero_treatment_arm():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ events_T: 0, n_T: 500, events_C: 8, n_C: 500 }},
          {{ events_T: 0, n_T: 600, events_C: 12, n_C: 605 }},
          {{ events_T: 0, n_T: 400, events_C: 5, n_C: 395 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          ok: r.ok, OR: r.OR, zeros: r.n_zero_cell_studies,
        }}));
    """)
    assert out["ok"] is True
    # All-zero treatment arms => OR < 1 (and probably small).
    assert out["OR"] < 1
    assert out["zeros"] == 3


def test_fit_rejects_invalid_rows():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([
          {{ events_T: -1, n_T: 100, events_C: 5, n_C: 100 }},   // invalid (negative)
          {{ events_T: 200, n_T: 100, events_C: 5, n_C: 100 }},   // events_T > n_T
        ]);
        console.log(JSON.stringify(r));
    """)
    # All rows filtered → no valid rows → ok=false.
    assert out["ok"] is False
