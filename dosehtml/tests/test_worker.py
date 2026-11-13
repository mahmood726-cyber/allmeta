"""dose-response-worker.js (a Web Worker prototype, not loaded by the page; referenced by README, the release-snapshot
script and dosehtml's own CI file) must compute what the page computes.

Before: it had its own model code -- reference rows (dose 0, logRR 0) kept as observations, the approximate DL
denominator tr(V) - df, a REML score without the REML correction, Q at the random-effects tau2 -- and it failed on
every dataset tried ("Singular 3x3 system in worker GLS solver" for the built-in sample, coffee_mort and milk_mort).
Now its numerical core is a verbatim copy of the page's functions (checked here line for line), so a runGLS message
returns exactly the page's solveGLS() result.
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _harness():
    out = subprocess.run(['node', str(HERE / 'worker_harness.cjs')], capture_output=True, text=True, timeout=300,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def test_worker_runGLS_equals_page_solveGLS():
    bad = []
    for key, c in V['cases'].items():
        if 'error' in c['worker']:
            bad.append('%s: worker error %s' % (key, c['worker']['error']))
        elif c['worker'] != c['page']:
            bad.append('%s: worker %r != page %r' % (key, c['worker'], c['page']))
    assert len(V['cases']) == 8 and bad == []


def test_worker_engine_functions_are_verbatim_page_copies():
    core = ['solveGLS', 'solveGLSWithTau2', 'computeQStat', 'estimateTau2', 'estimateTau2DL', 'estimateTau2REML',
            'tau2BlockPieces', 'prepareStudyBlocksForModel', 'buildGLSCovariance', 'detectStudyReferencePoint',
            'isPositiveSemiDefinite', 'invertMatrix']
    assert all(V['shared'].get(name) is True for name in core), V['shared']
    assert all(V['shared'].values()), V['shared']
