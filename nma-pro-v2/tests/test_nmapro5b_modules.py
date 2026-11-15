"""NMA Pro v8 (lane nmapro5, group 2: exports and secondary modules) vs R (tests/nmapro5b_r460.json from
tests/nmapro5b_reference.R, R 4.6.0 / netmeta 3.7.0 / metafor 5.0.1; page values from tests/nmapro5b_harness.cjs).

Before (lane nmapro5 group 1):
  F2  exportRCode / the R Validation tab: pairwise() without studlab for counts (R: "replacement has 28 rows, data has
      0"), no method.tau (netmeta DL vs the page's REML), always common = FALSE.
  F3  the benchmark script passed method.tau = "PM" (netmeta 3.7.0: 'must be "DL", "ML", or "REML"') and gave count
      rows as two-arm contrasts, so a multi-arm study lost its covariance.
  F6  HKSJ (the default) scaled the variance but used the normal quantile and p; Kenward-Roger a normal p.
  F7  Sidik-Jonkman at df.Q = 1: factor df/(df - 1) = Inf -> infinite SE.
  F8  Q-profile CI of tau2 with absolute brackets [0, 10 tau2 + 1] / [tau2, 20 tau2 + 5]: star network x 10 upper 5
      (the cap; metafor 34.50), x 100 upper 0.0005 x 100^2.
  F9  RobustTailedNMA / CBMBaselineDualNMA: their own PM fixed point on rows - p with an absolute 1e-8 stop whatever
      estimator was chosen, a diagonal-weight solve with an absolute ridge.
  F13 an inlined Web Worker ran an older second engine after every analysis and its result was discarded.
  F14 ModelSelection: diagonal likelihood (multi-arm covariance ignored), FE log-likelihood at the RE beta, the ML
      likelihood whatever the estimator, LRT p from chi2_1 with no boundary mixture.
"""
import json
import math
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'nmapro5b_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'nmapro5b_harness.cjs')], capture_output=True, text=True, timeout=900,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel, abs_=1e-12):
    return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= max(abs_, rel * abs(b))


CASES = ('senn_REML', 'senn_FE', 'senn_PM', 'smoke_OR_DL', 'smoke_OR_REML', 'zero_RR_REML', 'zero_RD_DL', 'zero_OR_ML')


# ---------------------------------------------------------------- F2 / F3 exported R scripts
def test_f2_scripts_run_in_R_are_exactly_what_the_page_emits():
    for nm in CASES:
        p = V['export'][nm]
        assert 'error' not in p, (nm, p)
        assert p['script'] == (HERE / 'fixtures' / 'nmapro5-export' / (nm + '.R')).read_text(encoding='utf-8'), nm
        assert p['bench'] == (HERE / 'fixtures' / 'nmapro5-export' / (nm + '.bench.R')).read_text(encoding='utf-8'), nm


def test_f2_exported_script_reproduces_the_page_in_R():
    bad = []
    for nm in CASES:
        p, r = V['export'][nm]['page'], R['export'][nm]
        if 'error' in r:
            bad.append('%s R %s' % (nm, r['error']))
            continue
        rel = 1e-5 if ('REML' in nm or 'ML' in nm) else 1e-8
        if not _close(p['tau2'], r['tau2'], rel, 1e-10) or not _close(p['Q'], r['Q'], 1e-8):
            bad.append('%s tau2/Q page %r R %r' % (nm, (p['tau2'], p['Q']), (r['tau2'], r['Q'])))
        for t, v in r['TE'].items():
            if not _close(p['TE'][t], v, rel, 1e-9) or not _close(p['se'][t], r['se'][t], rel, 1e-9):
                bad.append('%s %s page %r R %r' % (nm, t, (p['TE'][t], p['se'][t]), (v, r['se'][t])))
    assert bad == []


