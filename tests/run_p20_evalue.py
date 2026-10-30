"""Wrapper-compatible invocation; all pytest artifacts stay in the temp directory."""
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parent.parent
scratch = tempfile.mkdtemp(prefix="p20-evalue-pytest-")
raise SystemExit(pytest.main([
    str(root / "tests/test_evalue.py"), "-v", "-p", "no:cacheprovider",
    "--basetemp", scratch,
]))
