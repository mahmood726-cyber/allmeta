"""The page's own R path: "Download R script" / "Verify in R" (effect-size-converter/r-check.js).

Requirement (lane rp1): the script is written from the inputs the page ANALYSED (not the
example), recomputes every converted value, SE and CI (metafor escalc + the published
formulas in base R, as the P20 validation did) and the E-value widget (EValue), and ends with an honest MATCH n/n -- so a planted wrong page value must give
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
APP = "effect-size-converter"


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
    for port in range(18800, 18900):
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


CSV = "m1,sd1,n1,m2,sd2,n2\n52.5,8.2,30,47.1,7.9,30\n"


def _fresh(page):
    page.goto(page.url.split("?")[0].split("#")[0])  # drop url-state from an earlier test
    page.evaluate("try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}")
    page.reload()
    page.wait_for_selector("#results-body tr")
    for _ in range(80):
        if page.evaluate("!!(window.__escRScript && document.querySelector('#alm-csv-mount textarea'))"):
            return
        page.wait_for_timeout(250)
    raise AssertionError("page did not initialise")


def _counts(last):
    m = re.match(r"^MATCH (\d+)/(\d+)", last)
    assert m and m.group(1) == m.group(2), last
    return int(m.group(1))


@needs_evalue
def test_default_example_script_runs_and_matches(page, tmp_path):
    _fresh(page)
    script = page.evaluate("window.__escRScript()")
    assert 'type = "OR", est = 0.75, se = 0.12' in script
    lines = _run_r(script, tmp_path, "default.R")
    # 1 row-set check + 3 rows x (point, SE, lower, upper) + E-value widget (point, CI)
    assert lines[-1] == "MATCH 15/15", lines[-1]


@needs_evalue
def test_pasted_csv_row_script_follows_input_and_matches(page, tmp_path):
    _fresh(page)
    page.fill("#alm-csv-mount textarea", CSV)
    page.click("#alm-csv-mount [data-action=parse-paste]")
    page.wait_for_function("document.getElementById('in-type').value === 'SMD'") if False else page.wait_for_timeout(600)
    script = page.evaluate("window.__escRScript()")
    assert "csv <- list(m1 = 52.5, sd1 = 8.2, n1 = 30, m2 = 47.1, sd2 = 7.9, n2 = 30)" in script
    assert 'type = "SMD"' in script and 'kind = "g"' in script
    assert page.locator("#results-body tr td:nth-child(2)").first.inner_text() == "0.662"  # Hedges' g shown
    lines = _run_r(script, tmp_path, "csv.R")
    assert _counts(lines[-1]) >= 4 + 1 + 4 * 4 + 2, lines[-1]  # import checks + rows + E-value


@needs_evalue
def test_user_conversion_with_baseline_risk_and_ci(page, tmp_path):
    _fresh(page)
    page.select_option("#in-type", "OR")
    page.fill("#in-est", "1.8"); page.fill("#ctx-p0", "0.2")
    page.fill("#der-lo", "1.2"); page.fill("#der-hi", "2.7")
    page.click("#btn-derive")
    script = page.evaluate("window.__escRScript()")
    assert "est = 1.8" in script and "p0 = 0.2" in script and "ci <- c(lo = 1.2, hi = 2.7)" in script
    lines = _run_r(script, tmp_path, "or.R")
    assert any(l.startswith("SE derived from the 95% CI") and l.endswith("ok") for l in lines)
    _counts(lines[-1])


def test_inputs_are_the_analysed_ones_not_unsubmitted_edits(page):
    _fresh(page)
    page.fill("#in-est", "3.3")  # typed but not converted: the table still shows OR 0.75
    assert "est = 0.75," in page.evaluate("window.__escRScript()")


def test_planted_wrong_page_value_gives_mismatch(page, tmp_path):
    _fresh(page)
    script = page.evaluate("window.__escRScript()")
    planted = script.replace("point = c(0.75,", "point = c(0.750001,")
    assert planted != script
    lines = _run_r(planted, tmp_path, "planted.R")
    assert lines[-1].startswith("MISMATCH"), lines[-1]


def test_without_evalue_e_value_lines_are_reported_not_checked(page, tmp_path):
    """As in WebR, where EValue is absent: the E-value lines must say NOT CHECKED, not pass."""
    _fresh(page)
    script = page.evaluate("window.__escRScript()").replace('requireNamespace("EValue", quietly = TRUE)', 'requireNamespace("EValue.absent.for.test", quietly = TRUE)')
    lines = _run_r(script, tmp_path, "noev.R")
    assert lines[-1] == "MATCH 13/13 (2 more NOT CHECKED: see above)", lines[-1]
    assert sum("NOT CHECKED (package EValue is not installed)" in l for l in lines) == 2


@needs_evalue
@pytest.mark.parametrize("field,value", [("ctx-sd", "10"), ("der-n1", "40")])
def test_csv_import_then_edited_context_is_not_claimed_as_the_import(page, tmp_path, field, value):
    """Review r627 finding 4: after a CSV import, editing the pooled SD or a group size (with g/SE
    unchanged) changes the table; the script must check the table as shown, not assert the import."""
    _fresh(page)
    page.fill("#alm-csv-mount textarea", CSV)
    page.click("#alm-csv-mount [data-action=parse-paste]")
    page.wait_for_timeout(600)
    page.fill("#" + field, value)
    page.click("#btn-convert")
    script = page.evaluate("window.__escRScript()")
    assert ("sd = 10," if field == "ctx-sd" else "n1 = 40,") in script
    lines = _run_r(script, tmp_path, "csv_edited.R")
    assert not any("DIFFERS" in l for l in lines), [l for l in lines if "DIFFERS" in l]
    _counts(lines[-1])


@needs_evalue
def test_ratio_ci_on_log_scale_option_is_rederived_on_the_log_scale(page, tmp_path):
    """Review r627 finding 2 (refuted by execution): "CI is on: log scale" means ratio-scale bounds that
    the page log-transforms (deriveSE uses log(hi) - log(lo)), so R's log(hi) - log(lo) is the same rule."""
    _fresh(page)
    page.select_option("#in-type", "OR")
    page.fill("#in-est", "0.75"); page.select_option("#der-scale", "log")
    page.fill("#der-lo", "0.6"); page.fill("#der-hi", "0.95")
    page.click("#btn-derive")
    script = page.evaluate("window.__escRScript()")
    assert 'check("SE derived from the 95% CI", (log(ci[["hi"]]) - log(ci[["lo"]])) / (2 * z), inp$se)' in script
    lines = _run_r(script, tmp_path, "logci.R")
    assert any(l.startswith("SE derived from the 95% CI") and l.endswith("ok") for l in lines)
    _counts(lines[-1])
