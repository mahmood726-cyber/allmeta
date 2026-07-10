"""Tests for shared/gsdesign.js — group-sequential design boundaries.

Golden efficacy bounds captured from gsDesign (R 4.6.0, gsDesign::gsDesign,
test.type=1) 2026-07-10. The recursive-density / Gauss-Legendre boundary solver
reproduces gsDesign to ~1e-5 across the four spending families — the EXACT
boundary, vs the closed-form approximation in tsa / sequential-ma.
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
PRELUDE = "const G = require('./shared/gsdesign.js');\n"

# gsDesign::gsDesign(test.type=1, alpha=0.025, timing=(1:k)/k)$upper$bound
GOLDEN = {
    "obf_k4":    ([4.332634, 2.963131, 2.359044, 2.014090], {"spend": "obf"}),
    "pocock_k4": ([2.368328, 2.367524, 2.358168, 2.350036], {"spend": "pocock"}),
    "hsd_k3_g1": ([2.283141, 2.284441, 2.301255], {"spend": "hsd", "param": 1}),
    "power_k5_r2": ([3.090232, 2.714112, 2.472777, 2.279863, 2.114028], {"spend": "landemets", "param": 2}),
}


def _bounds(k, opts):
    frac = [(i + 1) / k for i in range(k)]
    o = dict(opts, alpha=0.025, infoFracs=frac)
    expr = f"G.boundaries({json.dumps(o)}).map(x=>x.z_eff)"
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("name", list(GOLDEN))
def test_boundaries_match_gsdesign(name):
    gold, opts = GOLDEN[name]
    k = len(gold)
    got = _bounds(k, opts)
    assert len(got) == k
    for g, e in zip(got, gold):
        assert math.isclose(g, e, abs_tol=1e-4), f"{name}: {got} vs {gold}"


def test_total_alpha_spent_equals_alpha():
    # cumulative alpha at the final look must equal the design alpha
    r = subprocess.run(
        [NODE, "-e", PRELUDE + "const b=G.boundaries({alpha:0.025,infoFracs:[0.25,0.5,0.75,1],spend:'obf'});"
         "console.log(JSON.stringify(b[b.length-1].cumAlpha));"],
        capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    assert math.isclose(json.loads(r.stdout.strip().splitlines()[-1]), 0.025, abs_tol=1e-9)


def test_single_look_reduces_to_fixed_design():
    got = _bounds(1, {"spend": "obf"})
    # k=1 => the fixed-design one-sided 0.025 critical value 1.959964
    assert math.isclose(got[0], 1.959963984540054, abs_tol=1e-6)


def test_conditional_power_sanity():
    # CP under current trend, interim exactly on the final-boundary trajectory.
    out = subprocess.run(
        [NODE, "-e", PRELUDE +
         "console.log(JSON.stringify({"
         "half: G.conditionalPower(1.96, 0.5, 1.96, 0),"       # theta=0 => low CP
         "trend: G.conditionalPower(2.5, 0.5, 1.96, null),"    # strong obs trend => high CP
         "}));"],
        capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    o = json.loads(out.stdout.strip().splitlines()[-1])
    assert 0.0 <= o["half"] <= 0.25, o         # no drift => low-ish CP (~0.21 for z=1.96@t=.5)
    assert o["trend"] > 0.8, o                  # strong interim trend => high conditional power