def test_f2_count_scripts_are_arm_level_with_studlab_and_the_page_estimator():
    for nm in ('smoke_OR_DL', 'smoke_OR_REML', 'zero_RR_REML', 'zero_RD_DL', 'zero_OR_ML'):
        sc = V['export'][nm]['script']
        assert 'studlab = names(sp)' in sc and 'arms <- data.frame(' in sc, nm
        est = nm.rsplit('_', 1)[1]
        assert 'method.tau = "%s"' % est in sc and R['export'][nm]['method.tau'] == est, nm
    assert R['export']['smoke_OR_DL']['k'] == 24  # 24 studies (2 three-arm), not 28 rows
    assert 'common = TRUE, random = FALSE' in V['export']['senn_FE']['script'] and R['export']['senn_FE']['tau2'] == 0


def test_f3_pm_is_stated_preset_in_the_export_and_refused_in_the_benchmark():
    assert 'tau.preset' in V['export']['senn_PM']['script'] and 'no Paule-Mandel' in V['export']['senn_PM']['script']
    assert 'No parity run' in R['export']['senn_PM.bench']['error'] and 'Paule-Mandel' in R['export']['senn_PM.bench']['error']
    # the benchmark runs and writes its JSON; with a multi-arm study netmeta's REML ignores the multi-arm covariance, so
    # the script itself flags reproducible = FALSE (its tau2 is netmeta's, not the page's exact-likelihood REML)
    b = R['export']['smoke_OR_REML.bench']
    assert 'error' not in b and b['json'] is True and 'reproducible=FALSE' in V['export']['smoke_OR_REML']['bench']
    assert _close(b['tau2'], R['export']['smoke_OR_REML']['tau2_netmeta'], 1e-12)


def test_f3_multiarm_reml_ml_netmeta_differs_and_net_page_reproduces_the_page():
    # inherent, shared with R: netmeta's REML / ML use V = seTE^2 for a multi-arm study's contrasts
    for nm in ('senn_REML', 'smoke_OR_REML', 'zero_RR_REML', 'zero_OR_ML'):
        r = R['export'][nm]
        assert r['has_net_page'] is True and 'net.page' in V['export'][nm]['script'], nm
        assert not _close(r['tau2_netmeta'], V['export'][nm]['page']['tau2'], 1e-3), nm  # the documented difference
    assert R['export']['smoke_OR_DL']['has_net_page'] is False  # DL: netmeta and the page agree, nothing added


# ---------------------------------------------------------------- F6 / F7 small-sample corrections
def test_f6_hksj_equals_metafor_adhoc_t_on_df_q():
    p, r = V['hk']['hksj'], R['hk']['adhoc']
    assert p['tDf'] == r['dfs'] == 16 and _close(p['tau2'], r['tau2'], 1e-6)
    bad = ['%s %s page %r R %r' % (k, t, p[pk][t], r[k][t]) for k, pk in (('b', 'est'), ('se', 'se'), ('lo', 'lo'), ('hi', 'hi'), ('p', 'p'))
           for t in r['b'] if not _close(p[pk][t], r[k][t], 1e-5, 1e-12)]
    assert bad == []


def test_f6_no_correction_equals_metafor_z():
    p, r = V['hk']['none'], R['hk']['z']
    bad = ['%s %s' % (k, t) for k, pk in (('se', 'se'), ('lo', 'lo'), ('hi', 'hi'), ('p', 'p')) for t in r['b']
           if not _close(p[pk][t], r[k][t], 1e-5, 1e-12)]
    assert bad == []


def test_f6_kenward_roger_and_mkh_ci_and_p_use_t_on_their_df():
    from scipy import stats  # noqa: PLC0415
    for corr in ('kr', 'mkh'):
        p = V['hk'][corr]
        assert p['tDf'] is not None
        for t, se in p['se'].items():
            if se == 0:
                continue
            q = stats.t.ppf(0.975, p['tDf'])
            assert _close(p['hi'][t] - p['est'][t], q * se, 1e-9), (corr, t)
            assert _close(p['p'][t], 2 * stats.t.sf(abs(p['est'][t] / se), p['tDf']), 1e-7, 1e-300), (corr, t)


