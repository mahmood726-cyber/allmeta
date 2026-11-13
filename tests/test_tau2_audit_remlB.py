"""tau2 estimators reachable from five pages must equal metafor 5.2.1 to 1e-6 (lane remlB, 2026-11-12).

Every implementation is EXECUTED: the page in real Chrome for inline engines, node for
shared modules. Reference values: tests/fixtures/tau2-audit-remlB-oracle.json, written by
tests/fixtures/tau2-audit-remlB-reference.R (metafor 5.2.1, tight tolerances).

Datasets: dat.bcg, dat.bangertdrowns2004, dat.normand1999, dat.molloy2014, a k=2 set with
tau2=0 and one with tau2>0, a tau2=0 set, and normand rescaled y*c, v*c^2 for c = 1e4 and
1e-4 (checked against c^2 times the unscaled reference: tau2 is exactly scale-equivariant).

Defects these tests were written against (each failed before its fix):
  living-meta   LMA.tauREML: Fisher information was 0.5*(sum w^2 - sum w^4/sum w), not
                0.5*tr(PP); when it went negative the loop broke on the first step and
                returned the DL start (molloy) or the 1%-of-mean-variance perturbation
                (tau2=0 sets); stop rule |step| < 1e-6 absolute; and ML/PM/HE/SJ were all
                silently computed as REML.
  bayesian-nma  DL denominator was sum(W) - sum(W^2)/sum(W) (the pairwise formula) instead
                of tr(W) - tr((X'WX)^-1 X'W^2 X) for the network design.
  nma-pro-v8.0  FrequentistNMA.estimateTau2: "REML" ran the Paule-Mandel fixed point
                tau2 <- tau2*Q(tau2)/df (so REML == PM), stop |step| < 1e-8 absolute; DL
                used the pairwise denominator on networks.
  multi-outcome-ma  the "per-outcome univariate REML" comparison was DerSimonian-Laird.
  gosh-metareg  the WLS solve refused (returned null) when |det| < 1e-14 absolute, so data
                on a large scale (normand x1e4) produced no result.
"""
import json
import shutil
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
ORACLE = json.loads((ROOT / "tests" / "fixtures" / "tau2-audit-remlB-oracle.json").read_text(encoding="utf-8"))
UNI = ORACLE["uni"]
NETS = ORACLE["nets"]
TOL = 1e-6
SCALES = {"normand_x1e4": 1e4, "normand_x1em4": 1e-4}
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
NODE = shutil.which("node")


def datasets():
    out = {nm: (d["yi"], d["vi"], d) for nm, d in UNI.items()}
    base = UNI["normand"]
    for nm, c in SCALES.items():
        out[nm] = ([y * c for y in base["yi"]], [v * c * c for v in base["vi"]], {"scale": c * c})
    return out


def expected(nm, key, method):
    """Reference tau2 for dataset nm; key = 'tau2' | 'reg_sqrtv' | 'reg_index'."""
    if nm in SCALES:
        return UNI["normand"][key][method] * SCALES[nm] ** 2
    return UNI[nm][key][method]


def close(got, exp):
    if got is None:
        return False
    if exp == 0:
        return abs(got) < 1e-10
    return abs(got - exp) / abs(exp) <= TOL


def report(rows):
    bad = [r for r in rows if not close(r[-2], r[-1])]
    lines = [" | ".join(str(x) for x in r) for r in bad]
    assert not bad, f"{len(bad)} of {len(rows)} tau2 values differ from metafor by > {TOL}:\n" + "\n".join(lines)


@pytest.fixture(scope="module")
def page():
    sync_api = pytest.importorskip("playwright.sync_api")
    if not CHROME.exists():
        pytest.skip("system Chrome not found")
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    pw = sync_api.sync_playwright().start()
    br = pw.chromium.launch(executable_path=str(CHROME), headless=True)

    def open_page(rel):
        pg = br.new_page()
        pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/{rel}", wait_until="load", timeout=120000)
        pg.wait_for_timeout(1000)
        return pg

    yield open_page
    br.close()
    pw.stop()
    srv.shutdown()


