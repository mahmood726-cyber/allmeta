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


if __name__ == '__main__':
    sys.exit(pytest.main([__file__, '-q']))
