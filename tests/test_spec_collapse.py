"""Cross-language parity for shared/spec-collapse.js vs the Spec-Collapse Atlas
Python engine (spec-collapse-atlas/spec_collapse/aggregators.py, validated vs
metafor across 473 Cochrane reviews).

The JS aggregators must reproduce the Python ones to 1e-6 on a fixed spec set,
and must exhibit the two structural properties that motivate the method:
  - the naive IV-RE pool collapses (its variance is far below a single spec);
  - the weighted-likelihood variance is never narrower than the mean within-spec
    variance (law of total variance).
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

PRELUDE = ("require('./shared/ma-core.js'); require('./shared/trimfill.js');\n"
           "const SC = require('./shared/spec-collapse.js');\n")

# Fixed spec set (theta, var, k) used for the aggregator parity check.
SPECS = "[{theta:-0.40,var:0.03,k:8},{theta:-0.25,var:0.05,k:8},{theta:-0.55,var:0.08,k:6},{theta:-0.18,var:0.02,k:8}]"

# Reference values from the Python engine (scipy), pinned 2026-06-05:
#   naive_ivre_pool / weighted_likelihood(components="t") on SPECS.
PY_NAIVE = {"theta": -0.29532374, "ciLo": -0.47743270, "ciHi": -0.11321478}
PY_WL = {"theta": -0.34500000, "var": 0.08865833, "ciLo": -0.99563438, "ciHi": 0.17696733}

# The app's example dataset (false-robustness demo).
EXAMPLE = ("[{est:-0.25,se:0.22},{est:-0.15,se:0.20},{est:-0.40,se:0.30},{est:0.00,se:0.18},"
           "{est:-0.30,se:0.26},{est:-0.05,se:0.17},{est:-0.45,se:0.33},{est:-0.12,se:0.19}]")


def _run(script: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + script], capture_output=True, text=True,
                       timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_naive_ivre_matches_python():
    o = _run(f"const r=SC.naiveIvre({SPECS}); console.log(JSON.stringify(r));")
    for k in ("theta", "ciLo", "ciHi"):
        assert math.isclose(o[k], PY_NAIVE[k], abs_tol=1e-6), f"naive {k}: {o[k]} vs {PY_NAIVE[k]}"
    assert o["verdict"] == "robust"


def test_weighted_likelihood_matches_python():
    o = _run(f"const r=SC.weightedLikelihood({SPECS}); console.log(JSON.stringify(r));")
    for k in ("theta", "var", "ciLo", "ciHi"):
        assert math.isclose(o[k], PY_WL[k], abs_tol=1e-6), f"weighted {k}: {o[k]} vs {PY_WL[k]}"


def test_naive_pool_collapses_below_weighted():
    """The cardinal sin: IV-RE pooling many-analyst results collapses the CI."""
    o = _run("const o=SC.analyze(" + EXAMPLE + ",{}); "
             "console.log(JSON.stringify({nv:o.naive.var, wv:o.weighted.var, nspecs:o.specs.length}));")
    assert o["nspecs"] == 36
    assert o["nv"] < o["wv"] / 10, "naive pool should collapse far below the weighted-likelihood variance"


def test_weighted_never_narrower_than_mean_within():
    """Law of total variance: total var = within + between >= within (>0)."""
    o = _run(f"const r=SC.weightedLikelihood({SPECS}); console.log(JSON.stringify(r));")
    assert o["var"] >= o["within"] - 1e-12
    assert o["between"] >= -1e-12


def test_example_shows_false_robustness():
    o = _run("const o=SC.analyze(" + EXAMPLE + ",{}); "
             "console.log(JSON.stringify({n:o.naive.verdict, w:o.weighted.verdict}));")
    assert o["n"] == "robust" and o["w"] == "fragile", \
        "the shipped example must demonstrate false robustness (naive robust, corrected fragile)"


# metafor 5.2.1: trimfill(rma(y, v, method = m), estimator = "L0"). The fixed-effect slope of y on sqrt(v) is positive
# here, the slope of metafor's regression (same tau2 method) is negative, so the side must be "right".
TF_Y = "[-0.4161741518246373,0.3937363511942834,-0.05876383965147141,0.035980276871680233,-0.14766792180929716]"
TF_V = "[0.2252,0.0368,0.0154,0.0512,0.0154]"
TF_REF = {"DL": 0.45779473046336, "PM": 0.46281690560161, "REML": 0.46030020064491}


@pytest.mark.parametrize("method", ["DL", "PM", "REML"])
def test_trimfill_side_matches_metafor_regression(method):
    o = _run("const T=require('./shared/trimfill.js');"
             f"const r=T.trimAndFill({TF_Y},{TF_V},{{method:'{method}'}});console.log(JSON.stringify(r));")
    assert o["side"] == "right"
    assert o["k0"] == 1
    assert math.isclose(o["imputed"][0]["yi"], TF_REF[method], abs_tol=1e-6)


def test_trimfill_fe_side_keeps_fixed_effect_slope_when_sqrt_vi_barely_varies():
    # FE (and any method without a tau2 regression) must keep the fixed-effect slope of yi on sqrt(vi),
    # even when sqrt(vi) has almost no spread: the regression-fit rank guard must not pre-empt it
    # (independent review of the P64 port; the slope here is about -2e6, so metafor's side is "right").
    o = _run("const T=require('./shared/trimfill.js');"
             "const r=T.trimAndFill([3,2,1],[1,1.000001,1.000002],{method:'FE'});"
             "console.log(JSON.stringify({side:r.side,s:T._regSlope([3,2,1],[1,1.000001,1.000002],'FE')}));")
    assert o["side"] == "right" and o["s"] < 0
