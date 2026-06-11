"""Verification suite for the registry-native synthesis -> guideline pipeline. Pins the headline results
(numerical baseline contract), checks export integrity, and verifies cross-result consistency. Stochastic
(NUTS) values use generous tolerances; categorical/deterministic are exact. Run: pytest tests -q"""
import io, sys, json, os, re
import pytest
# NOTE: deliberately NO module-level sys.stdout reassignment — it corrupts pytest's capture (lessons.md).

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = json.load(open(os.path.join(ROOT, 'tests', 'baselines.json')))
def load(f):
    p = os.path.join(ROOT, f)
    if not os.path.exists(p):
        pytest.skip(f'{f} not generated yet (run run_all.py)')
    return json.load(open(p))
def text(f):
    return open(os.path.join(ROOT, f), encoding='utf-8').read()


# ---------- 1. output existence + JSON validity ----------
KEY_JSON = ['transport_v2.json', 'nma_contrast.json', 'grade_recommendation.json', 'cinema_confidence.json',
            'cnma_incretin.json', 'extend_surrogate.json', 'nma_league.json', 'joint_benefit_risk.json',
            'registry_pubbias.json', 'trial_sequential.json', 'decision_sensitivity.json', 'hta_mcda.json']
@pytest.mark.parametrize('f', KEY_JSON)
def test_output_exists_and_valid(f):
    d = load(f)
    assert isinstance(d, (dict, list)) and d, f'{f} empty/invalid'


# ---------- 2. numerical baselines (regression contract) ----------
def test_transport_effects():
    n = {x['node']: x['eff_target'] for x in load('transport_v2.json')['nodes']}
    t = B['transport']['tol_pp']
    assert abs(n['tirzepatide'] - B['transport']['tirzepatide_eff_target']) < t
    assert abs(n['semaglutide-sc-weekly'] - B['transport']['semaglutide_eff_target']) < t

def test_exact_contrast():
    c = load('nma_contrast.json')['target']; b = B['contrast']
    assert abs(c['median'] - b['median']) < b['tol_pp']
    assert c['cri'][0] < 0 < c['cri'][1], 'contrast CrI should still cross null (imprecision real)'
    assert abs(c['p_gt_0'] - b['p_gt_0']) < b['tol_p']

def test_grade_and_cinema_low_and_consistent():
    assert load('grade_recommendation.json')['certainty'] == B['grade_certainty']
    assert load('cinema_confidence.json')['cinema_confidence'] == B['cinema_confidence']
    # cross-result consistency: the two independent frameworks must agree
    assert load('grade_recommendation.json')['certainty'] == load('cinema_confidence.json')['cinema_confidence']

def test_cnma_validated_and_glucagon_lever():
    d = load('cnma_incretin.json'); b = B['cnma']
    assert d['validated_vs_discomb'] is True, 'CNMA must match netmeta::discomb oracle'
    comp = d['components']
    assert abs(comp['GLP1']['est_pp'] - b['GLP1']) < b['tol_pp']
    assert (comp['GCG']['est_pp'] > comp['GIP']['est_pp']) == b['glucagon_gt_gip'], 'glucagon should be the larger lever'

def test_surrogate_not_validated():
    d = load('extend_surrogate.json'); b = B['surrogate']
    assert abs(d.get('I2_logHR', 0.0) - b['I2_logHR']) < 0.15
    assert str(d['r2_error_adjusted']) == b['r2_error_adjusted']
    assert b['verdict_contains'].lower() in d['finding'].lower()

def test_league_certainty_and_k1():
    d = load('nma_league.json'); b = B['league']
    assert sorted(d['k1_insufficient']) == sorted(b['k1_insufficient'])
    assert d['certainty_counts'].get('Moderate', 0) >= b['moderate_min']
    assert d['certainty_counts'].get('Very low', 0) >= b['very_low_min']
    assert 'High' not in d['certainty_counts'], 'no comparison should reach High (indirect star network)'

def test_benefit_risk_frontier():
    d = load('joint_benefit_risk.json')
    assert B['benefit_risk']['dominated_includes'] in d['dominated']

def test_pubbias_negligible():
    assert load('registry_pubbias.json')['measured_bias_negligible'] is B['pubbias']['measured_bias_negligible']

