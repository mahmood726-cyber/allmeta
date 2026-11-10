"""Wrapper-compatible entrypoint; existing assertions stay unchanged, artifacts use TEMP."""
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
import pytest

root = Path(__file__).resolve().parents[3]
output = Path(tempfile.mkdtemp(prefix="p10-pytest-"))
print(f"P10 Python evidence: {output}", flush=True)
code = pytest.main([
    "-v", "-p", "no:cacheprovider", "--import-mode=importlib",
    "--basetemp", str(output / "tmp"), "--junitxml", str(output / "results.xml"),
    str(root / "mh-peto/tests/test_smoke.py"),
    str(root / "mh-peto/tests/test_structure.py"),
    str(root / "mh-peto/tests/test_a11y.py"),
    str(root / "tests/test_truthcert_export.py"),
    str(root / "tests/test_export_signing_wiring.py") + "::test_chart_download_helper_supports_signing",
    str(root / "tests/test_export_signing_wiring.py") + "::test_results_export_helper_supports_signing",
])
raise SystemExit(code)
