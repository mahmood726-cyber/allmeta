"""Run the existing main-app Python suite without writing caches into the tree."""
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parents[1]
scratch = tempfile.mkdtemp(prefix="p08-r5-pytest-")
raise SystemExit(pytest.main([
    str(root / "meta-regression" / "tests"), "-q", "-rs", "-p", "no:cacheprovider",
    "-o", "addopts=", "--basetemp", scratch,
]))
