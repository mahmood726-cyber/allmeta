"""Run existing app, estimator and bus tests; keep generated files in TEMP."""
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parents[4]
with tempfile.TemporaryDirectory(prefix="p09-pytest-") as temporary:
    raise SystemExit(pytest.main([
        "-v", "-p", "no:cacheprovider", "--basetemp", temporary,
        str(root / "proportion-ma/tests/test_structure.py"),
        str(root / "proportion-ma/tests/test_smoke.py"),
        str(root / "proportion-ma/tests/test_a11y.py"),
        str(root / "tests/test_proportion_ma_tau2_parity.py"),
        str(root / "tests/test_ma_studies_v1.py"),
    ]))
