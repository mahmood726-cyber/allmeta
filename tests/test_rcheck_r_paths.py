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
    # Rscript is needed only by tests that execute R; the mocked-WebR tests run without it (XREV-631 A4).
    if not RSCRIPT:
        pytest.skip("Rscript not found")
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
        # The download IS the script the WebR button runs: capture it at the WebR boundary (the runR call made
        # by the real Verify button), not from the getter (XREV-631 finding 3). The stub never starts WebR.
        pg.evaluate("""() => { window.__rcheckSent = null; window.__rcheckRealRunR = window.AlmWebR.runR;
            window.AlmWebR.runR = async opts => { window.__rcheckSent = opts.script;
                return { ok: true, stdout: "MATCH 1/1", versions: { R: "test stub" } }; }; }""")
        pg.click("#btn-verify-r")
        pg.wait_for_function("() => window.__rcheckSent !== null")
        sent = pg.evaluate("() => window.__rcheckSent")
        pg.evaluate("() => { window.AlmWebR.runR = window.__rcheckRealRunR; }")
        assert downloaded == script == sent
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


# ---- PR #631 review findings -------------------------------------------------------------------------
RACE_DATA = {
    "poth": "0.9, A\n0.5, B\n0.1, C",
    "multiplicative-ma": "0.5, 0.2\n0.7, 0.3\n0.2, 0.25",
    "multiplicative-nma": "A, B, 0.3, 0.2\nA, C, 0.6, 0.2\nB, C, 0.2, 0.3\nA, B, 0.4, 0.25",
    "nma-meta-reg": ("S1, A, B, -0.3, 0.1, 50\nS2, A, B, -0.2, 0.1, 60\nS3, A, C, -0.4, 0.1, 55\n"
                     "S4, A, C, -0.5, 0.12, 65\nS5, B, C, -0.1, 0.1, 58\nS6, A, B, -0.35, 0.1, 52\nS7, A, C, -0.45, 0.1, 61"),
}


@pytest.mark.parametrize("app", list(CASES))
@pytest.mark.parametrize("second", ["rerun", "invalid"])
def test_webr_result_of_a_superseded_analysis_is_not_shown(browser, app, second):
    """Finding 1 (MAJOR): R started on analysis A must not report its verdict next to analysis B (or next to
    an input error) when it finishes after the user re-ran the page. WebR is mocked so the timing is exact."""
    br, base = browser
    pg = br.new_page()
    try:
        pg.goto(base + app + "/", wait_until="load", timeout=120000)
        pg.click("#btn-run")
        pg.evaluate("""() => { window.AlmWebR.runR = function () { return new Promise(r => { window.__resolve = r; }); }; }""")
        pg.click("#btn-verify-r")
        pg.wait_for_function("() => !!window.__resolve")
        new = RACE_DATA[app] if second == "rerun" else "not, a, number"
        pg.evaluate("""d => { const ta = [...document.querySelectorAll('textarea')].sort((a, b) => b.clientHeight - a.clientHeight)[0];
            ta.value = d; ta.dispatchEvent(new Event('input', { bubbles: true })); }""", new)
        pg.click("#btn-run")
        pg.evaluate("""() => window.__resolve({ ok: true, stdout: ['output of analysis A', 'MATCH 7/7'].join(String.fromCharCode(10)), versions: { R: 'R x' } })""")
        pg.wait_for_timeout(300)
        verdict = pg.text_content("#rcheck-verdict")
        out = pg.text_content("#rcheck-out")
        assert "MATCH 7/7" not in verdict and "analysis A" not in out, (verdict, out)
        assert "changed" in verdict, verdict   # the user is told why there is no verdict
        if second == "rerun":
            assert not pg.is_disabled("#btn-verify-r")
        else:
            # XREV-631 A3: with no analysis on the page the button is disabled, so the page must not tell
            # the user to press it.
            assert pg.is_disabled("#btn-verify-r")
            assert "Press Verify in R again" not in verdict, verdict
    finally:
        pg.close()


@pytest.mark.parametrize("app", list(CASES))
def test_webr_error_of_a_superseded_analysis_is_not_shown(browser, app):
    """XREV-631 A3: a WebR run that THROWS after the user re-ran the page belongs to the earlier analysis; its
    error must not replace the 'inputs changed' notice next to the current analysis."""
    br, base = browser
    pg = br.new_page()
    try:
        pg.goto(base + app + "/", wait_until="load", timeout=120000)
        pg.click("#btn-run")
        pg.evaluate("""() => { window.AlmWebR.runR = function () { return new Promise((res, rej) => { window.__reject = rej; }); }; }""")
        pg.click("#btn-verify-r")
        pg.wait_for_function("() => !!window.__reject")
        pg.evaluate("""d => { const ta = [...document.querySelectorAll('textarea')].sort((a, b) => b.clientHeight - a.clientHeight)[0];
            ta.value = d; ta.dispatchEvent(new Event('input', { bubbles: true })); }""", RACE_DATA[app])
        pg.click("#btn-run")
        pg.evaluate("() => window.__reject(new Error('boom from analysis A'))")
        pg.wait_for_timeout(300)
        verdict = pg.text_content("#rcheck-verdict")
        assert "boom from analysis A" not in verdict and "changed" in verdict, verdict
        assert not pg.is_disabled("#btn-verify-r")
    finally:
        pg.close()


