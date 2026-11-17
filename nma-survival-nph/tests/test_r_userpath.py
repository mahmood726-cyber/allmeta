"""R user path for nma-survival-nph (lane pa6, 2026-11-17).

Requirement (pack-app user path): a user must be able to check the page in R. The page offers
"Download R script" and "Verify in R (WebR)", both running one script generated from the inputs the
page has just analysed. This test drives the real page in system Chrome, downloads the script after
the user changes the inputs, checks the script carries THOSE inputs (not the example), runs it in
fresh R and requires the script's own honest verdict line `MATCH n/n` (n > 0) — for the default
example, for pasted data with fixed effect, and for pasted heterogeneous data under REML (multi-arm
covariance path, metafor::rma.mv) and DerSimonian-Laird (netmeta).
"""
import os
import re
import shutil
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
RSCRIPT = os.environ.get("ALM_RSCRIPT", "C:/Program Files/R/R-4.6.0/bin/Rscript.exe")

PASTED = """T1, placebo, 1, 52, 1450
T1, drugX, 1, 31, 1480
T2, placebo, 1, 61, 1210
T2, drugX, 1, 49, 1230
T3, placebo, 1, 40, 980
T3, drugY, 1, 22, 1005
T4, drugX, 1, 35, 1100
T4, drugY, 1, 30, 1120
T5, placebo, 1, 70, 1600
T5, drugY, 1, 33, 1630
T1, placebo, 2, 30, 1100
T1, drugX, 2, 29, 1200
T2, placebo, 2, 44, 950
T2, drugX, 2, 26, 1010
T3, placebo, 2, 25, 780
T3, drugY, 2, 27, 840
T4, drugX, 2, 22, 900
T4, drugY, 2, 31, 930
T5, placebo, 2, 41, 1300
T5, drugY, 2, 38, 1390"""

# heterogeneous, with one three-arm study (M7) so tau^2 > 0 and the multi-arm covariance is exercised
HET = """T1, placebo, 1, 52, 1450
T1, drugX, 1, 21, 1480
T2, placebo, 1, 61, 1210
T2, drugX, 1, 58, 1230
T3, placebo, 1, 40, 980
T3, drugY, 1, 12, 1005
T5, placebo, 1, 70, 1600
T5, drugY, 1, 62, 1630
M7, placebo, 1, 48, 1000
M7, drugX, 1, 30, 990
M7, drugY, 1, 41, 1010
T1, placebo, 2, 30, 1100
T1, drugX, 2, 29, 1200
T2, placebo, 2, 44, 950
T2, drugX, 2, 16, 1010
T3, placebo, 2, 25, 780
T3, drugY, 2, 37, 840
T5, placebo, 2, 41, 1300
T5, drugY, 2, 18, 1390
M7, placebo, 2, 33, 800
M7, drugX, 2, 31, 790
M7, drugY, 2, 20, 805"""


@pytest.fixture(scope="module")
def pg():
    sync_api = pytest.importorskip("playwright.sync_api")
    if not CHROME.exists():
        pytest.skip("system Chrome not found")

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    pw = sync_api.sync_playwright().start()
    br = pw.chromium.launch(executable_path=str(CHROME), headless=True)
    ctx = br.new_context(accept_downloads=True)
    page = ctx.new_page()
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/nma-survival-nph/", wait_until="load", timeout=120000)
    page.wait_for_selector("#rv-download")
    yield page
    br.close()
    pw.stop()
    srv.shutdown()


def download(pg, tmp_path, name):
    with pg.expect_download() as dl:
        pg.click("#rv-download")
    p = tmp_path / name
    dl.value.save_as(str(p))
    return p, p.read_text(encoding="utf-8")


def run_r(path):
    if not Path(RSCRIPT).exists():
        pytest.skip("Rscript not found")
    env = dict(os.environ, R_ENVIRON_USER=os.environ.get("ALM_R_ENVIRON_USER", "C:/Users/mahmo/wt/empty.Renviron"),
               R_LIBS=os.environ.get("ALM_R_LIBS", "C:/Users/mahmo/wt/rlib2"))
    r = subprocess.run([RSCRIPT, "--vanilla", str(path)], capture_output=True, text=True, timeout=300, env=env)
    out = r.stdout.strip().splitlines()
    assert r.returncode == 0, r.stdout + r.stderr
    return out[-1] if out else "", r.stdout


