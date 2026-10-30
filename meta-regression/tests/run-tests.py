"""Wrapper entry point: app tests, with bytecode/cache/test output outside the tree."""
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
import pytest

with tempfile.TemporaryDirectory(prefix="p08-d1-pytest-") as temporary:
    status = pytest.main([
        str(Path(__file__).parent), "-q", "-p", "no:cacheprovider",
        "-o", "addopts=", "--basetemp", str(Path(temporary) / "pytest"),
    ])
raise SystemExit(status)
