"""R user path of sequential-ma (paper 46): "Download R script" and "Verify in R" (WebR) must re-check, in R, the
table the page displays for the inputs the user entered.

Before 17 Nov 2026 the page offered no way to check it in R at all (live user-path capture: no R control).
Requirement checked here:
  * the downloaded script carries the page's CURRENT inputs (after the user edits them, not the example);
  * run in a fresh Rscript it prints MATCH n/n for the default example and for pasted data (both input formats,
    both spending families, with and without futility);
  * the verdict is computed, not printed: a page value moved by 1e-5 (below the 3 displayed decimals) gives MISMATCH.
The browser part needs node + playwright-core (ALLMETA_PLAYWRIGHT_CORE = path of its package dir, or resolvable from
node) and Chrome (ALLMETA_CHROME); it is skipped, with the reason, when they are absent.
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

APP_DIR = Path(__file__).resolve().parents[1]
ROOT = APP_DIR.parent
NODE = shutil.which("node")
RSCRIPT = os.environ.get("ALLMETA_RSCRIPT") or shutil.which("Rscript") or r"C:\Program Files\R\R-4.6.0\bin\Rscript.exe"
CHROME = os.environ.get("ALLMETA_CHROME") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def _rscript(path: Path) -> str:
    if not Path(RSCRIPT).exists() and not shutil.which(RSCRIPT):
        pytest.skip("Rscript not found")
    r = subprocess.run([RSCRIPT, "--vanilla", str(path)], capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout


def _node_script(cases: list, outdir: Path) -> list:
    """Build the R script for each case with the page's own engine + rcheck.js (no browser)."""
    if NODE is None:
        pytest.skip("node not installed")
    js = r"""
const S = require(process.argv[1] + '/shared/sequential-ma.js'), C = require(process.argv[1] + '/sequential-ma/rcheck.js');
const cases = JSON.parse(process.argv[2]), fs = require('fs'), out = [];
for (const c of cases) {
  const looks = c.rows[0].kind === 'tz' ? c.rows.map(r => ({ t: r.t, z: r.z })) : S.looksFromRows(c.rows);
  const r = S.computeBoundary(looks, { alpha: c.alpha, family: c.family, futility: c.futility, beta: 0.2 });
  fs.writeFileSync(c.file, C.buildRScript({ rows: c.rows, alpha: c.alpha, family: c.family, futility: c.futility, result: r }));
  out.push(r);
}
console.log(JSON.stringify(out));
"""
    for i, c in enumerate(cases):
        c["file"] = str(outdir / f"case{i}.R")
    r = subprocess.run([NODE, "-e", js, str(ROOT), json.dumps(cases)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def _match(out: str) -> tuple[int, int]:
    m = re.search(r"^MATCH (\d+)/(\d+)$", out, re.M)
    assert m, "no MATCH line:\n" + out
    return int(m.group(1)), int(m.group(2))


TZ = [{"kind": "tz", "t": t, "z": z} for t, z in [(0.25, 1.10), (0.50, 1.85), (0.75, 2.30), (1.00, 2.45)]]


def test_planted_difference_is_reported_as_mismatch(tmp_path):
    _node_script([{"rows": TZ, "alpha": 0.05, "family": "OBF", "futility": True}], tmp_path)
    src = (tmp_path / "case0.R").read_text(encoding="utf-8")
    _match(_rscript(tmp_path / "case0.R"))
    # move the second displayed boundary by 1e-5: invisible at 3 decimals, must still be caught
    m = re.search(r"^page_bound <- c\(([^,]+), ([^,]+),", src, re.M)
    planted = src.replace(m.group(0), "page_bound <- c(%s, %r," % (m.group(1), float(m.group(2)) + 1e-5), 1)
    (tmp_path / "planted.R").write_text(planted, encoding="utf-8")
    out = _rscript(tmp_path / "planted.R")
    assert re.search(r"^MISMATCH 24/25 agree$", out, re.M), out
    assert "look 2 boundary" in [l[:22].strip() for l in out.splitlines() if l.rstrip().endswith("MISMATCH")]


def test_look_past_full_information_with_futility_reports_instead_of_crashing(tmp_path):
    """agy review of PR #625: t = (0.5, 1.2) with futility made the R script stop with an R error (the inflation
    search started at R = 0.9, found no root, and NA reached `if`). Requirement: the script always finishes with a
    verdict line, and never calls the comparison a MATCH for a futility boundary it could not compute."""
    rows = [{"kind": "tz", "t": 0.5, "z": 1.0}, {"kind": "tz", "t": 1.2, "z": 2.0}]
    # Review of PR #648 (LIM-P46 F12): this design IS solvable -- its inflation root lies below 0.9 (R = 0.8987),
    # which the engine now searches as the R check does. Requirement: the page shows futility boundaries for it and
    # R, computing them independently, agrees with every displayed value (plain MATCH, nothing NOT CHECKED).
    res = _node_script([{"rows": rows, "alpha": 0.05, "family": "OBF", "futility": True}], tmp_path)[0]
    assert abs(res["infoInflation"] - 0.8987) < 5e-4 and all(l["futility_boundary"] is not None for l in res["looks"]), res
    out = _rscript(tmp_path / "case0.R")
    last = out.strip().splitlines()[-1]
    m = re.match(r"^MATCH (\d+)/(\d+)$", last)
    assert m and m.group(1) == m.group(2), out


# ---- the user path in a real browser ------------------------------------------------------------------------------

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
    for port in range(18470, 18999):
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
const [base, chrome, outFile, src, family, futility] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: chrome, headless: true, args: ['--headless=new'] });
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  await p.goto(base + 'sequential-ma/', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  if (src !== '-') { await p.fill('#src', src); await p.selectOption('#f-family', family); await p.selectOption('#f-futility', futility); }
  const shown = await p.evaluate(() => document.querySelector('#looks').innerText);   // the user does NOT press Compute
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btn-r-script')]);
  await dl.saveAs(outFile);
  const after = await p.evaluate(() => document.querySelector('#looks').innerText);
  console.log(JSON.stringify({ shown, after })); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
"""


@pytest.mark.parametrize("name,src,family,futility,n", [
    ("default", "-", "OBF", "0", 21),
    ("pasted t,z OBF futility", "0.25, 1.10\n0.50, 1.85\n0.75, 2.30\n1.00, 2.45", "OBF", "1", 25),
    ("pasted y,se,n Pocock futility", "-0.10, 0.12, 100\n-0.12, 0.09, 200\n-0.11, 0.07, 350\n-0.09, 0.05, 500", "POCOCK", "1", 25),
])
def test_downloaded_script_carries_current_inputs_and_matches_in_r(server, tmp_path, name, src, family, futility, n):
    pw = _playwright_dir()
    if not pw or NODE is None or not Path(CHROME).exists():
        pytest.skip("node + playwright-core + Chrome needed for the browser user path")
    f = tmp_path / "check.R"
    r = subprocess.run([NODE, "-e", BROWSER_JS, pw, server, CHROME, str(f), src, family, futility], capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stderr
    script = f.read_text(encoding="utf-8")
    if src != "-":
        assert f'family <- "{family}"' in script and ("futility <- TRUE" in script) == (futility == "1")
        rows = [[float(x) for x in line.split(",")] for line in src.splitlines()]
        names = ["t_in", "z_in"] if len(rows[0]) == 2 else ["y_cum", "se_cum", "n_cum"]
        for j, nm in enumerate(names):
            got = [float(x) for x in re.search(r"^%s <- c\(([^)]*)\)" % nm, script, re.M).group(1).split(",")]
            assert got == [row[j] for row in rows], (nm, got)
    ok, total = _match(_rscript(f))
    assert ok == total == n


@pytest.mark.parametrize("name,t,family,futility", [
    ("root beside NaN grid point, 2 looks", [0.446, 0.994], "OBF", True),
    ("root beside NaN grid point, 3 looks", [0.398, 0.789, 0.975], "OBF", True),
    ("Pocock spelled as the engine accepts it", [0.3, 0.7, 1.0], "Pocock", False),
    ("Pocock spelled as the engine accepts it, futility", [0.3, 0.7, 1.0], "Pocock", True),
])
def test_r_script_agrees_for_designs_from_the_pr648_delta_review(tmp_path, name, t, family, futility):
    # Delta review of PR #648. (1) The futility inflation objective can be finite at one 0.02 grid point and NaN at
    # the next with the root in between; the R check's inflation() returned NA there (futility NOT CHECKED) and the
    # engine refused. Both now locate the edge of the finite region and test its sign. (2) The script wrote the
    # family exactly as the caller spelled it ("Pocock"), which the engine accepts case-insensitively but R's
    # switch() did not, so efficacy() stopped with "missing value where TRUE/FALSE needed". It now writes the
    # engine's normalised family. Requirement: a fresh Rscript prints a plain MATCH n/n for each.
    rows = [{"kind": "tz", "t": x, "z": z} for x, z in zip(t, [0.2, 0.9, 1.1])]
    _node_script([{"rows": rows, "alpha": 0.05, "family": family, "futility": futility}], tmp_path)
    out = _rscript(tmp_path / "case0.R")
    last = out.strip().splitlines()[-1]
    m = re.match(r"^MATCH (\d+)/(\d+)$", last)
    assert m and m.group(1) == m.group(2), out
