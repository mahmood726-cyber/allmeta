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
