"""Prediction interval for a new study's dose 1 vs 0 relative risk, against R (tests/pi_r460.json, tests/pi_reference.R).

Before: all three places that report the 95% prediction interval (updateInterpretation, updateInterpretationLegacy,
buildAnalysisReportPayload) used t on max(k - 2, 1) df (IntHout et al. 2016), while the convention adopted for this repo
is t on k - 1 df (Cochrane Handbook v6.5; metafor predict() for a test = "knha" fit), and the page's own coverage
simulation already used k - 1 (piDF). The page matched R's k - 2 interval to ~1e-12 and missed the k - 1 one
(sample, k = 5, DL quadratic: page [0.3993, 2.4487], R t_{k-1} [0.4483, 2.1812]). The exported R script printed no
prediction interval at all. Undefined for k < 2 (reported as not estimable instead of t on 1 df).
"""
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
HTML = (HERE.parent / 'dose-response-pro.html').read_text(encoding='utf-8')
R = json.loads((HERE / 'pi_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'pi_harness.cjs')], capture_output=True, text=True, timeout=300,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def test_cases_cover_small_and_large_k():
    assert len(R['cases']) == 12 and set(V['cases']) == set(R['cases'])
    assert sorted({c['k'] for c in R['cases'].values()}) == [5, 14, 22]
    for key, r in R['cases'].items():
        assert V['cases'][key]['nStudies'] == r['k'] and r['df'] == r['k'] - 1, key


def test_report_payload_pi_equals_r_t_k_minus_1():
    bad = []
    for key, r in R['cases'].items():
        p = V['cases'][key]['payload']
        if _rel(p['piLower'], r['pi_lower']) > 1e-9 or _rel(p['piUpper'], r['pi_upper']) > 1e-9:
            bad.append('%s: page [%r, %r], R [%r, %r]' % (key, p['piLower'], p['piUpper'], r['pi_lower'], r['pi_upper']))
    assert bad == []


def test_interpretation_text_pi_equals_r_t_k_minus_1():
    bad = []
    for key, r in R['cases'].items():
        c = V['cases'][key]
        want = ['%.2f' % r['pi_lower'], '%.2f' % r['pi_upper']]
        if c['interp'] != want:
            bad.append('%s interp: page %r, R %r' % (key, c['interp'], want))
        want_b1 = ['%.2f' % r['pi_lower_b1'], '%.2f' % r['pi_upper_b1']]
        if c['legacy'] != want_b1:
            bad.append('%s legacy: page %r, R %r' % (key, c['legacy'], want_b1))
    assert bad == []


def test_k_minus_1_and_k_minus_2_are_distinguishable_here():
    # the check above can fail: at k = 5 the two conventions differ in the second decimal place
    r = R['cases']['sample_DL_quadratic']
    assert '%.2f' % r['pi_lower'] != '%.2f' % r['pi_lower_km2']


def test_no_k_minus_2_prediction_df_left_in_page():
    assert not re.search(r'k\s*-\s*2|nStudies\s*\|\|\s*2\)\s*-\s*2', HTML), 'a k - 2 df expression remains'


def test_helper_edges_k1_undefined_k2_t1_tau0_not_ci():
    h, r = V['helper'], R['helper']
    assert h['k1']['lower'] is None and h['k1']['upper'] is None  # NaN serialises as null: not estimable for k < 2
    assert h['kNaN']['lower'] is None
    assert h['k2']['df'] == 1 and _rel(h['k2']['crit'], r['k2']['crit']) <= 1e-12
    assert _rel(h['k2']['lower'], r['k2']['lower']) <= 1e-12 and _rel(h['k2']['upper'], r['k2']['upper']) <= 1e-12
    # tau2 = 0: the PI uses t_{k-1}, not z, so it is wider than the z-based CI (a PI equal to its CI is always wrong)
    assert h['k5tau0']['df'] == 4 and _rel(h['k5tau0']['lower'], r['k5tau0']['lower']) <= 1e-12
    assert h['k5tau0']['crit'] > 1.96
