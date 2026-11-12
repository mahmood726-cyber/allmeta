"""estimateTau2_REML must solve the REML score equation, and agree with metafor 5.2.1 rma(method="REML").

The REML estimating equation (Viechtbauer 2005; metafor rma.uni) with w_i = 1/(v_i + tau2) and mu the
weighted mean is

    sum(w^2 (y - mu)^2) - sum(w) + sum(w^2) / sum(w) = 0          (tau2 > 0),

and tau2 = 0 when the left side is <= 0 at tau2 = 0.  Before the fix the Fisher-scoring loop used the ML
score (the sum(w^2)/sum(w) term was missing) and a step-size convergence test, so it returned the ML root or
a stalled point with converged: true (dat.bangertdrowns2004: 0.047043 where REML is 0.049939).

Reference values: tests/reml_metafor521.json (tests/reml_score_reference.R, R 4.6.0, metafor 5.2.1).
Every engine copy that ships the function is checked: app.js (loaded by -fast.html), app.min.js, the bundle's
inline engine (and its -dist / -min builds), and Truthcert1/app.min.js (loaded by Truthcert1/...-production.html).
"""
import json
import os
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent
REF = json.loads((HERE / 'reml_metafor521.json').read_text(encoding='utf-8'))
ENGINES = [
    ROOT / 'app.js',
    ROOT / 'app.min.js',
    ROOT / 'TruthCert-PairwisePro-v1.0-bundle.html',
    ROOT / 'TruthCert-PairwisePro-v1.0-dist.html',
    ROOT / 'TruthCert-PairwisePro-v1.0-min.html',
    REPO / 'Truthcert1' / 'app.min.js',
]
TOL = 1e-6


def _run(engine):
    env = dict(os.environ, SHARED=str(REPO / 'shared'))
    out = subprocess.run(['node', str(HERE / 'reml_harness.cjs'), str(engine), str(HERE / 'reml_metafor521.json')],
                         capture_output=True, text=True, timeout=180, encoding='utf-8', env=env)
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def _reml_score(yi, vi, tau2):
    w = [1.0 / (v + tau2) for v in vi]
    sw = sum(w)
    mu = sum(wi * y for wi, y in zip(w, yi)) / sw
    return sum(wi * wi * (y - mu) ** 2 for wi, y in zip(w, yi)) - sw + sum(wi * wi for wi in w) / sw


def test_reference_covers_required_cases():
    sets = REF['sets']
    assert REF['metafor'] == '5.2.1'
    assert any(s['k'] == 2 and s['tau2_reml'] > 0 for s in sets.values())
    assert any(s['k'] == 3 and s['tau2_reml'] > 0 for s in sets.values())
    assert any(s['tau2_reml'] == 0 for s in sets.values())
    assert 'bcg' in sets and len(sets) >= 6
    # the reference itself must satisfy the REML equation (guards the oracle, not the app)
    for nm, s in sets.items():
        g = _reml_score(s['yi'], s['vi'], s['tau2_reml'])
        if s['tau2_reml'] > 0:
            assert abs(g) < 1e-6 * sum(1 / (v + s['tau2_reml']) for v in s['vi']), nm
        else:
            assert g <= 1e-9, nm


@pytest.mark.parametrize('engine', ENGINES, ids=lambda p: p.relative_to(REPO).as_posix())
def test_reml_matches_metafor(engine):
    got = _run(engine)
    bad = []
    for nm, s in REF['sets'].items():
        a = got[nm]
        for key, rkey in (('tau2', 'tau2_reml'), ('dispatch_tau2', 'tau2_reml'), ('mu', 'mu'), ('se', 'se'),
                          ('ci_lb', 'ci_lb'), ('ci_ub', 'ci_ub'), ('p', 'p')):
            if not abs(a[key] - s[rkey]) <= TOL:
                bad.append('%s %s: app %r, metafor %r' % (nm, key, a[key], s[rkey]))
    assert bad == []


@pytest.mark.parametrize('engine', ENGINES, ids=lambda p: p.relative_to(REPO).as_posix())
def test_converged_means_reml_score_is_zero(engine):
    """converged: true is a claim about the returned value; check the claim, not the flag."""
    got = _run(engine)
    bad = []
    for nm, s in REF['sets'].items():
        a = got[nm]
        if not a['converged']:
            continue
        g = _reml_score(s['yi'], s['vi'], a['tau2'])
        sw = sum(1 / (v + a['tau2']) for v in s['vi'])
        ok = abs(g) < 1e-6 * sw if a['tau2'] > 1e-8 else g <= 1e-9
        if not ok:
            bad.append('%s: tau2=%r converged=true but REML score=%r' % (nm, a['tau2'], g))
    assert bad == []
