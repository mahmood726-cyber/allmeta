# Root pytest configuration for the allmeta offline test suite.
#
# Some app directories carry legacy *standalone* Selenium runner scripts named
# `test_*.py` that live at the app root (not under `<app>/tests/`). These are
# browser-driven integration scripts meant to be run by hand
# (`python test_v19_comprehensive.py`) against a live Chrome/Firefox — they are
# NOT part of the default offline unit suite, they require a browser + network,
# and collecting the dosehtml set (which has duplicate basenames across frozen
# release snapshots) corrupts pytest's capture machinery
# ("ValueError: I/O operation on closed file" at session teardown).
#
# Exclude them from default collection here. They remain runnable directly.
# Archived snapshot copies are additionally pruned via `norecursedirs` in
# pytest.ini. Run them explicitly with: pytest <path> --import-mode=importlib

# --- R discovery for the R-parity tests -------------------------------------
# Many <app>/tests/test_against_*.py fall back to shutil.which("Rscript"); if R
# is installed under Program Files but not on PATH they skip. Prepend the newest
# installed R's bin dir so those metafor/netmeta/mada parity checks actually run
# — version-agnostic (no hardcoded R-x.y.z), and a no-op if R is already on PATH
# or not installed (non-Windows or absent -> glob returns nothing).
import glob as _glob
import os as _os
import shutil as _shutil

if _shutil.which("Rscript") is None:
    for _pat in (r"C:\Program Files\R\R-*\bin\x64", r"C:\Program Files\R\R-*\bin"):
        _cands = sorted(_glob.glob(_pat), reverse=True)  # newest version first
        _bin = next((d for d in _cands if _os.path.isfile(_os.path.join(d, "Rscript.exe"))), None)
        if _bin:
            _os.environ["PATH"] = _bin + _os.pathsep + _os.environ.get("PATH", "")
            break

collect_ignore = [
    "dosehtml/test_dose_response_app.py",
    "dosehtml/test_dose_response_main.py",
    "dosehtml/test_v19_comprehensive.py",
    "Pairwiseai/test_hta.py",
    "Pairwiseai/test_truthcert_comprehensive.py",
    "Pairwiseai/test_truthcert_v2.py",
]
