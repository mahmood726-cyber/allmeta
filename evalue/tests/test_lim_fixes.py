"""LIM-P22 limitation fixes (lane lim1, Nov 2026): each test states the requirement.

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
APP = "evalue"
sync_playwright = pytest.importorskip("playwright.sync_api").sync_playwright


def _free_port():
    for port in range(18400, 18500):
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


def _wait(pg, expr, timeout=20.0):
    # Page.wait_for_function polls with eval, which these pages' CSP (no 'unsafe-eval') can block;
    # page.evaluate is not affected. Poll from the test instead.
    import time
    end = time.time() + timeout
    while time.time() < end:
        if pg.evaluate(expr):
            return
        pg.wait_for_timeout(100)
    raise AssertionError("timed out waiting for " + expr)


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
    pg.wait_for_selector("#tbody tr")
    yield pg
    ctx.close()



def _set(page, **vals):
    for k, v in vals.items():
        if k == "rare":
            page.evaluate("v => { document.getElementById('rare').checked = v; }", v)
        else:
            page.evaluate("([id, v]) => { document.getElementById(id).value = v; }", [k, v])
    page.click("#btn-run")


def _result(page):
    return page.evaluate("window.__almLastEValue()")


def _table(page):
    return page.inner_text("#tbody")


RD_OK = {"measure": "RD", "n11": "60", "n10": "40", "n01": "30", "n00": "70", "truev": ""}


# ---- F08: RD cell counts must be whole numbers; the target must be a feasible RD ------------

@pytest.mark.parametrize("field,value", [("n11", "2.5"), ("n00", "70.25"), ("n10", str(2**53 + 2))])
def test_f08_non_integer_or_unsafe_counts_are_refused(page, field, value):
    _set(page, **{**RD_OK, field: value})
    assert _result(page) is None
    assert "whole number" in _table(page).lower()


@pytest.mark.parametrize("tv", ["-2", "-1", "1.5"])
def test_f08_infeasible_rd_target_is_refused(page, tv):
    _set(page, **{**RD_OK, "truev": tv})
    assert _result(page) is None
    assert "between -1 and 1" in _table(page).lower()


def test_f08_control_valid_counts_and_target_still_compute(page):
    _set(page, **RD_OK)
    assert _result(page)["rd"] == pytest.approx(0.3)
    _set(page, **{**RD_OK, "truev": "-0.5"})
    assert _result(page) is not None


# ---- F11: a displayed derived quantity that is not finite must refuse ----------------------

def test_f11_smd_se_overflow_is_refused_not_shown_as_zero_to_dash(page):
    # exp(0.91*0.3 - 1.78*1000) underflows to 0 and the upper limit overflows to Infinity.
    _set(page, measure="SMD", point="0.3", lo="", hi="", se="1000", truev="")
    assert _result(page) is None
    assert "non-finite" in _table(page).lower() or "out of range" in _table(page).lower()


def test_f11_control_ordinary_smd_se_computes(page):
    _set(page, measure="SMD", point="0.3", lo="", hi="", se="0.1", truev="")
    r = _result(page)
    assert r is not None and r["rr"]["lo"] > 0


# ---- F12: what the table shows must have the magnitude of the number behind it ------------

def _shown_numbers(page):
    import re
    txt = page.inner_text("#tbody")
    return [float(x) for x in re.findall(r"(?<![\w.])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?", txt)]


@pytest.mark.parametrize("point", ["1e30", "1e-6", "0.00004", "2e7"])
def test_f12_displayed_values_keep_their_magnitude(page, point):
    _set(page, measure="RR", point=point, lo="", hi="", se="", truev="")
    r = _result(page)
    assert r is not None
    shown = _shown_numbers(page)
    for want in (r["point"], r["rr"]["point"]):
        assert any(abs(s - want) <= 1e-3 * abs(want) for s in shown), (want, shown, _table(page))


def test_f12_control_default_example_display_unchanged(page):
    _set(page, measure="RR", point="2", lo="1.5", hi="2.7", se="", truev="")
    cells = page.locator("#tbody td.big").all_inner_texts()
    assert cells == ["3.4142", "2.366"], cells


# ---- F14: the plot must label an RD bias factor as such and keep markers on the axis --------

def test_f14_rd_plot_labels_bias_factor_not_rr(page):
    _set(page, **RD_OK)
    labels = page.evaluate("[...document.querySelectorAll('#plot text')].map(t => t.textContent)")
    assert not any(l == "RR" or l.startswith("1/RR") for l in labels), labels
    assert any("bias factor" in l.lower() for l in labels), labels
    assert "bias factor" in page.get_attribute("#plot", "aria-label").lower()


def test_f14_reciprocal_marker_stays_inside_axis(page):
    _set(page, measure="RR", point="0.1", lo="", hi="", se="", truev="0.11")
    xs = page.evaluate("[...document.querySelectorAll('#plot circle')].map(c => +c.getAttribute('cx'))")
    assert xs and all(30 <= x <= 580 for x in xs), xs


# ---- F15: the printed OLS formula must be the one computed (absolute contrast) --------------

def test_f15_footer_states_absolute_contrast():
    html = (ROOT / APP / "index.html").read_text(encoding="utf-8")
    assert "d = b·|δ|/SD" in html
    assert "d = b·δ/SD" not in html


# ---- F23: results and refusals are announced -----------------------------------------------

def test_f23_result_and_refusal_reach_a_live_region(page):
    live = page.locator("[aria-live]:not(#rcheck-status)")
    assert live.count() >= 1
    _set(page, measure="RR", point="2", lo="3", hi="4", se="", truev="")
    assert "refused" in " ".join(live.all_inner_texts()).lower()
    _set(page, measure="RR", point="2", lo="1.5", hi="2.7", se="", truev="")
    assert "3.4142" in " ".join(live.all_inner_texts())


# ---- F21: an R verdict must never stand beside a result it did not check -------------------
# MOCK: WebR is replaced by a stub that answers "MATCH 3/3" (EValue is not in the pinned WebR
# repository, so the real in-browser run cannot happen); what is tested is the page's handling.

def _mock_webr(page, hold=False):
    page.route("**/manifest.json", lambda route: route.fulfill(
        status=200, content_type="application/json", body='{"packages":[{"package":"EValue"}]}'))
    page.evaluate("hold => { window.__release = null; window.AlmWebR = { runR: () => new Promise(res => { "
                  "const done = () => res({ ok: true, stdout: 'MATCH 3/3' + String.fromCharCode(10), versions: {} }); "
                  "if (hold) window.__release = done; else done(); }) }; }", hold)


def test_f21_completed_verdict_is_cleared_when_inputs_change(page):
    _mock_webr(page)
    page.click("#btn-verify-r")
    _wait(page, "document.getElementById('rcheck-verdict').textContent.startsWith('MATCH')")
    page.fill("#point", "2.5")   # a real input event: the page recomputes
    page.wait_for_timeout(200)
    assert page.locator("#rcheck-verdict").is_hidden()
    assert "changed" in page.inner_text("#rcheck-status").lower()


def test_f21_verdict_for_earlier_inputs_is_discarded(page):
    _mock_webr(page, hold=True)
    page.click("#btn-verify-r")
    _wait(page, "typeof window.__release === 'function'")
    page.fill("#point", "2.5")
    page.evaluate("window.__release()")
    _wait(page, "!document.getElementById('btn-verify-r').disabled")
    assert page.locator("#rcheck-verdict").is_hidden()
    assert "discarded" in page.inner_text("#rcheck-status").lower()


def test_f21_control_unchanged_inputs_keep_the_verdict(page):
    _mock_webr(page)
    page.click("#btn-verify-r")
    _wait(page, "document.getElementById('rcheck-verdict').textContent.startsWith('MATCH')")
    page.click("#btn-download-r")
    assert page.inner_text("#rcheck-verdict").startswith("MATCH")


# ---- F20: the R script always ends with a verdict line, even when EValue stops --------------

def test_f20_r_error_still_ends_with_mismatch(page, tmp_path):
    import glob, os, shutil, subprocess
    rs = next((c for c in [os.environ.get("RSCRIPT"), shutil.which("Rscript")] +
               sorted(glob.glob("C:/Program Files/R/R-*/bin/Rscript.exe"), reverse=True) if c and Path(c).exists()), None)
    if rs is None:
        pytest.skip("Rscript not found")
    ok = subprocess.run([rs, "--vanilla", "-e", "cat(requireNamespace('EValue', quietly=TRUE))"],
                        capture_output=True, text=True, timeout=120).stdout.strip().endswith("TRUE")
    if not ok:
        pytest.skip("R package EValue not installed (set R_LIBS)")
    _set(page, measure="RR", point="2", lo="1.5", hi="2.7", se="", truev="")
    script = page.evaluate("window.__almEValueRScript()")
    # Plant an input EValue refuses (an RR below its lower limit), as a corrupted or
    # hand-edited script would carry: R must still print a terminal MISMATCH line.
    planted = script.replace("point = 2, lo = 1.5", "point = 2, lo = 2.5")
    assert planted != script
    f = tmp_path / "planted.R"
    f.write_text(planted, encoding="utf-8", newline="\n")
    r = subprocess.run([rs, "--vanilla", str(f)], capture_output=True, text=True, timeout=180)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    assert lines and lines[-1].startswith("MISMATCH"), (r.returncode, r.stdout[-500:], r.stderr[-500:])


# ---- F16 / F19: guidance on retained values; the script names its reference honestly --------

def test_f16_measure_change_guidance_is_shown(page):
    assert "kept when the measure changes" in page.inner_text("#measure-hint")


def test_f19_script_names_reference_and_later_modes(page):
    _set(page, measure="RR", point="2", lo="1.5", hi="2.7", se="", truev="")
    s = page.evaluate("window.__almEValueRScript()")
    assert "Reference, as in the P22 validation" not in s
    assert "added to the page later" in s
    assert 'packageVersion("EValue") != "4.1.4"' in s
