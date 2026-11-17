"""The page's "Download R script" / "Verify in R" script (fragility/r-check.js).

Requirement: the script is generated from the page's CURRENT inputs (after the user edits
them, not the example), it runs in fresh R, and it prints an honest MATCH n/n against the
numbers the page displays. Drives the real page in system Chrome (playwright-core, located by
the ALM_PLAYWRIGHT_CORE environment variable) and runs the script with Rscript --vanilla.
Skips, with the reason, when Chrome/playwright-core/Rscript/metafor/fragility are not available.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = "fragility"
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

COMMON = {"ta": "#data", "sel": "#measure", "state": "__almFragilityRState", "api": "AlmFragilityRCheck"}
PASTED = "12, 150, 22, 148, A\n9, 130, 15, 128, B\n4, 70, 10, 72, C\n15, 200, 24, 198, D"
CASES = [
    dict(COMMON, id="default-OR", text=None, select=None),
    dict(COMMON, id="pasted-OR", text=PASTED, select=None),
    dict(COMMON, id="pasted-RR", text=PASTED, select="RR"),
    dict(COMMON, id="pasted-RD", text=PASTED, select="RD"),
    # not significant: the page reports no FI; the script then checks the pooled part and the significance status
    dict(COMMON, id="nonsig-OR", text="10, 100, 11, 100, X\n9, 100, 10, 100, Y", select=None),
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
    s = driven["pasted-RR"]["script"]
    assert "e1 <- c(12, 9, 4, 15); n1 <- c(150, 130, 70, 200)" in s
    assert "e0 <- c(22, 15, 10, 24); n0 <- c(148, 128, 72, 198)" in s
    assert 'measure <- "RR"' in s
    assert "c(8, 5, 11, 3, 7)" not in s, "the example data leaked into the script for pasted data"


@pytest.mark.parametrize("cid", [c["id"] for c in CASES])
def test_rscript_prints_match(driven, tmp_path, cid):
    lines = run_r(tmp_path, cid, driven[cid]["script"])
    if any("PACKAGE NOT AVAILABLE: 'fragility'" in ln for ln in lines):
        pytest.skip("R package fragility not installed: the full FI/FQ check cannot run")
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", lines[-1])
    expect = 4 if cid.startswith("nonsig") else 8
    assert m and m.group(1) == m.group(2) and int(m.group(2)) == expect, "\n".join(lines[-20:])
