"""Run the existing P08 Python smoke suites with all caches/output in TEMP."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parents[4]
with TemporaryDirectory(prefix="p08-pytest-") as scratch:
    raise SystemExit(pytest.main([
        "-v", "-p", "no:cacheprovider", "-o", "addopts=",
        "--basetemp", str(Path(scratch) / "pytest"),
        "-o", "cache_dir=" + str(Path(scratch) / "cache"),
        *[str(root / "meta-regression" / "tests" / name) for name in (
            "test_meta_regression.py", "test_export.py", "test_csv_upload.py",
        )],
    ]))