def test_living_meta_estimators_match_metafor(page):
    pg = page("living-meta/living-meta-complete.html")
    data = {nm: {"yi": y, "vi": v} for nm, (y, v, _) in datasets().items()}
    got = pg.evaluate("""d => { const o = {}; for (const nm in d) { o[nm] = {};
        for (const m of ['DL','REML','ML','PM','HE','SJ']) o[nm][m] = LMA.metaAnalysis(d[nm].yi, d[nm].vi, { method: m }).tau2; }
        return o; }""", data)
    rows = [("living-meta", m, nm, got[nm][m], expected(nm, "tau2", m)) for nm in got for m in got[nm]]
    report(rows)


def test_living_meta_pm_on_large_scale_via_ma_core(page):
    """normand x1e4 PM through shared/ma-core.js. Was a strict xfail while tau2PM capped its bracket at
    hi > 1e9 (returned 2^30 = 1073741824); PR #538 removed the cap. metafor: 728.251128594497 * 1e8."""
    pg = page("living-meta/living-meta-complete.html")
    exp = expected("normand_x1e4", "tau2", "PM")
    assert abs(exp - 7.28251128594497e10) / 7.28251128594497e10 < 1e-12, exp  # oracle file, not a new pin
    y, v, _ = datasets()["normand_x1e4"]
    got = pg.evaluate("d => LMA.metaAnalysis(d.yi, d.vi, { method: 'PM' }).tau2", {"yi": y, "vi": v})
    report([("living-meta", "PM", "normand_x1e4", got, exp)])


def test_bayesian_nma_dl_is_the_network_dl(page):
    pg = page("bayesian-nma/index.html")
    nets = {f"pw_{nm}": [{"t1": "B", "t2": "A", "te": y[i], "se": v[i] ** 0.5} for i in range(len(y))] for nm, (y, v, _) in datasets().items()}
    # the page's input has no study column, so every row is an independent contrast
    for nm in ("senn_rows_independent", "smoking_rows_independent", "senn_2arm", "smoking_2arm"):
        nets[nm] = [{"t1": r["treat1"], "t2": r["treat2"], "te": r["TE"], "se": r["seTE"]} for r in NETS[nm]["data"]]
    got = pg.evaluate("""nets => { const o = {}; for (const nm in nets) {
        const txt = nets[nm].map(r => [r.t1, r.t2, r.te, r.se].join(', ')).join('\\n');
        const r = window.__almBNMA(txt, undefined, 'lower'); o[nm] = r ? r.tau2 : null; } return o; }""", nets)
    rows = []
    for nm, g in got.items():
        exp = NETS[nm]["tau2"]["DL"] if nm in NETS else expected(nm[3:], "tau2", "DL")
        rows.append(("bayesian-nma", "DL", nm, g, exp))
    report(rows)


def test_nma_pro_estimators_match_metafor(page):
    pg = page("nma-pro-v2/nma-pro-v8.0.html")
    nets = {}
    for nm, (y, v, _) in datasets().items():
        if nm == "normand_x1em4":
            continue  # VARIANCE_FLOOR = 1e-4 clamps every variance of this set (reported, not fixed here)
        nets[f"pw_{nm}"] = [{"name": f"s{i}", "treatment1": "B", "treatment2": "A", "yi": y[i], "vi": v[i]} for i in range(len(y))]
    for nm in ("senn_2arm", "smoking_2arm"):
        nets[nm] = [{"name": r["studlab"], "treatment1": r["treat1"], "treatment2": r["treat2"], "yi": r["TE"], "vi": r["seTE"] ** 2} for r in NETS[nm]["data"]]
    got = pg.evaluate("""nets => { const o = {}; for (const nm in nets) { o[nm] = {};
        const st = nets[nm], trts = [...new Set(st.flatMap(s => [s.treatment1, s.treatment2]))].sort();
        const mat = FrequentistNMA.buildMatrices(FrequentistNMA.calcEffects(st, 'MD'), trts[0], { effectMeasure: 'MD' });
        for (const m of ['DL','REML','PM']) o[nm][m] = FrequentistNMA.estimateTau2(mat, m).tau2; } return o; }""", nets)
    rows = []
    for nm, res in got.items():
        for m, g in res.items():
            exp = NETS[nm]["tau2"][m] if nm in NETS else expected(nm[3:], "tau2", m)
            rows.append(("nma-pro-v8.0", m, nm, g, exp))
    report(rows)


