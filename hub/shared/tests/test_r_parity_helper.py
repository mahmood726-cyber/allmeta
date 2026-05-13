import shutil
from pathlib import Path
import pytest
from _r_parity import assert_r_parity, RSCRIPT

FIXTURES = Path(__file__).parent / "fixtures"

# Exact values from metafor rma.uni(method="REML") on parity-tiny.csv
# Captured by running parity-tiny.R on 2026-05-13 (R 4.5.2, metafor 4.x).
# tol=1e-6 for tight coupling to metafor.
EXACT_R_VALUES = {
    "b": 0.07796610169492,
    "se": 0.1008438968179,
    "ci.lb": -0.1196843041289,
    "ci.ub": 0.2756165075187,
    "tau2": 0.0,
    "I2": 0.0,
    "Q": 1.635593220339,
    "QEp": 0.441403167052,
    "k": 3,
}


@pytest.mark.skipif(
    not shutil.which("Rscript") and not Path(RSCRIPT).is_file(),
    reason="Rscript not available — R-parity check requires R 4.5.x",
)
def test_assert_r_parity_passes_when_python_matches_r():
    # Values are the exact metafor REML output — Python engine must match these.
    assert_r_parity(
        EXACT_R_VALUES,
        r_script=FIXTURES / "parity-tiny.R",
        fixture_csv=FIXTURES / "parity-tiny.csv",
        tol=1e-6,
    )


def test_assert_r_parity_skips_when_no_rscript(monkeypatch, tmp_path):
    monkeypatch.setattr("shutil.which", lambda *a, **k: None)
    monkeypatch.setattr("_r_parity.RSCRIPT", "/does/not/exist/Rscript")
    with pytest.raises(pytest.skip.Exception):
        assert_r_parity(
            {"b": 0.0},
            r_script=tmp_path / "any.R",
            fixture_csv=tmp_path / "any.csv",
            tol=1e-6,
        )
