"""Pytest harness for `shared/ma-pooled-v1.js` (the pooled-result bus).

Runs the JS module under Node and asserts the contract: a single pooled effect
{pointEstimate, ciLo, ciHi, scale, measure?, k, nTotal?, model?, label?}. Storage
round-trips are covered by Playwright (Node has no localStorage); here we cover
validation + the fromEstSE back-transform helper. Mirrors test_ma_comparisons_v1.py.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "ma-pooled-v1.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> dict:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def _validate(result_literal: str) -> dict:
    return _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope({result_literal});
        console.log(JSON.stringify(M.validate(env)));
    """)


# --- Validation ---------------------------------------------------------------

def test_accepts_good_ratio_result():
    out = _validate('{ pointEstimate: 0.85, ciLo: 0.68, ciHi: 1.06, scale: "ratio", measure: "RR", k: 4, nTotal: 12400, model: "random", label: "All-cause mortality" }')
    assert out == {"ok": True, "errors": []}


def test_accepts_good_linear_result():
    out = _validate('{ pointEstimate: -2.5, ciLo: -4.0, ciHi: -1.0, scale: "linear", measure: "MD", k: 6 }')
    assert out == {"ok": True, "errors": []}


def test_rejects_wrong_schema():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{ _schema: "wrong", _savedAt: "x", result: {{ pointEstimate: 1, ciLo: 0.5, ciHi: 2, scale: "ratio", k: 3 }} }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("_schema" in e for e in out["errors"])


def test_rejects_ci_lo_above_hi():
    out = _validate('{ pointEstimate: 0.85, ciLo: 1.06, ciHi: 0.68, scale: "ratio", k: 4 }')
    assert out["ok"] is False
    assert any("ciLo" in e for e in out["errors"])


def test_rejects_point_outside_ci():
    out = _validate('{ pointEstimate: 2.0, ciLo: 0.68, ciHi: 1.06, scale: "ratio", k: 4 }')
    assert out["ok"] is False
    assert any("within" in e for e in out["errors"])


def test_rejects_ratio_nonpositive():
    out = _validate('{ pointEstimate: -0.2, ciLo: -0.5, ciHi: 0.1, scale: "ratio", k: 4 }')
    assert out["ok"] is False
    assert any("> 0 on a ratio scale" in e for e in out["errors"])


def test_rejects_bad_k():
    out = _validate('{ pointEstimate: 0.85, ciLo: 0.68, ciHi: 1.06, scale: "ratio", k: 0 }')
    assert out["ok"] is False
    assert any("result.k" in e for e in out["errors"])


def test_rejects_bad_scale():
    # Validate a RAW envelope (buildEnvelope would normalize the scale away). This
    # is the read() path: a malformed stored payload must be rejected, not coerced.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{ _schema: "ma-pooled-v1", _savedAt: "x", result: {{ pointEstimate: 0.85, ciLo: 0.68, ciHi: 1.06, scale: "logit", k: 4 }} }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("scale" in e for e in out["errors"])


# --- fromEstSE back-transform helper -----------------------------------------

def test_from_est_se_ratio_backtransforms():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fromEstSE(Math.log(0.85), 0.1, {{ scale: "ratio", measure: "RR", k: 4 }});
        console.log(JSON.stringify(r));
    """)
    assert out["scale"] == "ratio"
    assert math.isclose(out["pointEstimate"], 0.85, rel_tol=1e-9)
    # CI = exp(log(0.85) +/- 1.96*0.1)
    assert math.isclose(out["ciLo"], math.exp(math.log(0.85) - 1.959963984540054 * 0.1), rel_tol=1e-9)
    assert math.isclose(out["ciHi"], math.exp(math.log(0.85) + 1.959963984540054 * 0.1), rel_tol=1e-9)
    assert out["ciLo"] < out["pointEstimate"] < out["ciHi"]
    # the helper output must itself validate
    valid = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fromEstSE(Math.log(0.85), 0.1, {{ scale: "ratio", measure: "RR", k: 4 }});
        console.log(JSON.stringify(M.validate(M.buildEnvelope(r))));
    """)
    assert valid["ok"] is True


def test_from_est_se_linear_passthrough():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fromEstSE(-2.5, 0.5, {{ scale: "linear", measure: "MD", k: 6 }});
        console.log(JSON.stringify(r));
    """)
    assert math.isclose(out["pointEstimate"], -2.5, rel_tol=1e-12)
    assert math.isclose(out["ciLo"], -2.5 - 1.959963984540054 * 0.5, rel_tol=1e-12)
    assert math.isclose(out["ciHi"], -2.5 + 1.959963984540054 * 0.5, rel_tol=1e-12)