def test_tsa_conclusive_and_pipeline():
    d = load('trial_sequential.json'); b = B['tsa']
    assert d['conclusive'] is b['conclusive']
    assert d['ongoing_trials'] >= b['ongoing_trials_min']

def test_decision_sensitivity_curve():
    d = load('decision_sensitivity.json')['headline']['p_by_mid']; b = B['decision_sensitivity']
    assert d['0'] >= b['p_mid0_min'], 'near-certain superiority at MID 0'
    assert d['3'] <= b['p_mid3_max'], 'uncertain by MID 3 (the values-dependence)'

def test_hta_mcda_top():
    assert load('hta_mcda.json')['p_best'].get('tirzepatide', 0) >= B['hta_mcda']['tirzepatide_pbest_min']


# ---------- 3. cross-result consistency ----------
def test_k1_nodes_consistent_across_files():
    league_k1 = set(load('nma_league.json')['k1_insufficient'])
    tv = {x['node']: x for x in load('transport_v2.json')['nodes']}
    for n in ['mazdutide', 'retatrutide']:
        assert tv[n]['k'] == 1 and n in league_k1, f'{n} k=1 flag must be consistent transport<->league'


# ---------- 4. export integrity (HTML) ----------
HTML = ['dashboard.html', 'grade_export.html', 'nma_league.html']
@pytest.mark.parametrize('f', HTML)
def test_html_integrity(f):
    if not os.path.exists(os.path.join(ROOT, f)):
        pytest.skip(f'{f} not built')
    s = text(f)
    assert s.count('<table') == s.count('</table>'), f'{f} table tags unbalanced'
    assert s.count('<div') == s.count('</div>'), f'{f} div tags unbalanced'
    # fully offline: no external CDN (the SVG xmlns w3.org URL is allowed)
    ext = re.findall(r'https?://(?!www\.w3\.org)', s)
    assert not ext, f'{f} has external refs: {ext[:3]}'
    for tok in ['{{', 'REPLACE_ME', '__PLACEHOLDER__']:                 # template tokens
        assert tok not in s, f'{f} contains unpopulated token {tok!r}'
    # JS rendering artifacts (a value rendered as undefined/NaN/null in a cell) — NOT the word in prose
    art = re.search(r'(?:>|\s)(undefined|NaN|null)(?:<|\s|,|%|pp)', s)
    assert not art, f'{f} has a rendered {art.group(1) if art else ""} value (missing field)'


# ---------- 5. generality (second class) ----------
def test_pcsk9_generality():
    p = os.path.join(ROOT, 'class2_pcsk9', 'pcsk9_results.json')
    if not os.path.exists(p):
        pytest.skip('pcsk9_results.json not generated')
    d = json.load(open(p)); b = B['pcsk9']
    assert d['ranking'][0] == b['ranking_top']
    assert all(a in d['ranking'] for a in b['ranking_includes'])
    # method discriminates: incretin surrogate failed, PCSK9 pairs consistent with validated surrogate
    assert 'discriminat' in d['surrogate_note'].lower() or 'consistent' in d['surrogate_note'].lower()


# ---------- 6. external concordance (validation keystone) ----------
def test_concordance_with_published_guidelines():
    d = load('concordance_validation.json'); v = d['verdict']
    assert v['recommendation']['concordant'] is True, 'recommendation must match the MAGIC GRADE guideline (weak/conditional, favour tirzepatide)'
    assert v['ranking']['concordant'] is True, 'ranking must match published (tirzepatide > semaglutide)'
    assert v['certainty']['logic_concordant'] is True
    # DOIs present for attribution
    dois = [r.get('doi') for r in d['references'].values()]
    assert '10.1136/bmj-2024-082071' in dois


