"""User-path guards for the WebR validator (2026-11-11).

A user who pressed "Validate (R)" / "Verify in R" in any app that links here saw
"FAIL: wr.captureR is not a function": the page called captureR on the WebR
object, which webR 0.5.x does not have (it is a Shelter method). The project's
Node harness never drove this path, so nothing caught it. A real-Chrome run of
the path (tools/userpath/userpath.cjs) found it; these static guards keep the
specific failure classes from coming back without needing a browser in CI.
"""
import re
import subprocess
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE = (HERE.parent / "index.html").read_text(encoding="utf-8")
BUS = (HERE.parent.parent / "shared" / "ma-studies-v1.js")


def test_no_capture_on_the_webr_object():
    # captureR exists only on a Shelter in webR 0.5.x.
    assert not re.search(r"\b(wr|webR)\s*\.\s*captureR\s*\(", PAGE), \
        "captureR must be called on a Shelter (new webR.Shelter()), not on the WebR object"


def test_runs_through_the_pinned_runner():
    # The in-page "Validate this analysis in R" panels use shared/webr-runner.js,
    # which installs only the SHA-256-pinned bundle. The validator must run the
    # same R, not whatever metafor the webR CDN serves.
    assert '<script src="../shared/webr-runner.js"></script>' in PAGE
    assert "AlmWebR.runR(" in PAGE


def test_r_script_uses_tight_convergence():
    # metafor's default PM tolerance stops ~5e-4 short of the optimum, which the
    # page's own 1e-4 comparison then flags; a user pasting the script into R
    # saw different numbers from the app.
    assert "control = list(tol = 1e-12" in PAGE
    assert "control = list(threshold = 1e-12" in PAGE


def test_page_says_what_it_checks():
    assert 'id="source-banner"' in PAGE
    for app in ("mh-peto", "multilevel-ma", "meta-regression", "dta-sroc", "nma", "copas"):
        assert f'"{app}"' in PAGE, f"{app} must be listed as not an inverse-variance pool"


