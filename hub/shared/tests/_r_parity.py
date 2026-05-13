"""Shared R-parity test helper. SKIP if Rscript unavailable; FAIL on numeric drift."""
from __future__ import annotations
import json
import math
import shutil
import subprocess
from pathlib import Path
import pytest

RSCRIPT = r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe"


def _rscript_path() -> str | None:
    if Path(RSCRIPT).is_file():
        return RSCRIPT
    return shutil.which("Rscript")


def assert_r_parity(
    python_result: dict,
    *,
    r_script: Path,
    fixture_csv: Path,
    tol: float = 1e-6,
) -> None:
    """Run r_script against fixture_csv via Rscript, parse JSON output,
    compare every numeric field to python_result within tol. Calls
    pytest.skip if Rscript is not on the host."""
    rscript = _rscript_path()
    if rscript is None:
        pytest.skip("Rscript not available — R-parity check requires R 4.5.x")
    proc = subprocess.run(
        [rscript, "--vanilla", str(r_script), str(fixture_csv)],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Rscript failed (exit {proc.returncode}):\n{proc.stderr}")
    r_result = json.loads(proc.stdout.strip().splitlines()[-1])
    mismatches = []
    for key, py_val in python_result.items():
        if key not in r_result:
            mismatches.append(f"  {key}: missing in R output")
            continue
        r_val = r_result[key]
        if isinstance(py_val, (int, float)) and isinstance(r_val, (int, float)):
            if not math.isclose(py_val, r_val, abs_tol=tol, rel_tol=tol):
                mismatches.append(f"  {key}: python={py_val} vs r={r_val} (tol={tol})")
        elif py_val != r_val:
            mismatches.append(f"  {key}: python={py_val!r} vs r={r_val!r}")
    if mismatches:
        raise AssertionError("R-parity mismatch:\n" + "\n".join(mismatches))
