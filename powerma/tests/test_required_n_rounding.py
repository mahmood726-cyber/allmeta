"""A required sample size must never be rounded DOWN (paper 46 validation, branch f1000/p46-tsa).

Reference: RTSA 0.2.2 ris(outcome = "MD", mc = 0.5, sd_mc = 1, alpha = 0.05, beta = 0.1, side = 2): NF = 169;
with D2 = 0.3, NR_D2 = ceiling(169 / (1 - 0.3)) = 242; with I2 = 0.2, NR_I2 = ceiling(169 / 0.8) = 212.
The page previously printed toFixed(0) of 241.43 (= 241) for the D2-adjusted RIS.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

RUN = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[1], 'utf8'), vals = JSON.parse(process.argv[2]);
const els = {}, L = {};
const el = (id) => els[id] || (els[id] = { id, value: vals[id] === undefined ? '' : String(vals[id]), innerHTML: '', style: {},
  addEventListener(t, f) { L[id + t] = f; }, insertAdjacentHTML() {} });
const ctx = { document: { getElementById: el, querySelector: () => null, readyState: 'complete', addEventListener() {} },
  console, Math, JSON, Number, setTimeout() {} };
ctx.window = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) if (m[1].includes('__almPowerMA')) vm.runInContext(m[1], ctx);
console.log(JSON.stringify({ body: els['tbl-body'].innerHTML, last: ctx.__almLastPowerMA() }));
"""


def test_adjusted_sizes_are_rounded_up():
    vals = {"outcome": "continuous", "alpha": 0.05, "power": 0.9, "ratio": 1, "i2": 20, "d2": 30, "md": 0.5, "sd-c": 1,
            "p0": 0.15, "rrr": 0.2}
    r = subprocess.run([NODE, "-e", RUN, str(APP / "index.html"), json.dumps(vals)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    rows = [re.findall(r"<td>(.*?)</td>", tr) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", out["body"])]
    totals = [row[2] for row in rows]
    assert totals == ["169", "212", "242"], totals
    assert out["last"]["ris_total_n"] == 242