EXP_DATA = {
    "multiplicative-ma": ("-7.1, 0.3\n-6.9, 0.25\n-7.3, 0.4\n-6.8, 0.35\n-7.0, 0.3", [("#scale", "exp")], "metafor"),
    # |log effect| > 13.1 is where the old 1e-9 * exp(|x|) became looser than the 3-dp display
    "multiplicative-nma": ("A, B, -14.1, 0.3\nA, B, -13.9, 0.25\nA, C, -14.3, 0.4\nB, C, -0.2, 0.35\nA, C, -14.0, 0.3",
                           [("#scale", "exp")], "netmeta"),
}


@pytest.mark.parametrize("app", list(EXP_DATA))
def test_exponentiated_checks_are_not_looser_than_the_display(browser, tmp_path, app):
    """Finding 2 (MAJOR): on the exp scale a ratio of ~0.001 is shown to 3 dp. A page value off by 9e-4
    (0.001 shown as 0.002) must fail its row, whatever the log effect; and (finding 3) every displayed
    exponentiated estimate and limit has its own row."""
    br, base = browser
    data, settings, pkg = EXP_DATA[app]
    if not r_has(pkg):
        pytest.skip(f"R package {pkg} not installed")
    pg, script = page_script(br, base, app, data, settings)
    pg.close()
    rows = re.findall(r'chk\("(exp [^"]+)", ([-0-9.e+]+), ', script)
    if app == "multiplicative-ma":
        assert sorted(q for q, _ in rows) == sorted("exp %s %s" % (m, w) for m in ("FE", "PM", "UWLS")
                                                    for w in ("estimate", "CI lower", "CI upper"))
    r, v = run_r(script, tmp_path, app + "-exp")
    assert v and re.match(r"^MATCH (\d+)/\1$", v[-1]), r.stdout[-3000:]
    for q, val in rows:
        planted = script.replace('chk("%s", %s, ' % (q, val), 'chk("%s", %r, ' % (q, float(val) + 9e-4), 1)
        r, v = run_r(planted, tmp_path, app + "-exp-planted")
        assert v and v[-1].startswith("MISMATCH "), f"{q} off by 9e-4 (a different 3-dp display) still gives {v}"


# ---- XREV-631 (external review of the merged PR) -----------------------------------------------------------
@pytest.mark.parametrize("app,field", [("multiplicative-nma", "aicDiff"), ("nma-meta-reg", "p")])
def test_displayed_summary_field_is_checked(browser, tmp_path, app, field):
    """XREV-631 finding 1: the page displays res.aicDiff (the Delta AIC in the verdict line) and fit.p (the
    'p (params)' card). A wrong stored value must change the script AND turn the R verdict into MISMATCH."""
    br, base = browser
    if not r_has(CASES[app][0]):
        pytest.skip(f"R package {CASES[app][0]} not installed")
    pg, original = page_script(br, base, app)
    try:
        planted = pg.evaluate("""field => {
            const s = structuredClone(window.AlmRCheck._state());
            s.page[field] += 100;
            return window.AlmRCheck.buildScript(s);
        }""", field)
    finally:
        pg.close()
    assert planted != original, f"displayed {field} does not enter the R check"
    r, v = run_r(original, tmp_path, app + "-summary-clean")
    assert r.returncode == 0, r.stderr
    assert v and re.match(r"^MATCH (\d+)/\1$", v[-1]), r.stdout[-3000:]
    r, v = run_r(planted, tmp_path, app + "-summary-planted")
    assert r.returncode == 0, r.stderr
    assert v and v[-1].startswith("MISMATCH "), r.stdout[-3000:]


def test_nmr_r_check_uses_the_rows_the_page_analysed(browser, tmp_path):
    """XREV-631 finding 2: a row the engine rejects (here a missing covariate) is not analysed by the page, so
    it must not enter R's covariate shift or fit; and the 'Dropped multi-arm contrasts' row compares the
    number the page displays (rows dropped for that reason only), not every rejected row."""
    br, base = browser
    if not r_has("netmeta"):
        pytest.skip("R package netmeta not installed")
    data = RACE_DATA["nma-meta-reg"] + "\nBAD, A, B, -0.2, 0.1, missing"
    pg, script = page_script(br, base, "nma-meta-reg", data)
    try:
        st = pg.evaluate("() => { const p = window.AlmRCheck._state().page; return { n: p.n, dropped: p.droppedRows.map(r => r.reason) }; }")
        card = pg.evaluate("""() => [...document.querySelectorAll('#summary .card')].find(c => /Dropped multi-arm/.test(c.textContent)).querySelector('.v').textContent""")
    finally:
        pg.close()
    assert st["n"] == 7 and st["dropped"] == ["non-finite yi, sei, or covariate"], st
    assert card == "0"
    assert 'chk("dropped multi-arm contrasts", 0, ' in script, "the script does not compare the displayed count"
    r, v = run_r(script, tmp_path, "nmr-invalid-row-exclusion")
    assert r.returncode == 0, r.stderr
    assert v and re.match(r"^MATCH (\d+)/\1$", v[-1]), r.stdout[-3000:]
    assert "Invalid input rows excluded by the page and R: 1" in r.stdout, r.stdout[-3000:]
