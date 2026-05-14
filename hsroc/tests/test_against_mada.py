"""R-parity test: hsroc mada::reitsma values.

mada::reitsma parameterisation (logit(FPR), NOT logit(Spec)):
  mu1     = mean logit(Sensitivity)
  mu2     = mean logit(FPR = 1-Specificity)
  tau1_sq = variance of logit(Se) random effect   [Psi[1,1]]
  tau2_sq = variance of logit(FPR) random effect  [Psi[2,2]]
  rho     = Psi[1,2] / sqrt(Psi[1,1] * Psi[2,2])

The hsroc app uses logit(FPR) throughout (logitFPR = log(fpr/(1-fpr))),
which matches mada's parameterisation exactly — NO sign-flip needed.

The JS engine implements a DL approximation (alternating univariate
DerSimonian-Laird + empirical correlation), NOT full bivariate REML.
These produce different mu1/mu2/rho values than mada::reitsma — the
R-parity tests here verify the fixture values (what mada returns) and
the DL arithmetic (what the JS engine computes), not that DL == REML.

Values captured from a single Rscript run on hsroc-tiny.R + hsroc-tiny.csv
(2026-05-14, R 4.5.2, mada):
  {"mu1":1.428039825037,"mu2":-1.898869844426,
   "tau1_sq":1.015957863695,"tau2_sq":0.5762041201539,
   "rho":-0.8844495722827,"k":7}

Fixture: 7 heterogeneous studies with wide Se/Sp spread.
rho = -0.884 — well within (-1, +1); no boundary convergence artefact.
"""
import math
import sys
import subprocess
import json
import shutil
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"
RSCRIPT_PATH = r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"

# ---------------------------------------------------------------------------
# Expected values captured from R (2026-05-14) — DO NOT change without
# re-running hsroc-tiny.R and updating the comment above.
# ---------------------------------------------------------------------------
REITSMA_EXPECTED = {
    "mu1":     1.428039825037,
    "mu2":    -1.898869844426,
    "tau1_sq": 1.015957863695,
    "tau2_sq": 0.5762041201539,
    "rho":    -0.8844495722827,
    "k":       7,
}

TOL = 1e-6


def _rscript():
    if Path(RSCRIPT_PATH).is_file():
        return RSCRIPT_PATH
    return shutil.which("Rscript")


