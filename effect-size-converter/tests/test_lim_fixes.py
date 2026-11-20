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


# ---- A07: an R verdict covers exactly what is shown, and only while it is shown ------------
# MOCK: WebR is replaced by a stub answering a fixed verdict; what is tested is the page.

def _mock_webr(page, stdout):
    page.route("**/manifest.json", lambda route: route.fulfill(
        status=200, content_type="application/json",
        body='{"packages":[{"package":"metafor"},{"package":"EValue"}]}'))
    page.evaluate("out => { window.AlmWebR = { runR: () => Promise.resolve({ ok: true, stdout: out, versions: {} }) }; }",
                  stdout)


def _verify(page):
    page.click("#btn-verify-r")
    page.wait_for_function("!document.getElementById('rcheck-verdict').hidden")


def test_a07_verdict_cleared_after_a_new_conversion(page):
    _mock_webr(page, "MATCH 15/15\n")
    _verify(page)
    _set(page, **{"in-est": "0.8"})
    page.click("#btn-convert")
    assert page.locator("#rcheck-verdict").is_hidden()
    assert "changed" in page.inner_text("#rcheck-status").lower()


def test_a07_verdict_cleared_after_an_e_value_edit(page):
    _mock_webr(page, "MATCH 15/15\n")
    _verify(page)
    page.fill("#ev-point", "2.2")
    page.wait_for_timeout(200)
    assert page.locator("#rcheck-verdict").is_hidden()


def test_a07_control_verdict_kept_while_nothing_changes(page):
    _mock_webr(page, "MATCH 15/15\n")
    _verify(page)
    page.click("#btn-download-r")
    assert page.inner_text("#rcheck-verdict") == "MATCH 15/15"
    assert "ok" in page.get_attribute("#rcheck-verdict", "class").split()


def test_a07_partial_match_is_not_coloured_as_success(page):
    _mock_webr(page, "MATCH 13/13 (2 more NOT CHECKED: see above)\n")
    _verify(page)
    assert "ok" not in page.get_attribute("#rcheck-verdict", "class").split()


def test_a07_refused_e_value_panel_is_reported_not_checked(page):
    page.fill("#ev-point", "")
    page.wait_for_timeout(200)
    script = page.evaluate("window.__escRScript()")
    assert 'not_checked("E-value widget"' in script


def test_a07_refused_conversion_table_is_reported_not_checked(page):
    _set(page, **{"in-se": ""})
    page.click("#btn-convert")
    script = page.evaluate("window.__escRScript()")
    assert 'not_checked("conversion table"' in script


# ---- A03: a ratio row whose point underflowed must not get a difference-scale CI -----------

def test_a03_underflowed_or_gets_no_negative_ci(page):
    _set(page, **{"in-type": "SMD", "in-smd-kind": "d", "in-est": "-500", "in-se": "0.1",
                  "der-n1": "", "der-n2": ""})
    page.click("#btn-convert")
    rows = page.evaluate("window.__almResultRows")
    orr = [r for r in rows if r["scale"].startswith("OR")][0]
    assert not (isinstance(orr.get("lo"), (int, float)) and orr["lo"] < 0), orr
    assert "range" in _warn(page).lower()


def test_a03_r_twin_agrees_on_the_underflowed_row(page):
    _set(page, **{"in-type": "SMD", "in-smd-kind": "d", "in-est": "-500", "in-se": "0.1",
                  "der-n1": "", "der-n2": ""})
    page.click("#btn-convert")
    script = page.evaluate("window.__escRScript()")
    # The R twin must apply the same rule (no CI for an under/overflowed ratio row), or the
    # R check reports a spurious difference; the fresh-R run is in the lane's user-path check.
    assert "ratio_scale" in script and "!(ratio_scale & !ratio)" in script


# ---- A05: export what is displayed, not a recomputation of unsubmitted fields ---------------

def test_a05_export_ignores_unsubmitted_edits(page):
    page.wait_for_function("typeof window.__almResults === 'function'")
    _set(page, **{"in-est": "0.9"})          # typed, Convert not pressed
    res = page.evaluate("window.__almResults()")
    assert res["input_estimate"] == 0.75
    assert res["rows"][0]["point"] == 0.75
    assert page.evaluate("window.__almResultRows[0].point") == 0.75


def test_a05_rejected_csv_is_not_revived_by_export(page):
    page.wait_for_function("typeof window.__almLoadCSV === 'function'")
    page.evaluate("window.__almLoadCSV([{m1:'52.5',sd1:'-1',n1:'30',m2:'47.1',sd2:'7.9',n2:'30'}])")
    assert _rows(page) == []
    assert page.evaluate("window.__almResults()")["rows"] == []


def test_a05_export_includes_the_e_value_widget(page):
    page.wait_for_function("typeof window.__almResults === 'function'")
    ev = page.evaluate("window.__almResults()")["e_value"]
    assert ev["measure"] == "RR" and abs(ev["e_point"] - 3.414214) < 1e-6


# ---- A09: notes say what was done; omitted conversions are explained ------------------------

def test_a09_large_df_correction_not_called_exact(page):
    _set(page, **{"in-type": "SMD", "in-smd-kind": "d", "in-est": "0.5", "in-se": "0.01",
                  "der-n1": "60000", "der-n2": "60000"})
    page.click("#btn-convert")
    notes = page.evaluate("window.__almResultRows.map(r => r.note).join(' | ')")
    assert "approximation" in notes and "exact small-sample" not in notes, notes


def test_a09_omitted_implied_ratios_are_explained(page):
    _set(page, **{"in-type": "RD", "in-est": "0.5", "in-se": "0.1", "ctx-p0": "0.7"})
    page.click("#btn-convert")
    assert _rows(page) == ["RD"]
    assert "outside (0,1)" in _warn(page)


# ---- A11: the E-value widget does not depend on the optional hub modules --------------------

def test_a11_e_value_widget_works_without_hub_modules(browser_ctx):
    br, url = browser_ctx
    ctx = br.new_context()
    pg = ctx.new_page()
    pg.route("**/hub/shared/*.js", lambda route: route.abort())
    pg.goto(url)
    pg.wait_for_selector("#results-body tr")
    pg.wait_for_timeout(500)
    assert pg.evaluate("!window.alm")
    assert "E-value (point) =" in pg.inner_text("#ev-out")
    ctx.close()
