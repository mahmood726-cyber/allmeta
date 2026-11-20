"""R user path (lane pa8, 2026-11-17; rewritten after review of PR #630): the page's own R check.

Requirement: the page offers "Download R script", generated from the inputs it analysed (not the
example, not the saved bus), that recomputes every number it DISPLAYS and prints an honest
"MATCH n/n" or "MISMATCH m/n" -- and "Verify this analysis in R (WebR)" runs that same script in
the browser with the unchanged shared/webr-runner.js. Before this lane the page had no such path.

These tests use the real buttons in headless Chrome, read the numbers from the DOM, run the
downloaded file in Rscript, and check that R's values round to exactly what the page shows. They
also check that a wrong page value is reported as MISMATCH, that the button refuses when there is
no result, and that the WebR button prints MATCH.

They need ALM_PLAYWRIGHT (path to playwright-core), ALM_CHROME (a Chrome executable), node and
Rscript on PATH (the root conftest.py adds R's bin dir). Without them they SKIP -- not a pass.
"""
import functools
import http.server
import json
import math
import os
import random
import re
import shutil
import socketserver
import subprocess
import threading
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
APP_DIR = HERE.parent
ROOT = APP_DIR.parent
APP = APP_DIR.name
SRC = (APP_DIR / "index.html").read_text(encoding="utf-8")
RCHECK = (APP_DIR / "r-check.js").read_text(encoding="utf-8")
DRIVER = HERE / "r_check_driver.cjs"


# ---------------------------------------------------------------- harness
def _need(cond, why):
    if not cond:
        pytest.skip(why)


@pytest.fixture(scope="module")
def server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    httpd = None
    for port in random.sample(range(18000, 19000), 50):
        try:
            httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    assert httpd is not None, "no free port in 18000-18999"
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield "http://127.0.0.1:%d/%s/" % (httpd.server_address[1], APP)
    httpd.shutdown()


def drive(url, actions, webr=False, refuse=False, dom=None):
    _need(shutil.which("node"), "node not on PATH")
    _need(os.environ.get("ALM_PLAYWRIGHT") and os.environ.get("ALM_CHROME"), "ALM_PLAYWRIGHT / ALM_CHROME not set")
    r = subprocess.run(["node", str(DRIVER), url, json.dumps(actions), dom or DOM_EXPR,
                        json.dumps({"webr": webr, "refuse": refuse})],
                       capture_output=True, text=True, encoding="utf-8", timeout=1500)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def run_r(script, tmp_path, name):
    rs = shutil.which("Rscript")
    _need(rs, "Rscript not on PATH")
    p = tmp_path / (name + ".R")
    p.write_text(script, encoding="utf-8")
    r = subprocess.run([rs, "--vanilla", str(p)], capture_output=True, text=True, encoding="utf-8", timeout=900)
    return r.returncode, r.stdout + r.stderr


LINE = re.compile(r"^(.+?)\s+R = (\S+)\s+page = (\S+)\s+\|diff\| = \S+\s+(ok|DIFFERS)$", re.M)
_SPECIAL = {"NA": float("nan"), "NaN": float("nan"), "Inf": math.inf, "-Inf": -math.inf}


def r_values(out):
    """{quantity: R value} from the script's per-quantity lines."""
    return {m.group(1).strip(): _SPECIAL[m.group(2)] if m.group(2) in _SPECIAL else float(m.group(2))
            for m in LINE.finditer(out)}


def assert_match(rc, out):
    assert rc == 0, out
    m = re.search(r"^MATCH (\d+)/(\d+)$", out, re.M)
    assert m and m.group(1) == m.group(2) and int(m.group(1)) > 0, out
    assert "MISMATCH" not in out and "DIFFERS" not in out, out
    assert len(LINE.findall(out)) == int(m.group(1)), out
    return int(m.group(1))


def fmt(x, d):
    """JS Number.prototype.toFixed for the values these pages show ("—" when not finite)."""
    if x is None or not math.isfinite(x):
        return "—"
    return "%.*f" % (d, x)


