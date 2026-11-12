"""Degenerate inputs must give null, not rounding-noise numbers (p52 validation lane).

Zero variance of the surrogate effects makes the regression undefined; constant final effects make R^2 0/0.
In both cases the engine must return null rather than a value computed from floating-point residue.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _js(pairs):
    arr = [{"label": f"T{i}", "s": s, "f": f, "seF": e} for i, (s, f, e) in enumerate(pairs)]
    prog = ("const S=require('./shared/surrogate-v1.js');"
            f"const r=S.analyze({{pairs:{json.dumps(arr)}}});"
            "console.log(JSON.stringify(r));")
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    assert out.returncode == 0, out.stdout + out.stderr
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_zero_variance_surrogate_is_refused():
    r = _js([(-0.2, -0.31, 0.08), (-0.2, -0.12, 0.10), (-0.2, -0.25, 0.12), (-0.2, -0.02, 0.09), (-0.2, -0.40, 0.11)])
    assert r["ok"] is True
    for key in ("slope", "intercept", "r2_naive", "pearson", "ste", "r2_adj", "loo_min", "loo_max"):
        assert r[key] is None, f"{key} = {r[key]}"
    assert all(x["r2"] is None for x in r["loo"])
    assert r["adj_degenerate"] is True


def test_constant_final_effects_give_null_r2():
    r = _js([(-0.5, -0.2, 0.08), (-0.3, -0.2, 0.10), (-0.1, -0.2, 0.12), (-0.2, -0.2, 0.09), (-0.6, -0.2, 0.11)])
    assert r["ok"] is True
    assert r["r2_naive"] is None and r["pearson"] is None
    assert all(x["r2"] is None for x in r["loo"])
    assert r["adj_degenerate"] is True and r["r2_adj"] is None
