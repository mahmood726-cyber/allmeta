"""Limitation repairs for inspect-sr (limitation sweep LIM-P50, 20 Nov 2026), driven in the real page.

Each test states a requirement the page did not meet (fail-before recorded by the lim7 lane) and drives
the page in system Chrome (playwright-core, located by ALM_PLAYWRIGHT_CORE), served from this checkout on
an ephemeral 127.0.0.1 port. Skips, with the reason, when node or playwright-core are missing.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
PW = os.environ.get("ALM_PLAYWRIGHT_CORE")

pytestmark = pytest.mark.skipif(not (NODE and PW and Path(PW).is_dir()),
                                reason="needs node and ALM_PLAYWRIGHT_CORE=<dir of playwright-core>")

# The scenario is the body of an async function (p, fill) run in Node; it returns a JSON-able value.
DRIVER = r"""
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.ALM_PLAYWRIGHT_CORE);
const [root, body] = process.argv.slice(1);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch(process.env.ALM_CHROME ? { executablePath: process.env.ALM_CHROME, headless: true } : { channel: 'chrome', headless: true });
  let out, errs = [], dialogs = [];
  try {
    const ctx = await b.newContext({ acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    p.on('dialog', d => { dialogs.push(d.message()); if (p.__acceptDialogs) d.accept(); else d.dismiss(); });
    p.url0 = 'http://127.0.0.1:' + srv.address().port + '/inspect-sr/';
    await p.goto(p.url0, { waitUntil: 'load' });
    await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' });
    const fill = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'input'); };
    const download = async (sel) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); return fs.readFileSync(await d.path(), 'utf8'); };
    const fn = new (Object.getPrototypeOf(async function () {}).constructor)('p', 'fill', 'download', body);
    out = await fn(p, fill, download);
  } finally { await b.close(); srv.close(); }
  process.stdout.write(JSON.stringify({ out, errs, dialogs }));
});
"""


def drive(body):
    r = subprocess.run([NODE, "-e", DRIVER, str(ROOT), body], capture_output=True, text=True, timeout=180,
                       env=dict(os.environ))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_L03_trials_left_out_of_the_pool_are_named():
    """L03: a trial whose effect or SE is missing, non-numeric or SE <= 0 was dropped from every pooled set
    with no trace, so k could be smaller than the number of assessed trials without the reader knowing why.
    Requirement: the page names each trial left out and why; a numeric prefix ("1kg") is not a number."""
    res = drive(r"""
      await fill('#trial-name', 'A'); await fill('#eff-est', '-0.4'); await fill('#eff-se', '0.15');
      await p.click('#btn-add'); await fill('#trial-name', 'B'); await fill('#eff-est', '-0.2'); await fill('#eff-se', '0.2');
      await p.click('#btn-add'); await fill('#trial-name', 'C'); await fill('#eff-est', '-0.9');
      const blank = await p.evaluate(() => (document.getElementById('pool-excluded') || {}).textContent || '');
      await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('inspect-sr-v1')); s.trials[2].se = '0.3kg'; localStorage.setItem('inspect-sr-v1', JSON.stringify(s)); });
      await p.reload({ waitUntil: 'load' });
      const prefix = await p.evaluate(() => (document.getElementById('pool-excluded') || {}).textContent || '');
      const k = await p.evaluate(() => document.querySelector('#pooled tr td:nth-child(2)').textContent);
      return { blank, prefix, k };
    """)
    o = res["out"]
    assert "C" in o["blank"] and "SE" in o["blank"], o
    assert "C" in o["prefix"] and o["k"] == "2", o


TWO = r"""
      await fill('#trial-name', 'A'); await fill('#eff-est', '-0.4'); await fill('#eff-se', '0.15');
      await p.click('#btn-add'); await fill('#trial-name', 'B'); await fill('#eff-est', '-0.2'); await fill('#eff-se', '0.2');
"""


def test_L04_failed_repool_does_not_leave_the_previous_table():
    """L04: a finite SE whose square underflows (1e-200) made shared/ma-core.js throw inside the table render;
    the exception escaped and the table kept the numbers of the previous inputs. Requirement: the failing
    sets say the pool could not be computed, no exception escapes, and nothing is offered to R."""
    res = drive(TWO + r"""
      const before = await p.innerText('#pooled');
      await fill('#eff-se', '1e-200');
      return { before, after: await p.innerText('#pooled'), r: await p.evaluate(() => window.__almInspectSrRState()) };
    """)
    o = res["out"]
    assert res["errs"] == [], res["errs"]
    first = o["after"].splitlines()[0]
    assert "-0.328" not in first and "could not" in first, o
    assert o["r"] is None
