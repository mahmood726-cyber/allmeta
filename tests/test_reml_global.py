"""Global REML regression and fresh R/metafor reference checks.

The fixtures cover multiple positive modes, a higher interior mode entirely
missed by PR #84's 64-point grid, and a genuine competing boundary maximum.
"""
from __future__ import annotations

import json
import hashlib
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
REAL = json.loads((ROOT / "tests/fixtures/reml_nonconvergence.json").read_text())["reviews"]
MODES = json.loads((ROOT / "tests/fixtures/reml_global_modes.json").read_text())["cases"]
CASES = [{**c, "id": c["review_id"]} for c in REAL] + MODES


def run_cases(cases, expression="M.tau2REML(c.yi,c.vi)"):
    code = f"""
    const fs=require('node:fs'), M=require('./shared/ma-core.js');
    const cases=JSON.parse(fs.readFileSync(0,'utf8'));
    console.log(JSON.stringify(cases.map(c=>({expression}))));
    """
    result = subprocess.run([NODE, "-e", code], input=json.dumps(cases),
                            capture_output=True, text=True, cwd=ROOT, timeout=30, check=True)
    return json.loads(result.stdout)


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_global_mode_and_true_boundary(case):
    got = run_cases([case])[0]
    assert got == pytest.approx(case["expected_tau2"], rel=2e-8, abs=2e-9)
    if case["expected_tau2"] == 0:
        assert got == 0


@pytest.mark.parametrize("factor", [1e-120, 1e-60, 1e-12, 1, 1e12, 1e60, 1e120])
def test_units_do_not_change_boundary_or_mode_selection(factor):
    source = [CASES[1], MODES[0], MODES[2], MODES[3]]
    scaled = [{"yi": [y * factor for y in c["yi"]],
               "vi": [(v * factor) * factor for v in c["vi"]]} for c in source]
    got = run_cases(scaled)
    for c, value in zip(source, got):
        assert value is not None, "REML returned a non-finite value"
        assert (value / factor) / factor == pytest.approx(c["expected_tau2"], rel=2e-8, abs=2e-9)


def test_permutation_and_translation_invariance():
    cases = []
    for c in MODES[:3]:
        cases.extend([
            {"yi": c["yi"][::-1], "vi": c["vi"][::-1]},
            {"yi": [x + 1e6 for x in c["yi"]], "vi": c["vi"]},
        ])
    got = run_cases(cases)
    for c, values in zip(MODES[:3], zip(got[::2], got[1::2])):
        for value in values:
            assert value == pytest.approx(c["expected_tau2"], rel=3e-8, abs=2e-9)


def test_exact_two_study_and_equal_variance_solutions():
    near = math.sqrt(.05) * (1 + 1e-8)
    cases = [
        {"yi": [], "vi": []}, {"yi": [10], "vi": [.01]},
        {"yi": [3, 3, 3], "vi": [.001, 1, 100]},
        {"yi": [0, 1], "vi": [.02, .03]},
        {"yi": [0, near], "vi": [.02, .03]},
        {"yi": [-1, 0, 1], "vi": [.1, .1, .1]},
        {"yi": [-.01, 0, .01], "vi": [.1, .1, .1]},
    ]
    expected = [0, 0, 0, .475, (near * near - .05) / 2, .9, 0]
    got = run_cases(cases)
    for value, ref in zip(got, expected):
        assert value == pytest.approx(ref, rel=3e-8, abs=1e-17)
    assert got[4] > 0, "A tiny positive optimum must not be rounded to the boundary"


def test_invalid_variances_and_unrepresentable_ranges_are_refused():
    code = """
    const M=require('./shared/ma-core.js');
    const cases=[[[0,1],[1]], [[0,1],[0,1]], [[0,1],[-1,1]],
      [[0,NaN],[1,1]], [[0,1],[1,Infinity]], [[0,'1'],[1,1]],
      [[0,1],[Number.MIN_VALUE,1e308]], [[-1e155,1e155],[1,1]]];
    console.log(JSON.stringify(cases.map(c=>{
      try { M.tau2REML(...c); return false; } catch(e) { return e instanceof RangeError; }
    })));
    """
    result = subprocess.run([NODE, "-e", code], capture_output=True, text=True,
                            cwd=ROOT, timeout=30, check=True)
    assert all(json.loads(result.stdout))


def test_fresh_metafor_pool_and_hartung_knapp_reference():
    refs = json.loads((ROOT / "tests/fixtures/reml_reference.json").read_text())
    assert refs["metafor_version"] == "4.8.0"
    assert refs["r_version"].startswith("R version 4.5.1")
    for filename, digest in refs["input_sha256"].items():
        assert hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() == digest
    assert hashlib.sha256((ROOT / "tests/reml_reference.R").read_bytes()).hexdigest() == refs["source_sha256"]
    got = run_cases(CASES, "{plain:M.pool(c.yi,c.vi,{method:'REML'}),hk:M.pool(c.yi,c.vi,{method:'REML',knha:true})}")
    for c, result in zip(CASES, got):
        ref = refs["cases"][c["id"]]["reference"]
        for field in ["tau2", "mu", "se", "ciLo", "ciHi", "I2"]:
            assert result["plain"][field] == pytest.approx(ref[field], abs=2e-8, rel=2e-8), (c["id"], field)
        for js, r in [("se", "knhaSe"), ("ciLo", "knhaCiLo"), ("ciHi", "knhaCiHi")]:
            assert result["hk"][js] == pytest.approx(ref[r], abs=2e-8, rel=2e-8), (c["id"], r)


def test_seeded_inputs_against_independent_scipy_contrast_profile():
    np = pytest.importorskip("numpy")
    scipy_linalg = pytest.importorskip("scipy.linalg")
    optimize = pytest.importorskip("scipy.optimize")
    rng = np.random.default_rng(84084)
    cases = []
    for _ in range(120):
        k = int(rng.integers(3, 13))
        v = 10 ** rng.uniform(-5, 3, k)
        y = rng.normal(size=k) * np.sqrt(v) * rng.uniform(.1, 2)
        cases.append({"yi": y.tolist(), "vi": v.tolist()})
    for c, got in zip(cases, run_cases(cases)):
        y, v = np.array(c["yi"]), np.array(c["vi"])
        h = scipy_linalg.helmert(len(y))
        lam, eigenvectors = np.linalg.eigh((h * v) @ h.T)
        z2 = (eigenvectors.T @ h @ y) ** 2
        grid = np.r_[0, np.geomspace(min(lam)*1e-12, max(sum((y-y.mean())**2), max(v))*2, 2048)]
        def score(t):
            d = lam + t
            return .5 * np.sum((z2-d)/d**2)
        def ll(t):
            d = lam + t
            return -.5 * np.sum(np.log(d) + z2/d)
        scores = np.array([score(t) for t in grid])
        roots = [optimize.brentq(score, a, b, xtol=np.finfo(float).tiny, rtol=1e-14)
                 for a, b, sa, sb in zip(grid[:-1], grid[1:], scores[:-1], scores[1:]) if sa*sb < 0]
        assert max(map(ll, [0]+roots)) - ll(got) < 1e-7
