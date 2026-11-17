"""R user path for km-reconstructor (lane pa6, 2026-11-17).

Requirement (pack-app user path): a user must be able to check the page in R. The page offers
"Download R script" and "Verify in R (WebR)", both running one script generated from the inputs the
page has just reconstructed from. This test drives the real page in system Chrome, downloads the script
after the user changes the inputs, checks the script carries THOSE inputs (not the example), runs it in
fresh R and requires the script's own honest verdict line `MATCH n/n` (n > 0): the default example,
a pasted curve + at-risk table, and the fusion source with a reported total-events constraint.
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

CURVE = """0, 1.00
3, 0.93
6, 0.84
9, 0.76
12, 0.69
15, 0.62
18, 0.57
21, 0.52
24, 0.47
30, 0.40
36, 0.33"""
RISK = """0, 320
6, 262
12, 205
18, 160
24, 121
30, 82
36, 44"""


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
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/km-reconstructor/", wait_until="load", timeout=120000)
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
    assert 'source <- "digitized"' in txt and "n = c(200, 165" in txt
    last, full = run_r(p)
    assert_match(last, full)


def test_pasted_data_script_carries_inputs_and_matches(pg, tmp_path):
    pg.fill("#curve", CURVE)
    pg.fill("#risk", RISK)
    p, txt = download(pg, tmp_path, "pasted.R")
    assert "n = c(320, 262" in txt and "n = c(200" not in txt, "script must use the pasted inputs, not the example"
    last, full = run_r(p)
    assert_match(last, full)


def test_fusion_with_total_events_script_matches(pg, tmp_path):
    pg.fill("#curve", CURVE)
    pg.fill("#risk", RISK)
    pg.select_option("#curve-source", "fusion")
    pg.fill("#anchors", """0, 1.00
6, 0.85
12, 0.70
24, 0.48
36, 0.34""")
    pg.fill("#tot-events", "180")
    p, txt = download(pg, tmp_path, "fusion.R")
    assert 'source <- "fusion"' in txt and "totEvents <- 180" in txt
    last, full = run_r(p)
    assert_match(last, full)


def test_curve_reaching_zero_before_the_last_point_runs_and_matches(pg, tmp_path):
    # Requirement: the script must finish with a verdict on any input the page accepts. Here survival hits
    # 0 at t=12 and stays there, so the page computes 0/0 at t=18. The page still shows N 100, 100 events
    # and median 3.0, and R must reproduce that rather than stop with an error.
    nl = chr(10)
    pg.select_option("#curve-source", "digitized")
    pg.fill("#tot-events", "")
    pg.fill("#curve", nl.join(["0, 1.0", "6, 0.4", "12, 0.0", "18, 0.0"]))
    pg.fill("#risk", nl.join(["0, 100", "6, 40", "12, 5", "18, 0"]))
    p, txt = download(pg, tmp_path, "zero.R")
    last, full = run_r(p)
    assert_match(last, full)


def _km_inputs(pg, curve, risk, tot="", source="digitized", anchors=None):
    nl = chr(10)
    pg.select_option("#curve-source", source)
    if anchors is not None:
        pg.fill("#anchors", nl.join(anchors))
    pg.fill("#tot-events", tot)
    pg.fill("#curve", nl.join(curve))
    pg.fill("#risk", nl.join(risk))


def _r_value(full, quantity):
    for ln in full.splitlines():
        if ln.startswith(quantity):
            return float(ln.split("R=")[1].split()[0])
    raise AssertionError(f"{quantity} not in R output:\n{full}")


def test_zero_survival_with_reported_total_events_finishes_and_reconstructs(pg, tmp_path):
    # Requirement: with a finite total-events target, an interval the heuristic cannot define (0/0 once
    # survival is 0) must not wipe the intervals that are defined. R must finish with a verdict and keep the
    # 100 subjects, re-split to the reported 95 events. Whether the verdict is MATCH depends on the page
    # doing the same (at the time of writing it shows N 0: a page defect, reported, not defended here).
    _km_inputs(pg, ["0, 1.0", "6, 0.4", "12, 0.0", "18, 0.0"], ["0, 100", "6, 40", "12, 5", "18, 0"], tot="95")
    p, txt = download(pg, tmp_path, "zero95.R")
    last, full = run_r(p)
    assert last.startswith(("MATCH", "MISMATCH")), full
    assert _r_value(full, "Reconstructed N") == 100, full
    assert _r_value(full, "Total events") == 95, full


def test_fusion_with_no_anchors_runs_and_matches(pg, tmp_path):
    # Requirement: an empty input list must stay a typed empty vector in R (numeric(0), not NULL).
    _km_inputs(pg, ["0, 1.00", "6, 0.8", "12, 0.6", "24, 0.4"], ["0, 100", "12, 60", "24, 30"],
               source="fusion", anchors=[])
    p, txt = download(pg, tmp_path, "fusion-empty.R")
    assert "numeric(0)" in txt
    last, full = run_r(p)
    assert_match(last, full)


def test_nobody_at_risk_is_not_checked(pg, tmp_path):
    # Requirement: with 0 at risk nothing is reconstructed on either side; that is NOT CHECKED, not an error
    # and not MATCH.
    _km_inputs(pg, ["0, 1.00", "6, 0.8", "12, 0.6"], ["0, 0", "6, 0", "12, 0"])
    p, txt = download(pg, tmp_path, "nobody.R")
    last, full = run_r(p)
    assert last.startswith("NOT CHECKED: no estimate"), full
