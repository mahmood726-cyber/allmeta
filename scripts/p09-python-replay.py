"""Run the existing estimator migration controls; write no cache into the tree."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parent.parent
raise SystemExit(pytest.main([
    "-p", "no:cacheprovider", "-v",
    str(root / "tests/test_proportion_ma_tau2_parity.py"),
]))
