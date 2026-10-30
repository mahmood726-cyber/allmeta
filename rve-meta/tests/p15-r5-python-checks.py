"""Wrapper-compatible launcher; keep pytest caches and bytecode out of the tree."""
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="p15-r5-pytest-") as scratch:
    result = subprocess.run([
        sys.executable, "-B", "-m", "pytest", "-p", "no:cacheprovider",
        "--basetemp", scratch, "tests/test_rve.py", "tests/test_rve_extras.py", "-q",
    ], cwd=root, check=False)
sys.exit(result.returncode)
