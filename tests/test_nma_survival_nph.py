"""Tests for shared/nma-survival-nph.js — piecewise-exponential non-PH survival NMA.

Per-interval relative effects are pinned to netmeta::netmeta() run on the same
interval's log-HR contrasts (R 4.6.0, netmeta, 2026-07-11). The interval-1
network is 3 treatments A/B/C over studies s1(A,B), s2(A,C), s3(B,C).
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
PRELUDE = "const S = require('./shared/nma-survival-nph.js');\n"

IV1_ROWS = [
    {"study": "s1", "treatment": "A", "interval": "1", "events": 40, "ptime": 1000},
    {"study": "s1", "treatment": "B", "interval": "1", "events": 30, "ptime": 1000},
    {"study": "s2", "treatment": "A", "interval": "1", "events": 45, "ptime": 900},
    {"study": "s2", "treatment": "C", "interval": "1", "events": 20, "ptime": 900},
    {"study": "s3", "treatment": "B", "interval": "1", "events": 28, "ptime": 850},
    {"study": "s3", "treatment": "C", "interval": "1", "events": 22, "ptime": 800},
]
# netmeta::netmeta(..., reference.group="A", common=TRUE) golden
NETMETA = {"B": (-0.37706693, 0.20390481), "C": (-0.68219469, 0.21601098)}


def _run(expr: str):
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_per_interval_matches_netmeta():
    out = _run(f"S.fit({json.dumps(IV1_ROWS)}, {{model:'fe'}}).intervals['1']")
    assert out["refTreat"] == "A"
    for t, (te, se) in NETMETA.items():
        assert math.isclose(out["effects"][t]["logHR"], te, abs_tol=1e-6), (t, out["effects"][t])
        assert math.isclose(out["effects"][t]["se"], se, abs_tol=1e-6), (t, out["effects"][t])


def test_log_hazard_and_contrast_formula():
    # logHazard = log((events+cc)/ptime); log-HR = difference of the two.
    lh = _run("S._logHazard(30, 1000, 0.5)")
    assert math.isclose(lh, math.log((30 + 0.5) / 1000), rel_tol=1e-12)


def test_non_ph_intervals_are_independent_and_pooled():
    # Two intervals with DIFFERENT hazard ratios (non-PH): effects differ by interval,
    # pooled is the inverse-variance average across intervals.
    rows = IV1_ROWS + [
        {"study": "s1", "treatment": "A", "interval": "2", "events": 20, "ptime": 800},
        {"study": "s1", "treatment": "B", "interval": "2", "events": 35, "ptime": 800},
        {"study": "s2", "treatment": "A", "interval": "2", "events": 25, "ptime": 700},
        {"study": "s2", "treatment": "C", "interval": "2", "events": 30, "ptime": 700},
        {"study": "s3", "treatment": "B", "interval": "2", "events": 33, "ptime": 650},
        {"study": "s3", "treatment": "C", "interval": "2", "events": 24, "ptime": 600},
    ]
    r = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}})")
    assert r["intervalIds"] == ["1", "2"]
    # B vs A flips direction across intervals (protective early, harmful late) => genuine non-PH
    b1 = r["intervals"]["1"]["effects"]["B"]["logHR"]
    b2 = r["intervals"]["2"]["effects"]["B"]["logHR"]
    assert b1 < 0 < b2, (b1, b2)
    # pooled B is between the two interval estimates (IV average)
    bp = r["pooled"]["B"]["logHR"]
    assert min(b1, b2) < bp < max(b1, b2)


def test_interval_with_single_arm_is_skipped():
    rows = [
        {"study": "s1", "treatment": "A", "interval": "1", "events": 10, "ptime": 500},
        {"study": "s1", "treatment": "B", "interval": "1", "events": 12, "ptime": 500},
        {"study": "s9", "treatment": "A", "interval": "2", "events": 5, "ptime": 300},  # lone arm
    ]
    r = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}})")
    assert r["intervalIds"] == ["1"]  # interval 2 (single arm) dropped
