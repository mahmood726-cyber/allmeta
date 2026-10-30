"""Actually invoke the existing ten zero-argument wiring smoke tests.

Directly running their files only defines functions. Use unittest's runner so
collection counts, assertion failures and the process exit status are real.
"""
from pathlib import Path
import runpy
import sys
import unittest

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[1]
suite = unittest.TestSuite()
for name in ("test_export.py", "test_csv_upload.py"):
    namespace = runpy.run_path(str(root / "influence" / "tests" / name))
    tests = [(key, value) for key, value in namespace.items() if key.startswith("test_") and callable(value)]
    assert tests, f"No tests collected from {name}"
    for key, function in tests:
        suite.addTest(unittest.FunctionTestCase(function, description=f"{name}::{key}"))
assert suite.countTestCases() == 10
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
