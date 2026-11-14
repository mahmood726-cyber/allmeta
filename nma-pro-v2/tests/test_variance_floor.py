"""The core GLS must not override real variances below 1e-4 (tests/floor_r460.json, tests/floor_reference.R).

Before: NMA_CONSTANTS.VARIANCE_FLOOR = 1e-4 was applied as max(1e-4, v) to every study variance (buildMatrices v and W),
to the diagonal of V + tau2 (fitGLS), to every treatment-effect variance (calcTreatmentEffects) and to the variance of
each pairwise difference in the P-scores (TreatmentRanking and the worker's Ranking). Any input with SE < 0.01 -- common
for mean differences on small units or very large trials -- was refitted as if every such study had SE 0.01: on
nma-tiny.csv with SEs x 0.01 the page gave equal weights, REML tau2 5.0e-5 (netmeta 1.466e-4) and every SE exactly
0.0100 (netmeta 0.00868). The floor is now a fallback for missing / non-positive variances only.
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'floor_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'floor_harness.cjs')], capture_output=True, text=True, timeout=300,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel, abs_=1e-12):
    return abs(a - b) <= max(abs_, rel * abs(b))


def test_cases_include_variances_below_the_old_floor():
    assert set(V['cases']) == set(R['cases']) == {'s1_REML', 's1_DL', 's0.01_REML', 's0.01_DL'}
    assert max(V['cases']['s0.01_REML']['v']) < 1e-4


def test_study_variances_are_used_as_given():
    for key in ('s1_DL', 's0.01_DL'):
        sc = 1 if key.startswith('s1_') else 0.01
        want = [(s * sc) ** 2 for s in (0.18, 0.22, 0.19, 0.25, 0.20, 0.17)]
        assert all(_close(a, b, 1e-12) for a, b in zip(V['cases'][key]['v'], want)), V['cases'][key]['v']


def test_tau2_q_effects_and_ses_equal_netmeta():
    bad = []
    for key, r in R['cases'].items():
        p = V['cases'][key]
        rel = 1e-6 if key.endswith('REML') else 1e-9
        if not _close(p['tau2'], r['tau2'], rel, 1e-10):
            bad.append('%s tau2: page %r, netmeta %r' % (key, p['tau2'], r['tau2']))
        if not _close(p['Q'], r['Q'], 1e-9):
            bad.append('%s Q: page %r, netmeta %r' % (key, p['Q'], r['Q']))
        for t in ('B', 'C', 'D'):
            if not _close(p['effects'][t]['est'], r['TE'][t], rel):
                bad.append('%s TE %s: page %r, netmeta %r' % (key, t, p['effects'][t]['est'], r['TE'][t]))
            if not _close(p['effects'][t]['se'], r['seTE'][t], rel):
                bad.append('%s seTE %s: page %r, netmeta %r' % (key, t, p['effects'][t]['se'], r['seTE'][t]))
    assert bad == []


def test_pscores_equal_netrank():
    bad = []
    for key, r in R['cases'].items():
        for t, want in r['pscores'].items():
            got = V['cases'][key]['pscores'][t]
            if abs(got - want) > 1e-6:
                bad.append('%s %s: page %r, netrank %r' % (key, t, got, want))
    assert bad == []
