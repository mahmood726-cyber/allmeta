"""The R user paths of poth, multiplicative-ma, multiplicative-nma and nma-meta-reg.

Requirement (pack user path): each page offers "Download R script" and "Verify in R (WebR)", both running
one script generated from the inputs the page LAST ANALYSED. The script recomputes every displayed number
in R and ends with an honest "MATCH n/n" (or "MISMATCH").

These tests drive the real page in system Chrome, then:
  * check the script carries the user's pasted inputs (not the example),
  * run it in fresh Rscript (--vanilla) and require MATCH n/n for the default example and the pasted data,
  * plant a wrong page value and require MISMATCH (the verdict can fail).
In-page WebR is exercised by the lane's live-like run, not here (it downloads ~30 MB and takes minutes).
Skips (never passes) when Chrome, Python playwright, Rscript or the R package is missing.
"""
import os
import re
import shutil
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CHROME = Path(os.environ.get("ALM_CHROME", "C:/Program Files/Google/Chrome/Application/chrome.exe"))
RSCRIPT = os.environ.get("ALM_RSCRIPT") or shutil.which("Rscript")

POTH_PCT = "92%, Alpha\n74, Beta\n55, Gamma\n41, Delta\n23, Eps"
MMA_BCG = ("-0.889311, 0.570600, Aronson 1948\n-1.585389, 0.441114, Ferguson 1949\n"
           "-1.348073, 0.644490, Rosenthal 1960\n-1.441551, 0.141457, Hart 1977\n"
           "-0.217547, 0.226297, Frimodt-Moller 1973\n-0.786116, 0.083100, Stein 1953")
MNMA_SENN = ("plac, metf, -1.9000, 0.1414, DeFronzo1995\nplac, metf, -0.8200, 0.0992, Lewin2007\n"
             "plac, rosi, -1.3400, 0.1435, Davidson2007\nplac, rosi, -1.1000, 0.1141, Wolffenbuttel1999\n"
             "plac, piog, -1.3000, 0.1268, Kipnes2001\nplac, rosi, -0.7700, 0.1078, Kerenyi2004\n"
             "metf, piog, 0.1600, 0.0849, Hanefeld2004\nrosi, piog, 0.1000, 0.1831, Derosa2004\n"
             "plac, rosi, -1.3000, 0.1014, Baksi2004\nmetf, rosi, -0.1400, 0.2239, Yang2003")
NMR_SENN = ("DeFronzo1995, plac, metf, -1.9000, 0.1414, 8.5\nLewin2007, plac, metf, -0.8200, 0.0992, 8.3\n"
            "Davidson2007, plac, rosi, -1.3400, 0.1435, 8.6\nWolffenbuttel1999, plac, rosi, -1.1000, 0.1141, 8.1\n"
            "Kipnes2001, plac, piog, -1.3000, 0.1268, 7.8\nKerenyi2004, plac, rosi, -0.7700, 0.1078, 7.7\n"
            "Hanefeld2004, metf, piog, 0.1600, 0.0849, 8.7\nDerosa2004, rosi, piog, 0.1000, 0.1831, 7.8\n"
            "Baksi2004, plac, rosi, -1.3000, 0.1014, 8.1\nRosenstock2008, plac, rosi, -1.0900, 0.2263, 9.3\n"
            "Zhu2003, plac, rosi, -1.5000, 0.1624, 9.4\nYang2003, metf, rosi, -0.1400, 0.2239, 8.5\n"
            "Kim2007, metf, rosi, 0.0000, 0.2339, 8.5\nGonzalez-Ortiz2004, plac, metf, -0.4000, 0.4356, 8.0")

# app, R package needed, pasted data, extra settings, strings that must appear in the script, planted page value
CASES = {
    "poth": (None, POTH_PCT, [], ['"92%"', '"Gamma"'], ("page.poth", 0.123)),
    "multiplicative-ma": ("metafor", MMA_BCG, [], ["-1.585389", "0.0831"], ("page.uwls.se", 0.5)),
    "multiplicative-nma": ("netmeta", MNMA_SENN, [("#reference", "plac")], ['"piog"', "0.1831"], ("page.Q", 1.5)),
    "nma-meta-reg": ("netmeta", NMR_SENN, [("#f-ref", "plac"), ("#f-method", "ML")], ['"Gonzalez-Ortiz2004"', "0.4356"], ("page.QE", 1.5)),
}
EXAMPLE_MARK = {"poth": '"Drug A"', "multiplicative-ma": "1.1, ", "multiplicative-nma": '"A"', "nma-meta-reg": '"S01"'}


