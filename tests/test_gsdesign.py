"""Tests for shared/gsdesign.js — group-sequential design boundaries.

Golden efficacy bounds captured from gsDesign (R 4.6.0, gsDesign::gsDesign,
test.type=1) 2026-07-10. The engine reproduces gsDesign's own numerical method
(Jennison-Turnbull grid, Newton bounds, Brent information search); the full
validation against gsDesign 3.11.0 and rpact 4.4.0 lives in the
gsdesign-reproducible archive.
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


def _node(expr, timeout=30):
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=timeout, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_two_sided_follows_gsdesign_test_type_2():
    # gsDesign test.type=2 spends sfLDOF(alpha_one_sided, t) on EACH side, so with a
    # two-sided 0.05 test the first of two equally spaced bounds is
    # b1 = Phi^-1(1 - sfLDOF(0.025, 0.5)), sfLDOF(a, t) = 2 * (1 - Phi(Phi^-1(1 - a/2) / sqrt(t))).
    from statistics import NormalDist
    N = NormalDist()
    spend1 = 2 * (1 - N.cdf(N.inv_cdf(1 - 0.0125) / math.sqrt(0.5)))
    want = N.inv_cdf(1 - spend1)
    got = _node("G.boundaries({alpha:0.05,infoFracs:[0.5,1],spend:'obf',twoSided:true})[0].z_eff")
    assert math.isclose(got, want, abs_tol=1e-9), (got, want)


def test_many_looks_finish_quickly():
    # the recursive-density solver was exponential in K (K=5 ~5 s, K=6 minutes);
    # the page allows K up to 10.
    expr = "G.boundaries({alpha:0.025,infoFracs:[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1],spend:'obf'}).map(x=>x.z_eff)"
    got = _node(expr, timeout=20)
    assert len(got) == 10 and all(2 < g < 9 for g in got)


def test_beta_spending_futility_is_computed_under_the_alternative():
    # gsDesign beta-spending: P(Z1 < a1 | theta = delta) = sf(beta, t1), i.e.
    # a1 = delta * sqrt(I1) + Phi^-1(sf(beta, t1)); under H0 (the old behaviour) a1 = Phi^-1(sf(beta, t1)).
    from statistics import NormalDist
    N = NormalDist()
    r = _node("(()=>{const b=G.boundaries({alpha:0.025,infoFracs:[1/3,2/3,1],spend:'obf',futility:'betaspend',"
              "futSpend:'obf',beta:0.1});return {a1:b[0].z_fut,I1:b[0].infoRatio};})()")
    delta = N.inv_cdf(0.975) + N.inv_cdf(0.9)
    bspend1 = 2 * (1 - N.cdf(N.inv_cdf(1 - 0.05) / math.sqrt(1 / 3)))
    assert r.get("I1") is not None, r
    assert math.isclose(r["a1"], delta * math.sqrt(r["I1"]) + N.inv_cdf(bspend1), abs_tol=1e-9), r


def test_gsdesign_default_design_type4():
    # gsDesign::gsDesign() defaults: k=3, test.type=4, alpha=.025, beta=.1, sfHSD(-4) / sfHSD(-2)
    d = _node("G.design({testType:4,k:3,alpha:0.025,beta:0.1})")
    for g, e in zip(d["upper"]["bound"], [3.010739, 2.546531, 1.999226]):
        assert math.isclose(g, e, abs_tol=1e-6), d["upper"]["bound"]
    for g, e in zip(d["lower"]["bound"], [-0.238724, 0.941067, 1.999226]):
        assert math.isclose(g, e, abs_tol=1e-6), d["lower"]["bound"]


def test_simulation_with_reestimation_keeps_type1_error():
    # inverse-normal combination keeps the type I error under sample-size re-estimation
    r = _node("""(()=>{const d=G.simDesignFrom(G.design({testType:1,k:3,alpha:0.025,beta:0.1,sfu:{family:'LDOF'}}));
      const o={alternative:[0],stDev:5,plannedSubjects:[20,40,60],conditionalPower:0.8,
        minNumberOfSubjectsPerStage:[NaN,20,20],maxNumberOfSubjectsPerStage:[NaN,80,80],maxNumberOfIterations:20000,seed:7};
      return {rej:G.simulateMeans(d,o)[0].overallReject};})()""", timeout=60)
    assert abs(r["rej"] - 0.025) < 0.006, r


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
