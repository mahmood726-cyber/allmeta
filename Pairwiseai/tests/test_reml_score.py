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
    return _reml_score_info(yi, vi, tau2)[0]


def _reml_score_info(yi, vi, tau2):
    """REML score g and expected information f = tr(P^2)/2, both formed from sums of nonnegative terms
    (sum_{j!=i} w_j is summed directly, never S - w_i), so neither cancels for disparate variances."""
    w = [1.0 / (v + tau2) for v in vi]
    sw = sum(w)
    mu = sum(wi * y for wi, y in zip(w, yi)) / sw
    so = [sum(w[:i]) + sum(w[i + 1:]) for i in range(len(w))]
    qo = [sum(x * x for x in w[:i]) + sum(x * x for x in w[i + 1:]) for i in range(len(w))]
    a = sum(wi * wi * (y - mu) ** 2 for wi, y in zip(w, yi))
    b = sum(wi * s for wi, s in zip(w, so)) / sw
    f = 0.5 * sum(wi * wi * (s * s + q) for wi, s, q in zip(w, so, qo)) / (sw * sw)
    return 0.5 * (a - b), f


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
        g, f = _reml_score_info(s['yi'], s['vi'], a['tau2'])
        scale = max(a['tau2'], sum(s['vi']) / len(s['vi']))
        # scale-free: a boundary answer must be exactly 0 with score(0) <= 0; an interior one a score root
        ok = g <= 0 if a['tau2'] == 0 else abs(g / f) < 1e-6 * scale
        if not ok:
            bad.append('%s: tau2=%r converged=true but REML score=%r' % (nm, a['tau2'], g))
    assert bad == []


FIXTURES = REPO / 'tests' / 'fixtures'


def _fixture_cases(name, key):
    data = json.loads((FIXTURES / name).read_text(encoding='utf-8'))[key]
    return {(c.get('id') or c.get('review_id')): c for c in data}


def _run_cases(engine, cases, tmp_path):
    ref = tmp_path / 'cases.json'
    ref.write_text(json.dumps({'sets': {k: {'yi': c['yi'], 'vi': c['vi']} for k, c in cases.items()}}), encoding='utf-8')
    env = dict(os.environ, SHARED=str(REPO / 'shared'))
    out = subprocess.run(['node', str(HERE / 'reml_harness.cjs'), str(engine), str(ref)],
                         capture_output=True, text=True, timeout=180, encoding='utf-8', env=env)
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


@pytest.mark.parametrize('engine', ENGINES, ids=lambda p: p.relative_to(REPO).as_posix())
def test_cochrane_nonconvergence_reviews(engine, tmp_path):
    """tests/fixtures/reml_nonconvergence.json: three Cochrane reviews where a bare REML iteration stalls or
    oscillates (expected_tau2 from tests/reml_reference.R). CD006536 oscillates; the old oscillation exit
    returned the mean of the last three iterates with converged:false instead of searching the REML likelihood."""
    cases = _fixture_cases('reml_nonconvergence.json', 'reviews')
    got = _run_cases(engine, cases, tmp_path)
    bad = ['%s: app %r, reference %r' % (k, got[k]['tau2'], c['expected_tau2'])
           for k, c in cases.items() if not abs(got[k]['tau2'] - c['expected_tau2']) <= TOL]
    assert bad == []


@pytest.mark.xfail(strict=True, reason='KNOWN GAP: Fisher scoring from the DL start finds a LOCAL REML maximum; '
                   'the global-mode search lives in shared/ma-core.js (AlmMaCore.tau2REML), which these pages do not load')
def test_global_mode_cases_app_js(tmp_path):
    cases = _fixture_cases('reml_global_modes.json', 'cases')
    got = _run_cases(ROOT / 'app.js', cases, tmp_path)
    bad = ['%s: app %r, global %r' % (k, got[k]['tau2'], c['expected_tau2'])
           for k, c in cases.items() if not abs(got[k]['tau2'] - c['expected_tau2']) <= TOL]
    assert bad == []


# Extreme-scale inputs (independent Codex review of PR #536). metafor 5.2.1, rma(method="REML",
# threshold=1e-14): case A tau2 = 9.0949470177292884e-13 (= 2^-40), mu = 0, se = 9.5367431640625e-07;
# case B tau2 = 0, mu = 0, se = 9.3132257461547852e-10 (metafor warns that the variance ratio is extreme).
EXTREME = {
    'A_tiny_scale': dict(yi=[-2.0 ** -20, 2.0 ** -20], vi=[2.0 ** -40, 2.0 ** -40], tau2=2.0 ** -40, se=9.5367431640625e-07),
    'B_disparate_vi': dict(yi=[0.0, 0.0], vi=[2.0 ** -60, 1.0], tau2=0.0, se=9.3132257461547852e-10),
}


@pytest.mark.parametrize('engine', ENGINES, ids=lambda p: p.relative_to(REPO).as_posix())
def test_extreme_scale_matches_metafor(engine, tmp_path):
    got = _run_cases(engine, EXTREME, tmp_path)
    bad = []
    for k, c in EXTREME.items():
        a = got[k]
        if not (a['converged'] and abs(a['tau2'] - c['tau2']) <= 1e-6 * c['tau2']
                and abs(a['se'] - c['se']) <= 1e-6 * c['se']):
            bad.append('%s: tau2 %r (metafor %r), se %r (metafor %r), converged %r, %s'
                       % (k, a['tau2'], c['tau2'], a['se'], c['se'], a['converged'], a['note']))
    assert bad == []


@pytest.mark.parametrize('engine', ENGINES, ids=lambda p: p.relative_to(REPO).as_posix())
@pytest.mark.parametrize('factor', [1e-12, 1e8])
def test_reml_is_scale_equivariant(engine, factor, tmp_path):
    """yi -> c*yi, vi -> c^2*vi must give tau2 -> c^2*tau2 (absolute constants in the solver break this)."""
    sets = {k: {'yi': [y * factor for y in s['yi']], 'vi': [v * factor * factor for v in s['vi']]}
            for k, s in REF['sets'].items()}
    got = _run_cases(engine, sets, tmp_path)
    bad = []
    for k, s in REF['sets'].items():
        want = s['tau2_reml'] * factor * factor
        tol = 1e-6 * max(want, factor * factor * sum(s['vi']) / len(s['vi']) * 1e-6)
        if not abs(got[k]['tau2'] - want) <= tol:
            bad.append('%s: %r vs %r' % (k, got[k]['tau2'], want))
    assert bad == []
