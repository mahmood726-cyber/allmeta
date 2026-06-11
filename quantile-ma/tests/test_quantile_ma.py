"""Cross-language parity + behaviour for shared/quantile-ma-v1.js.

Two-stage quantile meta-analysis: DL random-effects pool per quantile (reuses
ma-core) + a multivariate Wald test for a flat QTE profile (χ²_{q−1}). JS (node)
is compared to a numpy/scipy oracle (DL pool + Wald) to 1e-6.
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

STUDIES = [
    {"label": "S1", "est": [-2.0, -5.0, -8.0], "se": [1.0, 1.1, 0.9]},
    {"label": "S2", "est": [-2.2, -4.8, -8.2], "se": [0.8, 1.0, 1.2]},
    {"label": "S3", "est": [-1.5, -5.3, -7.5], "se": [1.2, 0.9, 1.0]},
]
QS = [0.25, 0.5, 0.75]


def _js():
    prog = ("require('./shared/ma-core.js');const Q=require('./shared/quantile-ma-v1.js');"
            f"const r=Q.analyze({{quantiles:{json.dumps(QS)},studies:{json.dumps(STUDIES)}}});"
            "console.log(JSON.stringify({prof:r.profile.map(p=>[p.est,p.se]),W:r.wald.statistic,df:r.wald.df,p:r.wald.p,hte:r.hte}));")
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if out.returncode != 0:
        raise AssertionError(out.stdout + out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])


def _dl(y, v):
    y, v = np.asarray(y, float), np.asarray(v, float); k = len(y)
    w = 1 / v; mu_fe = (w * y).sum() / w.sum()
    Q = (w * (y - mu_fe) ** 2).sum(); c = w.sum() - (w ** 2).sum() / w.sum()
    tau2 = max(0.0, (Q - (k - 1)) / c) if c > 0 else 0.0
    wr = 1 / (v + tau2); mu = (wr * y).sum() / wr.sum(); se = np.sqrt(1 / wr.sum())
    return mu, se


def _oracle():
    theta, V = [], []
    for j in range(len(QS)):
        y = [s["est"][j] for s in STUDIES]; v = [s["se"][j] ** 2 for s in STUDIES]
        mu, se = _dl(y, v); theta.append(mu); V.append(se ** 2)
    theta = np.array(theta); V = np.array(V); q = len(theta); m = q - 1
    C = np.zeros((m, q))
    for a in range(m): C[a, a] = -1; C[a, a + 1] = 1
    d = C @ theta; M = C @ np.diag(V) @ C.T
    W = float(d @ np.linalg.inv(M) @ d)
    return theta, np.sqrt(V), W, m, float(stats.chi2.sf(W, m))


def test_js_matches_numpy_scipy_oracle():
    js = _js(); th, se, W, df, p = _oracle()
    for j in range(len(QS)):
        assert abs(js["prof"][j][0] - th[j]) < 1e-6
        assert abs(js["prof"][j][1] - se[j]) < 1e-6
    assert abs(js["W"] - W) < 1e-6 and js["df"] == df
    assert abs(js["p"] - p) < 1e-9


def test_chi2_survival_matches_scipy():
    prog = ("const Q=require('./shared/quantile-ma-v1.js');"
            "console.log(JSON.stringify([Q._chi2sf(18,2),Q._chi2sf(5.5,3),Q._chi2sf(0.5,1)]));")
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    js = json.loads(out.stdout.strip().splitlines()[-1])
    for got, (x, k) in zip(js, [(18, 2), (5.5, 3), (0.5, 1)]):
        assert abs(got - float(stats.chi2.sf(x, k))) < 1e-9


def test_flat_profile_is_not_hte():
    prog = ("require('./shared/ma-core.js');const Q=require('./shared/quantile-ma-v1.js');"
            "const r=Q.analyze({quantiles:[0.25,0.5,0.75],studies:[{est:[-5,-5,-5],se:[1,1,1]},{est:[-5.1,-4.9,-5.0],se:[1,1,1]}]});"
            "console.log(JSON.stringify({hte:r.hte,p:r.wald.p}));")
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    o = json.loads(out.stdout.strip().splitlines()[-1])
    assert o["hte"] is False and o["p"] > 0.5


def test_guards():
    prog = ("require('./shared/ma-core.js');const Q=require('./shared/quantile-ma-v1.js');"
            "console.log(JSON.stringify({q1:Q.analyze({quantiles:[0.5],studies:[{est:[1],se:[1]},{est:[2],se:[1]}]}).ok,"
            "s1:Q.analyze({quantiles:[0.25,0.5],studies:[{est:[1,2],se:[1,1]}]}).ok}));")
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    o = json.loads(out.stdout.strip().splitlines()[-1])
    assert o["q1"] is False and o["s1"] is False