def test_gosh_metareg_dl_meta_regression_on_any_scale(page):
    pg = page("gosh-metareg/index.html")
    data = {nm: [{"te": y[i], "se": v[i] ** 0.5, "mod": i + 1} for i in range(len(y))]
            for nm, (y, v, _) in datasets().items() if len(y) >= 4}
    got = pg.evaluate("""d => { const o = {}; for (const nm in d) { const r = window.__almMetareg(d[nm]); o[nm] = r ? r.tau2 : null; } return o; }""", data)
    report([("gosh-metareg", "DL (yi ~ index)", nm, g, expected(nm, "reg_index", "DL")) for nm, g in got.items()])


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_multi_outcome_univariate_comparison_is_reml():
    data = {nm: {"yi": y, "vi": v} for nm, (y, v, _) in datasets().items()}
    js = (
        "globalThis.AlmMaCore = require('./shared/ma-core.js');"
        "const MO = require('./shared/multi-outcome-ma.js'); const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        "const o = {}; for (const nm in d) { const st = d[nm].yi.map((y, i) => ({ y: [y, NaN], V: [[d[nm].vi[i], 0], [0, 1]] }));"
        "o[nm] = MO.fitUnivariatePerOutcome(st, 2)[0].tau2; } process.stdout.write(JSON.stringify(o));"
    )
    r = subprocess.run([NODE, "-e", js], input=json.dumps(data), capture_output=True, text=True, cwd=ROOT, timeout=60)
    assert r.returncode == 0, r.stderr
    got = json.loads(r.stdout)
    report([("multi-outcome-ma", "REML", nm, g, expected(nm, "tau2", "REML")) for nm, g in got.items()])


def test_nma_pro_analyze_finishes_and_tau2_ci_is_scale_equivariant(page):
    """FrequentistNMA.analyze() always runs profileLikelihoodCI, which stepped tau2 down by 0.001
    and up by 0.01 from the estimate: ~tau2/0.001 likelihood evaluations, so the page froze once
    tau2 was large (normand1999 x100, tau2 = 6.8e6: > 30 s; x1e4: ~1e13 evaluations). x10 is used
    here so the pre-fix run still terminates (it takes tens of seconds and fails the time bound)."""
    pg = page("nma-pro-v2/nma-pro-v8.0.html")
    base = UNI["normand"]
    out = {}
    for c in (1.0, 10.0):
        st = [{"name": f"s{i}", "treatment1": "B", "treatment2": "A", "yi": y * c, "vi": v * c * c}
              for i, (y, v) in enumerate(zip(base["yi"], base["vi"]))]
        out[c] = pg.evaluate("""st => { const t0 = performance.now();
            const r = FrequentistNMA.analyze(st, { reference: 'A', effectMeasure: 'MD', estimator: 'REML' });
            return { tau2: r.tau2, lo: r.tau2CI.lower, hi: r.tau2CI.upper, ms: performance.now() - t0 }; }""", st)
        assert out[c]["ms"] < 20000, f"x{c}: analyze took {out[c]['ms']:.0f} ms"
    rows = [("nma-pro-v8.0", "REML", "pw_normand", out[1.0]["tau2"], expected("normand", "tau2", "REML"))]
    for c in (10.0,):
        for key in ("tau2", "lo", "hi"):
            rows.append(("nma-pro-v8.0 tau2 profile CI", key, f"normand x{c:g} vs c^2 * x1", out[c][key], out[1.0][key] * c * c))
    report(rows)


PLCI = json.loads((ROOT / "tests" / "fixtures" / "nma-pro-tau2-plci-oracle.json").read_text(encoding="utf-8"))["plci"]


def test_nma_pro_tau2_profile_ci_matches_metafor_pl(page):
    """The tau2 95% CI that analyze() reports must be the profile-likelihood CI of the estimator in use:
    metafor confint(rma(method = M), type = "PL"), crossing max - qchisq(.95, 1) / 2 of the RESTRICTED
    log-likelihood for REML and of the ML log-likelihood for ML. It profiled the ML log-likelihood
    for every estimator and anchored it at that estimator's estimate (for REML not the ML maximum), with
    1.92 for qchisq(.95, 1) / 2: normand REML gave [228.89, 1947.41] where metafor gives [255.81, 2379.19].
    Reference: tests/fixtures/nma-pro-tau2-plci-reference.R (metafor 5.2.1, tight tolerances)."""
    pg = page("nma-pro-v2/nma-pro-v8.0.html")
    data = {nm: UNI[nm] for nm in PLCI if nm in UNI}
    got = pg.evaluate("""d => { const o = {}; for (const nm in d) { o[nm] = {};
        const st = d[nm].yi.map((y, i) => ({ name: 's' + i, treatment1: 'B', treatment2: 'A', yi: y, vi: d[nm].vi[i] }));
        for (const m of ['REML', 'ML']) { const r = FrequentistNMA.analyze(st, { reference: 'A', effectMeasure: 'MD', estimator: m });
            o[nm][m] = { tau2: r.tau2, lower: r.tau2CI.lower, upper: r.tau2CI.upper }; } } return o; }""", data)
    rows = [("nma-pro-v8.0 tau2 PL CI", m, f"{nm} {k}", got[nm][m][k], PLCI[nm][m][k])
            for nm in got for m in got[nm] for k in ("tau2", "lower", "upper")]
    report(rows)


def test_nma_pro_tau2_profile_ci_saturated_is_null_and_k2_matches_metafor(page):
    """With df = n - p = 0 tau2 is not identifiable: the restricted log-likelihood is flat, so the upper
    bracket doubled 200 times and the page reported an upper limit of 1.6e59 (agy review r550). Such a
    model has no tau2 CI (null, as pauleMandel_CI). k = 2 (df = 1) still has one: metafor PL, oracle k2_two."""
    pg = page("nma-pro-v2/nma-pro-v8.0.html")
    got = pg.evaluate("""() => { const nets = {
        one: [{ name: 's1', treatment1: 'B', treatment2: 'A', yi: 0.3, vi: 0.1 }],
        star: [{ name: 's1', treatment1: 'B', treatment2: 'A', yi: 0.3, vi: 0.1 }, { name: 's2', treatment1: 'C', treatment2: 'A', yi: -0.2, vi: 0.1 }],
        k2_two: [{ name: 's1', treatment1: 'B', treatment2: 'A', yi: 0.3, vi: 0.1 }, { name: 's2', treatment1: 'B', treatment2: 'A', yi: -0.2, vi: 0.1 }] };
        const o = {}; for (const k in nets) for (const m of ['REML', 'ML', 'DL']) {
            const r = FrequentistNMA.analyze(nets[k], { reference: 'A', effectMeasure: 'MD', estimator: m }); o[k + ' ' + m] = r.tau2CI; }
        return o; }""")
    for k in ("one", "star"):
        for m in ("REML", "ML", "DL"):
            assert got[f"{k} {m}"] is None, f"{k} {m}: df = 0 but tau2CI = {got[k + ' ' + m]}"
    rows = [("nma-pro-v8.0 tau2 PL CI", m, f"k2_two {b}", got[f"k2_two {m}"][b], PLCI["k2_two"][m][b])
            for m in ("REML", "ML") for b in ("lower", "upper")]
    report(rows)
