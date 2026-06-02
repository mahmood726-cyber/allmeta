"""τ²-estimator parity for shared/ma-core.js vs metafor::rma.

Runs ma-core under Node and asserts every τ² estimator matches the value
metafor::rma(method=...) produced on the same k=8 heterogeneous dataset.
Skipped if Node is not installed.

Expected τ² captured from metafor 4.6.0 (2026-06-02) on:
  yi = [0.20, 0.50, -0.10, 0.80, 0.30, 0.60, 0.10, 0.45]
  vi = [0.020, 0.030, 0.015, 0.050, 0.025, 0.040, 0.018, 0.030]

  DL  0.05450642   HE  0.05538393   HS  0.04368853   SJ  0.05989549
  ML  0.04404704   REML 0.05432882  EB  0.05474737   PM  0.05474718
(EB ≡ PM in metafor; both retained as a regression guard.)
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "ma-core.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

YI = [0.20, 0.50, -0.10, 0.80, 0.30, 0.60, 0.10, 0.45]
VI = [0.020, 0.030, 0.015, 0.050, 0.025, 0.040, 0.018, 0.030]

# metafor::rma(method=...)$tau2 — captured from metafor 4.6.0.
METAFOR_TAU2 = {
    "DL": 0.05450642,
    "HE": 0.05538393,
    "HS": 0.04368853,
    "SJ": 0.05989549,
    "ML": 0.04404704,
    "REML": 0.05432882,
    "EB": 0.05474737,
    "PM": 0.05474718,
}
TOL = 1e-6


def _ma_core_tau2() -> dict:
    script = f"""
        const M = require({json.dumps(str(MODULE))});
        const yi = {json.dumps(YI)}, vi = {json.dumps(VI)};
        const out = {{}};
        for (const m of {json.dumps(list(METAFOR_TAU2))}) out[m] = M.pool(yi, vi, {{ method: m }}).tau2;
        console.log(JSON.stringify(out));
    """
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT))
    assert res.returncode == 0, f"node exited {res.returncode}\n{res.stderr}"
    return json.loads(res.stdout.strip().splitlines()[-1])


def test_ma_core_tau2_estimators_match_metafor():
    got = _ma_core_tau2()
    mism = []
    for m, expected in METAFOR_TAU2.items():
        assert m in got, f"{m} missing from ma-core output"
        if abs(got[m] - expected) > TOL:
            mism.append(f"  {m}: ma-core={got[m]} vs metafor={expected} (tol={TOL})")
    assert not mism, "τ² estimator mismatch vs metafor:\n" + "\n".join(mism)


def test_eb_equals_pm():
    got = _ma_core_tau2()
    assert abs(got["EB"] - got["PM"]) < 1e-12, "EB must equal PM"
