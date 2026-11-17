"""R user path of powerma (paper 46): "Download R script" and "Verify in R" (WebR) must re-check, in R, the
"Required information" table the page displays for the inputs the user entered.

Before 17 Nov 2026 the page offered no way to check it in R (live user-path capture: no R control).
Requirement checked here:
  * the downloaded script carries the page's CURRENT inputs (after the user edits them, without pressing Compute);
  * run in a fresh Rscript it prints MATCH n/n for the default example and for user inputs (pooled-variance binary,
    continuous with unequal allocation);
  * the verdict is computed, not printed: one displayed size changed by 1 gives MISMATCH.
The browser part needs node + playwright-core (ALLMETA_PLAYWRIGHT_CORE, or resolvable from node) and Chrome
(ALLMETA_CHROME); it is skipped, with the reason, when they are absent.
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
RSCRIPT = os.environ.get("ALLMETA_RSCRIPT") or shutil.which("Rscript") or r"C:\Program Files\R\R-4.6.0\bin\Rscript.exe"
CHROME = os.environ.get("ALLMETA_CHROME") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def _rscript(path: Path) -> str:
    if not Path(RSCRIPT).exists() and not shutil.which(RSCRIPT):
        pytest.skip("Rscript not found")
    r = subprocess.run([RSCRIPT, "--vanilla", str(path)], capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout


def _match(out: str) -> tuple[int, int]:
    m = re.search(r"^MATCH (\d+)/(\d+)$", out, re.M)
    assert m, "no MATCH line:\n" + out
    return int(m.group(1)), int(m.group(2))


def test_planted_difference_is_reported_as_mismatch(tmp_path):
    if NODE is None:
        pytest.skip("node not installed")
    st = {"outcome": "binary", "method": "arcsine", "alpha": 0.05, "power": 0.8, "ratio": 1, "i2Pct": 25, "d2Pct": 25,
          "p0": 0.15, "rrr": 0.2, "md": 0.4, "sd": 1, "page": [[2031, 4062, 548], [2708, 5416, 731], [2708, 5416, 731]]}
    js = "const C=require(process.argv[1]);process.stdout.write(C.buildRScript(JSON.parse(process.argv[2])))"
    for name, page, want in [("ok", st["page"], r"^MATCH 9/9$"),
                             ("planted", [[2031, 4062, 548], [2708, 5416, 731], [2708, 5417, 731]], r"^MISMATCH 8/9 agree$")]:
        r = subprocess.run([NODE, "-e", js, str(ROOT / "powerma" / "rcheck.js"), json.dumps({**st, "page": page})],
                           capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, r.stderr
        (tmp_path / f"{name}.R").write_text(r.stdout, encoding="utf-8")
        out = _rscript(tmp_path / f"{name}.R")
        assert re.search(want, out, re.M), out


def _playwright_dir():
    d = os.environ.get("ALLMETA_PLAYWRIGHT_CORE")
    if d and Path(d).exists():
        return d
    if NODE:
        r = subprocess.run([NODE, "-e", "console.log(require.resolve('playwright-core'))"], capture_output=True, text=True, cwd=str(ROOT))
        if r.returncode == 0:
            return str(Path(r.stdout.strip()).parent)
    return None


@pytest.fixture(scope="module")
def server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    for port in range(18480, 18999):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                continue
        try:
            httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{port}/"
    httpd.shutdown()


BROWSER_JS = r"""
const { chromium } = require(process.argv[1]);
const [base, chrome, outFile, setJson] = process.argv.slice(2), set = JSON.parse(setJson);
(async () => {
  const b = await chromium.launch({ executablePath: chrome, headless: true, args: ['--headless=new'] });
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  await p.goto(base + 'powerma/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  for (const [id, v] of Object.entries(set)) {
    if (await p.$eval('#' + id, e => e.tagName) === 'SELECT') await p.selectOption('#' + id, v); else await p.fill('#' + id, v);
  }
  // the user does NOT press Compute: the download must re-check the current inputs
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-r-script')]);
  await dl.saveAs(outFile);
  console.log(JSON.stringify({ table: await p.evaluate(() => document.querySelector('#tbl-body').innerText) })); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
"""


@pytest.mark.parametrize("name,setting,expect,n", [
    ("default", {}, {"outcome": "binary", "binary_formula": "arcsine", "p0": "0.15"}, 9),
    ("pooled", {"p0": "0.30", "rrr": "0.25", "power": "0.90", "i2": "40", "d2": "50", "binary-method": "pooled"},
     {"binary_formula": "pooled", "p0": "0.30", "rrr": "0.25", "power": "0.90", "I2": "40"}, 9),
    ("continuous ratio 2", {"outcome": "continuous", "ratio": "2", "md": "5", "sd-c": "12", "i2": "40", "d2": "50"},
     {"outcome": "continuous", "ratio": "2", "md": "5", "sd": "12", "D2": "50"}, 6),
])
def test_downloaded_script_carries_current_inputs_and_matches_in_r(server, tmp_path, name, setting, expect, n):
    pw = _playwright_dir()
    if not pw or NODE is None or not Path(CHROME).exists():
        pytest.skip("node + playwright-core + Chrome needed for the browser user path")
    f = tmp_path / "check.R"
    r = subprocess.run([NODE, "-e", BROWSER_JS, pw, server, CHROME, str(f), json.dumps(setting)], capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stderr
    script = f.read_text(encoding="utf-8")
    for k, v in expect.items():
        m = re.search(r'(?:^|; )%s <- ("[^"]*"|[^;\s]+)' % re.escape(k), script, re.M)
        assert m, (k, script[:1800])
        got = m.group(1)
        assert (got.strip('"') == v) if got.startswith('"') else (float(got) == float(v)), (k, got, v)
    ok, total = _match(_rscript(f))
    assert ok == total == n
