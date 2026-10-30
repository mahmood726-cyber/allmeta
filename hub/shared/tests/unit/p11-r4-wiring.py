"""Run existing Influence wiring assertions without writing pytest caches."""
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[4]
count = 0
for name in ("test_export.py", "test_csv_upload.py"):
    tests = runpy.run_path(str(root / "influence/tests" / name))
    for test_name, test in tests.items():
        if test_name.startswith("test_") and callable(test):
            test()
            count += 1
            print(f"PASS {name}::{test_name}")
print(f"PASS {count}/{count} existing Influence wiring tests")
