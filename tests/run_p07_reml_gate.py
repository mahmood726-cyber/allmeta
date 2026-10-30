"""Run the existing REML suite through the file-only job runner.

Keep caches, bytecode, and temporary test output out of the source tree.
No assertions, reference values, or tolerances are changed.
"""
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

import pytest


if __name__ == "__main__":
    suite = Path(__file__).with_name("test_reml_global.py")
    with tempfile.TemporaryDirectory(prefix="p07-reml-gate-") as output:
        result = pytest.main([
            str(suite), "-v", "-p", "no:cacheprovider", "--basetemp", output,
        ])
    raise SystemExit(result)
