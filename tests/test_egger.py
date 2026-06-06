"""R-parity for shared/egger.js (Egger's regression test for funnel asymmetry).

Verified vs R `summary(lm(yi/sei ~ 1/sei))` (the classic Egger linear regression):
the intercept is the bias coefficient, tested two-sided with df = k - 2.
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

PRELUDE = "const E = require('./shared/egger.js');\n"
ROWS = ("[{y:-0.42,se:0.18},{y:-0.31,se:0.20},{y:-0.55,se:0.25},{y:-0.18,se:0.15},"
        "{y:-0.62,se:0.30},{y:-0.27,se:0.17},{y:-0.10,se:0.12}]")

# Reference from R: summary(lm((yi/sei) ~ (1/sei))) on the rows above.
R_REF = {"intercept": -3.1758, "se": 0.4881, "t": -6.506, "df": 5, "p": 0.0013}


def _run(script: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + script], capture_output=True, text=True,
                       timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_egger_matches_r_lm():
    o = _run("console.log(JSON.stringify(E.eggerTest(" + ROWS + ")));")
    assert math.isclose(o["intercept"], R_REF["intercept"], abs_tol=1e-3)
    assert math.isclose(o["se"], R_REF["se"], abs_tol=1e-3)
    assert math.isclose(o["t"], R_REF["t"], abs_tol=1e-2)
    assert o["df"] == R_REF["df"]
    assert math.isclose(o["p"], R_REF["p"], abs_tol=1e-3)


def test_egger_needs_three_studies():
    o = _run("console.log(JSON.stringify(E.eggerTest([{y:0.1,se:0.2},{y:0.2,se:0.3}])===null));")
    assert o is True


def test_symmetric_funnel_is_non_significant():
    # Effects scattered around a constant, unrelated to precision -> no asymmetry.
    o = _run("console.log(JSON.stringify(E.eggerTest("
             "[{y:0.32,se:0.10},{y:0.28,se:0.20},{y:0.31,se:0.30},{y:0.29,se:0.40},{y:0.30,se:0.50}])));")
    assert o["p"] > 0.1, "a symmetric funnel should not flag significant asymmetry"