def check_dom_against_r(dom, R):
    bad, n = DOM_CHECK(dom, R)
    assert not bad, bad
    assert n >= MIN_DOM_CHECKS, (n, dom)
    return n


# ---------------------------------------------------------------- per-app configuration
PASTED = ("Aronson1948, -0.8893, 0.5706\nFergu\"son\\1949, -1.5854, 0.4411\nRosenthal1960, -1.3481, 0.6445\n"
          "Hart1977, -1.4416, 0.1415\nFrimodt-Moller1973, -0.2175, 0.2263\nStein1953, -0.7861, 0.0831\n"
          "Vandiviere1973, -1.6209, 0.4722")
DEFAULT_ACTIONS = [{"wait": 500}]
PASTED_ACTIONS = [{"fill": "#f-data", "value": PASTED}, {"wait": 500}]
PASTED_TOKENS = ['"Fergu\\"son\\\\1949"', "-1.5854", "0.4411"]     # label escaped for R, then the data
REFUSE_ACTIONS = [{"fill": "#f-data", "value": ""}, {"wait": 500}]
DOM_EXPR = ("[...document.querySelectorAll('#stats-wrap .stat')]"
            ".map(e => [e.querySelector('.k').textContent, e.querySelector('.v').textContent])")
MIN_DOM_CHECKS = 6


def DOM_CHECK(dom, R):
    """The stat cards the page shows vs R's values rounded as the page rounds them."""
    bad, n = [], 0
    for k, v in dom:
        exp = None
        if k == "k":
            exp = str(int(R["k"]))
        elif k == "τ² strategy":
            if not v.endswith("= " + fmt(R["tau^2 (plug-in)"], 4)):
                bad.append((k, v, fmt(R["tau^2 (plug-in)"], 4)))
            n += 1
            continue
        elif k == "Posterior mean":
            exp = fmt(R["posterior mean"], 3)
        elif k.startswith("95% CrI"):
            exp = "[" + fmt(R["95% CrI lower"], 3) + ", " + fmt(R["95% CrI upper"], 3) + "]"
        elif k.startswith("P(θ <"):
            exp = fmt(next(x for q, x in R.items() if q.startswith("P(theta <")), 3)
        elif k.startswith("P(|θ| <"):
            exp = fmt(next(x for q, x in R.items() if q.startswith("P(|theta| <")), 3)
        if exp is not None:
            n += 1
            if v != exp:
                bad.append((k, v, exp))
    return bad, n



# ---------------------------------------------------------------- tests
def test_page_loads_the_unchanged_runner_and_the_app_local_check():
    assert '<script src="../shared/webr-runner.js"></script>' in SRC
    assert '<script src="r-check.js"></script>' in SRC
    assert "window.__almRCheckInputs = function" in SRC


def test_default_example_download_button_runs_in_R_and_agrees_with_the_display(server, tmp_path):
    res = drive(server, DEFAULT_ACTIONS)
    assert res["downloaded"], res["status"]
    rc, out = run_r(res["script"], tmp_path, "default")
    assert_match(rc, out)
    check_dom_against_r(res["dom"], r_values(out))


def test_pasted_data_reaches_the_downloaded_script_and_agrees_with_the_display(server, tmp_path):
    res = drive(server, PASTED_ACTIONS)
    assert res["downloaded"], res["status"]
    for tok in PASTED_TOKENS:
        assert tok in res["script"], tok
    rc, out = run_r(res["script"], tmp_path, "pasted")
    assert_match(rc, out)
    check_dom_against_r(res["dom"], r_values(out))


def test_a_wrong_page_value_is_reported_as_MISMATCH(server, tmp_path):
    # The verdict is computed by R from the comparisons: change one page value in the downloaded
    # script and the same script must say MISMATCH and mark exactly that quantity DIFFERS.
    res = drive(server, DEFAULT_ACTIONS)
    m = re.search(r"^(page <- list\(\w+ = (?:c\()?)(-?[0-9][0-9.e+-]*)", res["script"], re.M)
    assert m, res["script"][:2000]
    bad = res["script"][:m.start(2)] + repr(float(m.group(2)) + 0.01) + res["script"][m.end(2):]
    rc, out = run_r(bad, tmp_path, "perturbed")
    assert rc == 0, out
    assert re.search(r"^MISMATCH (\d+)/(\d+) agree$", out, re.M), out
    assert out.count("DIFFERS") == 1, out


