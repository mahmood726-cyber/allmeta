"""Replay all existing matrix expectations without editing the oracle or its tests."""
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import subprocess
from numeric_oracle import expected, observed, matches

here = Path(__file__).resolve().parent
run = subprocess.run(['node', str(here / 'p13-numeric-replay.cjs')],
                     capture_output=True, text=True, encoding='utf-8', timeout=120)
assert run.returncode == 0, run.stderr
cases = json.loads(run.stdout)
assert len(cases) == 76
checks = 0
for case in cases:
    actual = observed(case)
    for field, value in expected(case).items():
        assert matches(actual[field], value), f"numeric matrix {case['model']} {case['name']} {field}"
        checks += 1
print(f'{len(cases)} cases, {checks} unchanged exact-key/numeric field assertions PASS (URL stub repaired in memory).')