def test_f7_sidik_jonkman_at_df_q_1_is_refused():
    e = V['hk']['sj_df1']
    assert e.get('name') == 'CorrectionNotEstimable' and 'df.Q = 1' in e['error'], e


# ---------------------------------------------------------------- F8 Q-profile CI
def test_f8_q_profile_ci_equals_metafor_confint_qp_at_every_scale():
    bad = []
    for k, r in R['qp'].items():
        p = V['qp'][k]
        for f in ('lower', 'upper'):
            if not _close(p[f], r[f], 1e-8, 1e-12):  # the limits solved tightly in R
                bad.append('%s %s page %r R %r' % (k, f, p[f], r[f]))
            if not _close(p[f], r['metafor_' + f], 1e-4, 1e-12):  # metafor confint(type = "QP"), uniroot tol ~1e-4
                bad.append('%s %s page %r metafor %r' % (k, f, p[f], r['metafor_' + f]))
        if p['upperReached'] is not True:
            bad.append('%s upper not reached' % k)
    assert bad == []


# ---------------------------------------------------------------- F9 robust / baseline model
def test_f9_robust_t_with_nu_infinite_is_the_main_analysis_for_each_estimator():
    bad = []
    for k, p in V['robust'].items():
        rel = 1e-6 if k.startswith('REML') else 1e-9
        if not _close(p['nuInf'], p['core'], rel, 1e-300) or not _close(p['nuInfTE'], p['coreTE'], rel, 1e-300):
            bad.append('%s nu=inf %r core %r' % (k, (p['nuInf'], p['nuInfTE']), (p['core'], p['coreTE'])))
        if p['converged'] is not True:
            bad.append('%s did not converge' % k)
    for est in ('DL', 'REML', 'PM'):
        a, b = V['robust'][est + '_1'], V['robust'][est + '_0.0001']
        if not _close(b['nu4'] / 1e-8, a['nu4'], 1e-6) or not _close(b['nu4TE'] / 1e-4, a['nu4TE'], 1e-6):
            bad.append('%s nu=4 not scale-equivariant %r vs %r' % (est, b['nu4'] / 1e-8, a['nu4']))
    # the chosen estimator matters (it was always PM)
    assert len({round(V['robust'][e + '_1']['nu4'], 6) for e in ('DL', 'REML', 'PM')}) == 3
    assert bad == []


def test_f9_baseline_model_tau2_equals_metafor_for_each_estimator():
    assert V['cbm']['studies'] == R['cbm']['studies']
    bad = []
    for est in ('DL', 'REML', 'PM', 'ML'):
        p, r = V['cbm'][est], R['cbm'][est]
        rel = 1e-5 if est in ('REML', 'ML') else 1e-8
        for f in ('tau2', 'slope', 'slopeSE'):
            if not _close(p[f], r[f], rel, 1e-10):
                bad.append('%s %s page %r R %r' % (est, f, p[f], r[f]))
    assert bad == []


# ---------------------------------------------------------------- F13 one engine
def test_f13_no_worker_engine():
    assert V['worker'] == {'WORKER_CODE': False, 'initWorker': False, 'workerCall': False}


# ---------------------------------------------------------------- F14 model selection
def test_f14_model_selection_equals_metafor_fitstats_and_mixture_lrt():
    bad = []
    for k, r in R['ms'].items():
        p = V['ms'][k]
        for m in ('re', 'fe'):
            for f in ('logL', 'AIC', 'BIC', 'AICc'):
                if not _close(p[m][f], r[m][f], 1e-6, 1e-9):
                    bad.append('%s %s %s page %r R %r' % (k, m, f, p[m][f], r[m][f]))
        if not _close(p['lrt']['statistic'], r['lrt'], 1e-6, 1e-9) or not _close(p['lrt']['pValue'], r['p'], 1e-5, 1e-300):
            bad.append('%s LRT page %r R %r' % (k, (p['lrt']['statistic'], p['lrt']['pValue']), (r['lrt'], r['p'])))
    assert bad == []
