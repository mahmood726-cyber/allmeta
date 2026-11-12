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


PAGE = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const page = process.argv[1], html = fs.readFileSync(page, 'utf8'), state = JSON.parse(process.argv[2]);
const els = {};
const el = (id) => els[id] || (els[id] = { id, value: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} },
  addEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {}, querySelector() { return null; } });
const doc = { readyState: 'complete', getElementById: el, querySelector: () => el('_q'), querySelectorAll: () => [],
  addEventListener() {}, createElement: () => el('_c'), body: el('_b') };
const ctx = { document: doc, console, Math, JSON, setTimeout() {},
  localStorage: { getItem() { return JSON.stringify(state); }, setItem() {} } };
ctx.window = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src = (m[1].match(/src="([^"]+)"/) || [])[1];
  if (src) { if (src.endsWith('sequential-ma.js')) vm.runInContext(fs.readFileSync(path.resolve(path.dirname(page), src), 'utf8'), ctx); }
  else if (m[2].includes('__almTsaCompute')) vm.runInContext(m[2], ctx);
}
const cards = {};
for (const c of els['stats-wrap'].innerHTML.matchAll(/<span class="k">([^<]*)<\/span><span class="v">([^<]*)<\/span>/g)) cards[c[1]] = c[2];
const M = ctx.AlmSequentialMA;
console.log(JSON.stringify({ cards, M_ok: !!M }));
"""


def test_boundary_card_after_information_exceeds_ris():
    # RIS = (1.96 + 0.8416)^2 / 0.5^2 = 31.4 information units; looks at information 16, 36, 64 (t = .51, 1.15, 2.04).
    data = "A, -0.5, 0.25\nB, -0.5, 0.22360679774997896\nC, -0.5, 0.1889822365046136"
    state = {"data": data, "risMode": "auto", "delta": "0.5", "alpha": "0.05", "power": "0.8", "risManual": "200",
             "diversity": "1", "title": ""}
    r = subprocess.run([NODE, "-e", PAGE, str(APP / "index.html"), json.dumps(state)], capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert r.returncode == 0, r.stderr
    cards = json.loads(r.stdout.strip().splitlines()[-1])["cards"]
    # alpha is exhausted at look 2 (t >= 1); look 3 must show the look-2 (final) boundary, not '--' or Infinity
    b = cards["OF boundary (now)"]
    assert "--" not in b and "Infinity" not in b, cards
    assert float(re.search(r"[0-9]+\.[0-9]+", b).group()) < 2.2, cards


def _cards(data, delta="0.5"):
    state = {"data": data, "risMode": "auto", "delta": delta, "alpha": "0.05", "power": "0.8", "risManual": "200",
             "diversity": "1", "title": ""}
    r = subprocess.run([NODE, "-e", PAGE, str(APP / "index.html"), json.dumps(state)], capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])["cards"]


def _nums(s):
    return [float(x) for x in re.findall(r"-?[0-9]+\.[0-9]+", s)]


@pytest.mark.parametrize("data", [
    "A, -0.5, 0.5\nB, -0.4, 0.45",                                                      # t < 1 at the last look
    "A, -0.5, 0.25\nB, -0.5, 0.22360679774997896\nC, -0.5, 0.1889822365046136",          # last look after the RIS
])
def test_tsa_adjusted_ci_card(data):
    # TSA-adjusted CI (TSA program; RTSA inference(): estimate +/- alpha boundary at the look x SE): the pooled
    # estimate +/- the current monitoring boundary (the final boundary once t >= 1) times its SE.
    cards = _cards(data)
    assert "TSA-adjusted CI" in cards, sorted(cards)
    mu, lo, hi = _nums(cards["Pooled μ"])
    alo, ahi = _nums(cards["TSA-adjusted CI"])
    b = _nums(cards["OF boundary (now)"])[0]
    se = (hi - lo) / (2 * 1.959963984540054)
    assert abs((alo + ahi) / 2 - mu) <= 1.5e-3, (mu, alo, ahi)
    assert abs((ahi - alo) / 2 - b * se) <= 6e-3, (b, se, alo, ahi)   # inputs printed to 2-3 decimals
    assert ahi - alo > hi - lo                                        # wider than the naive 95% CI
