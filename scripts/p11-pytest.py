"""Run the existing shared comparison-bus tests without checkout caches."""
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
import pytest

with tempfile.TemporaryDirectory(prefix="p11-pytest-") as temporary:
    suite = Path(__file__).resolve().parents[1] / "tests/test_ma_comparisons_v1.py"
    result = pytest.main([str(suite), "-q", "-p", "no:cacheprovider", "--basetemp", temporary])
raise SystemExit(result)
