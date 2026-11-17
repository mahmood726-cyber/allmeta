"""R user path (lane pa8, 2026-11-17): "Download R script" + in-page "Verify in R (WebR)".

Requirement: the page offers an R script, generated from the inputs it analysed (not the example,
not the saved bus), that recomputes every number it displays and prints an honest "MATCH n/n" (or
"MISMATCH m/n") -- and the in-page WebR button runs that same script with shared/webr-runner.js.
Before this lane the page had no such path (live check, 17 Nov 2026).

The browser + R tests need: ALM_PLAYWRIGHT (path to playwright-core), ALM_CHROME (a Chrome/Chromium
executable), node on PATH and Rscript on PATH (the root conftest.py adds R's bin dir). Without them
they SKIP, which is not a pass.
"""
import functools
import http.server
import json
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

# ---- per-app configuration (filled in for this page) ----
HOOK = "window.__almBMARScript()"
DEFAULT_ACTIONS = [{"waitFor": "window.__almRCheckInputs && window.__almRCheckInputs()"}]
PASTED_ACTIONS = [{"fill": "#src", "value": "Aronson1948, -0.8893, 0.325585\nFerguson1949, -1.5854, 0.194581\nRosenthal1960, -1.3481, 0.415368\nHart1977, -1.4416, 0.020010\nFrimodt-Moller1973, -0.2175, 0.051210\nStein1953, -0.7861, 0.006906\nVandiviere1973, -1.6209, 0.223017"}, {"click": "#btn-run"}, {"waitFor": "window.__almRCheckInputs() && window.__almRCheckInputs().rows.length===7"}]
PASTED_TOKENS = ['"Ferguson1949"', '-1.5854', '0.194581']     # strings the generated script must contain after the paste


def test_page_loads_the_unchanged_runner_and_the_app_local_check():
    assert '<script src="../shared/webr-runner.js"></script>' in SRC
    assert '<script src="r-check.js"></script>' in SRC
    assert "window.__almRCheckInputs = function" in SRC
    assert 'id="btn-r-script"' in RCHECK and 'id="btn-r-webr"' in RCHECK
    assert "AlmWebR.runR" in RCHECK


def test_verdict_is_computed_not_hard_coded():
    # The MATCH line is printed by R from the per-quantity comparisons, never as a literal pass.
    assert 'sprintf(\\"MATCH %d/%d' in RCHECK
    assert not re.search(r'cat\(\\"MATCH', RCHECK)
    assert "tol = 1e-6" in RCHECK


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
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield "http://127.0.0.1:%d/%s/" % (httpd.server_address[1], APP)
    httpd.shutdown()


def _script_for(url, actions, tmp_path, name):
    _need(shutil.which("node"), "node not on PATH")
    _need(os.environ.get("ALM_PLAYWRIGHT") and os.environ.get("ALM_CHROME"), "ALM_PLAYWRIGHT / ALM_CHROME not set")
    r = subprocess.run(["node", str(DRIVER), url, json.dumps(actions), "window.__almRCheckInputs() && " + HOOK],
                       capture_output=True, text=True, encoding="utf-8", timeout=900)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out["script"], "the page produced no R script"
    p = tmp_path / (name + ".R")
    p.write_text(out["script"], encoding="utf-8")
    return p, out["script"]


def _run_r(path):
    rs = shutil.which("Rscript")
    _need(rs, "Rscript not on PATH")
    r = subprocess.run([rs, "--vanilla", str(path)], capture_output=True, text=True, encoding="utf-8", timeout=900)
    return r.returncode, r.stdout + r.stderr


def _assert_match(rc, out):
    assert rc == 0, out
    m = re.search(r"^MATCH (\d+)/(\d+)$", out, re.M)
    assert m and m.group(1) == m.group(2) and int(m.group(1)) > 0, out
    assert "MISMATCH" not in out and "DIFFERS" not in out, out


def test_default_example_script_runs_in_R_and_matches(server, tmp_path):
    p, _ = _script_for(server, DEFAULT_ACTIONS, tmp_path, "default")
    _assert_match(*_run_r(p))


def test_pasted_data_reaches_the_script_and_matches(server, tmp_path):
    p, code = _script_for(server, PASTED_ACTIONS, tmp_path, "pasted")
    for tok in PASTED_TOKENS:
        assert tok in code, tok
    _assert_match(*_run_r(p))


EDIT_WITHOUT_RUN = [{"waitFor": "window.__almRCheckInputs && window.__almRCheckInputs()"}, {"fill": "#src", "value": "X, 1.5, 0.01\nY, 1.6, 0.01\nZ, 1.7, 0.01"}, {"wait": 500}]


def test_validator_handoff_sends_the_analysed_rows_not_unrun_edits(server):
    # Codex finding (2026-11-17), reproduced by execution before the fix: after the user edits the
    # textarea WITHOUT re-running, "Verify in R" handed the validator the edited rows while the page
    # still displayed the earlier run's result. The hand-off must be the analysed snapshot.
    _need(shutil.which("node"), "node not on PATH")
    _need(os.environ.get("ALM_PLAYWRIGHT") and os.environ.get("ALM_CHROME"), "ALM_PLAYWRIGHT / ALM_CHROME not set")
    hook = "JSON.stringify({v: window.__almValidatorStudies(), a: window.__almRCheckInputs()})"
    r = subprocess.run(["node", str(DRIVER), server, json.dumps(EDIT_WITHOUT_RUN), hook],
                       capture_output=True, text=True, encoding="utf-8", timeout=900)
    assert r.returncode == 0, r.stderr
    got = json.loads(json.loads(r.stdout)["script"])
    analysed = got["a"]["rows"]
    assert [s["label"] for s in got["v"]] == [x["label"] for x in analysed], got["v"]
    assert "X" not in [s["label"] for s in got["v"]]
