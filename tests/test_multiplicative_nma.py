"""Parity + invariants for shared/multiplicative-nma.js.

Multiplicative-heterogeneity NMA = fixed-effect (common-effect) contrast-based
NMA with the covariance scaled by phi = Q/(n-p); point estimates unchanged, SEs
inflated by sqrt(phi), t_{n-p} CIs. The network generalisation of UWLS
(shared/uwls.js / Stanley-Doucouliagos 2015).

For a network of TWO-ARM trials the common-effect fit is, by construction,
ordinary weighted least squares on the treatment-incidence design — identical to
R netmeta::netmeta's common-effect model. We verify the JS engine against an
INDEPENDENT pure-Python WLS oracle (different implementation, same estimator) to
1e-9, plus the structural invariants (point==FE, SE==SE_FE*sqrt(phi), phi==Q/df).
The committed tests/parity-multiplicative-nma.R reproduces the same numbers
against netmeta on R-enabled machines.
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

PRELUDE = (
    "require('./shared/ma-core.js');"
    "const M = require('./shared/multiplicative-nma.js');\n"
)

# A 3-treatment triangle network of two-arm trials (one closed loop -> Q>0).
# treatments: A (reference), B, C.
TREATMENTS = ["A", "B", "C"]
ROWS = [
    {"trtA": "A", "trtB": "B", "yi": 0.50, "sei": 0.20},
    {"trtA": "A", "trtB": "C", "yi": 0.80, "sei": 0.25},
    {"trtA": "B", "trtB": "C", "yi": 0.40, "sei": 0.30},
]


def _run(expr):
    code = PRELUDE + "console.log(JSON.stringify(" + expr + "));"
    r = subprocess.run([NODE, "-e", code], capture_output=True, text=True,
                       timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def _fit_js():
    return _run("M.fit(" + json.dumps(ROWS) + "," + json.dumps(TREATMENTS) + ")")


# ---- independent pure-Python WLS oracle (no numpy) -------------------------
def _solve(A, b):
    """Solve A x = b by Gauss-Jordan (small dense systems)."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[piv] = M[piv], M[c]
        d = M[c][c]
        M[c] = [x / d for x in M[c]]
        for r in range(n):
            if r != c and M[r][c]:
                f = M[r][c]
                M[r] = [a - f * b_ for a, b_ in zip(M[r], M[c])]
    return [M[i][n] for i in range(n)], M


def _oracle():
    """Independent FE-WLS on the incidence design -> beta, cov-diag, Q."""
    p = len(TREATMENTS) - 1
    idx = {t: i for i, t in enumerate(TREATMENTS)}
    X, y, w = [], [], []
    for r in ROWS:
        row = [0.0] * p
        ia, ib = idx[r["trtA"]], idx[r["trtB"]]
        if ia > 0:
            row[ia - 1] = -1.0
        if ib > 0:
            row[ib - 1] = +1.0
        X.append(row)
        y.append(r["yi"])
        w.append(1.0 / (r["sei"] ** 2))
    XtWX = [[sum(X[i][a] * w[i] * X[i][b_] for i in range(len(X))) for b_ in range(p)]
            for a in range(p)]
    XtWy = [sum(X[i][a] * w[i] * y[i] for i in range(len(X))) for a in range(p)]
    beta, _ = _solve([row[:] for row in XtWX], XtWy[:])
    # cov = inverse(XtWX): solve against identity columns
    cov = [[0.0] * p for _ in range(p)]
    for col in range(p):
        e = [1.0 if i == col else 0.0 for i in range(p)]
        x, _ = _solve([row[:] for row in XtWX], e)
        for i in range(p):
            cov[i][col] = x[i]
    Q = 0.0
    for i in range(len(X)):
        fit = sum(X[i][a] * beta[a] for a in range(p))
        Q += w[i] * (y[i] - fit) ** 2
    n = len(X)
    return {"beta": beta, "covdiag": [cov[i][i] for i in range(p)], "Q": Q,
            "n": n, "p": p, "df": n - p}


def test_fe_estimates_match_independent_oracle():
    o = _oracle()
    js = _fit_js()
    assert js["ok"] is True
    # beta_B, beta_C vs A
    assert math.isclose(js["effects"]["B"]["estimate"], o["beta"][0], abs_tol=1e-9)
    assert math.isclose(js["effects"]["C"]["estimate"], o["beta"][1], abs_tol=1e-9)
    # fixed-effect SEs = sqrt(cov diag)
    assert math.isclose(js["effects"]["B"]["seFE"], math.sqrt(o["covdiag"][0]), abs_tol=1e-9)
    assert math.isclose(js["effects"]["C"]["seFE"], math.sqrt(o["covdiag"][1]), abs_tol=1e-9)
    assert math.isclose(js["Q"], o["Q"], abs_tol=1e-9)
    assert js["df"] == o["df"]


def test_phi_and_multiplicative_se_invariants():
    o = _oracle()
    js = _fit_js()
    phi = o["Q"] / o["df"]
    assert math.isclose(js["phi"], phi, abs_tol=1e-9)
    # SE_mult = SE_FE * sqrt(phi) for every non-reference treatment
    for t in ("B", "C"):
        e = js["effects"][t]
        assert math.isclose(e["se"], e["seFE"] * math.sqrt(phi), rel_tol=1e-12)


def test_reference_is_zero():
    js = _fit_js()
    a = js["effects"]["A"]
    assert a["estimate"] == 0 and a["se"] == 0


def test_aic_fields_and_formula():
    js = _fit_js()
    add, mult = js["additive"], js["multiplicative"]
    # AIC = -2 logLik + 2*(p+1) for both models
    assert math.isclose(add["aic"], -2 * add["logLik"] + 2 * (js["p"] + 1), abs_tol=1e-9)
    assert math.isclose(mult["aic"], -2 * mult["logLik"] + 2 * (js["p"] + 1), abs_tol=1e-9)
    assert math.isclose(js["aicDiff"], add["aic"] - mult["aic"], abs_tol=1e-9)
    assert js["prefer"] in ("multiplicative", "additive", "comparable")


def test_under_identified_network_fails_closed():
    # 2 treatments need 1 basic parameter but give it zero usable contrasts.
    bad = _run("M.fit([{trtA:'A',trtB:'B',yi:0.2,sei:0}], ['A','B'])")
    assert bad["ok"] is False and "error" in bad


def test_disconnected_or_singular_design_fails_closed():
    # A-B and C-D: two disconnected components -> singular design for 3 params.
    expr = ("M.fit(["
            "{trtA:'A',trtB:'B',yi:0.2,sei:0.2},"
            "{trtA:'C',trtB:'D',yi:0.3,sei:0.2}"
            "], ['A','B','C','D'])")
    out = _run(expr)
    assert out["ok"] is False
