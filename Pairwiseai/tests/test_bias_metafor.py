"""Publication-bias engine and prediction interval vs R 4.6.0 / metafor 5.2.1 (lane pwbias).

Requirements (tests/bias_reference.R -> tests/bias_metafor521.json; dat.bcg log RR, k = 13, and
dat.hackshaw1998 log OR, k = 37):

* eggersTest is Egger et al. (1997): ORDINARY least squares of z_i = y_i / se_i on precision 1 / se_i, the
  intercept tested on t(k - 2). This is the test metafor regtest(model = "lm") reports (its sei-slope t and p
  are this intercept's). It used to weight that regression by 1 / se_i^2 (dat.bcg: intercept -7.85, p 0.044
  where R gives -2.11, p 0.189).
* trimAndFill reproduces metafor::trimfill(rma(yi, vi, method = <the analysis's method>)): L0 (the default)
  and R0, ranks of |y - beta| signed by y - beta, the side metafor estimates (sign of the slope of
  rma(yi, vi, mods = sqrt(vi))) and the mirrored studies themselves. It used to compute R0 as a rank sum,
  rank the signed deviations, impute on the side opposite the one it trimmed and always fit REML
  (dat.bcg REML: k0 3, -0.714 -> -0.920; R R0 k0 0, L0 k0 1, -0.657).
* The prediction interval is theta +/- t_{k-1} sqrt(tau2 + SE^2) (Cochrane Handbook v6.5; the repo convention),
  SE the conventional SE of the pooled estimate -- the same interval #566 put on the orchard plot. It used t_{k-2}.
* calculateHKSJ floors the Knapp-Hartung scale at 1, i.e. metafor test = "adhoc" (which the R export now names).

Engines: the bundle's inline engine (loaded by Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html) and
Truthcert1/app.min.js (loaded by Truthcert1/TruthCert-PairwisePro-v1.0-production.html).
"""
import json
import os
import re
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent
REF = json.loads((HERE / 'bias_metafor521.json').read_text(encoding='utf-8'))
ENGINES = [ROOT / 'TruthCert-PairwisePro-v1.0-bundle.html', REPO / 'Truthcert1' / 'app.min.js']
SETS = ['bcg', 'hack']


def _run(engine):
    env = dict(os.environ, SHARED=str(REPO / 'shared'))
    out = subprocess.run(['node', str(HERE / 'bias_harness.cjs'), str(engine), str(HERE / 'bias_metafor521.json')],
                         capture_output=True, text=True, timeout=180, encoding='utf-8', env=env)
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


@pytest.fixture(scope='module', params=ENGINES, ids=lambda p: p.parent.name + '/' + p.name)
def got(request):
    return _run(request.param)


def test_reference_is_metafor_521():
    assert REF['metafor'] == '5.2.1'


@pytest.mark.parametrize('nm', SETS)
def test_egger_is_ols_of_z_on_precision(got, nm):
    r, g = REF[nm]['egger'], got[nm]['egger']
    assert g['df'] == r['df']
    for key in ('intercept', 'se', 't', 'p'):
        assert abs(g[key] - r[key]) < 1e-8 * max(1, abs(r[key])), (key, g[key], r[key])
    # the same t and p metafor regtest(model = "lm") prints
    assert abs(g['t'] - r['regtest_lm_t']) < 1e-8 and abs(g['p'] - r['regtest_lm_p']) < 1e-8


@pytest.mark.parametrize('nm', SETS)
@pytest.mark.parametrize('case', ['REML_L0', 'REML_R0', 'DL_L0', 'DL_R0', 'ML_L0', 'ML_R0'])
def test_trimfill_matches_metafor(got, nm, case):
    r, g = REF[nm]['trimfill'][case], got[nm]['trimfill'][case]
    assert g['side'] == r['side'], (g['side'], r['side'])
    assert g['k0'] == r['k0'], (g['k0'], r['k0'])
    assert abs(g['b'] - r['b']) < 1e-5, (g['b'], r['b'])
    assert g['se'] is not None and abs(g['se'] - r['se']) < 1e-5
    assert abs(g['ci_lb'] - r['ci_lb']) < 1e-5 and abs(g['ci_ub'] - r['ci_ub']) < 1e-5
    fy = r['fill_yi'] if isinstance(r['fill_yi'], list) else [r['fill_yi']]
    fv = r['fill_vi'] if isinstance(r['fill_vi'], list) else [r['fill_vi']]
    assert len(g['fill_yi']) == len(fy) == r['k0']
    for a, b in zip(sorted(g['fill_yi']), sorted(fy)):
        assert abs(a - b) < 1e-5
    for a, b in zip(sorted(g['fill_vi']), sorted(fv)):
        assert abs(a - b) < 1e-12


@pytest.mark.parametrize('nm', SETS)
@pytest.mark.parametrize('case', [m + '_' + e + '_' + s for m in ('REML', 'DL', 'ML') for e in ('L0', 'R0') for s in ('left', 'right')])
def test_trimfill_given_side_matches_metafor(got, nm, case):
    r, g = REF[nm]['trimfill'][case], got[nm]['trimfill'][case]
    assert g['k0'] == r['k0'], (g['k0'], r['k0'])
    assert abs(g['b'] - r['b']) < 1e-5, (g['b'], r['b'])


@pytest.mark.parametrize('nm', SETS)
@pytest.mark.parametrize('m', ['REML', 'DL'])
def test_prediction_interval_t_k_minus_1(got, nm, m):
    r, g = REF[nm]['pi'][m], got[nm]['pi'][m]
    k = len(REF[nm]['yi'])
    assert abs(g['theta'] - r['theta']) < 1e-5 and abs(g['tau2'] - r['tau2']) < 1e-5
    for key in ('standard', 'calc'):
        lo, hi, df = g[key]
        assert df == k - 1, (key, df)
        assert abs(lo - r['lo']) < 1e-5 and abs(hi - r['hi']) < 1e-5, (key, lo, hi, r['lo'], r['hi'])
    lo, hi = g['improved_hts']
    assert abs(lo - r['lo']) < 1e-5 and abs(hi - r['hi']) < 1e-5


@pytest.mark.parametrize('nm', SETS)
@pytest.mark.parametrize('m', ['REML', 'DL'])
def test_page_hksj_is_metafor_adhoc(got, nm, m):
    r, g = REF[nm]['pi'][m], got[nm]['pi'][m]
    se, lo, hi = g['hksj']
    assert abs(se - r['adhoc_se']) < 1e-5
    assert abs(lo - r['adhoc_ci'][0]) < 1e-5 and abs(hi - r['adhoc_ci'][1]) < 1e-5


def test_bundle_r_export_reproduces_the_page():
    """The R export names what the page computes: HKSJ with the scale floored at 1 is metafor test = "adhoc"
    (it said "knha", which has no floor), and the prediction interval is theta +/- t_{k-1} sqrt(tau2 + SE^2)
    with the conventional SE (predict(res) would use qnorm under test = "z" and the HKSJ SE under "adhoc").
    The generated code was run in R 4.6.0 / metafor 5.2.1 (lane pwbias report)."""
    rc = _run(ENGINES[0])['rcode']
    assert 'test = "adhoc"' in rc['hksj'] and 'test = "z"' in rc['z']
    for code in rc.values():
        assert not re.search(r"test\s*=\s*[\"']knha[\"']\s*[,)]", code)  # no fit uses the unfloored KH
        assert 'pi_crit <- qt(0.975, df = res$k - 1)' in code
        assert 'res_z <- update(res, test = "z")' in code
        assert 'pred <- predict(res)' not in code
