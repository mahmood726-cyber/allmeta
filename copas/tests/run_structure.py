"""Run the existing fixture-free structural tests with `python <file>`.

The job runner accepts script paths, not `python -m pytest`. No test assertions
are copied or changed, and this runner creates no caches or output files.
"""
from pathlib import Path
import runpy
import sys
import traceback


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    namespace = runpy.run_path(str(Path(__file__).with_name("test_structure.py")))
    tests = sorted((name, fn) for name, fn in namespace.items()
                   if name.startswith("test_") and callable(fn))
    if not tests:
        raise SystemExit("No structural tests collected")
    failures = 0
    for name, fn in tests:
        try:
            fn()
        except Exception:
            failures += 1
            print(f"FAIL {name}", flush=True)
            traceback.print_exc()
        else:
            print(f"PASS {name}", flush=True)
    print(f"Structural tests: {len(tests) - failures} passed, {failures} failed")
    raise SystemExit(1 if failures else 0)
