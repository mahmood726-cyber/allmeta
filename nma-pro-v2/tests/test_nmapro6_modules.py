"""NMA Pro v8 (lane nmapro6) vs R (tests/nmapro6_r460.json from tests/nmapro6_reference.R, R 4.6.0 / netmeta 3.7.0;
page values from tests/nmapro6_harness.cjs).

Before (lane nmapro5 group 2, 1ecdeea4):
  1  an MD / SMD row with no usable effect entered the network as yi = 0, vi = 1 (MD: every row without a direct TE,
     even with complete arm data; SMD: a missing SD; a missing mean read as 0), and a blank TE with an SE entered as
     TE = 0 (Number('') === 0, in calcEffects and in importCSV). netmeta drops such a comparison.
  2  the in-browser WebR check ran netmeta with method.tau = "REML" when the page used PM (and compared the page's
     HKSJ-scaled SEs / t CIs / P-scores / PIs with netmeta's uncorrected ones).
  3  the "kr" option was labelled Kenward-Roger in the UI, the methods text and the het panel; it is an ad hoc rule.
  4  every analyze() computed the node-split table and both tau2 CIs (unread by the bootstrap / multiverse refits),
     and fitGLS factorised the block-diagonal Sigma densely: the post-analysis suite took 3.5-25 s.
"""
import json
import math
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'nmapro6_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'nmapro6_harness.cjs')], capture_output=True, text=True, timeout=900,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel=1e-6, abs_=1e-9):
    return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= max(abs_, rel * abs(b))


# ---------------------------------------------------------------- item 1
BLANK = ('senn_blankTE_DL', 'senn_blankSE_DL', 'senn_blankTE_FE', 'senn_blankSE_FE',
         'pain_MD_DL', 'pain_MD_REML', 'pain_MD_blankSD_DL', 'pain_MD_blankSD_REML')


def test_1_rows_with_no_usable_effect_are_dropped_as_netmeta():
    bad = []
    for nm in BLANK:
        p, r = V['blank'][nm], R['blank'][nm]
        assert 'error' not in p, (nm, p)
        if p['k'] != r['m']:
            bad.append('%s comparisons used: page %s, netmeta %s' % (nm, p['k'], r['m']))
        for key in ('tau2', 'Q'):
            if not _close(p[key], r[key], 1e-6, 1e-9):
                bad.append('%s %s page %r R %r' % (nm, key, p[key], r[key]))
        for t, e in r['effects'].items():
            for f in ('TE', 'seTE'):
                if not _close(p['effects'][t][f], e[f], 1e-6, 1e-9):
                    bad.append('%s %s %s page %r R %r' % (nm, t, f, p['effects'][t][f], e[f]))
    assert not bad, bad


def test_1_the_dropped_rows_are_named_with_a_reason():
    for nm, who in (('senn_blankTE_DL', 'Kipnes2001'), ('senn_blankSE_FE', 'Davidson2007'),
                    ('pain_MD_blankSD_REML', 'Pain-4'), ('pain_SMD_blankSD', 'Pain-4')):
        p = V['blank'][nm]
        assert p['notComputable'] == [who], (nm, p['notComputable'])
        assert p['notComputableDetail'][0]['reason'], nm
    for nm in ('pain_MD_DL', 'pain_MD_REML'):
        assert V['blank'][nm]['notComputable'] == [], nm
    # SMD: the same study has no TE in pairwise(sm = "SMD") and is the one the page leaves out
    assert 'Pain-4' not in R['blank']['pain_SMD_blankSD']['withTE']  # pairwise() drops it (no TE)
    assert V['blank']['pain_SMD_blankSD']['k'] == len(R['blank']['pain_SMD_blankSD']['withTE']) == 11


def test_1_never_yi_0_vi_1():
    for nm, row in V['blank']['rows'].items():
        assert row['yi'] == 'NaN' and row['vi'] == 'NaN' and row['why'], (nm, row)


def test_1_import_keeps_a_blank_te_blank_and_the_notice_exists():
    imp = V['blank']['import']
    assert imp['B_yi'] == '', imp  # was 0 (Number(''))
    assert V['blank']['notice'] is True


# ---------------------------------------------------------------- item 2
WEBR = ('senn_PM_hksj', 'senn_PM_none', 'senn_REML_none', 'senn_DL_hksj', 'senn_ML_hksj', 'pain_MD_REML_none', 'senn_FE')


