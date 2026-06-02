"""AlmWebR.concordance — pure dual-engine (JS vs metafor) comparison.

Tests only the pure comparison logic (no WebR boot). Skipped if Node absent.
"""
from __future__ import annotations
import json, shutil, subprocess
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "webr-runner.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _node(script: str) -> dict:
    r = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_concordance_within_tol():
    out = _node(f"""
        const W = require({json.dumps(str(MODULE))});
        const js = {{ mu: 0.405372, se: 0.125830, tau2: 0.071297, I2: 59.10 }};
        const r  = {{ mu: 0.405372, se: 0.125830, tau2: 0.071297, I2: 59.10 }};
        console.log(JSON.stringify(W.concordance(js, r, {{ tol: 1e-4 }})));
    """)
    assert out["engine"] == "metafor"
    assert out["withinTol"] is True
    assert out["maxAbsDelta"] <= 1e-4
    assert "mu" in out["fields"] and out["fields"]["mu"]["absDelta"] == 0


def test_concordance_flags_divergence():
    out = _node(f"""
        const W = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(W.concordance({{ mu: 0.40, se: 0.12 }}, {{ mu: 0.50, se: 0.12 }}, {{ tol: 1e-4 }})));
    """)
    assert out["withinTol"] is False
    assert abs(out["maxAbsDelta"] - 0.10) < 1e-9
