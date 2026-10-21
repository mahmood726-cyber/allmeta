"""Tests for shared/reverse-bayes.js — Reverse-Bayes Analysis of Credibility.

Locks the closed-form Matthews (2018) sceptical prior and the Held (2019)
intrinsic-credibility limit (|z| = sqrt(2)*z_a, two-sided p ~ 0.0056), plus the
significance guards. Numerical baseline for the frontier module (v13).
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

PRELUDE = "const RB = require('./shared/reverse-bayes.js');\n"
ZA = 1.959963984540054


def _run(expr: str):
    r = subprocess.run(
        [NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
        capture_output=True, text=True, timeout=20, cwd=str(ROOT),
    )
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_normal_helpers():
    assert math.isclose(_run(f"RB._Phi({ZA})"), 0.975, abs_tol=1e-6)
    assert math.isclose(_run(f"RB._twoSidedP({ZA})"), 0.05, abs_tol=1e-6)
    assert math.isclose(_run("RB._qnorm(0.975)"), ZA, abs_tol=1e-6)


def test_sceptical_prior_closed_form():
    a = _run("RB.analyze(0.8, 0.2, {alpha:0.05})")  # z = 4, significant
    assert a["significant"] is True
    s, th = 0.2, 0.8
    tau2 = (ZA * ZA * s ** 4) / (th * th - ZA * ZA * s * s)
    assert math.isclose(a["sceptical"]["priorVar"], tau2, rel_tol=1e-9)
    assert math.isclose(a["sceptical"]["priorInterval95"][1], ZA * math.sqrt(tau2), rel_tol=1e-9)


def test_intrinsic_credibility_limit():
    zI = math.sqrt(2) * ZA
    a = _run(f"RB.analyze({zI}, 1.0, {{alpha:0.05}})")
    # at |z| = zI the sceptical p-value equals alpha exactly
    assert math.isclose(a["intrinsic"]["scepticalP"], 0.05, abs_tol=1e-6)
    assert math.isclose(a["intrinsic"]["zLimit"], zI, rel_tol=1e-9)
    assert a["intrinsic"]["credible"] is True
    # Held (2019): two-sided intrinsic-credibility threshold ~ 0.0056
    assert math.isclose(a["intrinsic"]["pLimit"], 0.005575, abs_tol=5e-5)


def test_predictive_z_identity():
    a = _run("RB.analyze(0.8, 0.2)")  # z = 4
    assert math.isclose(a["intrinsic"]["predictiveZ"], math.sqrt(16 - ZA * ZA), rel_tol=1e-9)


def test_significance_guards():
    assert _run("RB.analyze(1.0, 1.0)")["sceptical"]["exists"] is False
    assert _run("RB.analyze(1.96, 1.0)")["sceptical"]["exists"] is True
    # near the boundary the critical sceptical prior is diffuse (SD >> effect)
    assert _run("RB.analyze(1.9601, 1.0)")["sceptical"]["priorSDoverEffect"] > 10


def test_statement_diffuse_prior_not_called_smaller_than_effect():
    # Near the significance boundary the critical prior SD is many times the effect (here ~11x);
    # the statement must say so, never that the SD is much smaller ("<<") than the effect.
    a = _run("RB.analyze(1.9601, 1.0)")
    ratio = a["sceptical"]["priorSDoverEffect"]
    assert ratio > 10
    assert "≪" not in a["statement"]
    assert f"{ratio:.3g} times the effect" in a["statement"]
    # below 10x the percentage wording is kept
    b = _run("RB.analyze(0.8, 0.2)")
    assert f"{round(b['sceptical']['priorSDoverEffect'] * 100)}% of the effect" in b["statement"]


PAGE_DOM = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('reverse-bayes/index.html', 'utf8');
const els = {};
for (const m of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  const a = m[2], v = (a.match(/\bvalue="([^"]*)"/) || [])[1] || '';
  els[m[3]] = { value: m[1] === 'select' ? 'ratio' : v, hidden: /\shidden/.test(a), className: '', textContent: '',
    innerHTML: '', _l: [], addEventListener(t, f) { this._l.push(f); } };
}
const ctx = { document: { getElementById: id => els[id] }, Math, JSON, isFinite, parseFloat };
ctx.window = ctx; vm.createContext(ctx);
for (const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src = (s[1].match(/src="([^"]+)"/) || [])[1];
  vm.runInContext(src ? fs.readFileSync(require('path').join('reverse-bayes', src), 'utf8') : s[2], ctx);
}
const run = (v) => { Object.assign(els.scale, { value: v[0] }); els.est.value = v[1]; els.lo.value = v[2];
  els.hi.value = v[3]; els.alpha.value = v[4]; els.run._l.forEach(f => f()); };
"""


@pytest.mark.parametrize("bad", [
    ["ratio", "1.6", "-1", "2.23", "0.05"],   # non-positive ratio limit
    ["diff", "1.6", "2", "1", "0.05"],        # lo > hi
    ["diff", "1.6", "1", "2", "0.5"],         # alpha out of range
])
def test_refusal_clears_previous_result(bad):
    js = PAGE_DOM + (
        "run(['ratio','1.60','1.15','2.23','0.05']);"
        "const before = els.statement.textContent;"
        f"run({json.dumps(bad)});"
        "console.log(JSON.stringify({before, after: els.statement.textContent, tbl: els.tbl.hidden, "
        "note: els.note.hidden, verdict: els.verdict.className}));")
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout.strip().splitlines()[-1])
    assert o["before"].startswith("To overturn this result")
    assert o["verdict"] == "verdict warn"
    assert o["tbl"] is True and o["note"] is True
    assert o["after"] == ""  # no stale statement from the previous analysis


def test_sceptical_p_monotone_decreasing():
    ps = [_run(f"RB.analyze({z}, 1.0).intrinsic.scepticalP") for z in (2.0, 2.5, 3.0, 4.0)]
    assert all(ps[i] < ps[i - 1] for i in range(1, len(ps)))
