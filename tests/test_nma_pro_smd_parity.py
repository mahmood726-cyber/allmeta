"""nma-pro-v8.0 SMD from arm data against R (lane nmasmd, 2026-11-15).

Reference: nma-pro-v2/tests/fixtures/smd-oracle.R -> smd-oracle.json (R 4.6.0, metafor 5.0.1, meta 8.5-0,
netmeta 3.7-0); the R script header says exactly how every number is formed.

Defects this pins (both in FrequentistNMA.calcEffects, the SMD branch):
1. Variance. The page labelled its variance "Hedges exact" but computed
   (n1 + n2)/(n1 n2) + g^2/(2 df) (1 - J^2), whose second term is ~g^2 * 3/(4 df^2), i.e. ~0: the variance was
   essentially 1/n1 + 1/n2 and matched neither meta::metacont (= metafor escalc vtype "UB", the unbiased estimate of
   the exact variance) nor escalc's default "LS". dat.normand1999 Orpington-Severe: page 0.11342, R 0.16636 (-32%).
   J was the approximation 1 - 3/(4 df - 1); R uses the exact Gamma ratio (Montreal-Home: 0.96 vs 0.959910).
2. Multi-arm. Each contrast was standardised by the SD pooled over ITS OWN two arms, so the contrasts of a k-arm study
   were on different scales and not consistent: Franchini2012 Guttman 1997 (3 arms, SDs 4.4 / 4.3 / 4.3) was refused
   as "not consistent ... correct the contrasts of this study" although the arm data are fine (netmeta refuses those
   per-pair contrasts too; its own pairwise() pools the SD over all arms of a multi-arm study).
"""
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
APP = "nma-pro-v2/nma-pro-v8.0.html"
ORACLE = json.loads((ROOT / "nma-pro-v2/tests/fixtures/smd-oracle.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def pg():
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
    page = br.new_page()
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/{APP}", wait_until="load", timeout=120000)
    page.wait_for_function("() => typeof FrequentistNMA !== 'undefined'")
    yield page
    br.close()
    pw.stop()
    srv.shutdown()


def close(a, b, tol):
    return abs(a - b) <= tol * max(1.0, abs(b))


def normand_rows():
    return [dict(name=r["study"], treatment1="S", treatment2="G", n1=r["n1"], mean1=r["m1"], sd1=r["s1"],
                 n2=r["n2"], mean2=r["m2"], sd2=r["s2"]) for r in ORACLE["normand"]]


def franchini_rows():
    return [dict(name=r["study"], treatment1=r["t1"], treatment2=r["t2"], n1=r["n1"], mean1=r["m1"], sd1=r["s1"],
                 n2=r["n2"], mean2=r["m2"], sd2=r["s2"]) for r in ORACLE["franchini"]]


def calc(pg, rows, em):
    return pg.evaluate("([rows, em]) => FrequentistNMA.calcEffects(rows, em).map(r => [r.yi, r.vi])", [rows, em])


def test_two_arm_hedges_g_and_variance_match_metacont(pg):
    got = calc(pg, normand_rows(), "SMD")
    for (yi, vi), r in zip(got, ORACLE["normand"]):
        assert close(yi, r["g"], 1e-10), f"{r['study']}: g {yi} vs R {r['g']}"
        assert close(vi, r["vi_UB"], 1e-10), f"{r['study']}: var {vi} vs metacont / escalc(UB) {r['vi_UB']}"


def test_two_arm_md_matches_metacont(pg):
    got = calc(pg, normand_rows(), "MD")
    for (yi, vi), r in zip(got, ORACLE["normand"]):
        assert close(yi, r["md"], 1e-12) and close(vi, r["vi_md"], 1e-12), r["study"]


def test_multi_arm_contrasts_share_one_sd_and_match_r(pg):
    got = calc(pg, franchini_rows(), "SMD")
    for (yi, vi), r in zip(got, ORACLE["franchini"]):
        assert close(yi, r["g"], 1e-10), f"{r['study']} {r['t1']}-{r['t2']}: g {yi} vs R {r['g']}"
        assert close(vi, r["vi"], 1e-10), f"{r['study']} {r['t1']}-{r['t2']}: var {vi} vs R {r['vi']}"
    g = {(r["t1"], r["t2"]): y for (y, _), r in zip(got, ORACLE["franchini"]) if r["study"] == "Guttman 1997"}
    resid = g[("Placebo", "Bromocriptine")] - g[("Placebo", "Pramipexole")] - g[("Pramipexole", "Bromocriptine")]
    assert abs(resid) < 1e-12, f"Guttman 1997 contrasts not consistent: residual {resid}"


@pytest.mark.parametrize("est,key", [("FE", "common"), ("REML", "random")])
def test_franchini_network_from_arm_data_matches_netmeta(pg, est, key):
    res = pg.evaluate("""([rows, est]) => { try { const a = FrequentistNMA.analyze(rows, {reference: 'Placebo',
        effectMeasure: 'SMD', estimator: est, smallStudyCorrection: 'none', predictionIntervals: false});
        return {eff: Object.fromEntries(Object.entries(a.effects.effects).map(([k, v]) => [k, [v.estimate, v.se]])),
                Q: a.heterogeneity.Q, df: a.heterogeneity.df}; } catch (e) { return {error: e.name + ': ' + e.message}; } }""",
                      [franchini_rows(), est])
    assert "error" not in res, res.get("error")
    net = ORACLE["franchini_net"]
    for t, te in net[f"TE_{key}"].items():
        assert close(res["eff"][t][0], te, 1e-7), f"{t}: TE {res['eff'][t][0]} vs netmeta {te}"
        assert close(res["eff"][t][1], net[f"se_{key}"][t], 1e-7), f"{t}: SE {res['eff'][t][1]} vs netmeta {net[f'se_{key}'][t]}"
    assert close(res["Q"], net["Q"], 1e-8) and res["df"] == net["df_Q"]
