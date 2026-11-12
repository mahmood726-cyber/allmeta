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
