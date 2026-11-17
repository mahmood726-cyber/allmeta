"""R user path for surrogate-validation (lane pa6, 2026-11-17).

Requirement (pack-app user path): a user must be able to check the page in R. The page offers
"Download R script" and "Verify in R (WebR)", both running one script generated from the trials the
page has just analysed. This test drives the real page in system Chrome, downloads the script after
the user changes the inputs, checks the script carries THOSE trials (not the example), runs it in fresh
R and requires the script's own honest verdict line `MATCH n/n` (n > 0): for the example (adjusted R^2
refused) and for pasted data (adjusted R^2 reported).
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

PASTED = """4S, -1.80, -0.36, 0.080
WOSCOPS, -1.03, -0.27, 0.110
CARE, -1.03, -0.21, 0.090
LIPID, -1.00, -0.25, 0.070
HPS, -1.29, -0.27, 0.045
ASCOT, -1.07, -0.43, 0.150
JUPITER, -1.09, -0.58, 0.130
FOURIER, -1.45, -0.16, 0.040
IMPROVE-IT, -0.43, -0.07, 0.035
AIM-HIGH, -0.15, 0.03, 0.090"""


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
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/surrogate-validation/", wait_until="load", timeout=120000)
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


def test_example_script_matches(pg, tmp_path):
    pg.click("#btn-example")
    p, txt = download(pg, tmp_path, "example.R")
    assert '"Trial A"' in txt and "refused = TRUE" in txt
    last, full = run_r(p)
    assert_match(last, full)


def test_pasted_data_script_carries_inputs_and_matches(pg, tmp_path):
    pg.fill("#f-data", PASTED)
    p, txt = download(pg, tmp_path, "pasted.R")
    assert '"JUPITER"' in txt and '"Trial A"' not in txt, "script must use the pasted trials, not the example"
    assert "refused = FALSE" in txt
    last, full = run_r(p)
    assert_match(last, full)
