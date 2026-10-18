"""One table-driven state x field contract shared with native browser auditing."""
import json
import os
from pathlib import Path
import subprocess
from .numeric_oracle import expected, observed, matches


def test_numeric_state_field_matrix():
    here=Path(__file__).parent
    page=Path(os.environ.get('GOSH_PAGE',here.parent/'index.html')).resolve()
    proc=subprocess.run(['node',str(here/'numeric-probe.cjs'),str(page)],capture_output=True,text=True,encoding='utf-8',timeout=60)
    assert proc.returncode == 0, proc.stderr
    cases=json.loads(proc.stdout)
    assert len(cases)==76
    for case in cases:
        actual=observed(case)
        for field,value in expected(case).items():
            assert matches(actual[field],value), f"numeric matrix {case['model']} {case['name']} {field}: {actual[field]!r} != {value!r}"


def test_matrix_inputs_are_distinct_nontrivial():
    from .numeric_oracle import fixture
    for k in (2,3,16,101):
        rows=fixture(k)
        for column in zip(*rows):
            assert len(set(column)) == k
            assert not set(column) & {0,1,.5,2,10}
        assert all(effect != se for effect,se in rows)
