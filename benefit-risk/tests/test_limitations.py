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
    pg.fill("#f-perf", PERF + "\nA, xx, 1.0, 0.1")
    assert "xx" in pg.text_content("#summary") and pg.evaluate("() => window.__lastBR") is None
