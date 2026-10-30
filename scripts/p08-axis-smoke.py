"""Run the existing meta-regression Python smoke assertions without pytest caches."""
import runpy
from pathlib import Path

source = Path(__file__).resolve().parents[1] / 'meta-regression/tests/test_meta_regression.py'
tests = runpy.run_path(str(source))
count = 0
for name, check in sorted(tests.items()):
    if name.startswith('test_') and callable(check):
        check()
        count += 1
        print('PASS', name)
print(f'{count} existing smoke tests passed')
