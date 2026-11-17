"""The page's own R path: "Download R script" / "Verify in R" (evalue/r-check.js).

Requirement (lane rp1): the script is written from the inputs the page ANALYSED (not the
example), recomputes every displayed number with the R package EValue (as the P22
validation did), and ends with an honest MATCH n/n -- so a planted wrong page value must give
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
APP = "evalue"


def _rscript():
    cands = [os.environ.get("RSCRIPT"), shutil.which("Rscript")] + sorted(glob.glob("C:/Program Files/R/R-*/bin/Rscript.exe"), reverse=True)
    return next((c for c in cands if c and Path(c).exists()), None)


RSCRIPT = _rscript()
sync_playwright = pytest.importorskip("playwright.sync_api").sync_playwright
pytestmark = pytest.mark.skipif(RSCRIPT is None, reason="Rscript not found")


def _has_evalue():
    if RSCRIPT is None:
        return False
    r = subprocess.run([RSCRIPT, "--vanilla", "-e", "cat(requireNamespace('EValue', quietly=TRUE))"], capture_output=True, text=True, timeout=120)
    return r.stdout.strip().endswith("TRUE")


HAS_EVALUE = _has_evalue()
needs_evalue = pytest.mark.skipif(not HAS_EVALUE, reason="R package EValue not installed (set R_LIBS)")


def _free_port():
    for port in range(18700, 18800):
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
        pg.wait_for_selector("#tbody tr")
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
        if k == "measure":
            page.select_option("#measure", v)
        elif k == "rare":
            page.set_checked("#rare", v)
        else:
            page.fill("#" + k, v)


def _fresh(page):
    page.reload(); page.wait_for_selector("#tbody tr")


@needs_evalue
def test_default_example_script_runs_and_matches(page, tmp_path):
    _fresh(page)
    script = page.evaluate("window.__almEValueRScript()")
    assert 'measure = "RR", point = 2, lo = 1.5, hi = 2.7' in script
    lines = _run_r(script, tmp_path, "default.R")
    assert lines[-1] == "MATCH 5/5", lines[-1]


@needs_evalue
def test_script_follows_user_input_and_matches(page, tmp_path):
    _fresh(page)
    _set(page, measure="HR", point="0.72", lo="0.58", hi="0.89")
    script = page.evaluate("window.__almEValueRScript()")
    assert 'measure = "HR", point = 0.72, lo = 0.58, hi = 0.89' in script
    assert page.locator("#tbody td.big").first.inner_text() == "1.8215"
    lines = _run_r(script, tmp_path, "hr.R")
    assert lines[-1] == "MATCH 5/5", lines[-1]


@needs_evalue
def test_risk_difference_counts_match(page, tmp_path):
    _fresh(page)
    _set(page, measure="RD", n11="40", n10="60", n01="20", n00="80", truev="0.05")
    script = page.evaluate("window.__almEValueRScript()")
    assert "n11 = 40, n10 = 60, n01 = 20, n00 = 80" in script and "true = 0.05" in script
    lines = _run_r(script, tmp_path, "rd.R")
    assert lines[-1] == "MATCH 6/6", lines[-1]


@needs_evalue
def test_planted_wrong_page_value_gives_mismatch(page, tmp_path):
    _fresh(page)
    script = page.evaluate("window.__almEValueRScript()")
    planted = script.replace("e_point = 3.414213562373095", "e_point = 3.414214562373095")
    assert planted != script
    lines = _run_r(planted, tmp_path, "planted.R")
    assert lines[-1].startswith("MISMATCH"), lines[-1]


def test_without_evalue_the_script_says_so_and_does_not_match(page, tmp_path):
    """Run with an R library path that cannot contain EValue: no MATCH may be claimed."""
    _fresh(page)
    script = page.evaluate("window.__almEValueRScript()")
    f = tmp_path / "noev.R"
    f.write_text(script.replace('requireNamespace("EValue", quietly = TRUE)', 'requireNamespace("EValue.absent.for.test", quietly = TRUE)'), encoding="utf-8")
    r = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=120)
    last = [l for l in r.stdout.splitlines() if l.strip()][-1]
    assert last.startswith("MISMATCH (nothing could be checked)"), last
    assert "NOT CHECKED (package EValue is not installed)" in r.stdout


def test_refused_input_writes_no_script(page):
    _fresh(page)
    _set(page, point="2", lo="2.5", hi="3")  # CI excludes the estimate: the page refuses
    with pytest.raises(Exception, match="nothing to check"):
        page.evaluate("window.__almEValueRScript()")


@pytest.mark.parametrize("cells,tv", [(("20", "80", "40", "60"), ""), (("40", "60", "20", "80"), "0.3")])
def test_risk_difference_at_or_below_true_value_writes_no_script(page, cells, tv):
    """Review r627 finding 1 (refuted by execution): the page refuses an RD at or below the true
    value (EValue requires relabelling), so no bias factor is shown and no script is written."""
    _fresh(page)
    _set(page, measure="RD", n11=cells[0], n10=cells[1], n01=cells[2], n00=cells[3], truev=tv)
    assert page.locator("#tbody").inner_text().startswith("Analysis refused")
    with pytest.raises(Exception, match="nothing to check"):
        page.evaluate("window.__almEValueRScript()")
