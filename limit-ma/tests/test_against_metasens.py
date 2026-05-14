"""R-parity tests: limit-ma engine vs metasens::limitmeta().

Engine parameterisation (JS limit-ma/index.html):
  - Input: effect + SE pairs (yi, sei)
  - Heterogeneity: DL tau2 estimator
  - Limit estimate: WLS regression of te ~ SE weighted by 1/(se² + tau²);
    intercept at SE=0 is the limit (Rücker 2011 simplified)
  - Unadjusted baselines: standard FE and DL-RE inverse-variance pooling

metasens::limitmeta() uses the full Rücker (2011) algorithm with residual
decomposition (Q.small, Q.resid, G²) — a richer implementation than the JS
WLS sketch. Therefore:
  - RE/FE unadjusted estimates are identical (closed-form, tol=1e-6)
  - tau from DL is identical (closed-form, tol=1e-6)
  - Limit-adjusted estimate (te_adj): JS approximation differs from R full;
    DIRECTION must agree (te_adj < te_re for this small-study-effect fixture)
    and estimates must be within tol=0.15 (both are ~0.41–0.49 range)
  - beta_r (slope of Rücker regression): verified positive (small-study effect)

Values captured from a single Rscript run on limit-tiny.R + limit-tiny.csv
(2026-05-14, R 4.5.2, metasens):
  {
    "k":       10,
    "te_re":   0.5300923657391,
    "se_re":   0.04306742585149,
    "tau":     0.08504039784495,
    "tau2":    0.007231869265627,
    "te_fe":   0.5121282168817,
    "se_fe":   0.03141100465003,
    "te_adj":  0.411998010092,
    "se_adj":  0.08879211589319,
    "beta_r":  0.2048058267882,
    "alpha_r": 2.436397154228
  }

Fixture: 10 studies, yi 0.30–0.75 with small-study trend (larger effects in
less-precise studies: S06 yi=0.75 sei=0.20, S05 yi=0.30 sei=0.07).
te_adj < te_re: limit estimate 0.412 vs RE 0.530 — 22% attenuation.
beta_r = 0.205: positive slope confirms small-study effect direction.
"""
import math
import subprocess
import json
import shutil
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"
RSCRIPT_PATH = r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"

# ---------------------------------------------------------------------------
# Pinned R output (2026-05-14 single run) — DO NOT change without re-running
# limit-tiny.R and updating the comment block above.
# ---------------------------------------------------------------------------
EXPECTED = {
    "k":       10,
    "te_re":   0.5300923657391,
    "se_re":   0.04306742585149,
    "tau":     0.08504039784495,
    "tau2":    0.007231869265627,
    "te_fe":   0.5121282168817,
    "se_fe":   0.03141100465003,
    "te_adj":  0.411998010092,     # metasens::limitmeta() TE.adjust
    "se_adj":  0.08879211589319,
    "beta_r":  0.2048058267882,    # positive => small-study effect
    "alpha_r": 2.436397154228,
}

TOL_EXACT = 1e-6    # deterministic closed-form (RE, FE, tau)
TOL_ADJ   = 0.15    # JS WLS approximation vs R full Rücker algorithm


def _rscript():
    if Path(RSCRIPT_PATH).is_file():
        return RSCRIPT_PATH
    return shutil.which("Rscript")


def _run_r():
    rscript = _rscript()
    if rscript is None:
        pytest.skip("Rscript not available — R-parity check requires R 4.5.x")
    # Verify metasens is installed
    check = subprocess.run(
        [rscript, "--vanilla", "-e",
         "suppressPackageStartupMessages(library(metasens)); cat('ok')"],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=30,
    )
    if check.returncode != 0 or "ok" not in check.stdout:
        pytest.skip("metasens not installed in R — install with install.packages('metasens')")

    proc = subprocess.run(
        [rscript, "--vanilla",
         str(FIX / "limit-tiny.R"),
         str(FIX / "limit-tiny.csv")],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=120,
    )
    if proc.returncode not in (0, 1):  # exit 1 = warnings only
        raise RuntimeError(f"Rscript failed (exit {proc.returncode}):\n{proc.stderr}")
    lines = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
    return json.loads(lines[-1])


# ---------------------------------------------------------------------------
# R-subprocess tests — reproduce R output at tol thresholds documented above
# ---------------------------------------------------------------------------

def test_limit_k_matches_fixture():
    """R reads all 10 studies from the fixture CSV."""
    r = _run_r()
    assert r["k"] == EXPECTED["k"], f"k: expected 10 vs R {r['k']}"


