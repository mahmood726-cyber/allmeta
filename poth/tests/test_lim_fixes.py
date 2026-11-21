"""LIM-P23 limitation fixes (lane lim1, Nov 2026): each test states the requirement.

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
APP = "poth"
sync_playwright = pytest.importorskip("playwright.sync_api").sync_playwright


def _free_port():
    for port in range(18500, 18600):
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
@pytest.fixture(scope="module")
def page(browser_ctx):
    br, url = browser_ctx
    ctx = br.new_context()
    pg = ctx.new_page()
    pg.goto(url)
    pg.wait_for_selector("#out .big")
    yield pg
    ctx.close()


def _run(page, text):
    page.evaluate("t => { const d = document.getElementById('data'); d.value = t; d.dispatchEvent(new Event('input')); }", text)
    return page.inner_text("#out")


def _computed(page):
    return page.locator("#out .big").count() == 1


# ---- F01: a line's fields must not be silently lost or misread -----------------------------

def test_f01_decimal_comma_is_refused_not_read_as_zero(page):
    txt = _run(page, "0,92\n0,74\n0,55")
    assert not _computed(page), txt
    assert "decimal comma" in txt.lower()


def test_f01_treatment_name_with_comma_is_kept_whole(page):
    _run(page, "0.75, Drug A, 10 mg\n0.25, Drug B, 20 mg")
    assert _computed(page)
    assert "Drug A, 10 mg" in page.inner_text("#out table")


# ---- F02: mixed percent marking must not divide a fraction a second time -------------------

def test_f02_mixed_percent_marking_is_refused(page):
    txt = _run(page, "92%, A\n0.74, B\n0.5, C")
    assert not _computed(page), txt
    assert "%" in txt


def test_f02_control_unmarked_and_fully_marked_lists_unchanged(page):
    _run(page, "92, A\n74, B\n55, C\n41, D\n23, E\n15, F")
    assert _computed(page)
    _run(page, "92%, A\n74%, B\n55%, C\n41%, D\n23%, E\n15%, F")
    assert _computed(page)


# ---- F03: a nonzero value must never become zero ------------------------------------------

@pytest.mark.parametrize("tok", ["1e-400", "-1e-400", "5e-324%"])
def test_f03_underflow_to_zero_is_refused(page, tok):
    txt = _run(page, tok + ", A\n0.5, B\n0.6, C")
    assert not _computed(page), txt


# ---- F04: one row per treatment ------------------------------------------------------------

def test_f04_repeated_treatment_name_is_refused(page):
    txt = _run(page, "0.8, Drug A\n0.5, Drug B\n0.2, Drug A")
    assert not _computed(page), txt
    assert "repeat" in txt.lower()


def test_f04_generated_label_cannot_collide_with_a_supplied_one(page):
    txt = _run(page, "0.8, T2\n0.5\n0.2, C")
    assert not _computed(page) or len(set(page.locator("#out tbody td:first-child").all_inner_texts())) == 3, txt


# ---- F18: results and refusals are announced -----------------------------------------------

def test_f18_result_region_is_live(page):
    assert page.get_attribute("#out", "aria-live") == "polite"


# ---- F20: no unsupported claims ------------------------------------------------------------

def test_f20_high_band_does_not_claim_a_leader_is_meaningfully_ahead(page):
    _run(page, "1, A\n0.75, B\n0.25, C\n0, D")
    assert "meaningfully ahead" not in page.inner_text("#out")


def test_f20_low_band_allows_confidence_intervals(page):
    _run(page, "0.55, A\n0.5, B\n0.45, C")
    assert "confidence" in page.inner_text("#out").lower()


def test_f20_footer_validation_claim_is_scoped():
    html = (ROOT / APP / "index.html").read_text(encoding="utf-8")
    assert "on every <code>netmeta</code> example network)" not in html
    assert "that netmeta can rank" in html


# ---- F14: the R-check promise matches what the script compares -----------------------------

def test_f14_rcheck_does_not_promise_every_displayed_number():
    js = (ROOT / APP / "rcheck.js").read_text(encoding="utf-8")
    assert "recomputes every displayed number" not in js


# ---- control: the built-in example is unchanged --------------------------------------------

def test_control_default_example_unchanged(page):
    page.click("#btn-example")
    assert page.inner_text("#out .big") == "0.629"


# ---- F19: say that display is rounded while order and band use unrounded values ------------

def test_f19_rounding_and_tie_rule_is_stated(page):
    _run(page, "0.6004, A\n0.6, B\n0.3996, C\n0.4, D")
    txt = page.inner_text("#out").lower()
    assert "unrounded" in txt and "ties" in txt


# ---- F15: page and R script apply the same, stated [0, 1] cap ------------------------------

def test_f15_capped_value_is_stated_and_r_agrees(page, tmp_path):
    import glob, os, shutil, subprocess
    _run(page, "1, A\n0.67, B\n0.33, C\n0, D")   # rounded thirds: uncapped POTH 1.004
    assert page.inner_text("#out .big") == "1.000"
    assert "capped" in page.inner_text("#out").lower()
    rs = next((c for c in [os.environ.get("RSCRIPT"), shutil.which("Rscript")] +
               sorted(glob.glob("C:/Program Files/R/R-*/bin/Rscript.exe"), reverse=True) if c and Path(c).exists()), None)
    if rs is None:
        pytest.skip("Rscript not found")
    f = tmp_path / "poth-check.R"
    f.write_text(page.evaluate("window.AlmRCheck.script()"), encoding="utf-8", newline="\n")
    r = subprocess.run([rs, "--vanilla", str(f)], capture_output=True, text=True, timeout=120)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    assert lines and lines[-1].startswith("MATCH"), r.stdout[-800:] + r.stderr[-300:]


# ---- F01 review (PR #654): numbered treatments are not decimal commas ----------------------

def test_f01_numbered_treatments_with_whole_number_scores_are_accepted(page):
    # P-scores 1, 0.5, 0 for treatments named 3, 1, 2 (reviewer's list)
    _run(page, "1, 3\n0.5, 1\n0, 2")
    assert _computed(page), page.inner_text("#out")
    assert page.inner_text("#out .big") == "1.000"


@pytest.mark.parametrize("text", ["92, 1\n74, 2\n15, 3", "92,1\n74,2\n15,3"])
def test_f01_whole_percentages_with_numbered_treatments_are_accepted(page, text):
    # origin/main accepted this list: POTH 0.713 (reviewer's list; second form without spaces)
    _run(page, text)
    assert _computed(page), page.inner_text("#out")
    assert page.inner_text("#out .big") == "0.713"


def test_f01_ambiguous_no_space_form_is_accepted_with_a_note(page):
    _run(page, "92,1\n74,2\n15,3")
    assert "decimal comma" in page.inner_text("#out").lower()
