"""Limitation repairs for surrogate-validation (limitation sweep LIM-P52, 20 Nov 2026), in the real page.

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

EX = "Trial A, -9.4, -0.21, 0.06\nTrial B, -4.3, -0.26, 0.11\nTrial C, -8.7, -0.30, 0.18\nTrial D, -7.0, -0.18, 0.09"


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
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/surrogate-validation/", wait_until="load", timeout=120000)
    yield page
    br.close()
    pw.stop()
    srv.shutdown()


def analysed(pg):
    return pg.evaluate("() => (window.__lastSurrogatePairs || []).map(p => [p.label, p.s, p.f, p.seF])")


def test_F01_quoted_labels_and_wrong_field_counts(pg):
    """F01: rows were split on every comma, so a quoted label "Smith, 2020" shifted the fields (its year
    became the surrogate effect), and surplus fields were silently ignored. Requirement: a quoted field
    keeps its commas, and a row without exactly 4 fields is refused and named by line."""
    pg.fill("#f-data", EX + '\n"Smith, 2020", -5.0, -0.20, 0.10\nTrial X, -3.0, -0.10, 0.10, 99')
    rows = analysed(pg)
    assert ["Smith, 2020", -5.0, -0.2, 0.1] in rows, rows
    assert not any(r[0] == "Trial X" for r in rows), rows
    assert "line 6" in pg.text_content("#input-issues"), pg.text_content("#input-issues")


def test_F02_numeric_prefixes_are_not_numbers(pg):
    """F02: parseFloat read "1kg" as 1 and "-0.2 (log HR)" as -0.2. Requirement: a field must be a whole
    decimal/scientific number; anything else refuses the row, named by line."""
    pg.fill("#f-data", EX + "\nTrial K, -3kg, -0.10, 0.10")
    rows = analysed(pg)
    assert not any(r[0] == "Trial K" for r in rows), rows
    assert "line 5" in pg.text_content("#input-issues"), pg.text_content("#input-issues")
