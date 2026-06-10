"""Tests for shared/stats-qt.js (Hill 1970 qt + Beasley-Springer-Moro qnorm).

Validates against R's exact values where available; for environments
without R, falls back to scipy.stats reference values.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "stats-qt.js"

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


# --- qnorm (Beasley-Springer-Moro) -------------------------------------------


def test_qnorm_0975_matches_r():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.qnorm(0.975)));
    """)
    # R: qnorm(0.975) = 1.959963984540054
    assert abs(out - 1.959963984540054) < 1e-12


def test_qnorm_0025_negative():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.qnorm(0.025)));
    """)
    assert abs(out + 1.959963984540054) < 1e-12


@pytest.mark.parametrize("p,expected", [
    # CENTRAL region |p-0.5|<=0.425 — the AS241 branch that had r=q*q instead of
    # 0.180625-q*q. Old code returned wrong values here while the tails (0.975)
    # stayed correct, masking the bug. R qnorm():
    (0.55, 0.1256613),
    (0.60, 0.2533471),
    (0.70, 0.5244005),
    (0.75, 0.6744898),
    (0.80, 0.8416212),
    (0.90, 1.2815516),   # was 1.025 before the fix
    (0.20, -0.8416212),
    (0.10, -1.2815516),
])
def test_qnorm_central_region_matches_r(p, expected):
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.qnorm({p})));
    """)
    assert abs(out - expected) < 1e-6, f"qnorm({p}) = {out}, expected {expected}"


# --- qt (Hill 1970) — these are the table values; webr-validator HKSJ uses qt ---


@pytest.mark.parametrize("df,expected", [
    (1, 12.706204),   # R: qt(0.975, 1)
    (2, 4.302653),
    (3, 3.182446),
    (5, 2.570582),
    (10, 2.228139),
    (20, 2.085963),
    (28, 2.048407),   # critical for k=29
    (30, 2.042272),
    (50, 2.008559),   # PREVIOUSLY MISSING — old lookup table fell back to z=1.96
    (100, 1.983972),
    (1000, 1.962339),
])
def test_qt_0975_matches_R_table(df, expected):
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.qt(0.975, {df})));
    """)
    # Hill 1970 + 1 Newton step is good to ~1e-6 in this range.
    assert abs(out - expected) < 5e-5, f"qt(0.975, {df}) = {out}, expected {expected}"


def test_qt_handles_df_1_exact():
    # qt(0.975, 1) = tan(π/2 * (2*0.975 - 1)) = tan(0.475π)
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.qt(0.975, 1)));
    """)
    assert abs(out - math.tan(math.pi * 0.475)) < 1e-12


def test_qt_symmetric_about_05():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          pos: M.qt(0.95, 12),
          neg: M.qt(0.05, 12),
        }}));
    """)
    assert abs(out["pos"] + out["neg"]) < 1e-9


# --- pchisq (Q-test p-value sanity) ------------------------------------------


def test_pchisq_matches_R_one_dof():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.pchisq(3.84, 1)));
    """)
    # R: pchisq(3.84, 1) ≈ 0.9499578
    assert abs(out - 0.9499578) < 1e-5
