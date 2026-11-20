"""The page's own R path: "Download R script" / "Verify in R" (median-to-mean/r-check.js).

Requirement (lane rp1): the script is written from the inputs the page ANALYSED (not the
example), recomputes every displayed mean/SD with the published Wan/Luo/Shi formulas in
base R, and ends with an honest MATCH n/n -- so a planted wrong page value must give
MISMATCH. Runs the real page in headless Chrome and the script in fresh Rscript.
Needs: python playwright + a Chrome/Chromium, and Rscript (env RSCRIPT, PATH, or the
standard Windows install). Skips, never passes, when either is missing.
"""
import functools
import glob
import http.server
import os
import re
import shutil
import socket
import subprocess
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = "median-to-mean"


def _rscript():
    cands = [os.environ.get("RSCRIPT"), shutil.which("Rscript")] + sorted(glob.glob("C:/Program Files/R/R-*/bin/Rscript.exe"), reverse=True)
    return next((c for c in cands if c and Path(c).exists()), None)


RSCRIPT = _rscript()
sync_playwright = pytest.importorskip("playwright.sync_api").sync_playwright
pytestmark = pytest.mark.skipif(RSCRIPT is None, reason="Rscript not found")


def _free_port():
    for port in range(18600, 18700):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port")


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def page():
    port = _free_port()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(_Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        try:
            br = p.chromium.launch(channel="chrome", headless=True)
        except Exception:
            try:
                br = p.chromium.launch(headless=True)
            except Exception as e:  # no browser: skip, never pass
                pytest.skip(f"no Chromium available: {e}")
        pg = br.new_page()
        pg.goto(f"http://127.0.0.1:{port}/{APP}/")
        pg.wait_for_selector("#results-body tr")
        yield pg
        br.close()
    srv.shutdown()


def _run_r(script, tmp_path, name):
    f = tmp_path / name
    f.write_text(script, encoding="utf-8", newline="\n")
    r = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stdout + r.stderr
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return lines


def _set(page, **fields):
    for k, v in fields.items():
        if k == "scenario":
            page.select_option("#scenario", v)
        else:
            page.fill("#" + k, v)
    page.click("#btn-run")


def test_default_example_script_runs_and_matches(page, tmp_path):
    page.reload(); page.wait_for_selector("#results-body tr")
    script = page.evaluate("window.__almM2MRScript()")
    assert "scenario = \"C1\", n = 50, a = 2.1, q1 = 3.5, m = 4.8, q3 = 6.1, b = 9.9" in script
    lines = _run_r(script, tmp_path, "default.R")
    assert re.match(r"^MATCH (\d+)/\1\b", lines[-1]), lines[-1]
    assert int(re.match(r"^MATCH (\d+)", lines[-1]).group(1)) >= 8  # refusal + rows + 3 rows x (mean, SD)
    assert not any("DIFFERS" in l for l in lines)


def test_script_follows_user_input_and_matches(page, tmp_path):
    page.reload(); page.wait_for_selector("#results-body tr")
    _set(page, scenario="C3", n="120", q1="30", m="42", q3="58")
    script = page.evaluate("window.__almM2MRScript()")
    assert "scenario = \"C3\", n = 120" in script and "q1 = 30, m = 42, q3 = 58" in script
    shown = page.locator("#results-body tr td:nth-child(3)").first.inner_text()
    assert shown == "43.333"  # Wan C3 mean (q1+m+q3)/3 as displayed
    lines = _run_r(script, tmp_path, "user.R")
    assert re.match(r"^MATCH (\d+)/\1\b", lines[-1]), lines[-1]


def test_inputs_are_the_analysed_ones_not_unsubmitted_edits(page):
    page.reload(); page.wait_for_selector("#results-body tr")
    page.fill("#n", "999")  # typed but not estimated: the table still shows n = 50
    assert ", n = 50," in page.evaluate("window.__almM2MRScript()")


def test_refused_sample_size_is_checked_as_a_refusal(page, tmp_path):
    page.reload(); page.wait_for_selector("#results-body tr")
    _set(page, n="0")
    script = page.evaluate("window.__almM2MRScript()")
    assert "page_refused <- TRUE" in script
    lines = _run_r(script, tmp_path, "refused.R")
    # R must agree that the input is refused (that line is "ok") ...
    assert any(l.startswith("refuses the sample size (1 = yes)") and l.rstrip().endswith("ok") for l in lines), lines
    # ... but agreeing on a refusal compares no estimate, so the verdict is NOT CHECKED, never MATCH.
    # (This assertion used to require "MATCH 1/1", i.e. it defended a MATCH computed from a refusal alone.)
    assert lines[-1].startswith("NOT CHECKED"), lines[-1]


def test_planted_wrong_page_value_gives_mismatch(page, tmp_path):
    page.reload(); page.wait_for_selector("#results-body tr")
    script = page.evaluate("window.__almM2MRScript()")
    planted = re.sub(r"(mean = c\()([0-9.]+)", lambda m: m.group(1) + repr(float(m.group(2)) + 1e-6), script, count=1)
    assert planted != script
    lines = _run_r(planted, tmp_path, "planted.R")
    assert lines[-1].startswith("MISMATCH"), lines[-1]
    assert any("DIFFERS" in l for l in lines)


# Requirement (P24 limitation L03): a sample size the page cannot represent exactly (above 2^53 - 1), or so
# large that the range divisor 2*qnorm((n - 0.375)/(n + 0.25)) is infinite in double precision (from about
# n = 5e15 the quantile argument rounds to 1), must be REFUSED, not shown as an SD of 0.000 from the range
# term. The R script must agree that it is refused. Control: n = 10^12 (the archived validation's largest
# probe, P04) is still estimated and still MATCHes in R.
@pytest.mark.parametrize("scenario,nval", [("C2", "10000000000000000"), ("C1", "5000000000000000"), ("C3", "9007199254740993")])
def test_unrepresentable_sample_size_is_refused(page, tmp_path, scenario, nval):
    page.reload(); page.wait_for_selector("#results-body tr")
    _set(page, scenario=scenario, n=nval)
    assert page.locator("#results-body tr").count() == 0, page.locator("#results-body").inner_text()
    assert "too large" in page.locator("#warn-slot").inner_text()
    script = page.evaluate("window.__almM2MRScript()")
    assert "page_refused <- TRUE" in script
    lines = _run_r(script, tmp_path, "huge.R")
    assert any(l.startswith("refuses the sample size (1 = yes)") and l.rstrip().endswith("ok") for l in lines), lines
    assert lines[-1].startswith("NOT CHECKED"), lines[-1]


def test_largest_archived_sample_size_still_estimated(page, tmp_path):
    page.reload(); page.wait_for_selector("#results-body tr")
    _set(page, scenario="C1", n="1000000000000", a="1", q1="3", m="5", q3="7", b="9")
    assert page.locator("#results-body tr").count() == 3
    lines = _run_r(page.evaluate("window.__almM2MRScript()"), tmp_path, "p04.R")
    assert re.match(r"^MATCH (\d+)/\1\b", lines[-1]), lines[-1]
