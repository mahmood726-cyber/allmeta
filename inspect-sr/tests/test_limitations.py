"""Limitation repairs for inspect-sr (limitation sweep LIM-P50, 20 Nov 2026), driven in the real page.

Each test states a requirement the page did not meet (fail-before recorded by the lim7 lane) and drives
the page in system Chrome (playwright-core, located by ALM_PLAYWRIGHT_CORE), served from this checkout on
an ephemeral 127.0.0.1 port. Skips, with the reason, when node or playwright-core are missing.
"""
import json
import re
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


def test_L16_export_keeps_overrides_pool_and_provenance():
    """L16: the JSON merged suggestions and explicit overrides into one value and omitted the pooled table,
    the model and the software version, so it was not a record of the analysis. Requirement: it carries
    the reviewer's overrides separately from the effective judgements, the re-pool table and its method."""
    res = drive(TWO + r"""
      await p.selectOption('select[data-dj="2"]', 'some');
      const j = JSON.parse(await download('#btn-json'));
      return { t: j.trials[1], analysis: j.analysis, software: j.software };
    """)
    o = res["out"]
    assert o["t"]["domainOverrides"] == {"2": "some"} and o["t"]["overallOverride"] == "", o
    assert o["t"]["domainJudgements"]["2"] == "some" and o["t"]["domainJudgements"]["1"] == "unset", o
    assert o["analysis"]["method"].startswith("Paule-Mandel") and o["analysis"]["sets"][0]["k"] == 2, o
    assert abs(o["analysis"]["sets"][0]["mu"] - (-0.328)) < 5e-4, o
    assert o["software"]["app"] == "inspect-sr", o


def test_L17_downloaded_json_can_be_loaded_back():
    """L17: the downloaded JSON could not be reloaded, so moving an assessment meant re-entering it.
    Requirement: Load JSON restores labels, responses, overrides, reasons and effects."""
    res = drive(TWO + r"""
      await p.evaluate(() => document.querySelector('input[name="resp-1.1"][value="yes"]').click());
      await p.selectOption('select[data-dj="1"]', 'serious');
      const txt = await download('#btn-json');
      p.__acceptDialogs = true;
      await p.click('#btn-reset');
      const fs = require('fs'), f = require('path').join(process.env.TEMP || '.', 'insp-load-' + Date.now() + '.json');
      fs.writeFileSync(f, txt);
      await p.setInputFiles('#file-load', f);
      await p.waitForTimeout(300);
      fs.unlinkSync(f);
      return await p.evaluate(() => JSON.parse(localStorage.getItem('inspect-sr-v1')));
    """)
    s = res["out"]
    assert [t["label"] for t in s["trials"]] == ["A", "B"], s
    assert s["trials"][1]["resp"] == {"1.1": "yes"} and s["trials"][1]["dj"] == {"1": "serious"}, s
    assert s["trials"][0]["est"] == "-0.4" and s["trials"][0]["se"] == "0.15", s


def test_L17_pre_change_export_keeps_its_explicit_judgements():
    """Review of PR 649: an export written before domainOverrides/overallOverride existed (same _schema; only
    the effective domainJudgements/overall) was loaded with every explicit judgement dropped, while the page
    said "Loaded n trial(s)". Requirement: a judgement that differs from what the loaded responses suggest is
    restored as the reviewer's own, so every effective judgement is as exported, and the status says the
    file is an older export."""
    old = {"_schema": "inspect-sr-v1", "trials": [
        {"label": "Old1", "responses": {}, "domainJudgements": {"1": "serious", "2": "unset", "3": "unset", "4": "unset"},
         "overall": "serious", "est": "-0.4", "se": "0.15"},
        {"label": "Old2", "responses": {}, "domainJudgements": {"1": "unset", "2": "unset", "3": "unset", "4": "unset"},
         "overall": "no", "est": "-0.2", "se": "0.2"}]}
    res = drive(r"""
      p.__acceptDialogs = true;
      const fs = require('fs'), f = require('path').join(process.env.TEMP || '.', 'insp-old-' + Date.now() + '.json');
      fs.writeFileSync(f, """ + repr(json.dumps(old)) + r""");
      await p.setInputFiles('#file-load', f);
      await p.waitForTimeout(300);
      fs.unlinkSync(f);
      return { s: await p.evaluate(() => JSON.parse(localStorage.getItem('inspect-sr-v1'))),
               msg: await p.evaluate(() => document.getElementById('load-status').textContent),
               summary: await p.innerText('#summary') };
    """)
    o = res["out"]
    t1, t2 = o["s"]["trials"]
    assert t1["dj"] == {"1": "serious"} and t1["overall"] == "", o   # serious overall follows from the domain
    assert t2["dj"] == {} and t2["overall"] == "no", o
    assert "older" in o["msg"].lower(), o


def test_L19_radio_groups_named_focus_visible_and_domain_text():
    """L19: each check's radios had no group name tied to the question, the visually hidden radios had no
    visible focus cue, and the summary's domain cells were colour dots with a title only.
    Requirement: role=radiogroup labelled by the question, a focus-visible style, domain text in cells."""
    res = drive(r"""
      return await p.evaluate(() => {
        const g = document.querySelector('.opts');
        const id = g && g.getAttribute('aria-labelledby'), lab = id && document.getElementById(id);
        const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch (e) { return []; } }).join('\n');
        return { role: g && g.getAttribute('role'), label: lab ? lab.textContent : '', focus: /focus-visible/.test(css),
                 cell: document.querySelector('#summary td:nth-child(2)').textContent };
      });
    """)
    o = res["out"]
    assert o["role"] == "radiogroup" and "retraction" in o["label"], o
    assert o["focus"], o
    assert o["cell"].strip() == "Not set", o


def test_L20_footer_cites_the_article_number_and_scopes_its_claims():
    """L20: the reference gave the DOI suffix as the article number; the article number is e100611 (P50
    dictation, reference 1: "BMJ 2026;394:e100611. doi:10.1136/bmj-2026-100611"). The footer also called
    the pooling engine "audited" although the P50 validation excludes pooling. Requirement: the article
    number is cited, and no sentence about the re-pool engine claims it is audited/validated/verified
    (other than saying the validation does not test it)."""
    html = (ROOT / "inspect-sr" / "index.html").read_text(encoding="utf-8")
    foot = re.search(r"<footer>(.*?)</footer>", html, re.S).group(1)
    assert "BMJ 2026;394:e100611" in foot and "394:bmj-2026-100611" not in foot
    for sent in re.split(r"(?<=[.;])\s+", re.sub(r"<[^>]+>", "", foot)):
        if "ma-core" in sent or "pool" in sent.lower():
            claim = re.search(r"\b(audited|validated|verified)\b", sent, re.I)
            assert not claim or re.search(r"\bdoes not\b|\bnot\b", sent), sent

