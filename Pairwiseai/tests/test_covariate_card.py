"""The covariate-adjusted meta-regression card (multi-outcome panel) must not interpret a regression that did not run.

Before the fix (every build), covariateAdjustedAnalysis returned available: true for 3-4 trials although
metaRegression refuses k < 5 ({available: false, warning: 'At least 5 studies required ...'}, no slope). The
interpretation was `slope < 0 ? 'Effect increases ...' : 'Effect decreases ...'`, and `undefined < 0` is false, so the
card printed "Effect decreases (less benefit) with higher <covariate>" for every k = 3 or 4 -- including the page's
own 4-trial SGLT2i demo. A NaN slope (all trials share one covariate value) printed the same sentence.
"""
import json
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BUILDS = ['app.js', 'app.min.js', 'TruthCert-PairwisePro-v1.0-bundle.html', 'TruthCert-PairwisePro-v1.0-dist.html',
          'TruthCert-PairwisePro-v1.0-min.html', 'TruthCert-PairwisePro-v1.0-optimized.html',
          'pairwise-pro-v2_2_evalue (5).html']


def _trials(k, ages=None):
    ages = ages or [60 + 3 * i for i in range(k)]
    return [{'trial': f'T{i}', 'outcomes': {'cv_death_or_hfh': {'hr': 0.7 + 0.03 * i, 'ci': [0.6, 0.9 + 0.03 * i]}},
             'baseline': {'age': ages[i]}} for i in range(k)]


def _run(build, payload):
    out = subprocess.run(['node', str(HERE / 'covariate_harness.cjs'), build], capture_output=True, timeout=120,
                         input=json.dumps(payload).encode('utf-8'))
    assert out.returncode == 0, out.stderr.decode('utf-8', 'replace')[-2000:]
    return json.loads(out.stdout.decode('utf-8'))


@pytest.mark.parametrize('build', BUILDS)
def test_k_below_5_says_not_run(build):
    cases = [{'trials': _trials(k), 'covariate': 'age', 'outcome': 'cv_death_or_hfh'} for k in (3, 4)]
    got = _run(build, {'mode': 'real', 'cases': cases})
    for k, r in zip((3, 4), got):
        assert 'not run (k<5)' in r['interpretation'], (k, r)
        assert 'Effect' not in r['interpretation'], (k, r)


@pytest.mark.parametrize('build', BUILDS)
def test_k_below_3_still_warns(build):
    got = _run(build, {'mode': 'real', 'cases': [{'trials': _trials(2), 'covariate': 'age', 'outcome': 'cv_death_or_hfh'}]})
    assert got == [{'available': False, 'warning': 'Insufficient trials with both cv_death_or_hfh and age'}]


@pytest.mark.parametrize('build', BUILDS)
@pytest.mark.parametrize('slope,expect', [(-0.01, 'Effect increases (more benefit) with higher age'),
                                          (0.02, 'Effect decreases (less benefit) with higher age'),
                                          (0, 'Effect decreases (less benefit) with higher age')])
def test_regression_that_ran_keeps_its_interpretation(build, slope, expect):
    got = _run(build, {'mode': 'stub', 'stub': {'available': True, 'slope': slope, 'p_value': 0.3},
                       'cases': [{'trials': _trials(6), 'covariate': 'age', 'outcome': 'cv_death_or_hfh'}]})
    assert got[0]['interpretation'] == expect


@pytest.mark.parametrize('build', BUILDS)
def test_non_finite_slope_is_not_interpreted(build):
    # JSON cannot carry NaN; a stub without a slope gives undefined, which is what an inestimable slope looks like to
    # the interpretation (and the real NaN case is checked by isFinite in the same branch)
    got = _run(build, {'mode': 'stub', 'stub': {'available': True, 'p_value': None},
                       'cases': [{'trials': _trials(6), 'covariate': 'age', 'outcome': 'cv_death_or_hfh'}]})
    assert 'Effect' not in got[0]['interpretation'] and 'not estimable' in got[0]['interpretation'], got
