"""Tests for shared/nma-survival-nph.js — piecewise-exponential non-PH survival NMA.

Per-interval relative effects are pinned to netmeta::netmeta() run on the same
interval's log-HR contrasts (R 4.6.0, netmeta, 2026-07-11). The interval-1
network is 3 treatments A/B/C over studies s1(A,B), s2(A,C), s3(B,C).
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
PRELUDE = "const S = require('./shared/nma-survival-nph.js');\n"

IV1_ROWS = [
    {"study": "s1", "treatment": "A", "interval": "1", "events": 40, "ptime": 1000},
    {"study": "s1", "treatment": "B", "interval": "1", "events": 30, "ptime": 1000},
    {"study": "s2", "treatment": "A", "interval": "1", "events": 45, "ptime": 900},
    {"study": "s2", "treatment": "C", "interval": "1", "events": 20, "ptime": 900},
    {"study": "s3", "treatment": "B", "interval": "1", "events": 28, "ptime": 850},
    {"study": "s3", "treatment": "C", "interval": "1", "events": 22, "ptime": 800},
]
# netmeta::netmeta(..., reference.group="A", common=TRUE) golden
NETMETA = {"B": (-0.37706693, 0.20390481), "C": (-0.68219469, 0.21601098)}


def _run(expr: str):
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_per_interval_matches_netmeta():
    out = _run(f"S.fit({json.dumps(IV1_ROWS)}, {{model:'fe'}}).intervals['1']")
    assert out["refTreat"] == "A"
    for t, (te, se) in NETMETA.items():
        assert math.isclose(out["effects"][t]["logHR"], te, abs_tol=1e-6), (t, out["effects"][t])
        assert math.isclose(out["effects"][t]["se"], se, abs_tol=1e-6), (t, out["effects"][t])


def test_log_hazard_and_contrast_formula():
    # logHazard = log((events+cc)/ptime); log-HR = difference of the two.
    lh = _run("S._logHazard(30, 1000, 0.5)")
    assert math.isclose(lh, math.log((30 + 0.5) / 1000), rel_tol=1e-12)


def test_non_ph_intervals_are_independent_and_pooled():
    # Two intervals with DIFFERENT hazard ratios (non-PH): effects differ by interval,
    # pooled is the inverse-variance average across intervals.
    rows = IV1_ROWS + [
        {"study": "s1", "treatment": "A", "interval": "2", "events": 20, "ptime": 800},
        {"study": "s1", "treatment": "B", "interval": "2", "events": 35, "ptime": 800},
        {"study": "s2", "treatment": "A", "interval": "2", "events": 25, "ptime": 700},
        {"study": "s2", "treatment": "C", "interval": "2", "events": 30, "ptime": 700},
        {"study": "s3", "treatment": "B", "interval": "2", "events": 33, "ptime": 650},
        {"study": "s3", "treatment": "C", "interval": "2", "events": 24, "ptime": 600},
    ]
    r = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}})")
    assert r["intervalIds"] == ["1", "2"]
    # B vs A flips direction across intervals (protective early, harmful late) => genuine non-PH
    b1 = r["intervals"]["1"]["effects"]["B"]["logHR"]
    b2 = r["intervals"]["2"]["effects"]["B"]["logHR"]
    assert b1 < 0 < b2, (b1, b2)
    # pooled B is between the two interval estimates (IV average)
    bp = r["pooled"]["B"]["logHR"]
    assert min(b1, b2) < bp < max(b1, b2)


def _lh(e, pt, cc=0.5):
    return math.log((e + cc) / pt)


def test_multi_arm_interval_is_fitted():
    # A 3-arm trial must be fitted, not refused: AlmNmaMultiarm (like netmeta) requires all
    # m(m-1)/2 comparisons of a multi-arm study. With one 3-arm trial the network estimates are
    # the direct log rate ratios, SE sqrt(1/(e_t+cc) + 1/(e_A+cc)).
    arms = {"A": (40, 1000), "B": (30, 1000), "C": (20, 900)}
    rows = [{"study": "m1", "treatment": t, "interval": "1", "events": e, "ptime": pt} for t, (e, pt) in arms.items()]
    r = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}})")
    assert r["warnings"] == [], r["warnings"]
    eff = r["intervals"]["1"]["effects"]
    for t in ("B", "C"):
        te = _lh(*arms[t]) - _lh(*arms["A"])
        se = math.sqrt(1 / (arms[t][0] + 0.5) + 1 / (arms["A"][0] + 0.5))
        assert math.isclose(eff[t]["logHR"], te, rel_tol=1e-12, abs_tol=1e-12), (t, eff[t], te)
        assert math.isclose(eff[t]["se"], se, rel_tol=1e-12), (t, eff[t], se)


def test_pooled_only_over_intervals_with_the_network_reference():
    # Interval 2 has no A arm, so its effects are against B. They must not be pooled with
    # interval 1's effects against A: pooled C (vs A) = interval-1 C only.
    rows = IV1_ROWS + [
        {"study": "s3", "treatment": "B", "interval": "2", "events": 33, "ptime": 650},
        {"study": "s3", "treatment": "C", "interval": "2", "events": 24, "ptime": 600},
    ]
    r = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}})")
    assert r["intervals"]["2"]["refTreat"] == "B"
    c1 = r["intervals"]["1"]["effects"]["C"]
    assert math.isclose(r["pooled"]["C"]["logHR"], c1["logHR"], rel_tol=1e-12), (r["pooled"], c1)
    assert math.isclose(r["pooled"]["C"]["se"], c1["se"], rel_tol=1e-12)
    assert any(w.startswith("interval 2:") and "not pooled" in w for w in r["warnings"]), r["warnings"]


def test_interval_with_single_arm_is_skipped():
    rows = [
        {"study": "s1", "treatment": "A", "interval": "1", "events": 10, "ptime": 500},
        {"study": "s1", "treatment": "B", "interval": "1", "events": 12, "ptime": 500},
        {"study": "s9", "treatment": "A", "interval": "2", "events": 5, "ptime": 300},  # lone arm
    ]
    r = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}})")
    assert r["intervalIds"] == ["1"]  # interval 2 (single arm) dropped


def test_numeric_interval_labels_sort_numerically():
    # Interval labels 1..10 must come out in time order, not string order ("10" before "2").
    rows = []
    for iv in range(1, 11):
        for s, (a, b) in {"s1": ("A", "B"), "s2": ("A", "C"), "s3": ("B", "C")}.items():
            rows.append({"study": s, "treatment": a, "interval": str(iv), "events": 20 + iv, "ptime": 1000})
            rows.append({"study": s, "treatment": b, "interval": str(iv), "events": 15 + iv, "ptime": 1000})
    out = _run(f"S.fit({json.dumps(rows)}, {{model:'fe'}}).intervalIds")
    assert out == [str(i) for i in range(1, 11)], out
    # Non-numeric labels keep the deterministic string order.
    rows2 = [dict(r, interval={"1": "b", "2": "a"}[r["interval"]]) for r in rows if r["interval"] in ("1", "2")]
    assert _run(f"S.fit({json.dumps(rows2)}, {{model:'fe'}}).intervalIds") == ["a", "b"]


REML_FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "nma-survival-nph-reml.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("method", ["DL", "REML", "ML"])
def test_reml_ml_tau2_match_netmeta(method):
    # Random-effects tau^2 estimator choice: netmeta method.tau = "DL" (default), "REML", "ML".
    # Reference: tests/fixtures/nma-survival-nph-reml.R. Interval 1: two-arm trials only; interval 2: includes
    # a three-arm trial; interval 3: tau^2 at the boundary 0. Tolerance fixed before comparing: 1e-6 absolute
    # on tau^2, log HR and SE.
    #  - DL: netmeta 3.7.0 in every interval.
    #  - REML/ML: metafor 5.2.1 rma.mv with the full multi-arm sampling covariance ("exact_*") in every
    #    interval, and netmeta 3.7.0 in interval 1. netmeta given only TE/seTE uses a diagonal sampling
    #    covariance for its REML/ML step, so it is not the reference for the three-arm interval.
    rows = REML_FIXTURE["rows"]
    out = _run(f"S.fit({json.dumps(rows)}, {{model:'re', method:'{method}'}})")
    assert out["warnings"] == [], out["warnings"]
    for iv, refs in REML_FIXTURE["intervals"].items():
        targets = [refs[method]] if method == "DL" else [refs["exact_" + method]] + ([refs[method]] if iv == "1" else [])
        got = out["intervals"][iv]
        for ref in targets:
            assert math.isclose(got["tau2"], ref["tau2"], abs_tol=1e-6), (iv, method, got["tau2"], ref["tau2"])
            for t, e in ref["effects"].items():
                assert math.isclose(got["effects"][t]["logHR"], e["logHR"], abs_tol=1e-6), (iv, method, t)
                assert math.isclose(got["effects"][t]["se"], e["se"], abs_tol=1e-6), (iv, method, t)
    assert out.get("method") == method


def test_default_output_has_no_method_key():
    # The default call (no method) must be unchanged: DL, and no new key in the result.
    out = _run(f"S.fit({json.dumps(REML_FIXTURE['rows'])}, {{model:'re'}})")
    assert "method" not in out
    for iv, refs in REML_FIXTURE["intervals"].items():
        assert math.isclose(out["intervals"][iv]["tau2"], refs["DL"]["tau2"], abs_tol=1e-9)


CC0_FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "nma-survival-nph-cc-only0.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("model", ["fe", "re"])
def test_cc_only_zero_matches_meta_pairwise_netmeta(model):
    # ccTo: 'only0' adds the continuity correction only in a study-interval with a zero event count, as
    # meta::pairwise(sm = "IRR", incr = 0.5) does by default. Reference: tests/fixtures/nma-survival-nph-cc-only0.R
    # (meta 8.5-0, netmeta 3.7.0). Tolerance fixed before comparing: 1e-6 absolute.
    ref = CC0_FIXTURE["common" if model == "fe" else "random"]
    out = _run(f"S.fit({json.dumps(CC0_FIXTURE['rows'])}, {{model:'{model}', cc:0.5, ccTo:'only0'}})")
    got = out["intervals"]["1"]
    if model == "re":
        assert math.isclose(got["tau2"], ref["tau2"], abs_tol=1e-6), (got["tau2"], ref["tau2"])
    for t, e in ref["effects"].items():
        assert math.isclose(got["effects"][t]["logHR"], e["logHR"], abs_tol=1e-6), (model, t, got["effects"][t], e)
        assert math.isclose(got["effects"][t]["se"], e["se"], abs_tol=1e-6), (model, t, got["effects"][t], e)


def test_cc_default_still_added_to_every_arm():
    # Default (ccTo unset): 0.5 added to every arm, as before.
    out = _run(f"S.buildContrasts({json.dumps(CC0_FIXTURE['rows'])}, 0.5)")
    s2 = [c for c in out["1"] if c["study"] == "s2|1"][0]
    assert math.isclose(s2["est"], math.log(21.5 / 880) - math.log(30.5 / 900), rel_tol=1e-12)
