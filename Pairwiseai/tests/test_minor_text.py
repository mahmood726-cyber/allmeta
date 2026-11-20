"""Pairwise Pro minor defects (lane pwmin), every build.

1. mapOutcomeToStandard's last pass (2-of-n word overlap, confidence 0.7) tested each synonym word with
   `name.includes(word)`, so a 3-4 letter word matched inside a longer one: 'for' (from 'hospitalization for heart
   failure' / 'admission for hf') inside 'before' turned 'heart rate before treatment', 'admission before discharge'
   and 'hospitalization before randomization' into hf_hospitalization. Words of 3-4 letters now use the same
   whole-word rule as the main pass (synonymWordMatch); 5+ letter words still match as substrings.
2. NT-proBNP had no outcome synonym at all ('NT-proBNP', 'NTproBNP', 'N-terminal pro-BNP' -> custom_*), and as a
   baseline covariate 'N-terminal pro-BNP' / 'N-terminal pro-B-type natriuretic peptide' were stored as bnp (the
   'bnp' / 'b-type natriuretic peptide' entries were the longest that matched).
3. The covariate card at k = 3-4 (regression refused) showed Slope "N/A" and p-value "N/A", as if a value existed but
   was missing; it now says the regression was not run (k<5). A regression that ran but returned a null p-value
   threw (null.toFixed) and left the card empty.
4. The data-status alert read "1 valid studies".
"""
import json
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BUILDS = ['app.js', 'app.min.js', 'TruthCert-PairwisePro-v1.0-bundle.html', 'TruthCert-PairwisePro-v1.0-dist.html',
          'TruthCert-PairwisePro-v1.0-min.html', 'TruthCert-PairwisePro-v1.0-optimized.html',
          'pairwise-pro-v2_2_evalue (5).html']


def _node(harness, build, payload):
    out = subprocess.run(['node', str(HERE / harness), build], capture_output=True, timeout=120,
                         input=json.dumps(payload).encode('utf-8'))
    assert out.returncode == 0, out.stderr.decode('utf-8', 'replace')[-2000:]
    return json.loads(out.stdout.decode('utf-8'))


def _syn(build, outcomes, baseline):
    return _node('synonym_harness.cjs', build, {'outcomes': list(outcomes), 'baseline': list(baseline)})


# ---- 1. short words of the word-overlap pass are whole words ---------------------------------------------------
IN_WORD_FUZZY = ['heart rate before treatment', 'admission before discharge', 'hospitalization before randomization']
# the overlap pass must still fire on genuine words (two of 'hospitalization for heart failure' as words)
WORD_FUZZY = {'heart failure hospitalisation for any reason': 'hf_hospitalization',
              'heart failure before discharge': 'hf_hospitalization'}


@pytest.mark.parametrize('build', BUILDS)
def test_overlap_pass_short_words_do_not_match_inside_words(build):
    got = _syn(build, IN_WORD_FUZZY, [])['outcomes']
    assert {k: v for k, v in got.items() if v['key'] == 'hf_hospitalization'} == {}


@pytest.mark.parametrize('build', BUILDS)
def test_overlap_pass_still_matches_whole_words(build):
    got = _syn(build, WORD_FUZZY, [])['outcomes']
    assert {k: v for k, v in got.items() if (v['key'], v['confidence']) != (WORD_FUZZY[k], 0.7)} == {}


# ---- 2. NT-proBNP ---------------------------------------------------------------------------------------------
NTPROBNP_OUTCOME = {'NT-proBNP': 'ntprobnp_change', 'NTproBNP': 'ntprobnp_change',
                    'N-terminal pro-BNP': 'ntprobnp_change', 'NT-pro-BNP': 'ntprobnp_change',
                    'NT proBNP, pg/mL': 'ntprobnp_change', 'Change in N-terminal pro-BNP': 'ntprobnp_change',
                    # BNP itself is a different analyte and stays unmapped as an outcome
                    'BNP': 'custom_bnp'}
NTPROBNP_BASELINE = {'NT-proBNP': 'ntprobnp', 'NTproBNP': 'ntprobnp', 'N-terminal pro-BNP': 'ntprobnp',
                     'NT-pro-BNP, pg/mL': 'ntprobnp', 'NT pro-BNP': 'ntprobnp',
                     'N-terminal pro-B-type natriuretic peptide': 'ntprobnp', 'N-terminal proBNP': 'ntprobnp',
                     'BNP': 'bnp', 'B-type natriuretic peptide': 'bnp'}


@pytest.mark.parametrize('build', BUILDS)
def test_ntprobnp_outcome_variants_map(build):
    got = _syn(build, NTPROBNP_OUTCOME, [])['outcomes']
    assert {k: v['key'] for k, v in got.items() if v['key'] != NTPROBNP_OUTCOME[k]} == {}


@pytest.mark.parametrize('build', BUILDS)
def test_ntprobnp_baseline_variants_map(build):
    got = _syn(build, [], NTPROBNP_BASELINE)['baseline']
    assert {k: v for k, v in got.items() if v != NTPROBNP_BASELINE[k]} == {}


# ---- 3. covariate card at k<5 ---------------------------------------------------------------------------------
def _trials(k):
    return [{'trial': f'T{i}', 'outcomes': {'cv_death_or_hfh': {'hr': 0.7 + 0.03 * i, 'ci': [0.6, 0.9 + 0.03 * i]}},
             'baseline': {'age': 60 + 3 * i}} for i in range(k)]


def _card(build, mode, k, stub=None):
    return _node('ui_text_harness.cjs', build, {'card': {'mode': mode, 'stub': stub or {}, 'cases': [
        {'trials': _trials(k), 'covariate': 'age', 'outcome': 'cv_death_or_hfh'}]}})['card'][0]


@pytest.mark.parametrize('build', BUILDS)
@pytest.mark.parametrize('k', [3, 4])
def test_card_says_not_run_below_5(build, k):
    txt = _card(build, 'real', k)
    assert 'N/A' not in txt, txt
    assert 'Slope (β₁) Not run (k<5) p-value Not run (k<5)' in txt, txt


@pytest.mark.parametrize('build', BUILDS)
def test_card_keeps_values_of_a_regression_that_ran(build):
    txt = _card(build, 'stub', 6, {'available': True, 'slope': -0.01234, 'p_value': 0.3})
    assert 'Slope (β₁) -0.0123 p-value 0.3000' in txt, txt


@pytest.mark.parametrize('build', BUILDS)
def test_card_null_p_value_does_not_throw(build):
    txt = _card(build, 'stub', 6, {'available': True, 'slope': -0.01, 'p_value': None})
    assert not txt.startswith('THREW') and 'Slope (β₁) -0.0100 p-value N/A' in txt, txt


# ---- 4. "1 valid studies" -------------------------------------------------------------------------------------
@pytest.mark.parametrize('build', BUILDS)
def test_status_alert_pluralises(build):
    s1, s2, s3 = _node('ui_text_harness.cjs', build, {'summary': [1, 2, 3]})['summary']
    assert '1 valid study.' in s1 and 'studies.' not in s1.split('Minimum')[0], s1
    assert '2 valid studies.' in s2, s2
    assert s3.startswith('✓ 3 valid studies'), s3
