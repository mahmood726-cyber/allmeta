"""LIM-P20 limitation fixes (lane lim1, Nov 2026): each test states the requirement.

Runs the real page in headless Chrome served from this checkout on a private port.
Skips (never passes) when no Chromium is available.
"""
import functools
import http.server
import socket
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
APP = "effect-size-converter"
sync_playwright = pytest.importorskip("playwright.sync_api").sync_playwright


def _free_port():
    for port in range(18300, 18400):
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
def browser_ctx():
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
        yield br, f"http://127.0.0.1:{port}/{APP}/"
        br.close()
    srv.shutdown()


@pytest.fixture
def page(browser_ctx):
    br, url = browser_ctx
    ctx = br.new_context()
    pg = ctx.new_page()
    pg.goto(url)
    pg.wait_for_selector("#results-body tr")
    yield pg
    ctx.close()


def _rows(page):
    return page.evaluate("(window.__almResultRows || []).map(r => r.scale)")


def _warn(page):
    return page.inner_text("#warn-slot")


def _set(page, **vals):
    for k, v in vals.items():
        page.evaluate("([id, v]) => { document.getElementById(id).value = v; }", [k, v])


# ---- A01: invalid optional context / group sizes must refuse, not vanish -----------------

@pytest.mark.parametrize("n1,n2", [("2.5", "30"), ("1", "30"), ("30", ""), ("", "30"), ("-4", "30")])
def test_a01_invalid_smd_group_sizes_are_refused_not_ignored(page, n1, n2):
    # Requirement: an ENTERED group size that cannot be used must not silently drop the
    # Hedges/MD rows while the table looks complete.
    _set(page, **{"in-type": "SMD", "in-smd-kind": "d", "in-est": "0.5", "in-se": "0.1",
                  "der-n1": n1, "der-n2": n2})
    page.click("#btn-convert")
    assert _rows(page) == [], _rows(page)
    assert "group size" in _warn(page).lower()


def test_a01_valid_or_blank_group_sizes_still_convert(page):
    _set(page, **{"in-type": "SMD", "in-smd-kind": "d", "in-est": "0.5", "in-se": "0.1",
                  "der-n1": "30", "der-n2": "30"})
    page.click("#btn-convert")
    assert "SMD (Hedges' g)" in _rows(page)
    _set(page, **{"der-n1": "", "der-n2": ""})
    page.click("#btn-convert")
    assert _rows(page) == ["SMD (Cohen's d)", "OR (logit approximation)"]


@pytest.mark.parametrize("field", ["ctx-p0", "ctx-sd"])
def test_a01_unparseable_context_is_refused_not_treated_as_blank(page, field):
    _set(page, **{"in-type": "OR", "in-est": "0.75", "in-se": "0.12", field: ""})
    page.locator("#" + field).press_sequentially("1e")   # browser badInput: value reads as ""
    assert page.evaluate("id => document.getElementById(id).validity.badInput", field)
    page.click("#btn-convert")
    assert _rows(page) == []
    assert "not a number" in _warn(page).lower()


@pytest.mark.parametrize("blank", ["m1", "sd2", "n1"])
def test_a01_csv_blank_cell_is_rejected_not_read_as_zero(page, blank):
    page.wait_for_function("typeof window.__almLoadCSV === 'function'")
    row = {"m1": "52.5", "sd1": "8.2", "n1": "30", "m2": "47.1", "sd2": "7.9", "n2": "30"}
    row[blank] = ""
    page.evaluate("row => window.__almLoadCSV([row])", row)
    assert _rows(page) == []
    assert "csv rejected" in _warn(page).lower()
