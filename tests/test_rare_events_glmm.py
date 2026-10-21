"""Tests for shared/rare-events-glmm.js against metafor::rma.glmm (measure="OR", method="ML").

Reference values: R 4.6.0, metafor 5.2-1, lme4 2.0-6, BiasedUrn 2.0.12 (paper-30 validation archive,
rare-events-glmm-reproducible). Objective values are R's own deviance functions at fixed parameters
(lme4 `glmer(..., devFunOnly = TRUE)` for UM.FS/UM.RS/CM.AL, metafor's `.dnchg` for CM.EL), so they are
deterministic; estimates are rma.glmm fits with tightened convergence controls.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = Path(os.environ.get("ALM_RARE_GLMM_MODULE", ROOT / "shared" / "rare-events-glmm.js"))

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

BUILTIN = [(0, 250, 1, 248), (2, 500, 5, 510), (0, 180, 3, 182), (1, 320, 4, 325),
           (3, 600, 7, 605), (0, 95, 2, 98), (2, 450, 6, 445), (1, 210, 3, 215)]


def _rows(data):
    return [{"events_T": a, "n_T": n1, "events_C": c, "n_C": n2} for a, n1, c, n2 in data]


def _run_node(body: str) -> object:
    script = f"const M = require({json.dumps(str(MODULE))});\n{body}"
    result = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=120, check=False, cwd=str(ROOT))
    if result.returncode != 0:
        raise AssertionError(f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    return json.loads(lines[-1])


def _fit(model, data):
    return _run_node(f"console.log(JSON.stringify(M.fitModel({json.dumps(model)}, {json.dumps(_rows(data))})));")


def _rel(a, b):
    return abs(a - b) / max(1.0, abs(b))


# lme4 deviance (UM.FS, CM.AL: 7-point adaptive GH; UM.RS: Laplace, -2 log-likelihood form) and metafor .dnchg
# at R-chosen parameter vectors for the built-in example.
OBJECTIVE_CASES = [
    ("UM.FS", [0.05000000193751173, -1.2360147563822637, -5.767683406758392, -4.53010390060092, -4.347157349935944,
               -4.415865070601412, -4.345002222916959, -4.126455782649545, -4.264512065154614, -4.22187886876902],
     3.5804056191190377),
    ("UM.FS", [1.5500093823655577e-9, -1.0360147563822637, -5.767683406758392, -4.53010390060092, -4.347157349935944,
               -4.415865070601412, -4.345002222916959, -4.126455782649545, -4.264512065154614, -4.22187886876902],
     3.943098692914478),
    ("UM.RS", [1.0068495941383516e-9, 0, -1.2363774939828833, -4.4281250063377415], 44.0805138116106),
    ("CM.AL", [0, -1.2270275014969136], 3.5474513253372395),
    ("CM.EL", [-1.234403387889091, -8.52003581056052], 7.145255843672409),
]


@pytest.mark.parametrize("model,params,expected", OBJECTIVE_CASES)
def test_objective_equals_R_deviance_function(model, params, expected):
    out = _run_node(f"console.log(JSON.stringify(M.objective({json.dumps(model)}, {json.dumps(_rows(BUILTIN))}, {json.dumps(params)})));")
    assert _rel(out, expected) < 1e-10, (out, expected)


@pytest.mark.parametrize("model,theta,se", [
    ("UM.FS", -1.2360147563822637, 0.3797337238748206),
    ("UM.RS", -1.2363774939828833, 0.37965700741398506),
    ("CM.AL", -1.2270275014969136, 0.3786465139014035),
])
def test_builtin_example_matches_metafor(model, theta, se):
    r = _fit(model, BUILTIN)
    assert r["ok"] is True and r["model"] == model
    assert _rel(r["theta"], theta) < 1e-6, r
    assert _rel(r["se_theta"], se) < 1e-5, r
    assert r["tau2"] < 1e-8 and r["k"] == 8


def test_cmel_fixed_effect_rule_matches_metafor():
    # 20-study probe (one double-zero study): metafor CM.EL gives tau2 = 1.5e-5 < 1e-4 and so reports the fixed-effect
    # conditional MLE and its SE (beta = -1.0349022753427366, se = 0.25227713445120264, k = 19).
    data = [(0, 50, 2, 52), (1, 60, 3, 58), (0, 45, 1, 47), (2, 80, 5, 82), (1, 70, 1, 69), (0, 55, 3, 54),
            (3, 100, 6, 98), (0, 40, 2, 41), (1, 65, 4, 66), (2, 90, 2, 88), (0, 30, 1, 31), (1, 75, 5, 73),
            (0, 50, 0, 49), (4, 120, 7, 118), (1, 60, 2, 61), (0, 35, 2, 36), (2, 85, 6, 84), (1, 55, 1, 57),
            (0, 45, 3, 44), (3, 95, 4, 97)]
    r = _fit("CM.EL", data)
    assert r["ok"] is True and r["k"] == 19 and r["k_dropped00"] == 1
    assert _rel(r["theta"], -1.0349022753427366) < 1e-6, r
    assert _rel(r["se_theta"], 0.25227713445120264) < 1e-5, r
    assert r["tau2"] < 1e-4


def test_double_zero_studies_are_dropped_like_metafor():
    r = _fit("UM.FS", [(1, 100, 3, 100), (0, 120, 0, 118), (2, 200, 5, 210), (0, 90, 2, 95), (4, 300, 6, 310), (1, 150, 4, 140)])
    assert r["k"] == 5 and r["k_dropped00"] == 1


@pytest.mark.parametrize("model", ["UM.FS", "UM.RS", "CM.EL", "CM.AL"])
def test_complete_separation_is_refused(model):
    # every treatment arm has zero events: the ML log odds ratio is -infinity
    r = _fit(model, [(0, 200, 5, 200), (0, 150, 3, 148), (0, 300, 8, 305), (0, 120, 2, 118)])
    assert r["ok"] is False and "separation" in r["error"]


@pytest.mark.parametrize("model", ["UM.FS", "UM.RS", "CM.EL", "CM.AL"])
def test_fewer_than_two_informative_studies_is_refused(model):
    r = _fit(model, [(0, 80, 0, 80), (2, 150, 6, 150), (0, 60, 0, 61)])
    assert r["ok"] is False and r["k"] == 1


def test_invalid_rows_are_ignored():
    r = _fit("UM.FS", [(-1, 100, 5, 100), (200, 100, 5, 100)])
    assert r["ok"] is False and r["k"] == 0