def test_open_in_webr_names_the_source_app():
    js = r"""
    global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=String(v)}, removeItem(k){delete this._s[k]} };
    global.location = { pathname: "/allmeta/mh-peto/index.html" };
    let opened = null; global.open = (p) => { opened = p; return {}; }; global.alert = () => {};
    const M = require(process.argv[1]);
    M.openInWebR({ studies: [{label:"A", est: 0.1, se: 0.2}, {label:"B", est: 0.3, se: 0.1}], method: "REML", test: "knha" });
    console.log(JSON.stringify(opened));
    """
    out = subprocess.run(["node", "-e", js, str(BUS)], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    url = json.loads(out.stdout.strip().splitlines()[-1])
    assert url.startswith("../webr-validator/?fromBus=1&"), url
    assert "from=mh-peto" in url and "method=REML" in url and "test=knha" in url, url


def test_continue_with_link_names_the_source_app():
    # The "Continue with -> Verify in R (WebR)" suggestion opens the validator
    # through shared/app-flow.js, not through openInWebR; it must pass from= too
    # (found on the live re-run 2026-11-12: those tabs showed no banner).
    flow = (HERE.parent.parent / "shared" / "app-flow.js").read_text(encoding="utf-8")
    assert "webr-validator\/" in flow and '"from=" + encodeURIComponent' in flow


# --- 2026-11-12 user-path re-check (lane up1): the hand-off from heterogeneity ---
# Real Chrome, live site, BCG pasted with REML selected: "Verify in R" opened the
# validator on studies an EARLIER session had left on the shared bus (or, for a new
# user, only an alert), and "Validate (R)" / "Continue with" made it fit PM/z, so R
# showed tau^2 0.3181 next to the page's REML 0.3132 while the validator said "Match".
# Browser check of the same path: hub/shared/tests/heterogeneity-validator-handoff.spec.mjs.

ESTIMATORS = ("PM", "REML", "DL", "ML", "EB", "SJ", "HE", "HS")


def test_verify_button_forwards_studies_and_model():
    # attachVerifyInRButton used to drop method/test, so no caller could pass them.
    js = r"""
    global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=String(v)}, removeItem(k){delete this._s[k]} };
    global.location = { pathname: "/allmeta/heterogeneity/" };
    let opened = null; global.open = (p) => { opened = p; return {}; }; global.alert = (m) => { opened = "ALERT " + m; };
    let handler = null; const btn = { addEventListener: (t, f) => { handler = f; } };
    global.document = { querySelector: () => btn };
    const M = require(process.argv[1]);
    M.write([{label:"Earlier", est: 0.9, se: 0.3}, {label:"Earlier2", est: 0.8, se: 0.3}]);
    M.attachVerifyInRButton({ btn: "#b", getStudies: () => [{label:"A", est: 0.1, se: 0.2}, {label:"B", est: 0.3, se: 0.1}],
                              method: () => "REML", test: "z" });
    handler();
    console.log(JSON.stringify({ opened, bus: M.read().map(s => s.label) }));
    """
    out = subprocess.run(["node", "-e", js, str(BUS)], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    r = json.loads(out.stdout.strip().splitlines()[-1])
    assert "method=REML" in r["opened"] and "test=z" in r["opened"] and "from=heterogeneity" in r["opened"], r
    assert r["bus"] == ["A", "B"], r


def test_validator_fits_every_estimator_apps_send():
    # heterogeneity offers eight tau^2 estimators; the validator accepted three, so
    # any other choice silently became PM.
    sel = re.search(r'<select id="f-method".*?</select>', PAGE, re.S).group(0)
    for m in ESTIMATORS:
        assert f'value="{m}"' in sel, m
    allow = re.search(r'if \(m && \[([^\]]+)\]\.includes\(m\)\)', PAGE).group(1)
    assert set(re.findall(r'"([A-Z]+)"', allow)) == set(ESTIMATORS), allow


def test_heterogeneity_controls_hand_over_the_page_analysis():
    het = (HERE.parent.parent / "heterogeneity" / "index.html").read_text(encoding="utf-8")
    verify = re.search(r"attachVerifyInRButton\(\{(.*?)\}\);", het, re.S).group(1)
    assert "getStudies" in verify and "method" in verify, verify
    validate = re.search(r'getElementById\("btn-validate-webr"\)\.addEventListener\("click", function \(\) \{(.*?)\n      \}\);', het, re.S).group(1)
    assert "&method=" in validate, validate
    bar = re.search(r"attachContinueBar\(\{(.*?)\}\);", het, re.S).group(1)
    assert "getStudies" in bar and "getValidatorModel" in bar, bar


def test_continue_with_forwards_validator_model_and_refuses_empty():
    flow = (HERE.parent.parent / "shared" / "app-flow.js").read_text(encoding="utf-8")
    js = r"""
    const opened = []; global.open = (p) => { opened.push(p); return {}; };
    global.location = { pathname: "/allmeta/heterogeneity/" };
    global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=String(v)}, removeItem(k){delete this._s[k]} };
    global.MaStudies = require(process.argv[2]);
    let click = null; const el = { innerHTML: "", addEventListener: (t, f) => { click = f; } };
    global.document = { querySelector: () => el };
    const F = require(process.argv[1]);
    let studies = [{label:"A", est: 0.1, se: 0.2}, {label:"B", est: 0.3, se: 0.1}];
    F.attachContinueBar({ container: "#x", suggestions: ["webr-validator"], getStudies: () => studies,
                          getValidatorModel: () => ({ method: "SJ", test: "z" }) });
    const ev = { target: { closest: () => ({ getAttribute: () => "webr-validator" }) } };
    click(ev); studies = []; global.MaStudies.write([{label:"Old", est: 1, se: 1}, {label:"Old2", est: 1, se: 1}]); click(ev);
    console.log(JSON.stringify(opened));
    """
    out = subprocess.run(["node", "-e", js, str(HERE.parent.parent / "shared" / "app-flow.js"), str(BUS)],
                         capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    opened = json.loads(out.stdout.strip().splitlines()[-1])
    assert len(opened) == 1, opened  # second click: no valid current studies -> not opened on the stale bus
    assert "method=SJ" in opened[0] and "test=z" in opened[0] and "from=heterogeneity" in opened[0], opened
