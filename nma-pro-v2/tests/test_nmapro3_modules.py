"""NMA Pro v8: multi-arm networks, the worker engine and the remaining 1e-4 variance floors, vs R
(tests/nmapro3_r460.json from tests/nmapro3_reference.R, R 4.6.0 / netmeta 3.7.0 / meta 8.5-0 / metafor 5.0.1;
page values from tests/nmapro3_harness.cjs).

Before (lane nmapro3, on top of lane nmapro2 / PR #564):
  * multi-arm studies. The heterogeneity df was rows - (treatments - 1): Senn 2013 (28 rows, 10 treatments, one
    3-arm study) df 19, netmeta df.Q 18; smokingcessation (28 rows, 4 treatments, two 3-arm studies) df 25, netmeta
    23 -- while the prediction interval (PR #564) already used df.Q. The same df drove I2, the Q p-value, the DL and
    PM moment equations and HKSJ. The 3 TE/seTE contrasts of Senn's 3-arm study were treated as independent rows,
    and every pair of rows of one study got +tau2/2 in the random-effects covariance whatever the signs (contrasts
    A-C and C-D share C with opposite signs: -tau2/2). Senn DL: Q 97.0915 (netmeta 96.9856), tau2 0.106313
    (0.108717), acarbose -0.867302 (-0.841785); smokingcessation DL tau2 0.601898 (0.598875).
  * the Web Worker engine added 0.5 to every OR/RR cell; metabin adds incr 0.5 only in a study with a zero cell.
  * max(1e-4, .) on variances (or on SEs) in MCID ranking, GFL pooling, predictive P-scores, SMAA, CNMA
    leave-one-out, IPD-Cox (PH stress test), influence diagnostics, Q decomposition, outlier down-weighting,
    fractional-polynomial survival NMA, ML-NMR, composite likelihood and the registry OR/RR SE: every SE below
    0.01 came out 0.0100 (registry OR SE 0.0095 -> 0.0100; IPD-Cox year slope SE 0.0054 -> 0.0100; ML-NMR
    and FP SEs all 0.0100), and the modules with no R counterpart changed their answers when the data were rescaled.

Not the page's error (inherent, documented here): for TE/seTE input netmeta's REML uses V = seTE^2 (netmeta.R:
`else V <- dat.tau$seTE^2`), dropping the within-study covariance of a multi-arm study, so Senn REML tau2 is
0.101050 in netmeta and 0.0999175 in the exact likelihood (metafor rma.mv with the covariance, = the page).
For counts input (smokingcessation) netmeta builds the covariance and agrees with the page.
"""
import json
import math
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'nmapro3_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'nmapro3_harness.cjs')], capture_output=True, text=True, timeout=300,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel, abs_=1e-12):
    return a is not None and b is not None and abs(a - b) <= max(abs_, rel * abs(b))


def _bad_map(page, ref, rel, label, abs_=1e-12):
    return ['%s %s: page %r R %r' % (label, k, page.get(k), r) for k, r in ref.items()
            if not _close(page.get(k), r, rel, abs_)]


# ---------------------------------------------------------------- multi-arm networks
MA_TOL = {'senn_DL': 1e-6, 'smoke_DL': 1e-6, 'senn_s0.01_DL': 1e-6, 'smoke_REML': 2e-5}


def test_multiarm_Q_df_is_netmeta_df_Q():
    bad = ['%s: page df %r netmeta df.Q %r' % (k, V['multiarm'][k]['df'], r['df'])
           for k, r in R['multiarm'].items() if V['multiarm'][k]['df'] != r['df']]
    assert bad == []


def test_multiarm_Q_I2_pQ_equal_netmeta():
    bad = []
    for k, r in R['multiarm'].items():
        p = V['multiarm'][k]
        if not _close(p['Q'], r['Q'], 1e-8):
            bad.append('%s Q %r vs %r' % (k, p['Q'], r['Q']))
        if not _close(p['I2'], 100 * r['I2'], 1e-8):
            bad.append('%s I2 %r vs %r' % (k, p['I2'], 100 * r['I2']))
        if not _close(p['pQ'], r['pQ'], 1e-6, 1e-15):
            bad.append('%s pQ %r vs %r' % (k, p['pQ'], r['pQ']))
    assert bad == []


def test_multiarm_tau2_effects_and_PI_equal_netmeta():
    bad = []
    for k, rel in MA_TOL.items():
        r, p = R['multiarm'][k], V['multiarm'][k]
        if not _close(p['tau2'], r['tau2'], rel):
            bad.append('%s tau2 %r vs %r' % (k, p['tau2'], r['tau2']))
        for f in ('TE', 'seTE', 'lower', 'upper'):
            bad += _bad_map(p[f], r[f], rel, k + ' ' + f, 1e-12)
    assert bad == []


def test_multiarm_reml_tese_input_is_the_exact_likelihood():
    # page REML on Senn = metafor rma.mv(REML) with the multi-arm covariance (netmeta's REML drops it, see docstring)
    p, r = V['multiarm']['senn_REML'], R['exactreml']
    bad = [] if _close(p['tau2'], r['tau2'], 1e-5) else ['tau2 %r vs %r' % (p['tau2'], r['tau2'])]
    bad += _bad_map(p['TE'], r['TE'], 1e-5, 'TE') + _bad_map(p['seTE'], r['seTE'], 1e-5, 'seTE')
    assert bad == []
    assert abs(R['multiarm']['senn_REML']['tau2'] - r['tau2']) > 1e-3   # the documented netmeta difference is real


