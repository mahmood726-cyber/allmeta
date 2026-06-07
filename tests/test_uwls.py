"""R-parity for shared/uwls.js (UWLS / multiplicative-heterogeneity MA).

Verified vs R summary(lm(yi ~ 1, weights = 1/vi)): the point estimate is the
fixed-effect (inverse-variance) one, SE = SE_FE * sqrt(Q/(k-1)), t_{k-1} CI.
"""
import json, math, shutil, subprocess
from pathlib import Path
import pytest
ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
PRELUDE = "require('./shared/ma-core.js'); const U = require('./shared/uwls.js');\n"
YI = "[0.10,0.30,0.50,0.20,0.90,0.40,1.10,0.05]"
VI = "[0.20,0.25,0.18,0.30,0.22,0.28,0.35,0.15].map(s=>s*s)"
# R: summary(lm(yi ~ 1, weights=1/vi)) on the data above.
R = {"est": 0.35416256, "se": 0.12134013, "phi": 2.488249}

def _run(expr):
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])

def test_uwls_matches_r_lm():
    o = _run("U.uwls(" + YI + "," + VI + ")")
    assert math.isclose(o["mu"], R["est"], abs_tol=1e-6)
    assert math.isclose(o["se"], R["se"], abs_tol=1e-6)
    assert math.isclose(o["phi"], R["phi"], abs_tol=1e-5)

def test_point_equals_fixed_effect():
    o = _run("(function(){var u=U.uwls(" + YI + "," + VI + ");var fe=AlmMaCore.pool(" + YI + "," + VI + ",{method:'FE'});return {d:Math.abs(u.mu-fe.mu)};})()")
    assert o["d"] < 1e-12, "UWLS point estimate must equal the fixed-effect estimate"

def test_needs_two_studies():
    assert _run("U.uwls([0.1],[0.04])===null") is True
