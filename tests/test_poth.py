"""Tests for shared/poth.js (Precision Of Treatment Hierarchy, Wigle 2025).

POTH = [12(n-1)/(n+1)] * (1/n) Σ (SUCRA_i - 0.5)^2. The CRAN `poth` package was
not installed on this host, so reference values are analytically derived from
the closed form (which IS the paper's definition) and hand-verified.
"""
import json, math, shutil, subprocess
from pathlib import Path
import pytest
ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
PRELUDE = "const P = require('./shared/poth.js');\n"

def _run(expr):
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])

def test_perfect_hierarchy_is_one():
    assert math.isclose(_run("P.poth([0,1]).poth"), 1.0, abs_tol=1e-12)
    assert math.isclose(_run("P.poth([0,0.5,1]).poth"), 1.0, abs_tol=1e-12)

def test_flat_hierarchy_is_zero():
    assert math.isclose(_run("P.poth([0.5,0.5,0.5]).poth"), 0.0, abs_tol=1e-12)

def test_closed_form_value():
    # n=4, SUCRA {.9,.6,.3,.2}: S2=0.075, S2max=5/36 -> POTH=0.075/(5/36)=0.54.
    assert math.isclose(_run("P.poth([0.9,0.6,0.3,0.2]).poth"), 0.54, abs_tol=1e-9)

def test_needs_two_treatments():
    assert _run("P.poth([0.7])===null") is True
    assert _run("P.poth([])===null") is True

def test_bounded_0_1():
    o = _run("P.poth([0.99,0.01,0.5,0.5,0.5])")
    assert 0.0 <= o["poth"] <= 1.0

def test_sucra_from_rank_probs():
    # certain ranks -> SUCRAs {1,0.5,0} -> POTH 1.
    s = _run("P.sucraFromRankProbs([[1,0,0],[0,1,0],[0,0,1]])")
    assert [round(x, 6) for x in s] == [1.0, 0.5, 0.0]
