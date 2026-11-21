"""Limitation repairs for benefit-risk (limitation sweep LIM-P54, 20 Nov 2026), in the real page.

Each test states a requirement the page did not meet (fail-before recorded by the lim7 lane). Drives
system Chrome through playwright (Python), serving this checkout on an ephemeral 127.0.0.1 port.
"""
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")

CRIT = "wl, Weight loss, benefit, 0.6\nna, Nausea, harm, 0.4"
PERF = "A, wl, 17.8, 0.7\nA, na, 24, 2\nB, wl, 12.4, 0.6\nB, na, 20, 2"


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
    page = br.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.errs = errs
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/benefit-risk/", wait_until="load", timeout=120000)
    yield page
    br.close()
    pw.stop()
    srv.shutdown()


def test_L06_duplicate_and_unknown_cells_are_refused_and_constructor_is_a_name(pg):
    """L06: a treatment named "constructor" crashed the parser (plain {} map inherits Object.prototype);
    a repeated criterion id counted the same cells twice; a repeated performance row silently overwrote
    the first; a row for an undeclared criterion created an incomplete treatment. Requirement: names are
    plain data, and duplicate/undeclared rows are refused with a message naming them."""
    pg.fill("#f-criteria", CRIT)
    pg.fill("#f-perf", PERF.replace("B,", "constructor,"))
    assert pg.errs == [], pg.errs
    assert pg.evaluate("() => window.__lastBR && window.__lastBR.smaa.map(s => s.name).sort()") == ["A", "constructor"]
    pg.fill("#f-criteria", CRIT + "\nwl, Weight loss again, benefit, 0.6")
    assert "duplicate criterion" in pg.text_content("#summary").lower()
    assert pg.evaluate("() => window.__lastBR") is None
    pg.fill("#f-criteria", CRIT)
    pg.fill("#f-perf", PERF + "\nA, wl, 1.0, 0.1")
    assert "duplicate" in pg.text_content("#summary").lower() and pg.evaluate("() => window.__lastBR") is None
    # A row for an undeclared criterion is NOT a reason to refuse: the engine and the R script read only the
    # declared criteria's cells (perf[criteria[i].id]), so main analysed it and the result is unchanged.
    # Requirement (review of PR 649): analyse as before, and warn, naming the row. (This test first asserted a
    # refusal, which defended a regression.)
    pg.fill("#f-perf", PERF)
    ref = pg.evaluate("() => JSON.stringify(window.__lastBR.smaa)")
    pg.fill("#f-perf", PERF + "\nA, xx, 1.0, 0.1")
    assert pg.evaluate("() => JSON.stringify(window.__lastBR && window.__lastBR.smaa)") == ref
    assert "xx" in pg.text_content("#summary") and "ignored" in pg.text_content("#summary").lower()
    # the example with one criterion commented out but its rows kept still analyses, with a warning
    pg.fill("#f-criteria", "wl, Weight loss, benefit, 0.6\n# na, Nausea, harm, 0.4")
    pg.fill("#f-perf", PERF)
    assert pg.evaluate("() => window.__lastBR && window.__lastBR.smaa.length") == 2
    assert "\u201cna\u201d" in pg.text_content("#summary")


def test_L11_equal_leaders_are_all_named(pg):
    """L11: the headline showed only the first of several treatments with the same P(best), so the named
    leader depended on input order. Requirement: every treatment sharing the top P(best) is named."""
    pg.fill("#f-criteria", "wl, Weight loss, benefit, 1")
    pg.fill("#f-perf", "A, wl, 5\nB, wl, 5\nC, wl, 1")
    big = pg.text_content("#summary .big")
    assert "A" in big and "B" in big, big


def test_L16_refused_run_clears_charts_and_r_verdict(pg):
    """L16: a run refused by the engine (a missing cell) left the previous charts on screen, and a new run
    left an earlier R verdict displayed. Requirement: every new run clears the R output, and a refusal
    clears the charts."""
    pg.fill("#f-criteria", CRIT)
    pg.fill("#f-perf", PERF)
    assert pg.inner_html("#smaa-bars") != ""
    pg.evaluate("""() => { const o = document.getElementById("r-out"); o.textContent = "MATCH 20/20"; o.hidden = false;
                           document.getElementById("r-status").textContent = "MATCH 20/20"; }""")
    pg.fill("#f-perf", "A, wl, 17.8, 0.7\nA, na, 24, 2\nB, wl, 12.4, 0.6")
    assert pg.evaluate("() => window.__lastBR") is None
    assert pg.inner_html("#smaa-bars") == "" and pg.inner_html("#det-bars") == ""
    assert pg.evaluate("() => document.getElementById('r-out').hidden")
    assert "MATCH" not in pg.text_content("#r-status")