def test_bayesian_common_effect_multiarm_equals_netmeta_common():
    # iid draws: Monte Carlo SE of the mean = sd / sqrt(n); allow 4 MC SE. Before: Willms1999's 3 contrasts were
    # 3 rows (TE/seTE input: independent), acarbose posterior mean 15 MC SE from netmeta.
    b, r = V['bayesfe'], R['common']
    n = 4 * 11000
    bad = []
    for t, te in r['TE'].items():
        mcse = r['seTE'][t] / math.sqrt(n)
        if abs(b['mean'][t] - te) > 4 * mcse:
            bad.append('%s mean %r vs %r (%.1f MC SE)' % (t, b['mean'][t], te, abs(b['mean'][t] - te) / mcse))
        if abs(b['sd'][t] - r['seTE'][t]) > 0.03 * r['seTE'][t]:
            bad.append('%s sd %r vs %r' % (t, b['sd'][t], r['seTE'][t]))
    assert bad == []


# ---------------------------------------------------------------- worker engine, registry
def test_worker_and_main_OR_RR_equal_metabin():
    bad = []
    for em in ('OR', 'RR'):
        r = R['worker'][em]
        for eng in ('worker', 'main'):
            for i, s in enumerate(V['worker'][em][eng]):
                if not (_close(s['yi'], r['yi'][i], 1e-10) and _close(s['vi'], r['vi'][i], 1e-10)):
                    bad.append('%s %s row %d: %r vs yi %r vi %r' % (em, eng, i, s, r['yi'][i], r['vi'][i]))
    assert bad == []


def test_registry_OR_RR_se_equal_metabin():
    bad = []
    for em in ('OR', 'RR'):
        bad += ['%s %d: %r vs %r' % (em, i, a, b) for i, (a, b) in enumerate(zip(V['registry'][em], R['registry'][em]))
                if not _close(a, b, 1e-10)]
    assert bad == []


# ---------------------------------------------------------------- modules with an R counterpart
def test_ipdcox_year_slope_se_equals_weighted_lm():
    p, r = V['coxyear'], R['coxyear']
    assert _close(p['slope'], r['slope'], 1e-8) and _close(p['se'], r['se'], 1e-8), (p, r)


def test_mcid_probabilities_equal_pnorm_on_netmeta():
    bad = _bad_map(V['mcid']['pBenefit'], R['mcid']['pBenefit'], 1e-6, 'pBenefit', 1e-12)
    bad += _bad_map(V['mcid']['pHarm'], R['mcid']['pHarm'], 1e-6, 'pHarm', 1e-12)
    assert bad == []


def test_fp_ph_model_equals_netmeta_common_effect():
    assert V['fp']['applicable'] and V['fp']['best'] == 'Proportional Hazards'
    assert _bad_map(V['fp']['TE'], R['fp']['TE'], 1e-6, 'TE') + _bad_map(V['fp']['seTE'], R['fp']['seTE'], 1e-6,
                                                                         'seTE') == []


def test_mlnmr_equals_metafor_EE_metaregression():
    bad = []
    for sc in ('s1', 's0.01'):
        p, r = V['mlnmr'][sc], R['mlnmr'][sc]
        assert p['error'] is None, p['error']
        bad += _bad_map(p['beta'], r['beta'], 1e-5, sc + ' beta', 1e-9) + _bad_map(p['se'], r['se'], 1e-5, sc + ' se')
    assert bad == []


def test_composite_likelihood_equals_netmeta_DL():
    p, r = V['composite'], R['composite']
    assert p['df'] == r['df']
    assert _close(p['tau2'], r['tau2'], 1e-6)
    assert _bad_map(p['TE'], r['TE'], 1e-6, 'TE') + _bad_map(p['seTE'], r['seTE'], 1e-6, 'seTE') == []


# ---------------------------------------------------------------- no R counterpart: scale equivariance
def _flat(x, pre=''):
    if isinstance(x, dict):
        for k in sorted(x):
            yield from _flat(x[k], pre + '/' + str(k))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from _flat(v, pre + '/' + str(i))
    else:
        yield pre, x


def _equivariant(module):
    base = dict(_flat(V['equi']['s1'][module]))
    bad = []
    for sc in ('s0.01', 's0.0001'):
        other = dict(_flat(V['equi'][sc][module]))
        if other.keys() != base.keys():
            bad.append('%s %s: different output shape' % (module, sc))
            continue
        for k, a in base.items():
            b = other[k]
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
                if not _close(b, a, 1e-6, 1e-9):
                    bad.append('%s %s%s: %r vs %r' % (module, sc, k, b, a))
            elif a != b:
                bad.append('%s %s%s: %r vs %r' % (module, sc, k, b, a))
    return bad


def test_predictive_pscore_scale_equivariant():
    assert _equivariant('ppscore') == []


def test_gfl_pooling_scale_equivariant():
    assert _equivariant('gfl') == []


def test_smaa_scale_equivariant():
    assert _equivariant('smaa') == []


def test_cnma_loo_contribution_scale_equivariant():
    assert _equivariant('cnmaloo') == []


def test_influence_diagnostics_scale_equivariant():
    assert _equivariant('influence') == []


def test_q_decomposition_scale_equivariant():
    assert _equivariant('qdecomp') == []


def test_outlier_downweighting_scale_equivariant():
    assert _equivariant('outlier') == []
