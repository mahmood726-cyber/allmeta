"""The page's "Download R script" / "Verify in R (WebR)" for the robustness re-pool (inspect-sr/r-check.js).

Requirement (live sweep 2026-11-20: the page had no R control, though its re-pool table computes
Paule-Mandel pooled estimates, 95% CIs and I^2): the script is generated from the page's CURRENT trials
(effects, SEs and the overall judgement the page uses), it runs in fresh R, and it prints an honest
MATCH n/n against every number in the table (k, pooled, CI, I^2 for each analysis set), refitting with
metafor::rma(method = "PM"). Drives the real page in system Chrome (playwright-core, located by
ALM_PLAYWRIGHT_CORE) and runs the script with Rscript --vanilla. Skips, with the reason, when
Chrome/playwright-core/Rscript/metafor are missing.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = "inspect-sr"
NODE = shutil.which("node")
RSCRIPT = shutil.which("Rscript")
PW = os.environ.get("ALM_PLAYWRIGHT_CORE")

pytestmark = pytest.mark.skipif(not (NODE and RSCRIPT and PW and Path(PW).is_dir()),
                                reason="needs node, Rscript and ALM_PLAYWRIGHT_CORE=<dir of playwright-core>")

DRIVER = r"""
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.ALM_PLAYWRIGHT_CORE);
const [root, app, casesJson] = process.argv.slice(1);
const cases = JSON.parse(casesJson);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch(process.env.ALM_CHROME ? { executablePath: process.env.ALM_CHROME, headless: true } : { channel: 'chrome', headless: true });
  const fill = async (p, sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'input'); };
  const out = [];
  try {
    for (const c of cases) {
      const p = await b.newPage();
      await p.goto('http://127.0.0.1:' + srv.address().port + '/' + app + '/', { waitUntil: 'load' });
      for (let i = 0; i < c.trials.length; i++) {
        if (i > 0) await p.click('#btn-add');
        const [lab, est, se, ov] = c.trials[i];
        await fill(p, '#trial-name', lab);
        if (est) await fill(p, '#eff-est', est);
        if (se) await fill(p, '#eff-se', se);
        if (ov) await p.selectOption('#overall-sel', ov);
      }
      if (c.exp) await p.selectOption('#scale', 'exp');
      await p.waitForTimeout(300);
      out.push(await p.evaluate(() => { const st = window.__almInspectSrRState(); return { state: st, script: st ? window.AlmInspectSrRCheck.buildScript(st) : null,
        table: document.getElementById('pooled').innerText,
        buttons: [!!document.getElementById('rcheck-dl'), !!document.getElementById('rcheck-webr')], runner: !!(window.AlmWebR && window.AlmWebR.runR) }; }));
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
  process.stdout.write(JSON.stringify(out));
});
"""

# [label, effect, SE, overall judgement ('' = the page's suggestion; no checks answered -> none)]
FIVE = [["Alpha", "-0.40", "0.15", "no"], ["Beta", "-0.25", "0.20", "some"], ["Gamma", "-0.90", "0.25", "serious"],
        ["Delta", "-0.10", "0.12", ""], ["Eps", "-0.30", "0.18", "no"]]
CASES = [
    dict(id="default", trials=[], exp=False, expect=None),          # the page opens with one empty trial: no table numbers
    dict(id="five-linear", trials=FIVE, exp=False, expect=15),       # sets of k = 5, 3, 2: 5 checks each
    # k = 2, 1, 1 on the ratio scale; T3 has no effect, so it is in no pooled set
    dict(id="three-exp", trials=[["T1", "0.2", "0.1", "no"], ["T2", "0.5", "0.2", "serious"], ["T3", "", "", "some"]], exp=True, expect=15),
    dict(id="none-in-sets", trials=[["U1", "0.1", "0.2", ""], ["U2", "0.3", "0.25", "serious"]], exp=False, expect=7),  # k = 2, 0, 0
]


def r_env():
    env = dict(os.environ)
    if os.environ.get("ALM_R_LIBS"):
        env["R_LIBS"] = os.environ["ALM_R_LIBS"]
    return env


@pytest.fixture(scope="module")
def driven():
    r = subprocess.run([NODE, "-e", DRIVER, str(ROOT), APP, json.dumps(CASES)], capture_output=True, text=True,
                       timeout=300, env=dict(os.environ))
    assert r.returncode == 0, r.stderr
    return dict(zip([c["id"] for c in CASES], json.loads(r.stdout)))


def run_r(tmp_path, name, script):
    f = tmp_path / (name + ".R")
    f.write_text(script, encoding="utf-8")
    r = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300, env=r_env())
    if "there is no package called" in r.stderr:
        pytest.skip("R package missing: " + r.stderr.strip().splitlines()[-1])
    assert r.returncode == 0, r.stderr
    return r.stdout.strip().splitlines()


def test_controls_present(driven):
    for c in driven.values():
        assert c["buttons"] == [True, True]
        assert c["runner"], "../shared/webr-runner.js did not load"


def test_default_page_has_nothing_to_check(driven):
    c = driven["default"]
    assert c["state"] is None and c["script"] is None


def test_script_carries_current_trials(driven):
    s = driven["five-linear"]["script"]
    assert "est     <- c(-0.4, -0.25, -0.9, -0.1, -0.3)" in s
    assert "se      <- c(0.15, 0.2, 0.25, 0.12, 0.18)" in s
    assert 'overall <- c("no", "some", "serious", "unset", "no")' in s
    assert "exp_scale <- FALSE" in s
    e = driven["three-exp"]["script"]
    assert "est     <- c(0.2, 0.5, NA)" in e and "exp_scale <- TRUE" in e


@pytest.mark.parametrize("cid", [c["id"] for c in CASES if c["expect"]])
def test_rscript_prints_match(driven, tmp_path, cid):
    lines = run_r(tmp_path, cid, driven[cid]["script"])
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", lines[-1])
    expect = [c["expect"] for c in CASES if c["id"] == cid][0]
    assert m and m.group(1) == m.group(2) and int(m.group(2)) == expect, "\n".join(lines[-25:])


def test_script_can_fail(driven, tmp_path):
    """The verdict is computed, not printed: an I^2 displayed one point too high must give MISMATCH."""
    s = driven["five-linear"]["script"]
    m = re.search(r"page <- list\(\n  list\(k = \d+, mu = [^)]*?, I2 = ([0-9.e+-]+)\)", s)   # the first page row
    assert m
    bad = s.replace(m.group(0), m.group(0)[:m.start(1) - m.start(0)] + str(float(m.group(1)) + 1) + ")", 1)
    lines = run_r(tmp_path, "planted", bad)
    assert lines[-1].startswith("MISMATCH 14/15"), "\n".join(lines[-25:])
