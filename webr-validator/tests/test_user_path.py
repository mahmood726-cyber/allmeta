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
    # ... plus FE, which proportion-ma sends (test_validator_fits_proportion_ma_fixed_effect).
    assert set(re.findall(r'"([A-Z]+)"', allow)) == set(ESTIMATORS) | {"FE"}, allow


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


# ---- Every control that opens this validator must send the studies on screen ----
# Found on the live user path 2026-11-12 in real Chrome (lanes up1, up2, up3):
# heterogeneity, pubbias-tests, meta-regression, limit-ma and copas attached
# "Verify in R" WITHOUT getStudies, so it read whatever was already on the shared
# bus. In a fresh browser that is nothing, and the user got only the alert "No
# studies on the shared bus yet -- save your data to the bus first."; after another
# app or an earlier dataset had written the bus, the validator opened with THOSE
# studies, not the analysis on screen. app-flow's "Continue with -> Verify in R
# (WebR)" has the same fallback to MaStudies.read() when no getStudies is passed.
#
# One guard over EVERY top-level app page (both controls). KNOWN_UNFIXED lists the
# app/control pairs that still have the defect (open, reported to the coordinator).
# It may only shrink: a new pair without a provider fails, and a listed pair that
# gains one fails until it is removed from the list.
REPO = HERE.parent.parent
VERIFY, CONTINUE = "verify-in-r", "continue-with-validator"
KNOWN_UNFIXED = {
    "bayesian-ma": {VERIFY, CONTINUE}, "bayesian-mcmc": {VERIFY, CONTINUE},
    "bma-tau-priors": {CONTINUE}, "copas": {VERIFY}, "cross-design": {CONTINUE},
    "cumulative-subgroup": {VERIFY, CONTINUE}, "forest-plot": {VERIFY, CONTINUE},
    "funnel-plot": {VERIFY, CONTINUE}, "gosh-metareg": {VERIFY}, "gosh": {VERIFY},
    "influence": {VERIFY}, "pet-peese": {VERIFY}, "tsa": {VERIFY},
}
# Fixed on this branch; each must still be wired (a deleted button is not a fix).
FIXED = ("heterogeneity", "pubbias-tests", "meta-regression", "limit-ma", "proportion-ma")


def _app_pages():
    """(app, source) for every tracked top-level */index.html.

    A sparse worktree has only some apps on disk, and a glob of the disk would
    silently shrink the population (and pass); so the tracked list comes from
    git and a page missing from disk is read from the index (same bytes)."""
    try:
        out = subprocess.run(["git", "-C", str(REPO), "ls-files", "-z", "--", "*/index.html"],
                             capture_output=True, timeout=60)
        tracked = [t for t in out.stdout.decode("utf-8").split("\0") if t.count("/") == 1] if out.returncode == 0 else []
    except (OSError, subprocess.SubprocessError):
        tracked = []
    if not tracked:
        tracked = sorted(p.relative_to(REPO).as_posix() for p in REPO.glob("*/index.html"))
    absent = [rel for rel in tracked if not (REPO / rel).is_file()]
    blobs = {}
    if absent:  # one git process for all of them, not one per page
        got = subprocess.run(["git", "-C", str(REPO), "cat-file", "--batch"],
                             input="".join(":%s\n" % rel for rel in absent).encode("utf-8"),
                             capture_output=True, timeout=120)
        assert got.returncode == 0, got.stderr
        buf, pos = got.stdout, 0
        for rel in absent:
            nl = buf.index(b"\n", pos)
            head = buf[pos:nl].split()
            assert len(head) == 3 and head[1] == b"blob", "cannot read tracked page %s: %r" % (rel, buf[pos:nl])
            size = int(head[2])
            blobs[rel] = buf[nl + 1:nl + 1 + size].decode("utf-8", errors="replace")
            pos = nl + 1 + size + 1
    for rel in sorted(tracked):
        f = REPO / rel
        src = f.read_text(encoding="utf-8", errors="replace") if f.is_file() else blobs[rel]
        yield rel.split("/")[0], src


def _call_args(src, fn):
    for m in re.finditer(fn + r"\(\s*\{", src):
        depth, i = 0, m.end() - 1
        while i < len(src):
            depth += {"{": 1, "}": -1}.get(src[i], 0)
            if depth == 0:
                break
            i += 1
        yield src[m.end() - 1:i + 1]


def _validator_controls():
    """(app, control, args) for every Verify-in-R button and every Continue-with
    bar that offers the validator."""
    for app, src in _app_pages():
        for args in _call_args(src, "attachVerifyInRButton"):
            yield app, VERIFY, args
        for args in _call_args(src, "attachContinueBar"):
            if '"webr-validator"' in args or "'webr-validator'" in args:
                yield app, CONTINUE, args


def _verify_calls():
    for app, control, args in _validator_controls():
        if control == VERIFY:
            yield app, args


def test_validator_controls_send_the_current_studies():
    controls = list(_validator_controls())
    assert len({a for a, _, _ in controls}) >= 15, "population too small -- page discovery is broken"
    missing = {(a, c) for a, c, args in controls if "getStudies" not in args}
    known = {(a, c) for a, cs in KNOWN_UNFIXED.items() for c in cs}
    new = sorted(missing - known)
    assert not new, "control opens the validator without getStudies (stale or empty bus): %s" % new
    fixed = sorted(known - missing)
    assert not fixed, "now sends the current studies (or is gone); remove from KNOWN_UNFIXED: %s" % fixed
    for app in FIXED:
        assert any(a == app and c == VERIFY for a, c, _ in controls), "%s: no Verify in R wiring found" % app


