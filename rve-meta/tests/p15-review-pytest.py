"""Collect the existing RVE Python suites through the job's file-only runner."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# Keep bytecode, pytest caches, and test artifacts out of the source tree.
sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parents[2]
with TemporaryDirectory(prefix="p15-pytest-") as temp:
    status = pytest.main([
        "-q", "-p", "no:cacheprovider", "--basetemp", temp,
        str(root / "tests/test_rve.py"),
        str(root / "tests/test_rve_extras.py"),
    ])
raise SystemExit(status)