def test_buttons_refuse_when_the_page_shows_no_result(server):
    res = drive(server, REFUSE_ACTIONS, refuse=True)
    assert not res["downloaded"], "a script was downloaded for an input the page does not analyse"
    assert res["status"].startswith("Nothing to check"), res["status"]


def test_webr_button_runs_the_same_check_in_the_browser(server, tmp_path):
    res = drive(server, DEFAULT_ACTIONS, webr=True)
    m = re.search(r"^MATCH (\d+)/(\d+)$", res["webr"] or "", re.M)
    assert res["status"].startswith("R says: MATCH"), (res["status"], res["webr"])
    assert m and m.group(1) == m.group(2), res["webr"]
    rc, out = run_r(res["script"], tmp_path, "webr-default")
    assert int(m.group(1)) == assert_match(rc, out)
    check_dom_against_r(res["dom"], r_values(res["webr"]))


def test_chk_does_not_pass_different_undefined_values_or_large_values_beyond_display(tmp_path):
    # Review of PR #630: chk() counted NaN vs Inf and -Inf vs Inf as agreeing, and its relative tolerance
    # was looser than 3 decimals once |page| > 1000. The helpers shipped in r-check.js are run here.
    helpers = re.search(r"var R_HELPERS = \[(.*?)\]\.join", RCHECK, re.S).group(1)
    rsrc = "\n".join(json.loads("[" + helpers.rstrip().rstrip(",") + "]"))
    cases = ("chk('nan-vs-inf', NaN, Inf); chk('minf-vs-inf', -Inf, Inf); chk('big', 2000.0015, 2000);"
             "chk('na-vs-nan', NA, NaN); chk('inf-vs-inf', Inf, Inf); chk('close', 2000.0001, 2000); finish()")
    rc, out = run_r(rsrc + "\n" + cases + "\n", tmp_path, "chk")
    assert rc == 0, out
    verdict = {m.group(1).strip(): m.group(4) for m in LINE.finditer(out)}
    assert verdict == {"nan-vs-inf": "DIFFERS", "minf-vs-inf": "DIFFERS", "big": "DIFFERS",
                       "na-vs-nan": "ok", "inf-vs-inf": "ok", "close": "ok"}, out
    assert "MISMATCH 3/6 agree" in out, out


# Review of PR #630 (Codex F2 / agy A1): the PM call left tau2.max at metafor's default, the larger of
# 100 and 10 * mad(yi)^2, and metafor stops ("Value of 'tau2.max' too low") when the root lies above it,
# while the page's search (shared/ma-core.js tau2PM) doubles its upper bracket until Q(hi) <= k - 1.
# Requirement: for data the page analyses, the downloaded script runs and agrees with the display.
# OUTLIER: mad(yi) = 0, so metafor's bound is 100; the page's tau2 is 3332.3333.
# SPREAD: mad(yi) = 1.48 (bound 100), one far study; the page's tau2 is far above 100.
OUTLIER_ACTIONS = [{"fill": "#f-data", "value": "A, 0, 1\nB, 0, 1\nC, 100, 1"}, {"wait": 500}]
SPREAD_ACTIONS = [{"fill": "#f-data", "value": "A, 0, 1\nB, 1, 1\nC, 2, 1\nD, 300, 1"}, {"wait": 500}]


@pytest.mark.parametrize("name, actions", [("outlier", OUTLIER_ACTIONS), ("spread", SPREAD_ACTIONS)])
def test_pm_tau2_above_metafors_default_bound_still_runs_and_agrees(server, tmp_path, name, actions):
    res = drive(server, actions)
    assert res["downloaded"], res["status"]
    rc, out = run_r(res["script"], tmp_path, "pm-" + name)
    assert_match(rc, out)
    R = r_values(out)
    assert R["tau^2 (plug-in)"] > 100, out      # the case really is above metafor's default bound
    check_dom_against_r(res["dom"], R)
