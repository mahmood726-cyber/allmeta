"""Run the existing twelve NMA app checks without pytest cache or bytecode."""
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True
namespace = runpy.run_path(str(Path(__file__).resolve().parents[1] / "nma/tests/test_nma.py"))
checks = [(name, check) for name, check in namespace.items() if name.startswith("test_")]
assert len(checks) == 12, f"Expected all 12 existing checks, found {len(checks)}"
for name, check in checks:
    check()
    print(f"PASS {name}")
print(f"PASS all {len(checks)} existing NMA app checks")