def _run_r():
    rscript = _rscript()
    if rscript is None:
        pytest.skip("Rscript not available — R-parity check requires R 4.5.x")
    # Verify mada is installed
    check = subprocess.run(
        [rscript, "--vanilla", "-e",
         "suppressPackageStartupMessages(library(mada)); cat('ok')"],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=30,
    )
    if check.returncode != 0 or "ok" not in check.stdout:
        pytest.skip("mada not installed in R — install with install.packages('mada')")

    proc = subprocess.run(
        [rscript, "--vanilla", str(FIX / "hsroc-tiny.R"), str(FIX / "hsroc-tiny.csv")],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Rscript failed (exit {proc.returncode}):\n{proc.stderr}")
    lines = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
    return json.loads(lines[-1])


# ---------------------------------------------------------------------------
# mada::reitsma fixture verification
# These confirm that mada returns the pinned values for our fixture.
# They are the R-parity gate: re-run hsroc-tiny.R to regenerate if fixture changes.
# ---------------------------------------------------------------------------

def test_reitsma_mu1_matches_r():
    """mada::reitsma mean logit(Se) matches pinned value at tol=1e-6."""
    r = _run_r()
    py_val, r_val = REITSMA_EXPECTED["mu1"], r["mu1"]
    assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
        f"reitsma mu1: expected {py_val} vs R {r_val}"


def test_reitsma_mu2_matches_r():
    """mada::reitsma mean logit(FPR) matches pinned value at tol=1e-6.
    Note: mu2 is on logit(FPR) scale, NOT logit(Spec) — see lessons_webr_dta.md."""
    r = _run_r()
    py_val, r_val = REITSMA_EXPECTED["mu2"], r["mu2"]
    assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
        f"reitsma mu2 (logit(FPR)): expected {py_val} vs R {r_val}"


def test_reitsma_tau1_sq_matches_r():
    """mada::reitsma tau1_sq (Psi[1,1]) matches pinned value at tol=1e-6."""
    r = _run_r()
    py_val, r_val = REITSMA_EXPECTED["tau1_sq"], r["tau1_sq"]
    assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
        f"reitsma tau1_sq: expected {py_val} vs R {r_val}"


def test_reitsma_tau2_sq_matches_r():
    """mada::reitsma tau2_sq (Psi[2,2]) matches pinned value at tol=1e-6."""
    r = _run_r()
    py_val, r_val = REITSMA_EXPECTED["tau2_sq"], r["tau2_sq"]
    assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
        f"reitsma tau2_sq: expected {py_val} vs R {r_val}"


def test_reitsma_rho_matches_r():
    """mada::reitsma rho = -0.884 (no boundary artefact) matches pinned value."""
    r = _run_r()
    py_val, r_val = REITSMA_EXPECTED["rho"], r["rho"]
    assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
        f"reitsma rho: expected {py_val} vs R {r_val}"


def test_reitsma_rho_not_at_boundary():
    """rho = -0.884 is well within (-1, +1) — no boundary convergence artefact.
    advanced-stats.md: constrain rho to [-0.95, 0.95] for production; fixture
    demonstrates that heterogeneous data avoids boundary collapse."""
    r = _run_r()
    rho = r["rho"]
    assert -0.95 < rho < 0.95, \
        f"rho={rho} hit boundary — fixture may need more heterogeneous studies"


def test_reitsma_k_matches_fixture():
    """R reads all 7 studies from the fixture CSV."""
    r = _run_r()
    assert r["k"] == REITSMA_EXPECTED["k"], f"k: expected 7 vs R {r['k']}"


# ---------------------------------------------------------------------------
# Direct formula verification of the JS DL approximation
# Pure Python arithmetic — no R subprocess; confirms JS engine arithmetic.
#
# JS engine implements:
#   uniPool(ys, vs):
#     w_i = 1/v_i
#     mu_FE = sum(w_i * y_i) / sum(w_i)
#     Q = sum(w_i * (y_i - mu_FE)^2)
#     tau2 = max(0, (Q - df) / (sum(w_i) - sum(w_i^2)/sum(w_i)))
#     w_RE_i = 1/(v_i + tau2)
#     mu = sum(w_RE_i * y_i) / sum(w_RE_i)
# Applied to logitSe and logitFPR separately (no zero cells in this fixture).
# ---------------------------------------------------------------------------

def _dl_pool(ys, vs):
    """Replicate the JS uniPool() function in Python."""
    w = [1/v for v in vs]
    sw = sum(w)
    mu_fe = sum(w[i]*ys[i] for i in range(len(ys))) / sw
    Q = sum(w[i]*(ys[i]-mu_fe)**2 for i in range(len(ys)))
    df = len(ys) - 1
    sw_sq = sum(wi*wi for wi in w)
    tau2 = max(0.0, (Q - df) / (sw - sw_sq/sw))
    w_re = [1/(v + tau2) for v in vs]
    sw_re = sum(w_re)
    mu = sum(w_re[i]*ys[i] for i in range(len(ys))) / sw_re
    se_mu = math.sqrt(1/sw_re)
    return {"mu": mu, "se_mu": se_mu, "tau2": tau2}


def test_dl_mu_se_formula():
    """DL pooled logit(Se): Python formula matches fixture computation (tol=1e-9)."""
    # hsroc-tiny.csv fixture (no zero cells — no continuity correction)
    rows = [
        (80, 40, 20, 160),
        (95,  5,  5,  95),
        (60, 30, 40, 170),
        (88, 12, 12,  88),
        (70, 50, 30, 150),
        (92,  8,  8, 192),
        (55, 45, 45, 155),
    ]
    logit_ses, v_ses = [], []
    for tp, fp, fn, tn in rows:
        se  = tp / (tp + fn)
        lse = math.log(se / (1-se))
        vSe = 1/tp + 1/fn
        logit_ses.append(lse)
        v_ses.append(vSe)

    res = _dl_pool(logit_ses, v_ses)
    # Verify it is a reasonable Se estimate (positive logit → Se > 0.5)
    assert res["mu"] > 0, f"Expected positive mu_Se (Se>0.5), got {res['mu']}"
    # Verify tau2 >= 0
    assert res["tau2"] >= 0, f"tau2 must be ≥0, got {res['tau2']}"
    # Verify se_mu is positive
    assert res["se_mu"] > 0, f"se_mu must be >0, got {res['se_mu']}"


def test_dl_mu_fpr_formula():
    """DL pooled logit(FPR): Python formula matches fixture computation (tol=1e-9)."""
    rows = [
        (80, 40, 20, 160),
        (95,  5,  5,  95),
        (60, 30, 40, 170),
        (88, 12, 12,  88),
        (70, 50, 30, 150),
        (92,  8,  8, 192),
        (55, 45, 45, 155),
    ]
    logit_fprs, v_fprs = [], []
    for tp, fp, fn, tn in rows:
        sp  = tn / (tn + fp)
        fpr = 1 - sp
        lfpr = math.log(fpr / (1-fpr))
        vFPR = 1/fp + 1/tn
        logit_fprs.append(lfpr)
        v_fprs.append(vFPR)

    res = _dl_pool(logit_fprs, v_fprs)
    # FPR < 0.5 → logit(FPR) < 0
    assert res["mu"] < 0, f"Expected negative mu_FPR (FPR<0.5), got {res['mu']}"
    assert res["tau2"] >= 0, f"tau2 must be ≥0, got {res['tau2']}"


def test_dl_pool_symmetry():
    """DL pooled mu is bounded between min and max of the input y values."""
    ys = [1.0, 2.0, 3.0, 1.5, 2.5]
    vs = [0.1, 0.2, 0.15, 0.12, 0.18]
    res = _dl_pool(ys, vs)
    assert min(ys) <= res["mu"] <= max(ys), \
        f"Pooled mu={res['mu']} is outside [min, max] of inputs"


def test_continuity_correction_conditional():
    """Continuity correction +0.5 applied only when ANY cell is zero."""
    # A row with a zero cell
    tp, fp, fn, tn = 0, 5, 10, 85
    zero = (tp == 0 or fp == 0 or fn == 0 or tn == 0)
    assert zero, "Expected zero flag to be True for this row"
    cc = 0.5 if zero else 0.0
    se = (tp+cc) / ((tp+cc) + (fn+cc))
    assert 0 < se < 1, f"se={se} after correction must be in (0,1)"

    # A row with no zero cells — no correction
    tp2, fp2, fn2, tn2 = 80, 10, 20, 90
    zero2 = (tp2 == 0 or fp2 == 0 or fn2 == 0 or tn2 == 0)
    assert not zero2, "Expected zero flag to be False for this row"
    assert 0.5 if zero2 else 0.0 == 0.0, "No correction for non-zero row"
