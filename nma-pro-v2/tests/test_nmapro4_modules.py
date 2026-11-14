"""NMA Pro v8: design decomposition, node-splitting, multi-arm refusal, ML-NMR tau2, study-level bootstrap,
risk-of-bias stress test and the RR continuity correction, vs R (tests/nmapro4_r460.json from
tests/nmapro4_reference.R, R 4.6.0 / netmeta 3.7.0 / meta 8.5-0 / metafor 5.0.1; page values from
tests/nmapro4_harness.cjs).

Before (lane nmapro4, on top of lane nmapro3 / PR #570):
  * design-by-treatment decomposition grouped rows by pairwise comparison: Senn 2013 within 74.64 (df 13), between
    22.35 (df 14 = groups - 1); netmeta decomp.design within 74.46 (df 11), between 22.53 (df 7). smokingcessation
    between 0.686 on df 5; netmeta 15.22 on df 7. The Q decomposition module's q within + q between (79.91) did not
    add up to Q (96.99).
  * node-splitting pooled "rosi vs plac" and "plac vs rosi" rows without flipping the sign (Senn plac:rosi direct
    -1.18, netsplit +1.18), took the indirect weight as network + direct (netsplit: network - direct), used a t test
    on studies - 1 df.
  * an inconsistent 3-arm study given as TE/seTE (Willms1999 metf-acar -0.1 instead of -0.2) ran silently on the
    kept rows; netmeta stops ("Study with inconsistent treatment estimates: 'Willms1999'").
  * ML-NMR tau2 used the pairwise DL denominator sum(W) - sum(W^2)/sum(W) and weighted a multi-arm study's rows as
    independent (SE x 0.3: two-arm tau2 0.000293 vs 0.000465; multi-arm beta B -0.24570 vs -0.24129).
  * the ranking bootstrap drew rows, not studies (3-arm studies split, duplicated rows sharing one label) and showed
    no seed / MC SE.
  * the cross-design stress test added an absolute 0.02 * penalty to each variance (P-scores changed when y and SE
    were rescaled) and read row i's RoB from input row i (one unusable row shifted every label).
  * RR with a zero cell added 2 x incr to n (metabin RR.Cochrane = TRUE); metabin's default (and netmeta pairwise)
    adds incr once; the multi-arm RR covariance used the log-odds arm variance 1/a + 1/b (smokingcessation RR DL Q
    162.13, netmeta 160.19); a 3-arm study with one zero arm got the increment only in the rows touching that arm.

Not the page's error (documented): metafor rma(method = "DL", mods, intercept = FALSE) uses the mean-centred y in its
moment estimator (rma.uni: Ymc <- scale(yi, center = TRUE)), so for an NMA design without an intercept its QE (24.32)
is not the residual Q (12.16) and its DL tau2 is not the regression DL; the reference is the matrix formula, which
reproduces netmeta's DL tau2 when the covariate columns are dropped (dlcheck).
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'nmapro4_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'nmapro4_harness.cjs')], capture_output=True, text=True, timeout=600,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel, abs_=1e-12):
    return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= max(abs_, rel * abs(b))


def _bad_map(page, ref, rel, label, abs_=1e-12):
    return ['%s %s: page %r R %r' % (label, k, (page or {}).get(k), r) for k, r in ref.items()
            if not _close((page or {}).get(k), r, rel, abs_)]


NETS = ('senn', 'smoke')


# ---------------------------------------------------------------- 1. design decomposition (netmeta decomp.design)
def test_decomposition_within_between_equal_netmeta_decomp_design():
    bad = []
    for k in NETS:
        r, d = R['decomp'][k], V['decomp'][k]['decomposition']
        page = {'Qwithin': d['Qwithin'], 'Qbetween': d['Qbetween']}
        ref = {'Qwithin': r['Q'][1], 'Qbetween': r['Q'][2]}
        bad += _bad_map(page, ref, 1e-8, k)
        if (d['dfWithin'], d['dfBetween']) != (r['df'][1], r['df'][2]):
            bad.append('%s df within/between page %r R %r' % (k, (d['dfWithin'], d['dfBetween']), r['df'][1:]))
    assert bad == []


def test_decomposition_per_design_Q_df_equal_netmeta():
    bad = []
    for k in NETS:
        page = {x['design']: x for x in V['decomp'][k]['decomposition']['designs']}
        for key, r in R['decomp'][k]['design'].items():
            p = page.get(key)
            if p is None or p['df'] != r['df'] or not _close(p['Q'], r['Q'], 1e-8, 1e-10):
                bad.append('%s design %s: page %r R %r' % (k, key, p and (p['Q'], p['df']), r))
            if p is not None and not _close(p['qBetween'], R['decomp'][k]['incDesign'][key], 1e-7, 1e-10):
                bad.append('%s design %s share of Q between: page %r R %r' % (k, key, p['qBetween'],
                                                                            R['decomp'][k]['incDesign'][key]))
        if len(page) != len(R['decomp'][k]['design']):
            bad.append('%s: %d designs, netmeta %d' % (k, len(page), len(R['decomp'][k]['design'])))
    assert bad == []


def test_decomposition_random_between_designs_equal_netmeta():
    bad = []
    for k in NETS:
        r, d = R['decomp'][k], V['decomp'][k]['decomposition']
        bad += _bad_map({'Qr': d['QbetweenRandom'], 'tw': d['tauWithin']},
                        {'Qr': r['Qrandom'], 'tw': r['tauWithin']}, 1e-7, k)
    assert bad == []


def test_design_by_treatment_test_is_between_designs():
    bad = []
    for k in NETS:
        r, b = R['decomp'][k], V['decomp'][k]['designByTreatment']
        if not _close(b['Q'], r['Q'][2], 1e-8) or b['df'] != r['df'][2]:
            bad.append('%s design-by-treatment page Q %r df %r, netmeta %r %r' % (k, b['Q'], b['df'], r['Q'][2], r['df'][2]))
    assert bad == []


def test_no_design_by_treatment_test_without_loops():
    # netmeta: between designs df = 0 -> p NA; the summary must not read a missing p as 0 ("global signal")
    st = V['decomp']['star']
    assert (st['df'], st['dfWithin'], st['dfBetween']) == (3, 3, 0), st
    assert st['pValue'] is None and st['overall'] == 'Not estimable', st


def test_q_decomposition_module_equals_netmeta_and_keeps_multiarm_design_whole():
    bad = []
    for k in NETS:
        r, q = R['decomp'][k], V['decomp'][k]['qmodule']
        if 'error' in q:
            bad.append('%s %s' % (k, q['error']))
            continue
        bad += _bad_map({'w': q['qWithin'], 'b': q['qBetween'], 't': q['qTotal']},
                        {'w': r['Q'][1], 'b': r['Q'][2], 't': r['Q'][0]}, 1e-8, k)
        if (q.get('dfWithin'), q.get('dfBetween')) != (r['df'][1], r['df'][2]):
            bad.append('%s module df page %r R %r' % (k, (q.get('dfWithin'), q.get('dfBetween')), r['df'][1:]))
        if q['nDesigns'] != len(r['design']):
            bad.append('%s module %d designs, netmeta %d' % (k, q['nDesigns'], len(r['design'])))
    assert 'acar vs metf vs plac' in V['decomp']['senn']['qmodule'].get('designs', [])
    assert bad == []


# ---------------------------------------------------------------- 1b. node-splitting (netmeta netsplit)
def test_node_split_equals_netsplit_random_and_common():
    bad = []
    for k in NETS:
        for mode in ('random', 'common'):
            page, ref = V['netsplit'][k][mode], R['netsplit'][k][mode]
            if set(page) != set(ref):
                bad.append('%s %s comparisons page %r R %r' % (k, mode, sorted(page), sorted(ref)))
            for key, r in ref.items():
                p = page.get(key, {})
                for f in ('direct', 'seDirect', 'network', 'seNetwork', 'indirect', 'seIndirect', 'diff', 'seDiff', 'p'):
                    if f in r:
                        if not _close(p.get(f), r[f], 1e-6, 1e-12):
                            bad.append('%s %s %s %s: page %r netsplit %r' % (k, mode, key, f, p.get(f), r[f]))
                    elif f == 'indirect' and p.get(f) is not None:
                        bad.append('%s %s %s: page gives an indirect estimate, netsplit none' % (k, mode, key))
    assert bad == []


# ---------------------------------------------------------------- 3. inconsistent multi-arm study is refused
def test_inconsistent_multiarm_study_is_refused_with_the_study_named():
    assert 'Willms1999' in R['refuse']['message'] and 'inconsistent' in R['refuse']['message']
    a, g = V['refuse']['analyze'], V['refuse']['guardian']
    assert 'error' in a and 'Willms1999' in a['error'], a
    assert g['canProceed'] is False and any('Willms1999' in m for m in g['fails']), g


def test_consistent_multiarm_study_is_not_refused():
    assert V['refuse']['guardianClean'] == {'canProceed': True, 'fails': []}


# ---------------------------------------------------------------- 2. ML-NMR tau2
def test_mlnmr_tau2_is_the_regression_DL_two_arm():
    r, p = R['mlnmr']['twoarm'], V['mlnmr']['twoarm']
    assert _close(R['mlnmr']['dlcheck']['formula'], R['mlnmr']['dlcheck']['netmeta'], 1e-10)  # formula = netmeta DL
    assert 'error' not in p, p
    assert _bad_map({'tau2': p['tau2'], 'Q': p['Q']}, {'tau2': r['tau2'], 'Q': r['Q']}, 1e-6, 'two-arm') == []
    assert p['df'] == r['df']


def test_mlnmr_multiarm_GLS_and_tau2():
    r, p = R['mlnmr']['multiarm'], V['mlnmr']['multiarm']
    assert 'error' not in p, p
    bad = _bad_map(p['beta'], r['beta'], 1e-6, 'beta') + _bad_map(p['se'], r['se'], 1e-6, 'se')
    bad += _bad_map({'tau2': p['tau2'], 'Q': p['Q']}, {'tau2': r['tau2'], 'Q': r['Q']}, 1e-6, 'multi-arm')
    if p['df'] != r['df']:
        bad.append('df page %r R %r' % (p['df'], r['df']))
    assert bad == []


# ---------------------------------------------------------------- 6. RR continuity correction = metabin default
def test_rr_rows_equal_metabin_default_both_engines():
    bad = []
    for eng in ('main', 'worker'):
        for i, (p, yi, vi) in enumerate(zip(V['rr'][eng], R['rr']['yi'], R['rr']['vi'])):
            if not (_close(p['yi'], yi, 1e-12, 1e-14) and _close(p['vi'], vi, 1e-12, 1e-14)):
                bad.append('%s row %d: page %r metabin %r' % (eng, i + 1, (p['yi'], p['vi']), (yi, vi)))
    assert bad == []
    # the case that distinguishes the two conventions is in the data
    assert any(abs(a - b) > 1e-4 for a, b in zip(R['rr']['yi'], R['rr']['yiCochrane']))


def test_rr_multiarm_network_equals_netmeta():
    r, p = R['rr']['net'], V['rr']['net']
    bad = _bad_map({'Q': p['Q'], 'tau2': p['tau2']}, {'Q': r['Q'], 'tau2': r['tau2']}, 1e-8, 'RR')
    bad += _bad_map(p['TE'], r['TE'], 1e-7, 'TE') + _bad_map(p['seTE'], r['seTE'], 1e-7, 'seTE')
    assert bad == [] and p['df'] == r['df']


def test_multiarm_zero_arm_increment_in_all_arms_as_pairwise():
    bad = []
    for em in ('OR', 'RR'):
        r, p = R['zero'][em], V['zero'][em]
        for f in ('rowTE', 'rowSE'):
            for i, (a, b) in enumerate(zip(p[f], r[f])):
                if not _close(a, b, 1e-12, 1e-14):
                    bad.append('%s %s[%d] page %r R %r' % (em, f, i, a, b))
        bad += _bad_map({'Q': p['Q'], 'tau2': p['tau2']}, {'Q': r['Q'], 'tau2': r['tau2']}, 1e-8, em)
        bad += _bad_map(p['TE'], r['TE'], 1e-7, em + ' TE') + _bad_map(p['seTE'], r['seTE'], 1e-7, em + ' seTE')
    assert bad == []


# ---------------------------------------------------------------- 4. bootstrap ranks resample studies
def test_bootstrap_resamples_whole_studies_under_fresh_labels():
    b = V['boot']
    assert b['nSamples'] == 80
    assert b['splitCopies'] == 0, 'a multi-arm study was split'
    assert b['sharedLabel'] == 0, 'two copies of a comparison shared one study label'
    assert b['samplesWith24Studies'] == 80, 'every resample must hold 24 studies (the number of studies)'


def test_bootstrap_reports_seed_B_and_mc_se_and_is_reproducible():
    b = V['boot']
    assert b['seed'] == 12345 and b['nBoot'] == 80
    assert isinstance(b['mcse'], dict) and b['mcse']['maxMeanPScore'] > 0 and b['mcse']['maxTopProbability'] > 0
    assert all(isinstance(m, float) and m > 0 for _, m, _ in b['rowMcse'])
    assert b['summaries1'] == b['summaries2']


# ---------------------------------------------------------------- 5. risk-of-bias stress test
def test_cross_design_is_scale_equivariant():
    c, bad = V['cross'], []
    base = c['s1']
    for sc in ('s0.01', 's0.0001'):
        if not _close(c[sc]['tau2Ratio'], base['tau2Ratio'], 1e-8):
            bad.append('%s tau2 / sc^2 %r vs %r' % (sc, c[sc]['tau2Ratio'], base['tau2Ratio']))
        bad += _bad_map(c[sc]['p'], base['p'], 1e-8, sc, 1e-9)
    assert bad == []


def test_cross_design_rob_labels_follow_their_rows():
    a = V['cross']['align']
    assert 'error' not in a, a
    assert a['a'] == a['b'] and _close(a['tauB'], a['tauA'], 1e-12), a