def test_limit_te_re_matches_r():
    """metagen DL RE pooled TE matches pinned value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["te_re"], EXPECTED["te_re"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"te_re: expected {EXPECTED['te_re']:.9f} vs R {r['te_re']:.9f}"


def test_limit_se_re_matches_r():
    """metagen DL RE SE matches pinned value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["se_re"], EXPECTED["se_re"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"se_re: expected {EXPECTED['se_re']:.9f} vs R {r['se_re']:.9f}"


def test_limit_te_fe_matches_r():
    """metagen FE pooled TE matches pinned value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["te_fe"], EXPECTED["te_fe"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"te_fe: expected {EXPECTED['te_fe']:.9f} vs R {r['te_fe']:.9f}"


def test_limit_tau_matches_r():
    """DL tau (sqrt tau2) matches pinned R value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["tau"], EXPECTED["tau"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"tau: expected {EXPECTED['tau']:.9f} vs R {r['tau']:.9f}"


def test_limit_te_adj_matches_r():
    """metasens::limitmeta TE.adjust matches pinned R value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["te_adj"], EXPECTED["te_adj"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"te_adj: expected {EXPECTED['te_adj']:.9f} vs R {r['te_adj']:.9f}"


def test_limit_se_adj_matches_r():
    """metasens::limitmeta seTE.adjust matches pinned R value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["se_adj"], EXPECTED["se_adj"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"se_adj: expected {EXPECTED['se_adj']:.9f} vs R {r['se_adj']:.9f}"


def test_limit_beta_r_matches_r():
    """Rücker regression slope beta.r matches pinned R value at tol=1e-6."""
    r = _run_r()
    assert math.isclose(r["beta_r"], EXPECTED["beta_r"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"beta_r: expected {EXPECTED['beta_r']:.9f} vs R {r['beta_r']:.9f}"


def test_limit_adjusted_attenuates_vs_unadjusted():
    """Limit-adjusted estimate < unadjusted RE (small-study effect attenuation).

    Fixture has deliberate small-study trend: larger effects in less-precise
    studies (S06: yi=0.75, sei=0.20). Extrapolating to SE=0 removes the
    contribution of imprecise studies, pulling the estimate toward the
    truly-large-study effects (smaller in this fixture).
    """
    r = _run_r()
    assert r["te_adj"] < r["te_re"], \
        f"Expected te_adj ({r['te_adj']:.4f}) < te_re ({r['te_re']:.4f})"


def test_limit_beta_r_positive():
    """Rücker slope beta.r > 0: small studies report larger effects (pub bias signal).

    A positive beta.r means that as SE increases (less precise studies), the
    predicted effect also increases — the hallmark of small-study effects.
    """
    r = _run_r()
    assert r["beta_r"] > 0, \
        f"Expected positive beta_r, got {r['beta_r']:.4f}"


# ---------------------------------------------------------------------------
# Pure-Python formula tests — no R subprocess.
# Mirror the JS engine's dl(), pool(), and limitMA() functions.
# ---------------------------------------------------------------------------

# Fixture: same 10 studies as limit-tiny.csv
_STUDIES = [
    {"te": 0.55, "se": 0.08},
    {"te": 0.48, "se": 0.10},
    {"te": 0.70, "se": 0.15},
    {"te": 0.60, "se": 0.09},
    {"te": 0.30, "se": 0.07},
    {"te": 0.75, "se": 0.20},
    {"te": 0.52, "se": 0.08},
    {"te": 0.65, "se": 0.12},
    {"te": 0.45, "se": 0.17},
    {"te": 0.58, "se": 0.10},
]


def _dl(rows):
    """DerSimonian-Laird tau² — mirrors JS dl()."""
    w0 = [1.0 / (r["se"] ** 2) for r in rows]
    sw = sum(w0)
    mu_fe = sum(w0[i] * rows[i]["te"] for i in range(len(rows))) / sw
    Q = sum(w0[i] * (rows[i]["te"] - mu_fe) ** 2 for i in range(len(rows)))
    df = len(rows) - 1
    sum_w2 = sum(w ** 2 for w in w0)
    tau2 = max(0.0, (Q - df) / (sw - sum_w2 / sw))
    return {"tau2": tau2, "mu_fe": mu_fe, "Q": Q}


def _pool(rows, tau2=0.0):
    """Inverse-variance pooling at given tau² — mirrors JS pool()."""
    w = [1.0 / (r["se"] ** 2 + tau2) for r in rows]
    sw = sum(w)
    mean = sum(w[i] * rows[i]["te"] for i in range(len(rows))) / sw
    se_mean = math.sqrt(1.0 / sw)
    return {"mean": mean, "se": se_mean}


def _limit_ma(rows):
    """WLS limit estimate — mirrors JS limitMA().

    WLS of te ~ β₀ + β₁·SE weighted by 1/(se² + tau²).
    Intercept β₀ at SE=0 is the limit estimate.
    """
    d = _dl(rows)
    tau2 = d["tau2"]
    w = [1.0 / (r["se"] ** 2 + tau2) for r in rows]
    sw = swx = swy = swxx = swxy = 0.0
    for i, r in enumerate(rows):
        x, y, wi = r["se"], r["te"], w[i]
        sw += wi; swx += wi * x; swy += wi * y
        swxx += wi * x * x; swxy += wi * x * y
    det = sw * swxx - swx ** 2
    b0 = (swxx * swy - swx * swxy) / det
    b1 = (sw * swxy - swx * swy) / det
    rss = sum(w[i] * (rows[i]["te"] - (b0 + b1 * rows[i]["se"])) ** 2
              for i in range(len(rows)))
    sigma2 = rss / max(1, len(rows) - 2)
    var_b0 = sigma2 * swxx / det
    se_b0 = math.sqrt(max(var_b0, 0.0))
    return {"limit": b0, "se_limit": se_b0, "slope": b1, "tau2": tau2}


def test_python_dl_tau2_matches_r():
    """DL tau² matches pinned R value at tol=1e-6."""
    d = _dl(_STUDIES)
    assert math.isclose(d["tau2"], EXPECTED["tau2"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"tau2: JS={d['tau2']:.9f} vs R={EXPECTED['tau2']:.9f}"


def test_python_fe_pool_matches_r():
    """FE pooled estimate matches pinned R te_fe at tol=1e-6."""
    p = _pool(_STUDIES, tau2=0.0)
    assert math.isclose(p["mean"], EXPECTED["te_fe"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"FE pool: JS={p['mean']:.9f} vs R={EXPECTED['te_fe']:.9f}"


def test_python_re_pool_matches_r():
    """DL-RE pooled estimate matches pinned R te_re at tol=1e-6."""
    d = _dl(_STUDIES)
    p = _pool(_STUDIES, tau2=d["tau2"])
    assert math.isclose(p["mean"], EXPECTED["te_re"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"RE pool: JS={p['mean']:.9f} vs R={EXPECTED['te_re']:.9f}"


def test_python_limit_attenuates():
    """JS WLS limit estimate < RE (attenuation for small-study-effect fixture)."""
    lim = _limit_ma(_STUDIES)
    re = _pool(_STUDIES, tau2=_dl(_STUDIES)["tau2"])
    assert lim["limit"] < re["mean"], \
        f"limit ({lim['limit']:.4f}) should be < RE ({re['mean']:.4f})"


def test_python_limit_within_tol_of_r():
    """JS WLS limit estimate within tol={TOL_ADJ} of R metasens::limitmeta TE.adjust."""
    lim = _limit_ma(_STUDIES)
    r_adj = EXPECTED["te_adj"]
    assert math.isclose(lim["limit"], r_adj, abs_tol=TOL_ADJ, rel_tol=TOL_ADJ), \
        f"JS limit ({lim['limit']:.4f}) vs R te_adj ({r_adj:.4f}), tol={TOL_ADJ}"


def test_python_slope_positive():
    """WLS slope β₁ > 0: small studies contribute larger effects (small-study effect)."""
    lim = _limit_ma(_STUDIES)
    assert lim["slope"] > 0, f"Expected positive slope, got {lim['slope']:.4f}"


def test_python_se_limit_positive():
    """WLS SE of intercept (limit estimate SE) is positive."""
    lim = _limit_ma(_STUDIES)
    assert lim["se_limit"] > 0, f"se_limit={lim['se_limit']:.6f} should be positive"


def test_all_se_positive():
    """All SE values in fixture are positive."""
    for i, s in enumerate(_STUDIES):
        assert s["se"] > 0, f"Study {i} has se={s['se']}"


def test_k_equals_10():
    """Fixture has exactly 10 studies."""
    assert len(_STUDIES) == 10


def test_python_tau_matches_r():
    """DL tau (sqrt tau2) matches R at tol=1e-6."""
    d = _dl(_STUDIES)
    tau_js = math.sqrt(d["tau2"])
    assert math.isclose(tau_js, EXPECTED["tau"],
                        abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"tau: JS={tau_js:.9f} vs R={EXPECTED['tau']:.9f}"


def test_python_limit_in_plausible_range():
    """Limit estimate lies in (0, 1) — plausible for standardised effect sizes."""
    lim = _limit_ma(_STUDIES)
    assert 0.0 < lim["limit"] < 1.0, \
        f"Limit estimate {lim['limit']:.4f} outside (0, 1)"


def test_small_study_has_largest_effect():
    """Fixture deliberate design: least-precise study (sei=0.20) has largest effect (0.75)."""
    max_se_study = max(_STUDIES, key=lambda r: r["se"])
    max_te_study = max(_STUDIES, key=lambda r: r["te"])
    assert max_se_study == max_te_study, \
        f"Expected same study to have max SE and max te; " \
        f"max SE: {max_se_study}, max te: {max_te_study}"
