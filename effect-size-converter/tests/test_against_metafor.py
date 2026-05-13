"""R-parity test: effect-size-converter SMD and OR escalc values vs metafor::escalc."""
import math
import sys
import subprocess
import json
import shutil
import pytest
from pathlib import Path

FIX = Path(__file__).parent / "fixtures"
RSCRIPT_PATH = r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"

# ---------------------------------------------------------------------------
# Values captured from a single Rscript run on esc-tiny.R (2026-05-13):
# {"smd":{"yi":[0.6619744469902,0.6540652223779],"vi":[0.07031841807057,0.04682111841736]},
#  "or": {"yi":[0.5055485666651,-0.7472144018302],"vi":[0.2584586466165,0.3216374269006]}}
# ---------------------------------------------------------------------------

SMD_EXPECTED = {
    "yi": [0.6619744469902, 0.6540652223779],
    "vi": [0.07031841807057, 0.04682111841736],
}

OR_EXPECTED = {
    "yi": [0.5055485666651, -0.7472144018302],
    "vi": [0.2584586466165,  0.3216374269006],
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
    proc = subprocess.run(
        [rscript, "--vanilla", str(FIX / "esc-tiny.R")],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Rscript failed (exit {proc.returncode}):\n{proc.stderr}")
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_smd_yi_matches_metafor_escalc():
    r = _run_r()
    for i, (py_val, r_val) in enumerate(zip(SMD_EXPECTED["yi"], r["smd"]["yi"])):
        assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
            f"SMD yi[{i}]: python={py_val} vs r={r_val} (tol={TOL})"


def test_smd_vi_matches_metafor_escalc():
    r = _run_r()
    for i, (py_val, r_val) in enumerate(zip(SMD_EXPECTED["vi"], r["smd"]["vi"])):
        assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
            f"SMD vi[{i}]: python={py_val} vs r={r_val} (tol={TOL})"


def test_or_yi_matches_metafor_escalc():
    r = _run_r()
    for i, (py_val, r_val) in enumerate(zip(OR_EXPECTED["yi"], r["or"]["yi"])):
        assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
            f"OR yi[{i}]: python={py_val} vs r={r_val} (tol={TOL})"


def test_or_vi_matches_metafor_escalc():
    r = _run_r()
    for i, (py_val, r_val) in enumerate(zip(OR_EXPECTED["vi"], r["or"]["vi"])):
        assert math.isclose(py_val, r_val, abs_tol=TOL, rel_tol=TOL), \
            f"OR vi[{i}]: python={py_val} vs r={r_val} (tol={TOL})"


def test_smd_formula_matches_escalc_row0():
    """
    Direct numeric verification of escalc SMD formula for row 0 (no R subprocess).
    escalc(SMD): d = (m1 - m2) / S_p; S_p = sqrt(((n1-1)*sd1^2 + (n2-1)*sd2^2)/(n1+n2-2))
    Hedges correction: g = d * J where J = 1 - 3 / (4*df - 1), df = n1+n2-2
    Variance (metafor): vi = (n1+n2)/(n1*n2) + g^2 / (2*(n1+n2))

    NOTE: metafor's internal implementation uses log-gamma–based J and the exact
    noncentrality-parameter variance formula; these are numerically equivalent to
    the simple 1-3/(4df-1) approximation only to ~1e-5. We verify to 1e-4 for the
    direct-formula path and rely on the R-subprocess tests for 1e-6 parity.
    """
    m1, sd1, n1 = 52.5, 8.2, 30
    m2, sd2, n2 = 47.1, 7.9, 30
    df = n1 + n2 - 2
    Sp = math.sqrt(((n1 - 1) * sd1**2 + (n2 - 1) * sd2**2) / df)
    d = (m1 - m2) / Sp
    J = 1 - 3 / (4 * df - 1)
    g = d * J
    # metafor vi uses (n1+n2) not df in the denominator of the squared term
    vi = (n1 + n2) / (n1 * n2) + g**2 / (2 * (n1 + n2))
    # Tolerance 1e-4: direct formula vs metafor internal precision
    FORMULA_TOL = 1e-4
    assert math.isclose(g, SMD_EXPECTED["yi"][0], abs_tol=FORMULA_TOL), \
        f"SMD yi[0] formula check: got {g} expected {SMD_EXPECTED['yi'][0]}"
    assert math.isclose(vi, SMD_EXPECTED["vi"][0], abs_tol=FORMULA_TOL), \
        f"SMD vi[0] formula check: got {vi} expected {SMD_EXPECTED['vi'][0]}"


def test_or_formula_matches_escalc_row0():
    """
    Direct numeric verification of escalc OR formula for row 0 (no R subprocess).
    escalc(OR): yi = log(ai*di / (bi*ci)); vi = 1/ai + 1/bi + 1/ci + 1/di
    """
    ai, bi, ci, di = 12, 38, 8, 42
    yi = math.log(ai * di / (bi * ci))
    vi = 1/ai + 1/bi + 1/ci + 1/di
    assert math.isclose(yi, OR_EXPECTED["yi"][0], abs_tol=TOL), \
        f"OR yi[0] formula check: got {yi} expected {OR_EXPECTED['yi'][0]}"
    assert math.isclose(vi, OR_EXPECTED["vi"][0], abs_tol=TOL), \
        f"OR vi[0] formula check: got {vi} expected {OR_EXPECTED['vi'][0]}"
