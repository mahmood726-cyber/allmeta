"""Cross-language parity for shared/transportability-v1.js vs a scipy oracle.

Transport = random-effects meta-regression (Paule-Mandel τ², Knapp-Hartung
t_{k-2} with HKSJ floor) predicting the mean effect at a target modifier value.
Both engines are computed here and compared to 1e-5 — for a τ²=0 case and a
τ²>0 (heterogeneous) case, plus the documented fail-closed guards.
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

CLEAN = [(-0.28, 0.12, 32), (-0.22, 0.09, 35), (-0.15, 0.11, 42), (-0.10, 0.13, 48),
         (0.04, 0.15, 55), (-0.05, 0.14, 51), (-0.32, 0.11, 29), (-0.20, 0.10, 38)]
HET = [(-0.40, 0.10, 30), (0.10, 0.10, 32), (-0.50, 0.10, 50), (0.30, 0.10, 52),
       (-0.20, 0.10, 40), (0.00, 0.10, 41), (-0.35, 0.10, 33), (0.20, 0.10, 49)]


def _js(studies, target):
    arr = [{"est": e, "se": s, "x": x} for (e, s, x) in studies]
    prog = (
        "require('./shared/ma-core.js');const T=require('./shared/transportability-v1.js');"
        f"const r=T.transport({{studies:{json.dumps(arr)},target:{target}}});"
        "console.log(JSON.stringify({tau2:r.tau2,slope:r.slope.est,slopeSE:r.slope.se,p:r.slope.p,"
        "te:r.transported.est,lo:r.transported.ciLo,hi:r.transported.ciHi,shift:r.shift,mean:r.trialMean}));"
    )
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if out.returncode != 0:
        raise AssertionError(out.stdout + out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])


def _oracle(studies, target):
    y = np.array([s[0] for s in studies]); se = np.array([s[1] for s in studies]); x = np.array([float(s[2]) for s in studies])
    se2 = se ** 2; k = len(y); df = k - 2

    def fit(w):
        X = np.c_[np.ones(k), x]; W = np.diag(w); inv = np.linalg.inv(X.T @ W @ X); return inv @ X.T @ W @ y, inv

    def rss(w, b):
        r = y - (b[0] + b[1] * x); return float(np.sum(w * r * r))

    def rss_at(t2):
        w = 1 / (se2 + t2); b, _ = fit(w); return rss(w, b)

    lo, hi = 0.0, 1.0
    if rss_at(0) <= df:
        tau2 = 0.0
    else:
        while rss_at(hi) > df:
            hi *= 2
        for _ in range(200):
            m = (lo + hi) / 2
            if rss_at(m) > df: lo = m
            else: hi = m
        tau2 = (lo + hi) / 2
    w = 1 / (se2 + tau2); b, inv = fit(w); q = max(1.0, rss(w, b) / df); tc = stats.t.ppf(0.975, df)
    sumw = w.sum(); xbar = float((w * x).sum() / sumw)
    est = b[0] + b[1] * target; v = q * (inv[0, 0] + 2 * target * inv[0, 1] + target * target * inv[1, 1]); sd = np.sqrt(v)
    slopeSE = np.sqrt(q * inv[1, 1]); p = 2 * (1 - stats.t.cdf(abs(b[1] / slopeSE), df))
    return dict(tau2=tau2, slope=float(b[1]), slopeSE=float(slopeSE), p=float(p),
                te=float(est), lo=float(est - tc * sd), hi=float(est + tc * sd),
                shift=float(b[1] * (target - xbar)), mean=xbar)


@pytest.mark.parametrize("studies,target", [(CLEAN, 30), (CLEAN, 50), (HET, 35), (HET, 45)])
def test_js_matches_scipy_oracle(studies, target):
    js, ora = _js(studies, target), _oracle(studies, target)
    for key in ("tau2", "slope", "slopeSE", "p", "te", "lo", "hi", "shift", "mean"):
        assert abs(js[key] - ora[key]) < 1e-5, f"{key}: js={js[key]} oracle={ora[key]}"


def test_het_case_has_positive_tau2():
    assert _oracle(HET, 40)["tau2"] > 0          # the heterogeneous set must trigger the PM path


def test_fail_closed_guards():
    prog = (
        "require('./shared/ma-core.js');const T=require('./shared/transportability-v1.js');"
        "const few=T.transport({studies:[{est:-0.2,se:0.1,x:1},{est:-0.1,se:0.1,x:2}],target:1});"
        "const flat=T.transport({studies:[{est:-0.2,se:0.1,x:5},{est:-0.1,se:0.1,x:5},{est:0,se:0.1,x:5}],target:7});"
        "const noTgt=T.transport({studies:[{est:-0.2,se:0.1,x:1},{est:-0.1,se:0.1,x:2},{est:0,se:0.1,x:3}]});"
        "console.log(JSON.stringify({few:few.ok,flat:flat.ok,noTgt:noTgt.ok,flatErr:flat.error}));"
    )
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    o = json.loads(out.stdout.strip().splitlines()[-1])
    assert o["few"] is False and o["flat"] is False and o["noTgt"] is False
    assert "modifier is constant" in o["flatErr"]