def assert_match(last, full):
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", last)
    assert m and m.group(1) == m.group(2) and int(m.group(2)) > 0, full


def test_default_example_script_matches(pg, tmp_path):
    p, txt = download(pg, tmp_path, "default.R")
    assert '"s1", "s1", "s2"' in txt and 'model <- "fe"' in txt
    last, full = run_r(p)
    assert_match(last, full)


def test_pasted_data_script_carries_inputs_and_matches(pg, tmp_path):
    pg.fill("#data", PASTED)
    pg.select_option("#model", "fe")
    p, txt = download(pg, tmp_path, "pasted.R")
    assert '"T5"' in txt and "1630" in txt and '"s1"' not in txt, "script must use the pasted rows, not the example"
    last, full = run_r(p)
    assert_match(last, full)


@pytest.mark.parametrize("method", ["REML", "DL", "ML"])
def test_heterogeneous_random_effects_script_matches(pg, tmp_path, method):
    pg.fill("#data", HET)
    pg.select_option("#model", "re")
    pg.select_option("#tau-method", method)
    p, txt = download(pg, tmp_path, f"het-{method}.R")
    assert '"M7"' in txt and f'method <- "{method}"' in txt and 'model <- "re"' in txt
    last, full = run_r(p)
    assert_match(last, full)
    assert "tau2" in full


def no_download(pg):
    """Click Download R script and return the status text; fail if a script is produced."""
    got = []
    pg.once("download", lambda d: got.append(d))
    pg.click("#rv-download")
    pg.wait_for_timeout(1500)
    assert not got, "a script was downloaded although the page shows no result for the current input"
    return pg.text_content("#rv-status")


@pytest.mark.parametrize("bad", ["", "T9, A, 1, 3, 0\nT9, B, 1, 4, 0"], ids=["empty", "zero-person-time"])
def test_failed_fit_refuses_stale_script(pg, bad):
    # Requirement: the R check describes the CURRENT input. After a fit fails, the page shows an error and no
    # table, so neither control may produce a script built from the previous (successful) analysis.
    pg.fill("#data", PASTED)
    pg.select_option("#model", "fe")
    pg.click("#run")
    pg.fill("#data", bad)
    pg.click("#run")
    assert pg.text_content("#out") == ""
    assert "no current result" in no_download(pg).lower()
    pg.click("#rv-run")
    assert "no current result" in pg.text_content("#rv-status").lower()


def test_treatment_label_cannot_break_out_of_an_r_comment(pg):
    # Requirement: user text never reaches the script outside a quoted R string. The reference label is
    # written into a comment line; a line break inside it must not start a new line of R code.
    pg.fill("#data", PASTED)
    pg.click("#run")
    txt = pg.evaluate("""() => { const s = window.__almNphLast; s.rows[0].treatment = 'Aa' + String.fromCharCode(10) + 'cat("PWN")';
                                 return AlmNphRVerify.buildScript(); }""")
    assert not any(line.lstrip().startswith('cat("PWN")') for line in txt.splitlines()), txt[:1500]


def test_nothing_estimated_is_not_checked_never_match(pg, tmp_path):
    # Requirement: MATCH means at least one estimate was computed on both sides and agreed. A disconnected
    # network gives no estimate on the page, and netmeta refuses it too; agreement on that refusal alone
    # is not a check, so the verdict must be NOT CHECKED, never MATCH.
    pg.fill("#data", "T9, A, 1, 3, 100\nT9, B, 1, 4, 100\nT8, C, 1, 3, 100\nT8, D, 1, 5, 100")
    pg.select_option("#model", "fe")
    p, txt = download(pg, tmp_path, "disconnected.R")
    assert '"T8"' in txt
    last, full = run_r(p)
    assert last.startswith("NOT CHECKED: no estimate"), full
    assert "MATCH" not in last, full
