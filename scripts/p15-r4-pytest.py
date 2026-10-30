"""Run the unchanged scoped pytest suites without repository caches."""
import sys
import tempfile

sys.dont_write_bytecode = True
import pytest

with tempfile.TemporaryDirectory(prefix="p15-r4-pytest-") as scratch:
    result = pytest.main([
        "tests/test_rve.py", "tests/test_rve_extras.py", "-q",
        "-p", "no:cacheprovider", "--basetemp", scratch,
    ])
raise SystemExit(result)