def test_2_webr_script_run_in_R_is_exactly_what_the_page_emits():
    assert V['webr']['available'], V.get('webrLoadError')
    for nm in WEBR:
        c = V['webr']['cases'][nm]
        assert 'error' not in c, (nm, c)
        assert c['script'] == (HERE / 'fixtures' / 'nmapro6-webr' / (nm + '.R')).read_text(encoding='utf-8'), nm
        assert 'error' not in R['webr'][nm], (nm, R['webr'][nm])


def test_2_pm_is_not_compared_with_netmeta_reml():
    for nm in ('senn_PM_hksj', 'senn_PM_none'):
        c = V['webr']['cases'][nm]
        assert 'tau.preset' in c['plan']['tauArg'] and 'REML' not in c['plan']['tauArg'], c['plan']
        assert c['plan']['tau2Check'] is False
        assert any('no Paule-Mandel' in n for n in c['compare']['notes']), c['compare']['notes']
        assert 'tau-squared' not in c['compare']['names']
        # netmeta ran at the page's tau2
        assert _close(R['webr'][nm]['tau2'], c['tau2'], 1e-9, 1e-14)  # the script writes 10 significant digits, (R['webr'][nm]['tau2'], c['tau2'])


def test_2_every_like_with_like_check_passes():
    bad = []
    for nm in WEBR:
        cmp_ = V['webr']['cases'][nm]['compare']
        assert cmp_ is not None and cmp_['total'] > 10, (nm, cmp_)
        if cmp_['failed']:
            bad.append((nm, cmp_['failing']))
    assert not bad, bad


def test_2_the_old_call_fails_on_pm():
    # what the check did until 2026-11-15: netmeta REML against the page's PM -> tau2 and effects differ
    for nm in ('senn_PM_none',):
        old, new = R['webr']['old_' + nm], R['webr'][nm]
        assert abs(old['tau2'] - new['tau2']) > 0.005, (old['tau2'], new['tau2'])  # the check's own tau2 tolerance


def test_2_correction_compares_uncorrected_se_and_skips_ci():
    c = V['webr']['cases']['senn_DL_hksj']
    assert c['plan']['uncorrected'] and c['plan']['skipCI'] and c['plan']['skipPI']
    names = c['compare']['names']
    assert not any('CI lower' in n or 'PI lower' in n for n in names)
    assert 'tau-squared' in names  # DL is netmeta's own estimator
    # ML: Q(tau2_ML) > df.Q, so HKSJ scales the variance (factor > 1) and the SEs are compared before it
    m = V['webr']['cases']['senn_ML_hksj']
    assert m['correctionFactor'] > 1.01, m['correctionFactor']
    assert any(n.endswith('SE (before correction)') for n in m['compare']['names'])
    assert m['compare']['failed'] == 0, m['compare']['failing']


def test_2_multiarm_reml_is_fixed_at_the_page_tau2_and_not_scored():
    c = V['webr']['cases']['senn_REML_none']
    assert c['plan']['tau2Check'] is False and 'tau.preset' in c['plan']['tauArg'] and 'REML' in c['plan']['ownArg']
    r = R['webr']['senn_REML_none']
    assert abs(r['tau2_own'] - c['tau2']) > 1e-4, (r['tau2_own'], c['tau2'])  # netmeta 0.10105 vs exact 0.09992


# ---------------------------------------------------------------- item 3
def test_3_kr_is_not_called_kenward_roger():
    k = V['kr']
    assert k['option'] == 't on network df (ad hoc)' and k['label'] == k['option']
    assert 'not the Kenward-Roger method' in k['long']
    assert k['claimsKR'] is False
    assert 'not Kenward-Roger' in k['rscript']


# ---------------------------------------------------------------- item 4
def test_4_analyze_defers_the_unread_derived_fields():
    s = V['speed']
    assert s['atAnalyze']['profileLikelihoodCI'] == 0 and s['atAnalyze']['nodeSplitting'] == 0 \
        and s['atAnalyze']['pauleMandel_CI'] == 0, s['atAnalyze']
    assert s['lazyEqualsEager'] is True
    # the keys keep their order (a saved session's JSON is unchanged)
    assert s['keys'][:11] == ['notComputable', 'notComputableDetail', 'effects', 'heterogeneity', 'leagueTable',
                              'consistency', 'consistencySummary', 'tau2', 'tau', 'tau2CI', 'pmCI']


def test_4_sparse_lu_inverse_logdet_are_bitwise_the_dense_ones():
    e = V['speed']['exact']
    assert e['ldetFound'] and e['n'] >= 50 and e['exactUsed'] >= 30, e
    assert e['luSame'] == e['n'] and e['invSame'] == e['n'] and e['ldetSame'] == e['n'], e
