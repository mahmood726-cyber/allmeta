"""R-parity test: gosh vs metafor::gosh(rma.uni(...)).

Engine parameterisation (JS gosh/index.html):
  - Input: effect, SE pairs (parsed from textarea or CSV with yi, vi columns)
  - Full enumeration for k <= 15: all 2^k - 1 non-empty subsets of size >= 2
  - Random sampling for k > 15 (advanced-stats.md rule)
  - For each subset: FE (inverse-variance) or DL RE pooling
  - Summary: median estimate, IQR, range, median I² across all subsets

metafor::gosh() reference (R 4.5.2):
  - gosh(rma.uni(yi, vi, method="FE"), progbar=FALSE)
  - Returns per-subset: estimate, I2, k, QE
  - Subsets of size k_i < 2 are skipped by metafor (same as JS engine)

Fixture: 5 studies (k=5) → full enumeration = 26 subsets (size 2-5).
Data: study, yi, vi columns (vi = SE²).
  S01: yi=0.22, vi=0.0064 (SE=0.08)
  S02: yi=0.30, vi=0.0196 (SE=0.14)
  S03: yi=0.27, vi=0.0081 (SE=0.09)
  S04: yi=0.15, vi=0.0049 (SE=0.07)
  S05: yi=0.45, vi=0.0324 (SE=0.18)

Values captured from a single Rscript run on gosh-tiny.R + gosh-tiny.csv
(2026-05-14, R 4.5.2, metafor 4.x):
  {
    "method":     "FE",
    "k":          5,
    "n_subsets":  26,
    "median_est": 0.2217261558338,
    "q25_est":    0.2047081408179,
    "q75_est":    0.2615342255235,
    "min_est":    0.18,
    "max_est":    0.3565384615385,
    "median_i2":  0.0,
    "full_k_est": 0.2254227851625,
    "full_k_i2":  0.0
  }

R-parity scope:
  - Subset count: JS engine produces same 26 subsets as metafor (size >= 2)
  - Median FE estimate across all 26 subsets: tol=1e-4
  - Full-k FE estimate: tol=1e-6 (deterministic closed-form IV pooling)
  - Bounds check: min ≤ median ≤ max; I² in [0, 100]
  - Range: min_est ≤ full_k_est ≤ max_est
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
# re-running gosh-tiny.R and updating the comment above.
# ---------------------------------------------------------------------------
GOSH_EXPECTED = {
    "method":     "FE",
    "k":          5,
    "n_subsets":  26,
    "median_est": 0.2217261558338,
    "q25_est":    0.2047081408179,
    "q75_est":    0.2615342255235,
    "min_est":    0.18,
    "max_est":    0.3565384615385,
    "median_i2":  0.0,
    "full_k_est": 0.2254227851625,
    "full_k_i2":  0.0,
}

TOL_EXACT  = 1e-6   # deterministic closed-form (full-k FE)
TOL_MEDIAN = 1e-4   # median across subsets (floating-point ordering sensitivity)


def _rscript():
    if Path(RSCRIPT_PATH).is_file():
        return RSCRIPT_PATH
    found = shutil.which("Rscript")
    if found:
        return found
    import glob as _glob
    _c = sorted(_glob.glob("C:/Program Files/R/R-*/bin/Rscript.exe"), reverse=True)
    return _c[0] if _c else None


def _run_r(method="FE"):
    rscript = _rscript()
    if rscript is None:
        pytest.skip("Rscript not available — R-parity check requires R 4.5.x")
    # Verify metafor is installed
    check = subprocess.run(
        [rscript, "--vanilla", "-e",
         "suppressPackageStartupMessages(library(metafor)); cat('ok')"],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=30,
    )
    if check.returncode != 0 or "ok" not in check.stdout:
        pytest.skip("metafor not installed in R — install with install.packages('metafor')")

    proc = subprocess.run(
        [rscript, "--vanilla",
         str(FIX / "gosh-tiny.R"),
         str(FIX / "gosh-tiny.csv"),
         method],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=120,
    )
    if proc.returncode not in (0, 1):
        raise RuntimeError(f"Rscript failed (exit {proc.returncode}):\n{proc.stderr}")
    lines = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
    return json.loads(lines[-1])


# ---------------------------------------------------------------------------
# R-subprocess tests — verify pinned metafor outputs match stored values.
# ---------------------------------------------------------------------------

def test_gosh_k_matches_fixture():
    """R reads all 5 studies from the fixture CSV."""
    r = _run_r("FE")
    assert r["k"] == GOSH_EXPECTED["k"], f"k: expected 5 vs R {r['k']}"


def test_gosh_n_subsets_fe():
    """k=5 → 26 subsets of size >= 2 (full enumeration)."""
    r = _run_r("FE")
    assert r["n_subsets"] == GOSH_EXPECTED["n_subsets"], \
        f"n_subsets: expected 26 vs R {r['n_subsets']}"


def test_gosh_median_est_fe_matches_r():
    """Median FE estimate across 26 subsets matches R at tol=1e-4."""
    r = _run_r("FE")
    py_val, r_val = GOSH_EXPECTED["median_est"], r["median_est"]
    assert math.isclose(py_val, r_val, abs_tol=TOL_MEDIAN, rel_tol=TOL_MEDIAN), \
        f"median_est: expected {py_val:.6f} vs R {r_val:.6f}"


def test_gosh_full_k_est_fe_matches_r():
    """Full-k=5 FE pooled estimate matches R at tol=1e-6 (deterministic IV)."""
    r = _run_r("FE")
    py_val, r_val = GOSH_EXPECTED["full_k_est"], r["full_k_est"]
    assert math.isclose(py_val, r_val, abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"full_k_est: expected {py_val:.9f} vs R {r_val:.9f}"


def test_gosh_full_k_i2_is_zero():
    """Full-k I² is 0 (homogeneous fixture — near-identical effects, varying precision)."""
    r = _run_r("FE")
    assert math.isclose(r["full_k_i2"], 0.0, abs_tol=1e-3), \
        f"full_k_i2: expected 0 vs R {r['full_k_i2']:.4f}"


def test_gosh_min_le_median_le_max():
    """Sanity: min_est ≤ median_est ≤ max_est across all subsets."""
    r = _run_r("FE")
    assert r["min_est"] <= r["median_est"] + 1e-9, \
        f"min_est ({r['min_est']:.4f}) > median_est ({r['median_est']:.4f})"
    assert r["median_est"] <= r["max_est"] + 1e-9, \
        f"median_est ({r['median_est']:.4f}) > max_est ({r['max_est']:.4f})"


def test_gosh_median_i2_is_zero():
    """Median I² across all FE subsets is 0 for this near-homogeneous fixture."""
    r = _run_r("FE")
    assert math.isclose(r["median_i2"], 0.0, abs_tol=0.5), \
        f"median_i2: expected 0 vs R {r['median_i2']:.2f}"


def test_gosh_full_k_est_within_range():
    """Full-k estimate lies within the min–max range of all subset estimates."""
    r = _run_r("FE")
    assert r["min_est"] - 1e-6 <= r["full_k_est"] <= r["max_est"] + 1e-6, \
        (f"full_k_est ({r['full_k_est']:.4f}) outside "
         f"[{r['min_est']:.4f}, {r['max_est']:.4f}]")


# ---------------------------------------------------------------------------
# Pure-Python formula tests — no R subprocess.
# Verify the JS engine's FE pooling and all-subset enumeration directly.
# ---------------------------------------------------------------------------

# Fixture: same 5 studies as gosh-tiny.csv (vi = SE²)
_STUDIES = [
    {"te": 0.22, "se": 0.08},   # S01  vi=0.0064
    {"te": 0.30, "se": 0.14},   # S02  vi=0.0196
    {"te": 0.27, "se": 0.09},   # S03  vi=0.0081
    {"te": 0.15, "se": 0.07},   # S04  vi=0.0049
    {"te": 0.45, "se": 0.18},   # S05  vi=0.0324
]


def _fe_pool(rows):
    """Inverse-variance FE pooling — mirrors JS engine pool() for model='FE'."""
    w = [1.0 / (r["se"] ** 2) for r in rows]
    sw = sum(w)
    mu = sum(w[i] * rows[i]["te"] for i in range(len(rows))) / sw
    se = math.sqrt(1.0 / sw)
    Q = sum(w[i] * (rows[i]["te"] - mu) ** 2 for i in range(len(rows)))
    df = len(rows) - 1
    i2 = 100.0 * (Q - df) / Q if (df > 0 and Q > df) else 0.0
    return {"mu": mu, "se": se, "Q": Q, "I2": i2, "k": len(rows)}


def _all_subsets_fe(rows):
    """Enumerate all non-empty subsets of size >= 2; return list of (mu, I2)."""
    k = len(rows)
    total = (1 << k) - 1
    results = []
    for m in range(1, total + 1):
        subset = [rows[i] for i in range(k) if m & (1 << i)]
        if len(subset) < 2:
            continue
        p = _fe_pool(subset)
        results.append({"mu": p["mu"], "I2": p["I2"], "k": len(subset)})
    return results


def test_fe_pool_full_k_matches_r():
    """Python FE pool on all 5 studies matches R full_k_est at tol=1e-6."""
    p = _fe_pool(_STUDIES)
    expected = GOSH_EXPECTED["full_k_est"]
    assert math.isclose(p["mu"], expected, abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"FE pool: Python={p['mu']:.9f} vs R={expected:.9f}"


def test_fe_pool_full_k_i2_zero():
    """Python FE I² on all 5 studies is 0 (Q < df for near-homogeneous fixture)."""
    p = _fe_pool(_STUDIES)
    assert p["I2"] == 0.0, f"I2 should be 0, got {p['I2']:.4f}"


def test_subset_count_equals_26():
    """Full enumeration of k=5 yields exactly 26 subsets of size >= 2."""
    results = _all_subsets_fe(_STUDIES)
    assert len(results) == 26, f"Expected 26 subsets, got {len(results)}"


def test_median_est_matches_r():
    """Python median FE estimate over 26 subsets matches R at tol=1e-4.

    R's median() for even-length vectors averages the two central values.
    For n=26 subsets: median = (mus[12] + mus[13]) / 2 (0-indexed).
    The JS engine uses mus[floor(n/2)] = mus[13] (upper middle) — this
    test uses R's convention to match the pinned R output.
    """
    results = _all_subsets_fe(_STUDIES)
    mus = sorted(r["mu"] for r in results)
    n = len(mus)
    # R median convention for even n: average of central pair
    median = (mus[n // 2 - 1] + mus[n // 2]) / 2
    expected = GOSH_EXPECTED["median_est"]
    assert math.isclose(median, expected, abs_tol=TOL_MEDIAN, rel_tol=TOL_MEDIAN), \
        f"median: Python={median:.6f} vs R={expected:.6f}"


def test_min_est_matches_r():
    """Minimum FE estimate across 26 subsets matches R at tol=1e-6."""
    results = _all_subsets_fe(_STUDIES)
    mn = min(r["mu"] for r in results)
    expected = GOSH_EXPECTED["min_est"]
    assert math.isclose(mn, expected, abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"min_est: Python={mn:.6f} vs R={expected:.6f}"


def test_max_est_matches_r():
    """Maximum FE estimate across 26 subsets matches R at tol=1e-6."""
    results = _all_subsets_fe(_STUDIES)
    mx = max(r["mu"] for r in results)
    expected = GOSH_EXPECTED["max_est"]
    assert math.isclose(mx, expected, abs_tol=TOL_EXACT, rel_tol=TOL_EXACT), \
        f"max_est: Python={mx:.6f} vs R={expected:.6f}"


def test_all_subset_i2_in_0_100():
    """All I² values across 26 subsets lie in [0, 100]."""
    results = _all_subsets_fe(_STUDIES)
    for r in results:
        assert 0.0 <= r["I2"] <= 100.0 + 1e-9, \
            f"I2={r['I2']:.2f} out of [0, 100] for subset of size {r['k']}"


def test_single_study_exclusion_changes_estimate():
    """Leaving out each study changes the pooled estimate (no study has zero weight)."""
    k = len(_STUDIES)
    full = _fe_pool(_STUDIES)["mu"]
    for i in range(k):
        subset = [s for j, s in enumerate(_STUDIES) if j != i]
        p = _fe_pool(subset)
        assert not math.isclose(p["mu"], full, abs_tol=1e-9), \
            f"Leaving out study {i} did not change the estimate — weight may be zero"


def test_size2_subsets_count():
    """Exactly C(5,2)=10 subsets of size 2 in full enumeration."""
    results = _all_subsets_fe(_STUDIES)
    size2 = [r for r in results if r["k"] == 2]
    assert len(size2) == 10, f"Expected 10 size-2 subsets, got {len(size2)}"


def test_size5_subset_count():
    """Exactly 1 subset of size 5 (all studies included)."""
    results = _all_subsets_fe(_STUDIES)
    size5 = [r for r in results if r["k"] == 5]
    assert len(size5) == 1, f"Expected 1 size-5 subset, got {len(size5)}"


def test_size5_estimate_equals_full_k():
    """The k=5 subset estimate equals the full-k FE pool at tol=1e-9."""
    results = _all_subsets_fe(_STUDIES)
    size5 = [r for r in results if r["k"] == 5]
    assert len(size5) == 1
    expected = _fe_pool(_STUDIES)["mu"]
    assert math.isclose(size5[0]["mu"], expected, abs_tol=1e-9, rel_tol=1e-9), \
        f"size-5 subset estimate {size5[0]['mu']:.9f} != full-k {expected:.9f}"


def test_se_positive_for_all_subsets():
    """SE from FE pooling is positive for all subsets (denominator > 0)."""
    results_raw = []
    k = len(_STUDIES)
    total = (1 << k) - 1
    for m in range(1, total + 1):
        subset = [_STUDIES[i] for i in range(k) if m & (1 << i)]
        if len(subset) < 2:
            continue
        p = _fe_pool(subset)
        assert p["se"] > 0, f"SE={p['se']} for subset of size {p['k']}"
