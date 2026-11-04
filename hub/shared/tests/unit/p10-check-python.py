"""Run the unchanged MH/Peto Python structural tests with all caches in TEMP."""
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parents[4]
with tempfile.TemporaryDirectory(prefix="p10-pytest-") as scratch:
    sys.exit(pytest.main([
        "-q", "-p", "no:cacheprovider", "--basetemp", scratch,
        str(root / "mh-peto/tests/test_structure.py"),
        str(root / "mh-peto/tests/test_smoke.py"),
        str(root / "mh-peto/tests/test_a11y.py"),
    ]))