def r_has(pkg):
    if pkg is None:
        return True
    r = subprocess.run([RSCRIPT, "--vanilla", "-e", f"q(status = !requireNamespace('{pkg}', quietly = TRUE))"],
                       capture_output=True, timeout=120)
    return r.returncode == 0


def run_r(script, tmp_path, name):
    f = tmp_path / (name + ".R")
    f.write_text(script, encoding="utf-8")
    r = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=600)
    verdicts = [l for l in r.stdout.splitlines() if re.match(r"^(MATCH|MISMATCH) ", l)]
    return r, verdicts


@pytest.fixture(scope="module")
def browser():
    sync_api = pytest.importorskip("playwright.sync_api")
    if not CHROME.exists():
        pytest.skip("system Chrome not found")
    if not RSCRIPT:
        pytest.skip("Rscript not found")

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    pw = sync_api.sync_playwright().start()
    br = pw.chromium.launch(executable_path=str(CHROME), headless=True)
    yield br, f"http://127.0.0.1:{srv.server_address[1]}/"
    br.close()
    pw.stop()
    srv.shutdown()


def page_script(br, base, app, data=None, settings=()):
    pg = br.new_page()
    try:
        pg.goto(base + app + "/", wait_until="load", timeout=120000)
        if data is not None:
            pg.evaluate("""d => { const ta = [...document.querySelectorAll('textarea')].sort((a, b) => b.clientHeight - a.clientHeight)[0];
                ta.value = d; ta.dispatchEvent(new Event('input', { bubbles: true })); }""", data)
        for css, val in settings:
            if pg.eval_on_selector(css, "e => e.tagName") == "SELECT":
                pg.select_option(css, val)
            else:
                pg.fill(css, val)
        pg.click("#btn-run")
        assert pg.is_visible("#btn-rscript") and pg.is_visible("#btn-verify-r")
        assert pg.is_enabled("#btn-rscript"), "Download R script is disabled after a successful run"
        with pg.expect_download() as dl:
            pg.click("#btn-rscript")
        downloaded = Path(dl.value.path()).read_text(encoding="utf-8")
        script = pg.evaluate("() => window.AlmRCheck.script()")
        # the download IS the script the WebR button runs
        assert downloaded == script
        return pg, script
    except Exception:
        pg.close()
        raise


@pytest.mark.parametrize("app", list(CASES))
def test_r_script_matches_page(browser, tmp_path, app):
    br, base = browser
    pkg, data, settings, must, (plant_path, plant_value) = CASES[app]
    if not r_has(pkg):
        pytest.skip(f"R package {pkg} not installed")
    # default example
    pg, s_def = page_script(br, base, app)
    pg.close()
    assert EXAMPLE_MARK[app] in s_def
    r, v = run_r(s_def, tmp_path, app + "-default")
    assert r.returncode == 0, r.stderr
    m = re.match(r"^MATCH (\d+)/(\d+)$", v[-1]) if v else None
    assert m and m.group(1) == m.group(2) and int(m.group(2)) > 0, r.stdout[-3000:]
    # user-pasted data: the script must carry the CURRENT inputs, not the example
    pg, s_pas = page_script(br, base, app, data, settings)
    try:
        for token in must:
            assert token in s_pas, f"pasted input {token} missing from the generated script"
        assert EXAMPLE_MARK[app] not in s_pas, "script still carries the example data after the user changed it"
        # planted defect: a wrong page value must turn the verdict into MISMATCH
        planted = pg.evaluate("""([p, val]) => {
            const st = window.AlmRCheck._state(); const c = JSON.parse(JSON.stringify(st));
            const keys = p.split('.'); let o = c; for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
            o[keys[keys.length - 1]] = val; return window.AlmRCheck.buildScript(c); }""", [plant_path, plant_value])
    finally:
        pg.close()
    r, v = run_r(s_pas, tmp_path, app + "-pasted")
    assert r.returncode == 0, r.stderr
    m = re.match(r"^MATCH (\d+)/(\d+)$", v[-1]) if v else None
    assert m and m.group(1) == m.group(2) and int(m.group(2)) > 0, r.stdout[-3000:]
    r, v = run_r(planted, tmp_path, app + "-planted")
    assert v and v[-1].startswith("MISMATCH "), "a wrong page value was not caught: " + (v[-1] if v else r.stdout[-2000:])
