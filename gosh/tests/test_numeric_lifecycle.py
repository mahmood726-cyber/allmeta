"""Restoration adapters must preserve the supplied model and numeric input."""
import json
import os
from pathlib import Path
import subprocess


def test_numeric_restoration():
    here = Path(__file__).parent
    page = Path(os.environ.get('GOSH_PAGE', here.parent / 'index.html')).resolve()
    proc = subprocess.run(['node', str(here / 'numeric-lifecycle.cjs'), str(page)],
                          capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert proc.returncode == 0, proc.stderr
    for row in json.loads(proc.stdout):
        assert row['model'] == row['wantedModel'], 'numeric restoration model'
        assert row['src'] == '0, 1, S0\n2, 1, S1\n4, 1, S2', 'numeric restoration source'
        assert row['count'] == '7', 'numeric restoration count'
