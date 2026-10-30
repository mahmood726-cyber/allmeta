"""Runner-supported entry point for the unit gate and existing P09 app controls.

Run from the repository root with: python hub/shared/tests/p09-review-checks.py
Enumerate the unit glob because the job wrapper accepts only one script path.
No source, reference, cache, or test-output file is written.
"""
from pathlib import Path
import runpy
import subprocess
import sys
import traceback

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True


def main():
    unit_files = sorted((ROOT / "hub/shared/tests/unit").rglob("*.test.mjs"))
    if not unit_files:
        raise AssertionError("the unit gate must discover tests")
    print(f"Unit gate: {len(unit_files)} files", flush=True)
    gate = subprocess.run(
        ["node", "--test", *(str(path.relative_to(ROOT)) for path in unit_files)],
        cwd=ROOT,
        check=False,
    )

    controls = []
    for filename in ("test_structure.py", "test_smoke.py", "test_a11y.py"):
        namespace = runpy.run_path(str(ROOT / "proportion-ma/tests" / filename))
        controls.extend((name, fn) for name, fn in sorted(namespace.items())
                        if name.startswith("test_") and callable(fn))
    if len(controls) != 7:
        raise AssertionError(f"expected all seven existing app controls; found {len(controls)}")
    failures = 0
    for name, check in controls:
        try:
            check()
            print(f"PASS {name}", flush=True)
        except Exception:
            failures += 1
            print(f"FAIL {name}", flush=True)
            traceback.print_exc()
    print(f"App controls: {len(controls) - failures} passed, {failures} failed", flush=True)
    return 1 if gate.returncode or failures else 0


if __name__ == "__main__":
    sys.exit(main())
