"""Run existing RVE Python checks without writing caches/output into the tree."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parent.parent
with TemporaryDirectory(prefix="p15-parser-pytest-") as temp:
    result = pytest.main([
        str(root / "tests/test_rve_extras.py"),
        str(root / "tests/test_rve.py"),
        "-q", "-p", "no:cacheprovider", "--basetemp", str(Path(temp) / "pytest"),
    ])
raise SystemExit(result)
