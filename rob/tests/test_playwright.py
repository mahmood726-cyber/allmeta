"""Playwright UI tests for the /rob/ app.

Served over HTTP (not file://) so the same-origin '../shared/' scripts and the
CSP resolve exactly as in production. Skips cleanly if Playwright/Chromium are
not installed.
"""
import functools
import http.server
import socket
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent.parent  # F:/allmeta

playwright_sync = pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402


@pytest.fixture(scope="module")
def app_url():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = httpd.socket.getsockname()[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{port}"
    httpd.shutdown()


@pytest.fixture(scope="module")
def browser():
    try:
        with sync_playwright() as p:
            try:
                b = p.chromium.launch()
            except Exception as e:  # browser binary missing
                pytest.skip(f"chromium not available: {e}")
            yield b
            b.close()
    except Exception as e:
        pytest.skip(f"playwright unavailable: {e}")


@pytest.fixture()
def page(browser, app_url):
    pg = browser.new_page()
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(app_url + "/rob/index.html")
    pg.wait_for_function("window.__almRob !== undefined")
    pg._errors = errors
    yield pg
    pg.close()


def test_loads_clean(page):
    assert "Risk of Bias" in page.title()
    assert page._errors == [], f"console errors: {page._errors}"


def test_demo_low_risk_suggests_low(page):
    page.click("#btn-demo")
    page.wait_for_selector(".study-card")
    # the demo text is a textbook low-risk RCT -> overall low
    overall = page.eval_on_selector(".overall", "el => el.textContent")
    assert "Low" in overall, f"demo overall was {overall!r}"
    # at least one supporting sentence is shown with its cue
    assert page.query_selector(".support .cue") is not None


def test_engine_via_hook(page):
    # exercise the real engine through the page's test hook
    j = page.evaluate("() => window.__almRob.predict('the allocation sequence was computer-generated', "
                      "'random sequence generation (selection bias)').judgment")
    assert j == "low"
    j2 = page.evaluate("() => window.__almRob.predict('allocation by alternation on date of birth', "
                       "'random sequence generation (selection bias)').judgment")
    assert j2 == "high"


def test_confirm_flow_and_outputs(page):
    page.click("#btn-demo")
    page.wait_for_selector(".study-card")
    # outputs (table + traffic light) render
    assert page.query_selector("#rob-table tr") is not None
    assert page.eval_on_selector("#traffic", "el => el.querySelectorAll('circle').length") > 0
    # before confirm: at least one 'suggested' tag
    assert page.query_selector(".state-tag.suggested") is not None
    # confirm all -> tags flip to confirmed
    page.click("[data-act='confirm-all']")
    page.wait_for_selector(".state-tag.confirmed")
    status = page.eval_on_selector("#confirm-status", "el => el.textContent")
    assert "confirmed" in status.lower()


def test_override_changes_verdict(page):
    page.click("#btn-demo")
    page.wait_for_selector(".study-card")
    # override D1 to High via the select
    sel = page.query_selector("[data-act='verdict'][data-d='D1']")
    sel.select_option("high")
    page.wait_for_timeout(150)
    v = page.evaluate("() => window.__almRob.verdict(0, 'D1')")
    assert v == "high"


def test_push_synthesis_writes_envelope(page):
    page.click("#btn-demo")
    page.wait_for_selector(".study-card")
    page.evaluate("() => localStorage.removeItem('rob-assessments-v1')")
    page.once("dialog", lambda d: d.accept())
    page.click("#btn-push-synth")
    page.wait_for_timeout(200)
    env = page.evaluate("() => localStorage.getItem('rob-assessments-v1')")
    assert env and "rob-assessments-v1" in env
