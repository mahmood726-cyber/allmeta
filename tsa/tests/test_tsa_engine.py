"""Engine tests for tsa/index.html (paper 46 validation, branch f1000/p46-tsa).

Requirements: the monitoring boundary is the Lan-DeMets O'Brien-Fleming-type alpha-spending boundary (exact
group-sequential solution; reference values from mvtnorm in tests/fixtures/sequential-ma-ld-oracle.json), not the
continuous approximation z_{alpha/2}/sqrt(t); z-quantiles equal R's qnorm to 1e-12.
The page's scripts are executed in Node with a minimal stub document, in the order the page loads them.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
FIX = json.loads((ROOT / "tests" / "fixtures" / "sequential-ma-ld-oracle.json").read_text(encoding="utf-8"))
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

LOADER = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const page = process.argv[1], html = fs.readFileSync(page, 'utf8');
const el = () => ({ value: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} }, addEventListener() {},
  appendChild() {}, removeChild() {}, setAttribute() {}, querySelector() { return null; } });
const doc = { readyState: 'complete', getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
  addEventListener() {}, createElement: () => el(), body: el() };
const ctx = { document: doc, console, Math, JSON, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout() {} };
ctx.window = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src = (m[1].match(/src="([^"]+)"/) || [])[1];
  if (src) { if (src.endsWith('sequential-ma.js')) vm.runInContext(fs.readFileSync(path.resolve(path.dirname(page), src), 'utf8'), ctx); }
  else if (m[2].includes('__almTsaCompute')) vm.runInContext(m[2], ctx);
}
const o = JSON.parse(process.argv[2]);
console.log(JSON.stringify(ctx.__almTsaCompute(o)));
"""


def _compute(o):
    r = subprocess.run([NODE, "-e", LOADER, str(APP / "index.html"), json.dumps(o)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("conv,key", [("total", "total"), ("per-side", "per_side")])
def test_obrien_fleming_spending_boundary_is_exact(conv, key):
    cf = FIX["efficacy"][0]                     # t = .2..1, two-sided alpha .05, O'Brien-Fleming
    out = _compute({"alpha": cf["alpha"], "power": 0.8, "delta": 1, "D": 1, "studies": [], "tGrid": cf["t"],
                    "spendingConvention": conv})
    for a, r in zip(out["ob"], cf[key]):
        assert abs(a - r) < 1e-6, (out["ob"], cf[key])


def test_quantiles_match_r_qnorm():
    out = _compute({"alpha": 0.05, "power": 0.9, "delta": 0.2, "D": 1, "studies": [], "tGrid": []})
    assert abs(out["za"] - 1.959963984540054) < 1e-12
    assert abs(out["zb"] - 1.2815515655446004) < 1e-12
