"""Audit of the univariate tau^2 estimators a user can reach in shared/ma-core.js, HTA,
multivariate-ma, nma-dose-response-app and dosehtml (lane remlA, 2026-11-12).

Every implementation is EXECUTED (tests/fixtures/tau2_audit_runner.cjs) on eight datasets and
compared with metafor 5.2.1 at 1e-6 relative (tests/fixtures/tau2_audit_metafor521.json):
dat.bcg (log RR), dat.bangertdrowns2004, dat.normand1999 (MD), dat.molloy2014 (ZCOR), a k=2
set, a tau^2=0 set and dat.normand1999 rescaled by c=1e4 and c=1e-4 (y*c, v*c^2), whose exact
estimates are c^2 times the unscaled ones. The rescaled sets catch absolute stopping rules and
absolute brackets; the ML-score-for-REML defect shows on every heterogeneous set.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIX = json.loads((ROOT / "tests" / "fixtures" / "tau2_audit_metafor521.json").read_text(encoding="utf-8"))
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
TOL = 1e-6

METHOD = {
    "HTA IPD two-stage pooling": "REML",
    "multivariate-ma univariate REML": "REML",
    "nma-dose-response-app REMLEstimator": "REML",
    "nma-dose-response-app SidikJonkmanEstimator": "SJ",
    "dosehtml REML (mods = x)": "REML",
    "dosehtml DL (mods = x)": "DL",
}


@pytest.fixture(scope="module")
def results():
    res = subprocess.run([NODE, str(ROOT / "tests" / "fixtures" / "tau2_audit_runner.cjs")],
                         capture_output=True, text=True, timeout=300, check=False, cwd=str(ROOT))
    assert res.returncode == 0, f"runner exited {res.returncode}\n{res.stderr[-2000:]}"
    return json.loads(res.stdout)


def _ok(got, ref, vi):
    if not isinstance(got, (int, float)):
        return False
    if ref == 0:
        return abs(got) <= TOL * max(vi)
    return abs(got - ref) / abs(ref) <= TOL


def _check(block, refs, name, method):
    bad = []
    for ds, ref in refs.items():
        got = block[name][ds]
        if not _ok(got, ref[method], FIX["data"][ds]["vi"]):
            bad.append(f"{ds}: got {got!r}, metafor {ref[method]!r}")
    assert not bad, f"{name} ({method}) differs from metafor 5.2.1 at 1e-6:\n  " + "\n  ".join(bad)


UNI = ["ma-core REML", "ma-core ML", "ma-core PM", "ma-core EB", "ma-core SJ", "ma-core HE", "ma-core DL",
       "HTA metaMethods REML", "HTA metaMethods PM", "HTA metaMethods DL", "HTA IPD two-stage pooling",
       "multivariate-ma univariate REML", "nma-dose-response-app REMLEstimator",
       "nma-dose-response-app SidikJonkmanEstimator"]


@pytest.mark.parametrize("name", UNI)
def test_univariate_tau2_matches_metafor(results, name):
    _check(results["uni"], FIX["ref"], name, METHOD.get(name, name.split()[-1]))


@pytest.mark.parametrize("name", ["dosehtml REML (mods = x)", "dosehtml DL (mods = x)"])
def test_meta_regression_tau2_matches_metafor(results, name):
    _check(results["reg"], FIX["ref_reg"], name, METHOD[name])
