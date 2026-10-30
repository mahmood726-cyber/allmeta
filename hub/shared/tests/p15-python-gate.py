"""Run the unchanged Python part of rve-integrity without repository caches."""
import sys
sys.dont_write_bytecode = True

import os
import shutil
from pathlib import Path
import tempfile
import numpy  # Require CI's dependency; do not silently skip numerical checks.
import pytest

os.chdir(Path(__file__).resolve().parents[3])
assert shutil.which("node"), "Node is required; do not skip the CI checks"
with tempfile.TemporaryDirectory(prefix="p15-python-gate-") as temp:
    result = pytest.main([
        "tests/test_rve.py", "tests/test_rve_extras.py", "-q",
        "-p", "no:cacheprovider", "--basetemp", temp,
    ])
raise SystemExit(result)
