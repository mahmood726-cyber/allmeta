"""Parity of shared/fragility.js and the page parser with fragility::frag.ma (fragility 2.0, method = "DL", defaults).

Expected values were produced by R 4.6.0 / fragility 2.0 / metafor 5.2-1 (paper-33 validation archive,
fragility-reproducible). Runs the shipped JavaScript in Node.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not available")

ENGINE = r"""
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = process.argv[1]; const ctx = { console, Math }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['shared/ma-core.js', 'shared/fragility.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(cases.map(c => { const r = ctx.AlmFragility.fragility(c.studies, { measure: c.measure });
  return { FI: r.FI, FQ: r.FQ, dir: r.dir, est: r.pooled.est, lo: r.pooled.lo, hi: r.pooled.hi,
           path: (r.modifications || []).map(m => [m.study, m.arm, m.dir]) }; })));
"""

PARSER = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(process.argv[1], 'fragility/index.html'), 'utf8');
const src = /function parse\(text\) \{[\s\S]*?\r?\n    \}\r?\n/.exec(html)[0];
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
const texts = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(texts.map(t => ctx.parse(t))));
"""


def run(script, payload):
    out = subprocess.run([NODE, "-e", script, str(ROOT)], input=json.dumps(payload), capture_output=True,
                         text=True, check=True)
    return json.loads(out.stdout)


def tables(e1, n1, e0, n0):
    return [{"e1": a, "n1": b, "e0": c, "n0": d} for a, b, c, d in zip(e1, n1, e0, n0)]


def test_single_study_is_refused():
    # frag.ma stops for k = 1 ("The fragility of a single study can be assessed using frag.study()").
    r = run(ENGINE, [{"studies": tables([2], [50], [15], [50]), "measure": m} for m in ("OR", "RR", "RD")])
    for x in r:
        assert x["FI"] is None and x["FQ"] is None and x["path"] == []


# fragility::dat.ns, ma.id = 55 (38 trials). The greedy path drives a study to zero events in both arms; frag.ma keeps
# double-zero studies (drop00 = FALSE, add 1/2), so they must not be dropped from the pooled fit.
NS55 = dict(
    e1=[3, 5, 2, 2, 1, 0, 3, 3, 1, 182, 0, 2, 7, 0, 3, 5, 3, 12, 9, 0, 30, 4, 4, 1, 1, 12, 4, 4, 0, 0, 5, 4, 3, 1, 0, 5, 1, 8],
    n1=[64, 39, 25, 30, 15, 14, 21, 34, 21, 429, 256, 19, 55, 22, 50, 16, 12, 98, 27, 57, 68, 14, 14, 11, 30, 40, 21, 25, 11,
        8, 52, 50, 215, 50, 65, 75, 60, 32],
    e0=[0, 4, 5, 4, 0, 1, 4, 2, 3, 207, 3, 2, 0, 2, 4, 4, 2, 16, 6, 1, 35, 4, 5, 5, 7, 10, 4, 1, 1, 5, 10, 1, 2, 3, 1, 13, 7, 7],
    n0=[57, 35, 23, 30, 17, 14, 20, 25, 17, 429, 264, 19, 53, 24, 50, 15, 10, 97, 29, 55, 68, 14, 13, 18, 30, 40, 22, 25, 15,
        10, 49, 25, 108, 50, 15, 71, 60, 16])


def test_double_zero_studies_are_kept_as_in_frag_ma():
    s = tables(NS55["e1"], NS55["n1"], NS55["e0"], NS55["n0"])
    r = run(ENGINE, [{"studies": s, "measure": "RD"}, {"studies": s, "measure": "OR"}])
    assert r[0]["FI"] == 2   # frag.ma(..., measure = "RD", method = "DL")$FI
    assert r[1]["FI"] == 11  # frag.ma(..., measure = "OR", method = "DL")$FI


def test_candidate_order_matches_frag_ma():
    # frag.ma scans control-arm changes of every study first, then treatment-arm changes, and stops at the first
    # change that flips significance; so the flipping (last) step of dat.ns ma.id 55 (OR) is study 2, control, -1.
    s = tables(NS55["e1"], NS55["n1"], NS55["e0"], NS55["n0"])
    r = run(ENGINE, [{"studies": s, "measure": "OR"}])[0]
    assert r["path"][-1] == [2, "control", -1]


def test_parser_rejects_empty_and_fractional_counts():
    texts = ["5,,3,10\n8, 100, 18, 100\n5, 90, 14, 95",
             ",10,3,10\n8, 100, 18, 100\n5, 90, 14, 95",
             "2.5,20,6,20\n8, 100, 18, 100\n5, 90, 14, 95",
             "8, 100, 18, 100, Trial A\n5\t90\t14\t95"]
    r = run(PARSER, texts)
    assert [len(x["studies"]) for x in r] == [2, 2, 2, 2]
    assert r[1]["errs"] == ["line 1"] and r[2]["errs"] == ["line 1"]
