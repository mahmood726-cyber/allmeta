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


def test_L07_display_scale_survives_reload_and_is_exported():
    """L07: the ratio (exponentiated) display setting was not saved, so a reload silently showed the other
    scale, and the JSON did not say which scale the reviewer used. Requirement: it is kept and exported."""
    res = drive(TWO + r"""
      await p.selectOption('#scale', 'exp');
      await p.reload({ waitUntil: 'load' });
      const scale = await p.inputValue('#scale');
      const j = JSON.parse(await download('#btn-json'));
      return { scale, displayScale: j.displayScale };
    """)
    assert res["out"] == {"scale": "exp", "displayScale": "exp"}, res


def test_L08_reasons_are_recorded_saved_and_exported():
    """L08: there was nowhere to record the reason for a domain or overall judgement (the guidance asks the
    reviewer to justify them). Requirement: a reason box per domain and for the overall judgement, saved
    and exported."""
    res = drive(r"""
      await fill('textarea[data-reason="1"]', 'Retraction notice 2024');
      await fill('textarea[data-reason="overall"]', 'Retracted');
      await p.reload({ waitUntil: 'load' });
      const kept = await p.inputValue('textarea[data-reason="1"]');
      const j = JSON.parse(await download('#btn-json'));
      return { kept, reasons: j.trials[0].reasons };
    """)
    o = res["out"]
    assert o["kept"] == "Retraction notice 2024", o
    assert o["reasons"]["1"] == "Retraction notice 2024" and o["reasons"]["overall"] == "Retracted", o


def test_L10_override_inconsistent_with_domains_is_warned():
    """L10: an overall override of "no concerns" was accepted silently when a domain was "serious" or when
    domains were incomplete, and it decided which analysis sets the trial entered. Requirement: the page
    warns (it does not change the reviewer's choice)."""
    res = drive(r"""
      const w = () => p.evaluate(() => (document.getElementById('overall-warn') || {}).textContent || '');
      await p.selectOption('#overall-sel', 'no');
      const incomplete = await w();
      await p.selectOption('select[data-dj="1"]', 'serious');
      const below = await w();
      const kept = await p.inputValue('#overall-sel');
      await p.selectOption('#overall-sel', 'serious');
      const none = await w();
      return { incomplete, below, kept, none };
    """)
    o = res["out"]
    assert "not complete" in o["incomplete"], o
    assert "less severe" in o["below"] and o["kept"] == "no", o
    assert o["none"] == "", o


def test_L12_a_single_response_can_be_cleared():
    """L12: once answered, a check could not be returned to unanswered (only Remove trial / Reset all).
    Requirement: a per-check Clear control."""
    res = drive(r"""
      await p.evaluate(() => document.querySelector('input[name="resp-1.1"][value="yes"]').click());
      await p.click('button[data-clear="1.1"]');
      return { resp: await p.evaluate(() => JSON.parse(localStorage.getItem('inspect-sr-v1')).trials[0].resp),
               checked: await p.evaluate(() => document.querySelectorAll('input[name="resp-1.1"]:checked').length) };
    """)
    assert res["out"] == {"resp": {}, "checked": 0}, res


def test_L13_malformed_saved_state_still_renders_and_save_failure_is_shown():
    """L13: a saved record such as {trials:[{}], cur:5} threw at load and left no assessment form, and a
    failed localStorage write was swallowed. Requirement: the record is repaired so the form renders, and a
    failed save is reported on the page."""
    res = drive(r"""
      await p.evaluate(() => localStorage.setItem('inspect-sr-v1', JSON.stringify({ trials: [{}], cur: 5 })));
      await p.reload({ waitUntil: 'load' });
      const radios = await p.evaluate(() => document.querySelectorAll('#checks input[type=radio]').length);
      await p.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
      await fill('#trial-name', 'X');
      return { radios, msg: await p.evaluate(() => (document.getElementById('save-status') || {}).textContent || '') };
    """)
    assert res["errs"] == [], res["errs"]
    assert res["out"]["radios"] == 84 and "not saved" in res["out"]["msg"].lower(), res


def test_L15_remove_asks_before_deleting_an_assessment():
    """L15: Remove deleted the selected trial and its answers at once (Reset all asks first).
    Requirement: Remove asks; declining keeps the trial."""
    res = drive(r"""
      await p.click('#btn-add');
      await p.click('#btn-del');
      return await p.evaluate(() => JSON.parse(localStorage.getItem('inspect-sr-v1')).trials.length);
    """)
    assert res["out"] == 2 and len(res["dialogs"]) == 1, res
