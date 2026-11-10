"""Wrapper-compatible entry point for the existing Influence pytest suite."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# Keep imported-module bytecode, pytest caches, and runtime artifacts out of wt/.
sys.dont_write_bytecode = True

import pytest


if __name__ == "__main__":
    with TemporaryDirectory(prefix="p11-influence-pytest-") as output:
        status = pytest.main([
            "-v", "-rA", "-p", "no:cacheprovider",
            "--basetemp", str(Path(output) / "pytest"),
            str(Path(__file__).resolve().parent),
        ])
    raise SystemExit(status)
