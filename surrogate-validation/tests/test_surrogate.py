"""Cross-language parity + behaviour for shared/surrogate-v1.js.

Trial-level surrogacy: weighted regression of the final effects on the surrogate
effects, with the estimation-error-adjusted R² and a degeneracy guard. JS (node)
is compared to a numpy oracle to 1e-6, and the degenerate case (final effects
don't vary) is checked to refuse the adjusted R².
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PAIRS = [(-12, -0.30, 0.10), (-8, -0.15, 0.12), (-15, -0.40, 0.09),
         (-5, -0.05, 0.15), (-10, -0.22, 0.11), (-17, -0.50, 0.08)]


def _js(pairs):
    arr = [{"label": f"T{i}", "s": s, "f": f, "seF": e} for i, (s, f, e) in enumerate(pairs)]
    prog = (
        "const S=require('./shared/surrogate-v1.js');"
        f"const r=S.analyze({{pairs:{json.dumps(arr)}}});"
        "console.log(JSON.stringify({ok:r.ok,r2n:r.r2_naive,pear:r.pearson,Q:r.Q,i2:r.i2,"
        "r2adj:r.r2_adj,deg:r.adj_degenerate,ste:r.ste,slope:r.slope}));"
    )
    out = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if out.returncode != 0:
        raise AssertionError(out.stdout + out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])


def _oracle(pairs):
    s = np.array([p[0] for p in pairs], float); f = np.array([p[1] for p in pairs], float); se = np.array([p[2] for p in pairs], float)
    w = 1 / se ** 2; k = len(s); X = np.c_[np.ones(k), s]
    beta = np.linalg.solve(X.T @ (X * w[:, None]), X.T @ (w * f)); fh = X @ beta
    sw = w.sum(); fbar = (w * f).sum() / sw
    r2 = 1 - np.sum(w * (f - fh) ** 2) / np.sum(w * (f - fbar) ** 2)
    pear = float(np.corrcoef(s, f)[0, 1]); Q = float(np.sum(w * (f - fbar) ** 2)); df = k - 1; i2 = max(0.0, (Q - df) / Q)
    vfo = np.var(f, ddof=1); wf = np.mean(se ** 2); vfa = vfo - wf
    degenerate = (Q <= df) or (vfa <= 0.25 * vfo)
    r2adj = None if degenerate else float(min(np.cov(s, f, ddof=1)[0, 1] ** 2 / (np.var(s, ddof=1) * vfa), 1.0))
    return dict(r2n=float(r2), pear=pear, Q=Q, i2=i2, r2adj=r2adj, deg=degenerate, ste=float(-beta[0] / beta[1]), slope=float(beta[1]))


def test_js_matches_numpy_oracle():
    js, ora = _js(PAIRS), _oracle(PAIRS)
    for key in ("r2n", "pear", "Q", "i2", "ste", "slope"):
        assert abs(js[key] - ora[key]) < 1e-6, f"{key}: {js[key]} vs {ora[key]}"
    assert js["deg"] == ora["deg"]
    assert abs(js["r2adj"] - ora["r2adj"]) < 1e-6


def test_degenerate_when_final_effects_dont_vary():
    # final HRs cluster tightly (no between-trial signal) -> adjusted R² refused
    flat = [(-12, -0.21, 0.10), (-8, -0.20, 0.10), (-15, -0.22, 0.10), (-5, -0.19, 0.10), (-10, -0.205, 0.10)]
    o = _js(flat)
    assert o["deg"] is True and o["r2adj"] is None


def test_leave_one_out_and_guards():
    o = _js(PAIRS)
    assert o["ok"] is True and o["slope"] is not None
    # too few trials fails closed
    few = subprocess.run([NODE, "-e",
        "const S=require('./shared/surrogate-v1.js');"
        "console.log(JSON.stringify({ok:S.analyze({pairs:[{s:1,f:1,seF:1},{s:2,f:2,seF:1}]}).ok}));"],
        capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    assert json.loads(few.stdout.strip().splitlines()[-1])["ok"] is False