def test_limit_ma_asks_the_validator_for_its_own_dl_model():
    calls = [args for app, args in _verify_calls() if app == "limit-ma"]
    if not calls:
        import pytest
        pytest.skip("limit-ma not in this checkout")
    assert 'method: "DL"' in calls[0] and 'test: "z"' in calls[0] and "getStudies" in calls[0]


def test_attach_forwards_method_and_test_to_the_validator():
    js = r"""
    global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=String(v)}, removeItem(k){delete this._s[k]} };
    global.location = { pathname: "/allmeta/limit-ma/" };
    let opened = null; global.open = (p) => { opened = p; return {}; }; global.alert = (m) => { opened = "ALERT " + m; };
    const btn = { addEventListener(t, f) { this.f = f; } };
    global.document = { querySelector: () => btn };
    const M = require(process.argv[1]);
    M.attachVerifyInRButton({ btn: "#b", method: "DL", test: "z", getStudies: () => [{label:"A", est: 0.1, se: 0.2}, {label:"B", est: 0.3, se: 0.1}] });
    btn.f();
    console.log(JSON.stringify(opened));
    """
    out = subprocess.run(["node", "-e", js, str(BUS)], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    url = json.loads(out.stdout.strip().splitlines()[-1])
    assert "from=limit-ma" in url and "method=DL" in url and "test=z" in url, url


# ---- proportion-ma: the validator must fit the page's tau^2 estimator (2026-11-12) ----
# Lane up2, real Chrome: proportion-ma's "Verify in R" sent the studies but no
# estimator, so with "DerSimonian-Laird" selected the validator (and its exported
# validate.R) fitted its PM default. The bus rows are always logit proportions, so
# the validator's fit is the page's logit pool with the same estimator and z test.
def test_proportion_ma_asks_the_validator_for_its_selected_estimator():
    calls = [args for app, args in _verify_calls() if app == "proportion-ma"]
    assert calls, "proportion-ma: no Verify in R wiring found"
    js = r"""
    const args = process.argv[1];
    const out = {};
    for (const sel of ["DL", "PM", "FE"]) {
      const document = { getElementById: (id) => (id === "tau-est" ? { value: sel } : null) };
      const current = () => [];
      const opts = new Function("document", "current", "return (" + args + ");")(document, current);
      let m = opts.method, t = opts.test;
      if (typeof m === "function") m = m(); if (typeof t === "function") t = t();
      out[sel] = { method: m, test: t };
    }
    console.log(JSON.stringify(out));
    """
    out = subprocess.run(["node", "-e", js, calls[0]], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    r = json.loads(out.stdout.strip().splitlines()[-1])
    assert r == {m: {"method": m, "test": "z"} for m in ("DL", "PM", "FE")}, r



def test_validator_fits_proportion_ma_fixed_effect():
    # proportion-ma also offers "Fixed-effect only" (#tau-est = FE). The validator
    # accepted no FE, so a page fitting FE was re-fitted as PM and could "Match"
    # a different model (Codex review of the integration branch, 2026-11-12).
    sel = re.search(r'<select id="f-method".*?</select>', PAGE, re.S).group(0)
    assert 'value="FE"' in sel
    allow = re.search(r'if \(m && \[([^\]]+)\]\.includes\(m\)\)', PAGE).group(1)
    assert "FE" in set(re.findall(r'"([A-Z]+)"', allow)), allow
    # metafor rma(method = "FE") takes no tau^2 iteration controls.
    assert re.search(r'method === "DL" \|\| method === "FE"', PAGE), "FE must not get tau^2 controls"


# ---- tools/userpath/userpath.cjs must not report PASS for an unfinished or empty check ----
# Codex review of the integration branch (2026-11-12) probed judge() directly:
# "5/5 live R quantities passed" from an EARLIER panel next to a panel still
# "Running R in WebR..." returned PASS, and "0/0 live R quantities passed" returned
# PASS. A check that did not finish, or checked nothing, is not a pass.
USERPATH = REPO / "tools" / "userpath" / "userpath.cjs"


def _judge(cases):
    js = r"""
    const { judge } = require(process.argv[1]);
    console.log(JSON.stringify(JSON.parse(process.argv[2]).map(([c, r]) => judge(c, r).verdict)));
    """
    out = subprocess.run(["node", "-e", js, str(USERPATH), json.dumps(cases)],
                         capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_userpath_judge_needs_a_new_finished_nonempty_result():
    c = {"id": "btn-extras", "text": "Validate the extras in R"}
    before = "Main panel: 5/5 live R quantities passed"
    cases = [
        # earlier panel's pass, this control's panel still running at timeout
        [c, {"kind": "inpage", "text": before + "\nExtras: Running R in WebR...", "before": before, "stillBusy": True}],
        # nothing new appeared after pressing this control
        [c, {"kind": "inpage", "text": before, "before": before, "stillBusy": False}],
        # empty check
        [c, {"kind": "inpage", "text": "0/0 live R quantities passed", "before": "", "stillBusy": False}],
        # control could not be pressed
        [c, {"kind": None, "error": "not visible"}],
        # genuine new pass
        [c, {"kind": "inpage", "text": before + "\nExtras: 3/3 live R quantities passed", "before": before, "stillBusy": False}],
    ]
    assert _judge(cases) == ["FAIL", "UNKNOWN", "UNKNOWN", "FAIL", "PASS"]
