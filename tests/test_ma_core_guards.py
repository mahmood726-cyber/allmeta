"""Fail-closed input guards for shared/ma-core.js (hardening lane 2026-07-09).

The pooling core previously did NO input validation: a zero/negative/non-finite
sampling variance, a non-finite effect, or a yi/vi length mismatch would flow
straight into 1/(vi+τ²) and silently produce either NaN or — for a NEGATIVE
variance — a *finite, clean-looking-but-wrong* pooled estimate (a negative
weight). That is a fail-open hazard: a garbage number that passes for a real
pooled result.

These tests pin the fail-CLOSED behaviour added in this lane:
  - pool() returns { ok:false, error, mu:NaN, ... } (same shape) on bad input;
  - the standalone τ² estimators return NaN on bad values;
  - the VALID path is byte-identical (guarded by the metafor parity suite too);
  - the k<2 / empty / single-study behaviour is preserved.

Each assertion here FAILED before the guard (finite garbage / NaN slipping
through) and PASSES after. Skipped if Node is not installed.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "ma-core.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run(expr: str) -> dict:
    script = f"const C = require({json.dumps(str(MODULE))});\nconsole.log(JSON.stringify({expr}));"
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT))
    assert res.returncode == 0, f"node exited {res.returncode}\n{res.stderr}"
    return json.loads(res.stdout.strip().splitlines()[-1])


# ---- valid path stays exactly as documented (regression anchor) -------------

def test_valid_pool_unchanged():
    o = _run(
        "(function(){var yi=[.10,.30,.50,.20,.90,.40,1.10,.05],"
        "vi=[.20,.25,.18,.30,.22,.28,.35,.15].map(function(s){return s*s;});"
        "var r=C.pool(yi,vi,{method:'DL'});"
        "return {tau2:r.tau2,mu:r.mu,se:r.se,I2:r.I2,hasOk:('ok' in r)};})()"
    )
    # header-documented DL values on this dataset
    assert abs(o["tau2"] - 0.0734430866) < 1e-9
    assert abs(o["mu"] - 0.4059483675) < 1e-9
    assert abs(o["se"] - 0.1269421050) < 1e-9
    assert abs(o["I2"] - 59.811091) < 1e-5
    assert o["hasOk"] is False           # valid path is untouched — no ok flag added


# ---- pool() fails closed on structurally-invalid input ----------------------

def test_pool_negative_variance_fails_closed():
    # THE priority hazard: a negative variance previously produced a finite,
    # clean-looking-but-wrong estimate. Must now be flagged, not returned.
    o = _run("(function(){var r=C.pool([0.1,0.2],[0.02,-0.03]);"
             "return {ok:r.ok,muFinite:isFinite(r.mu)};})()")
    assert o["ok"] is False
    assert o["muFinite"] is False        # no finite garbage escapes


@pytest.mark.parametrize("vi", ["[0.02,0]", "[0.02,'x']", "[0.02,null]"])
def test_pool_bad_variance_fails_closed(vi):
    o = _run(f"(function(){{var r=C.pool([0.1,0.2],{vi});return {{ok:r.ok}};}})()")
    assert o["ok"] is False


def test_pool_nonfinite_effect_fails_closed():
    o = _run("(function(){var r=C.pool([0.1,NaN],[0.02,0.03]);return {ok:r.ok};})()")
    assert o["ok"] is False


def test_pool_infinite_variance_fails_closed():
    o = _run("(function(){var r=C.pool([0.1,0.2],[0.02,1/0]);return {ok:r.ok};})()")
    assert o["ok"] is False


def test_pool_length_mismatch_fails_closed():
    o = _run("(function(){var r=C.pool([0.1,0.2,0.3],[0.02,0.03]);"
             "return {ok:r.ok,muFinite:isFinite(r.mu)};})()")
    assert o["ok"] is False
    assert o["muFinite"] is False


def test_pool_non_array_fails_closed():
    o = _run("(function(){var r=C.pool(null,null);return {ok:r.ok};})()")
    assert o["ok"] is False


def test_pool_flag_shape_is_same_shape():
    # Same-shape return so existing callers reading .mu/.se still get a safe
    # (non-finite) value rather than a thrown exception or a missing field.
    o = _run("(function(){var r=C.pool([0.1,0.2],[0.02,-0.03]);"
             "return {keys:['k','tau2','mu','se','ciLo','ciHi','Q','I2','method'].every(function(k){return k in r;}),"
             "err:(typeof r.error==='string' && r.error.length>0)};})()")
    assert o["keys"] is True
    assert o["err"] is True


# ---- standalone τ² estimators fail closed on bad values ---------------------

@pytest.mark.parametrize("fn", ["tau2DL", "tau2PM", "tau2REML", "tau2ML", "tau2HE", "tau2HS", "tau2SJ"])
def test_tau2_estimators_negative_variance_nan(fn):
    o = _run(f"(function(){{var t=C.{fn}([0.1,0.2,0.3],[0.02,0.03,-0.01]);"
             "return {isNaN:Number.isNaN(t)};})()")
    assert o["isNaN"] is True            # was finite garbage before the guard


@pytest.mark.parametrize("fn", ["tau2DL", "tau2PM", "tau2REML", "tau2ML", "tau2HE", "tau2HS", "tau2SJ"])
def test_tau2_estimators_length_mismatch_nan(fn):
    o = _run(f"(function(){{var t=C.{fn}([0.1,0.2,0.3],[0.02,0.03]);"
             "return {isNaN:Number.isNaN(t)};})()")
    assert o["isNaN"] is True


# ---- degenerate-but-VALID paths are preserved (no over-guarding) ------------

def test_single_study_pool_preserved():
    o = _run("(function(){var r=C.pool([0.5],[0.04]);"
             "return {mu:r.mu,se:r.se,hasOk:('ok' in r)};})()")
    assert abs(o["mu"] - 0.5) < 1e-12
    assert abs(o["se"] - 0.2) < 1e-12     # sqrt(0.04)
    assert o["hasOk"] is False            # k=1 is valid, not flagged


def test_empty_and_single_tau2_preserved():
    o = _run("(function(){return {dlEmpty:C.tau2DL([],[]),pmSingle:C.tau2PM([0.5],[0.04]),"
             "remlSingle:C.tau2REML([0.5],[0.04])};})()")
    assert o["dlEmpty"] == 0              # k<2 → 0 (unchanged; empty is not 'bad')
    assert o["pmSingle"] == 0
    assert o["remlSingle"] == 0