def _classfile(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        pytest.skip(f'{rel} not generated')
    return json.load(open(p))

def test_generality_class2_pcsk9():
    d = _classfile('class2_pcsk9/pcsk9_results.json')
    assert d['ranking'][0] == 'bococizumab' and 'evolocumab' in d['ranking']
    assert 'discriminat' in d['surrogate_note'].lower() or 'consistent' in d['surrogate_note'].lower()

def test_generality_class3_sglt2_flags_heterogeneity():
    d = _classfile('class3_sglt2/sglt2_results.json')
    assert d['cross_agent_I2'] >= 50, 'SGLT2 composite pooling should surface (and flag) high heterogeneity'
    assert 'artifact' in d['caveat'].lower() or 'endpoint' in d['caveat'].lower()

def test_pcsk9_league_bayesian_parity():
    # PCSK9 Bayesian draw-matrix league (parity with SGLT2/flagship), alongside the frequentist one
    d = _classfile('class2_pcsk9/pcsk9_league_bayes.json')
    assert 'bayesian' in d['inference'].lower() and 'draw' in d['inference'].lower()
    assert d['rhat'] <= 1.01 and d['lead'] == 'bococizumab'
    # same ranking as the frequentist league (the parity claim)
    fz = _classfile('class2_pcsk9/pcsk9_league.json')
    assert d['ranking'] == fz['ranking']
    c0 = d['comparisons'][0]
    assert 'cri' in c0 and 0.0 <= c0['p_superiority'] <= 1.0

def test_asthma_league_bayesian_depth():
    # 3rd full-depth class: Bayesian count/rate (exacerbation IRR) league
    d = _classfile('class5_asthma/asthma_league.json')
    assert d['outcome_type'] == 'count/rate' and 'bayesian' in d['inference'].lower()
    assert d['rhat'] <= 1.01 and d['lead'] == 'tezepelumab'
    assert all(v < 1.0 for v in d['median_irr'].values()), 'all biologics reduce the exacerbation rate'
    c0 = d['comparisons'][0]
    assert 'cri_logrr' in c0 and 0.0 <= c0['p_superiority'] <= 1.0

def test_asthma_transport_averted_depth():
    d = _classfile('class5_asthma/asthma_transport.json')
    sc = d['scenarios']
    assert len(sc) >= 3
    av = [s['averted_per_yr'] for s in sc]
    assert av == sorted(av), 'absolute exacerbations averted should rise with baseline rate'
    assert av[-1] / av[0] >= 3, 'absolute benefit should swing several-fold across severity targets'
    assert any(s['primary'] for s in sc) and 'reference' in d['baseline_source'].lower()

def test_asthma_dashboard_offline():
    p = os.path.join(ROOT, 'class5_asthma', 'asthma_dashboard.html')
    if not os.path.exists(p):
        pytest.skip('asthma_dashboard.html not built')
    h = open(p, encoding='utf-8').read()
    assert 'http://' not in h and 'https://wwwn' not in h and 'C:/' not in h and 'C:\\' not in h
    import re as _re
    assert len(_re.findall(r'<div[\s>]', h)) == h.count('</div>')
    assert 'averted' in h and 'GRADE' in h and 'Bayesian' in h

def test_sglt2_league_bayesian_depth():
    # 2nd full-depth class + Bayesian draw matrix: single-endpoint HF-hosp league with CrI/P(sup)
    d = _classfile('class3_sglt2/sglt2_league.json')
    assert 'bayesian' in d['inference'].lower() and 'draw' in d['inference'].lower()
    assert d['rhat'] <= 1.01, 'Bayesian league must have converged'
    assert d['lead'] == 'canagliflozin' and d['ranking'][0] == 'canagliflozin'
    assert all(v <= 1.0 for v in d['median_hr'].values()), 'all SGLT2 agents reduce HF hospitalisation'
    assert 'ertugliflozin' in d['k1_insufficient'], 'k=1 ertugliflozin must be flagged INSUFFICIENT'
    # contrasts come from draws -> carry CrI + P(superiority)
    c0 = d['comparisons'][0]
    assert 'cri_loghr' in c0 and 0.0 <= c0['p_superiority'] <= 1.0
    # single-endpoint resolves the I2=87% composite artifact (no heterogeneity flag needed here)
    assert 'hospitalisation for heart failure' in d['outcome'].lower() or 'heart failure' in d['outcome'].lower()

def test_sglt2_transport_nnt_depth():
    d = _classfile('class3_sglt2/sglt2_transport.json')
    sc = d['scenarios']
    assert len(sc) >= 3
    # ARR rises and NNT falls monotonically with baseline risk (the honest transport message)
    arrs = [s['arr_pct_yr'] for s in sc]; nnts = [s['nnt_yr'] for s in sc]
    assert arrs == sorted(arrs) and nnts == sorted(nnts, reverse=True)
    assert any(s['primary'] for s in sc)
    assert 'reference' in d['baseline_source'].lower()
    assert nnts[0] / nnts[-1] >= 3, 'NNT should swing several-fold across baseline-risk targets'

def test_sglt2_dashboard_offline():
    p = os.path.join(ROOT, 'class3_sglt2', 'sglt2_dashboard.html')
    if not os.path.exists(p):
        pytest.skip('sglt2_dashboard.html not built')
    h = open(p, encoding='utf-8').read()
    assert 'http://' not in h and 'https://wwwn' not in h, 'dashboard must be fully offline'
    assert 'C:/' not in h and 'C:\\' not in h, 'no hardcoded local paths'
    import re as _re
    assert len(_re.findall(r'<div[\s>]', h)) == h.count('</div>'), 'div balance'
    assert 'NNT' in h and 'GRADE' in h and 'Bayesian' in h

def test_generality_class4_psoriasis_hierarchy():
    d = _classfile('class4_psoriasis/psoriasis_results.json')
    assert d['hierarchy_reproduced'] is True, 'should reproduce IL-17/IL-23 > TNF'
    assert d['il17_23_mean_pct'] > d['tnf_mean_pct']

def test_psoriasis_league_bayesian_depth():
    # 4th full-depth class: Bayesian binary/responder (PASI-90) draw-matrix league with CrI/P(sup)
    d = _classfile('class4_psoriasis/psoriasis_league.json')
    assert d['outcome_type'] == 'binary/responder' and 'bayesian' in d['inference'].lower()
    assert d['rhat'] <= 1.01, 'Bayesian league must have converged'
    # established hierarchy reproduced with posterior probability
    ivt = d['il17_23_vs_tnf']
    assert ivt['il_median_pct'] > ivt['tnf_median_pct']
    assert ivt['p_il_gt_tnf'] >= 0.9, 'IL-17/IL-23 > TNF should be near-certain in the draws'
    assert d['lead'] == d['ranking'][0]
    # contrasts come from draws -> carry CrI + P(superiority), on the risk-difference (pp) scale
    c0 = d['comparisons'][0]
    assert 'cri_pp' in c0 and 0.0 <= c0['p_superiority'] <= 1.0

def test_psoriasis_transport_nnt_depth():
    d = _classfile('class4_psoriasis/psoriasis_transport.json')
    sc = d['placebo_scenarios']
    assert len(sc) >= 3
    # responders gained falls and NNT rises as the placebo background rises (gained = response - placebo)
    gained = [s['responders_gained_per100'] for s in sc]
    nnts = [s['nnt'] for s in sc]
    assert gained == sorted(gained, reverse=True) and nnts == sorted(nnts)
    assert any(s['primary'] for s in sc) and 'reference' in d['baseline_source'].lower()
    # per-agent decision table present; top biologic NNT is small (active response dominates)
    pa = d['per_agent_nnt_at_reference']
    assert len(pa) >= 5 and pa[0]['nnt'] < 3, 'lead biologic NNT should be tiny vs placebo'

def test_psoriasis_dashboard_offline():
    p = os.path.join(ROOT, 'class4_psoriasis', 'psoriasis_dashboard.html')
    if not os.path.exists(p):
        pytest.skip('psoriasis_dashboard.html not built')
    h = open(p, encoding='utf-8').read()
    assert 'http://' not in h and 'https://wwwn' not in h, 'dashboard must be fully offline'
    assert 'C:/' not in h and 'C:\\' not in h, 'no hardcoded local paths'
    import re as _re
    assert len(_re.findall(r'<div[\s>]', h)) == h.count('</div>'), 'div balance'
    assert 'NNT' in h and 'GRADE' in h and 'Bayesian' in h and 'PASI-90' in h

def test_pcsk9_league_depth():
    # frontier 2: PCSK9 promoted beyond a core repoint -> full league + per-pair GRADE certainty
    d = _classfile('class2_pcsk9/pcsk9_league.json')
    assert d['lead'] == 'bococizumab' and d['ranking'][0] == 'bococizumab'
    assert sum(d['certainty_counts'].values()) == 12, 'all ordered pairwise comparisons should be graded'
    # same GRADE domains as the incretin flagship: bococizumab clearly best -> its contrasts clear the null (Moderate)
    assert d['lead_vs_second']['certainty'] == 'Moderate'
    assert d['k1_insufficient'] == [], 'every PCSK9 agent has k>=4; no INSUFFICIENT node'
    # honest depth boundary recorded (not the full 40-stage run)
    assert 'transport' in d['depth_note'].lower()

def test_pcsk9_transport_depth():
    # frontier 2 tail: transport stage repointed (% LDL -> absolute lowering in a real NHANES target)
    d = _classfile('class2_pcsk9/pcsk9_transport.json')
    tg = d['target']
    assert 120 <= tg['baseline_ldl_mg_dl'] <= 150, 'NHANES elevated-LDL baseline should be ~130 mg/dL'
    assert tg['n'] >= 200 and 'NHANES' in tg['source']
    rows = {r['agent']: r for r in d['transported']}
    assert rows['bococizumab']['abs_mmol_l'] == max(r['abs_mmol_l'] for r in d['transported'])
    assert all(r['abs_mmol_l'] > 1.5 for r in d['transported']), 'PCSK9i absolute lowering should exceed ~1.5 mmol/L here'
    # surrogate transport must NOT be sold as a CV claim
    assert 'not a cv' in d['ctt_context'].lower() or 'not a cardiovascular' in (d['ctt_context'] + d['depth_note']).lower()

def test_pcsk9_dashboard_offline():
    p = os.path.join(ROOT, 'class2_pcsk9', 'pcsk9_dashboard.html')
    if not os.path.exists(p):
        pytest.skip('pcsk9_dashboard.html not built')
    h = open(p, encoding='utf-8').read()
    assert 'http://' not in h and 'https://wwwn' not in h, 'dashboard must be fully offline'
    assert 'C:/' not in h and 'C:\\' not in h, 'no hardcoded local paths in shipped HTML'
    import re as _re
    assert len(_re.findall(r'<div[\s>]', h)) == h.count('</div>'), 'div balance'
    assert 'GRADE' in h and 'mmol/L' in h and 'DRAFT' in h

def test_generality_class5_asthma_rate():
    d = _classfile('class5_asthma/asthma_results.json')
    # 5th outcome TYPE: count/rate (annualised exacerbation incidence-rate ratio)
    assert d['outcome_type'] == 'count/rate'
    assert d['all_agents_reduce_rate'] is True, 'every biologic CI should sit below IRR=1 (significant rate reduction)'
    assert 0.5 <= d['class_pooled_irr'] <= 0.9, 'class-pooled exacerbation IRR should land in the published ~0.6-0.8 band'
    # method discriminates honestly: high cross-agent I2 flagged as effect modification, not a clean winner
    assert d['cross_agent_I2'] >= 50
    assert 'effect modification' in d['caveat'].lower() or 'transitivity' in d['caveat'].lower()


def test_ubcma_reporting_bias_inferential_pair():
    # frontier 4 method 1: UBCMA = inferential pair to the registry-native ghost-measurement
    d = _classfile('ubcma_reporting_bias.json')
    assert d['k_published'] == 13 and d['k_ghost'] == 2
    # the directly-observed reporting-bias direction: ghost pool < published pool
    assert d['observed']['ghost_iv'] < d['observed']['published_iv']
    # UBCMA, fit blind to the ghosts, infers a correction in the SAME direction the ghosts reveal
    assert d['same_direction_as_ghost_truth'] is True
    assert 10.5 <= d['ubcma']['mu'] <= 12.5, 'UBCMA mu should sit just below the naive published pool'
    assert 'pair' in d['role'].lower()

def test_grma_robust_pool_sensitivity():
    # frontier 4 method 2: GRMA = robust-pooling sensitivity pair to the IV pool
    d = _classfile('grma_robust_pool.json')
    assert d['k'] == 15
    assert abs(d['grma_minus_iv_pp']) < 1.5 and d['conclusion_robust_to_pooling'] is True
    assert 11.0 <= d['grma']['mu'] <= 12.0 and 11.0 <= d['iv']['mu'] <= 12.0
    assert 'sensitivity' in d['role'].lower()


def test_concordance_battery_multireview():
    d = load('concordance_battery.json')
    assert d['n_reviews'] >= 6, 'battery should score against several published reviews'
    assert d['n_concordant'] == d['n_reviews'], 'all reviews should concur incretins lead on weight loss'
    assert d['n_concordant'] >= 6, 'concordance must be multi-review (not n=1)'


if __name__ == '__main__':
    sys.exit(pytest.main([__file__, '-q']))
