"""The page's "Download R script" / "Verify in R here (WebR)" script (tsa/r-check.js).

Requirement (live sweep 2026-11-20: the page offered no downloadable R script): the script is generated
from the page's CURRENT inputs (after the user edits them, not the example), it runs in fresh R, and it
prints an honest MATCH n/n against every number the page displays (k, RIS, current information and its
percentage, cumulative Z, pooled mu and CI, O'Brien-Fleming boundary, Crossed?, TSA-adjusted CI), with
metafor + mvtnorm (paper 46's references for the page's total-spending convention). Drives the real page
in system Chrome (playwright-core, located by ALM_PLAYWRIGHT_CORE) and runs the script with Rscript
--vanilla. Skips, with the reason, when Chrome/playwright-core/Rscript/metafor/mvtnorm are missing.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = "tsa"
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
      for (const [act, sel, val] of c.actions) {
        if (act === 'fill') { await p.fill(sel, val); await p.dispatchEvent(sel, 'input'); }
        else { await p.selectOption(sel, val); await p.dispatchEvent(sel, 'input'); }
      }
      await p.waitForTimeout(300);
      out.push(await p.evaluate(() => { const st = window.__almTsaRState(); return { state: st, script: st ? window.AlmTsaRCheck.buildScript(st) : null,
        stats: document.getElementById('stats-wrap').innerText,
        buttons: [!!document.getElementById('rcheck-dl'), !!document.getElementById('rcheck-webr')], runner: !!(window.AlmWebR && window.AlmWebR.runR) }; }));
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
  process.stdout.write(JSON.stringify(out));
});
"""

PASTED = ("Bollaert 1998, -0.31, 0.21\nBriegel 1999, -0.18, 0.33\nAnnane 2002, -0.12, 0.09\nOppert 2005, -0.25, 0.40\n"
          "CORTICUS 2008, 0.08, 0.12\nADRENAL 2018, -0.05, 0.06\nAPROCCHSS 2018, -0.13, 0.07")
CASES = [
    dict(id="default", actions=[], expect=12),
    dict(id="pasted-auto", actions=[["fill", "#f-data", PASTED], ["fill", "#f-delta", "0.15"], ["fill", "#f-power", "0.90"],
                                    ["fill", "#f-diversity", "1.30"]], expect=12),
    # information below the RIS (t < 1 at every look): the boundary is the one at the last look
    dict(id="manual-below-ris", actions=[["fill", "#f-data", "T1, 0.20, 0.30\nT2, 0.35, 0.25\nT3, 0.15, 0.20"],
                                         ["select", "#f-ris-mode", "manual"], ["fill", "#f-ris-manual", "150"],
                                         ["fill", "#f-alpha", "0.01"]], expect=12),
    # an invalid RIS setup: the page shows only k, so there is nothing to check (getState is null)
    dict(id="invalid-ris", actions=[["fill", "#f-power", "0.2"]], expect=None),
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
    s = driven["pasted-auto"]["script"]
    assert "est <- c(-0.31, -0.18, -0.12, -0.25, 0.08, -0.05, -0.13)" in s
    assert "se  <- c(0.21, 0.33, 0.09, 0.4, 0.12, 0.06, 0.07)" in s
    assert 'ris_mode <- "auto"; delta <- 0.15; alpha <- 0.05; power <- 0.9; ris_manual <- 200; D <- 1.3' in s
    assert "-0.18, -0.25, -0.28" not in s, "the example data leaked into the script for pasted data"
    m = driven["manual-below-ris"]["script"]
    assert 'ris_mode <- "manual"' in m and "ris_manual <- 150" in m and "alpha_b <- 0.01" in m


def test_no_state_when_page_shows_no_analysis(driven):
    c = driven["invalid-ris"]
    assert c["state"] is None and c["script"] is None
    assert "RIS" not in c["stats"]


@pytest.mark.parametrize("cid", [c["id"] for c in CASES if c["expect"]])
def test_rscript_prints_match(driven, tmp_path, cid):
    lines = run_r(tmp_path, cid, driven[cid]["script"])
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", lines[-1])
    expect = [c["expect"] for c in CASES if c["id"] == cid][0]
    assert m and m.group(1) == m.group(2) and int(m.group(2)) == expect, "\n".join(lines[-20:])


def test_script_can_fail(driven, tmp_path):
    """The verdict is computed, not printed: a displayed boundary off by 0.01 must give MISMATCH."""
    s = driven["default"]["script"]
    m = re.search(r"page_b <- list\(bnd = ([^,]+),", s)
    assert m
    bad = s.replace(m.group(0), "page_b <- list(bnd = " + str(float(m.group(1)) + 0.01) + ",", 1)
    lines = run_r(tmp_path, "planted", bad)
    assert lines[-1].startswith("MISMATCH 11/12"), "\n".join(lines[-20:])


def test_no_unrestricted_dimension_reaches_pmvnorm(driven, tmp_path):
    """WebR's mvtnorm 1.2-4 Miwa crashes ("memory access out of bounds") when two or more dimensions are
    unrestricted (-Inf, Inf), which happened when early looks spend no alpha (pasted case, t = 0.04, 0.05).
    Such a look restricts nothing, so the script integrates it out; this asserts no -Inf/Inf limit except the
    final upper one ever reaches pmvnorm, and the verdict is unchanged."""
    s = driven["pasted-auto"]["script"]
    lib = "suppressPackageStartupMessages({ library(metafor); library(mvtnorm) })"
    assert s.count(lib) == 1
    guard = lib + "\npmvnorm <- function(lower, upper, ...) {\n" \
        "  if (any(!is.finite(lower)) || any(!is.finite(upper[-length(upper)]))) stop(\"unrestricted dimension passed to pmvnorm\")\n" \
        "  .alm_n_pmv <<- .alm_n_pmv + 1L; mvtnorm::pmvnorm(lower = lower, upper = upper, ...)\n}\n.alm_n_pmv <- 0L"
    lines = run_r(tmp_path, "guarded", s.replace(lib, guard, 1) + 'cat("pmvnorm calls:", .alm_n_pmv, "\n")\n')
    assert lines[-2] == "MATCH 12/12", "\n".join(lines[-20:])
    assert int(lines[-1].split()[-1]) > 0, "the multivariate path was not exercised"
