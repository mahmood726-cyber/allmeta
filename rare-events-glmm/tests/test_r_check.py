"""The page's "Download R script" / "Verify in R" script (rare-events-glmm/r-check.js).

Requirement: the script is generated from the page's CURRENT inputs (after the user edits
them, not the example), it runs in fresh R, and it prints an honest MATCH n/n against the
numbers the page displays. Drives the real page in system Chrome (playwright-core, located by
the ALM_PLAYWRIGHT_CORE environment variable) and runs the script with Rscript --vanilla.
Skips, with the reason, when Chrome/playwright-core/Rscript/metafor/lme4 are not available.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = "rare-events-glmm"
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
  const out = [];
  try {
    for (const c of cases) {
      const p = await b.newPage();
      await p.goto('http://127.0.0.1:' + srv.address().port + '/' + app + '/', { waitUntil: 'load' });
      if (c.text != null) { await p.fill(c.ta, c.text); await p.dispatchEvent(c.ta, 'input'); if (await p.$('#btn-run')) await p.click('#btn-run'); }
      if (c.select) await p.selectOption(c.sel, c.select);
      await p.waitForTimeout(300);
      out.push(await p.evaluate((c) => { const st = window[c.state](); return { state: st, script: st ? window[c.api].buildScript(st) : null,
        buttons: [!!document.getElementById('rcheck-dl'), !!document.getElementById('rcheck-webr')], runner: !!(window.AlmWebR && window.AlmWebR.runR) }; }, c));
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
  process.stdout.write(JSON.stringify(out));
});
"""

COMMON = {"ta": "#src", "sel": "#f-model", "state": "__almRareRState", "api": "AlmRareGlmmRCheck"}
PASTED = "S1, 0, 120, 2, 118\nS2, 1, 200, 4, 205\nS4, 3, 400, 6, 395\nS5, 2, 150, 1, 148\nS6, 0, 60, 3, 61"
# the same data plus one double-zero study (0 events in both arms)
PASTED00 = "S1, 0, 120, 2, 118\nS2, 1, 200, 4, 205\nS3, 0, 80, 0, 82\nS4, 3, 400, 6, 395\nS5, 2, 150, 1, 148\nS6, 0, 60, 3, 61"
CASES = [
    dict(COMMON, id="default-UMFS", text=None, select=None),
    dict(COMMON, id="pasted-UMFS", text=PASTED, select=None),
    dict(COMMON, id="pasted00-UMFS", text=PASTED00, select=None),
    dict(COMMON, id="pasted-UMRS", text=PASTED, select="UM.RS"),
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


def test_script_carries_current_inputs(driven):
    s = driven["pasted-UMRS"]["script"]
    assert "ai <- c(0, 1, 3, 2, 0); n1i <- c(120, 200, 400, 150, 60)" in s
    assert "ci <- c(2, 4, 6, 1, 3); n2i <- c(118, 205, 395, 148, 61)" in s
    assert 'model <- "UM.RS"' in s
    assert "c(250, 500, 180" not in s, "the example data leaked into the script for pasted data"


@pytest.mark.parametrize("cid", ["default-UMFS", "pasted-UMFS"])
def test_rscript_prints_match(driven, tmp_path, cid):
    lines = run_r(tmp_path, cid, driven[cid]["script"])
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", lines[-1])
    assert m and m.group(1) == m.group(2) and int(m.group(2)) == 11, "\n".join(lines[-20:])


@pytest.mark.xfail(strict=True, reason="REQUIREMENT: the page's k and log-OR must equal metafor rma.glmm, which drops "
                   "double-zero studies (k 5, log-OR -0.9935); the page keeps the double-zero study (k 6, log-OR -0.9942). "
                   "The fix is held because it changes displayed numbers (lane pa4 report).")
def test_rscript_double_zero_study(driven, tmp_path):
    lines = run_r(tmp_path, "pasted00-UMFS", driven["pasted00-UMFS"]["script"])
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", lines[-1])
    assert m and m.group(1) == m.group(2), "\n".join(lines[-20:])


def test_umrs_has_no_page_values_and_says_so(driven, tmp_path):
    lines = run_r(tmp_path, "pasted-UMRS", driven["pasted-UMRS"]["script"])
    assert lines[-1].startswith("NO CHECKS"), lines[-1]
    assert any(ln.startswith("NO PAGE VALUES: UM.RS is R-only") for ln in lines)
