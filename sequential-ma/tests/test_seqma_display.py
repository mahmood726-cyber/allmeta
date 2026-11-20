"""sequential-ma display requirements (LIM-P46 F11, F25), checked in headless Chrome on this worktree.

F11: when the current input gives no result (empty input, or a design the engine refuses) the page must not keep
     showing -- or offer for export -- the table and plot of the previous input.
F25: a look after all alpha is spent has an infinite efficacy boundary (no more alpha). The plot must still draw
     (no NaN coordinates) and keep every look inside the drawing area.
Needs node + playwright-core (ALLMETA_PLAYWRIGHT_CORE) and Chrome (ALLMETA_CHROME); skipped, with the reason, otherwise.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from test_seqma_r_user_path import CHROME, NODE, _playwright_dir, server  # noqa: F401  (fixture)

JS = r"""
const { chromium } = require(process.argv[1]);
const [base, chrome, stepsJson] = process.argv.slice(2), steps = JSON.parse(stepsJson);
(async () => {
  const b = await chromium.launch({ executablePath: chrome, headless: true, args: ['--headless=new'] });
  const p = await (await b.newContext()).newPage(); const out = [];
  await p.goto(base + 'sequential-ma/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  for (const s of steps) {
    if (s.src !== undefined) await p.fill('#src', s.src);
    if (s.futility !== undefined) await p.selectOption('#f-futility', s.futility);
    await p.click('#btn-run'); await p.waitForTimeout(300);
    out.push(await p.evaluate(() => ({
      rows: document.querySelectorAll('#looks tbody tr').length,
      overall: document.getElementById('overall').textContent,
      svg: document.getElementById('plot-host').innerHTML,
      last: typeof window.__almLastSequentialMA === 'function' ? !!window.__almLastSequentialMA() : false })));
  }
  console.log(JSON.stringify(out)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
"""


def _drive(server, steps):
    pw = _playwright_dir()
    if not pw or NODE is None or not Path(CHROME).exists():
        pytest.skip("node + playwright-core + Chrome needed")
    r = subprocess.run([NODE, "-e", JS, pw, server, CHROME, json.dumps(steps)], capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_no_result_clears_the_previous_table_plot_and_export(server):
    first, empty, refused = _drive(server, [{}, {"src": ""},
                                            {"src": "0.5, 1\n1.2, 2", "futility": "1"}])
    assert first["rows"] == 4 and first["last"]
    for st in (empty, refused):
        assert st["rows"] == 0, st
        assert "<polyline" not in st["svg"], st["overall"]
        assert not st["last"], "the previous result is still exported"
    assert refused["overall"].startswith("Cannot compute boundaries"), refused["overall"]



def test_plot_draws_when_a_later_look_has_no_alpha_left(server):
    (st,) = _drive(server, [{"src": "0.5, 1.0\n1.0, 1.5\n1.4, 1.8", "futility": "0"}])
    assert st["rows"] == 3
    assert "NaN" not in st["svg"] and "Infinity" not in st["svg"], st["svg"][:400]
    import re
    xs = [float(x) for x in re.findall(r'<circle cx="([-\d.]+)"', st["svg"])]
    assert len(xs) == 3 and all(60 <= x <= 690 for x in xs), xs
