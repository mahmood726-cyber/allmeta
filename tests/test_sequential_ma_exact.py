"""Exactness tests for shared/sequential-ma.js (paper 46 validation, branch f1000/p46-tsa).

Requirements tested (not the current output of the code):
- the normal CDF is accurate to 1e-12 (absolute) and its upper tail to 1e-9 relative;
- efficacy boundaries are the Lan-DeMets alpha-spending boundaries, i.e. the exact solution of the recursive
  multivariate-normal crossing probabilities (reference: mvtnorm, tests/fixtures/sequential-ma-ld-oracle.R), under the
  documented 'total' spending convention and the RTSA/ldbounds 'per-side' convention, within 1e-6 in z;
- futility boundaries are non-binding: switching futility on must not change the efficacy boundaries, and the futility
  boundaries match RTSA 0.2.2 non-binding designs within 2e-5 in z;
- a one-sided futility rule stops on a strongly negative trend (z < l), not on |z| < l.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "sequential-ma.js"
FIX = json.loads((ROOT / "tests" / "fixtures" / "sequential-ma-ld-oracle.json").read_text(encoding="utf-8"))
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _node(body: str):
    script = f"const M = require({json.dumps(str(MODULE))});\n{body}"
    r = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=120, check=False, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_pnorm_accuracy():
    z = FIX["pnorm"]["z"]
    out = _node(f"console.log(JSON.stringify({json.dumps(z)}.map(x => [M._pnorm(x), M._pnormUpper ? M._pnormUpper(x) : 1 - M._pnorm(x)])));")
    for (lo, up), rlo, rup in zip(out, FIX["pnorm"]["lower"], FIX["pnorm"]["upper"]):
        assert abs(lo - rlo) < 1e-12
        assert abs(up - rup) <= 1e-9 * rup + 1e-300


@pytest.mark.parametrize("conv", ["total", "per-side"])
@pytest.mark.parametrize("i", range(5))
def test_efficacy_boundaries_exact(conv, i):
    cf = FIX["efficacy"][i]
    looks = [{"t": t, "z": 0} for t in cf["t"]]
    opts = {"alpha": cf["alpha"], "family": cf["family"], "sided": cf["side"], "spendingConvention": conv}
    out = _node(f"console.log(JSON.stringify(M.computeBoundary({json.dumps(looks)}, {json.dumps(opts)}).looks.map(l => l.alpha_boundary)));")
    ref = cf["total" if conv == "total" else "per_side"]
    for a, r in zip(out, ref):
        assert abs(a - r) < 1e-6, (out, ref)


@pytest.mark.parametrize("i", range(3))
def test_futility_nonbinding_matches_rtsa(i):
    f = FIX["futility"][i]
    looks = [{"t": t, "z": 0} for t in f["t"]]
    on = {"alpha": f["alpha"], "beta": f["beta"], "family": f["family"], "futilityFamily": f["beta_family"], "sided": f["side"],
          "futility": True, "spendingConvention": "per-side"}
    off = dict(on, futility=False)
    out = _node(f"""const a = M.computeBoundary({json.dumps(looks)}, {json.dumps(on)});
      const b = M.computeBoundary({json.dumps(looks)}, {json.dumps(off)});
      console.log(JSON.stringify({{on: a.looks.map(l => l.alpha_boundary), off: b.looks.map(l => l.alpha_boundary),
        fut: a.looks.map(l => l.futility_boundary)}}));""")
    assert out["on"] == out["off"], "futility must be non-binding: efficacy boundaries changed"
    for a, r in zip(out["on"], f["efficacy"]):
        assert abs(a - r) < 2e-5
    for a, r in zip(out["fut"], f["futility"]):
        if r is None:
            assert a is None or a <= 0
        else:
            assert a is not None and abs(a - r) < 2e-5, (out["fut"], f["futility"])


def test_one_sided_futility_stops_on_negative_trend():
    looks = [{"t": 0.5, "z": -3.0}, {"t": 0.75, "z": -3.5}, {"t": 1.0, "z": -4.0}]
    opts = {"alpha": 0.025, "beta": 0.1, "family": "OBF", "sided": 1, "futility": True}
    out = _node(f"console.log(JSON.stringify(M.computeBoundary({json.dumps(looks)}, {json.dumps(opts)}).looks.map(l => l.decision)));")
    assert out[0] == "futility", out
