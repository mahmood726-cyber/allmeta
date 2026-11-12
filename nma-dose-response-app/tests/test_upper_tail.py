"""Upper-tail p-values are computed as upper tails (shared/upper-tail.js), never as 1 - CDF.

Before the fix, the design-by-treatment interaction test used a 100-term incomplete-gamma series
with no continued fraction: for Q = 484 on 1 df the CDF came out ~0, so p = 1 - CDF = 1
(R: 2.9e-107). Reference values: tests/upper_tail_r460.json from tests/upper_tail_reference.R (R 4.6.0).
"""
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
R = json.loads((HERE / 'upper_tail_r460.json').read_text(encoding='utf-8'))


def _run_harness():
    out = subprocess.run(['node', str(HERE / 'upper_tail_harness.cjs')], capture_output=True, text=True,
                         timeout=120, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def _rel(a, b):
    return 0.0 if a == b else abs(a - b) / abs(b)


def test_design_by_treatment_p_for_large_q_is_not_one():
    v = _run_harness()
    assert v['dbt']['Q'] == R['dbt']['Q'] and v['dbt']['df'] == R['dbt']['df']
    assert _rel(v['dbt']['p'], R['dbt']['p']) < 1e-9, v['dbt']


def test_incoherence_with_no_loop_keeps_p_one():
    # Tree network: no closed loop, Q = 0 on 0 df. The page showed p = 1 before the AlmTail change
    # (StatUtils.chiSquareCDF returned 0 for df <= 0); R pchisq(0, 0, lower.tail = FALSE) = 1.
    # AlmTail.pchisqUpper returns NaN for df <= 0, so the call sites must keep the df = 0 guard.
    v = _run_harness()['incoherence_tree']
    for part in ('loop', 'overall'):
        assert v[part]['Q'] == 0 and v[part]['df'] == 0, v
        assert v[part]['pValue'] == 1, v


def test_statutils_lower_cdfs_unchanged():
    v = _run_harness()
    assert abs(v['stat']['chisq_10_5'] - R['chisq_10_5']) < 1e-9
    assert abs(v['stat']['norm_196'] - R['norm_196']) < 1e-6   # A&S 7.1.26 lower CDF, kept


def test_page_loads_upper_tail_before_app():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    i = html.find('src="../shared/upper-tail.js"')
    j = html.find('src="app.js"')
    assert 0 <= i < j


CDF = (r'(?:pnorm|normalCDF|normalCdf|normCDF|normCdf|_normalCDF|Phi|_Phi|tCDF|_tCDF|tcdf|_tcdf|'
       r'pchisq|chiSqCDF|chiSquareCDF|chiSquaredCDF|chi2CDF|_chiSquareCDF|pf|fCDF|fcdf|'
       r'_gammaCDF|gammaCDF|gammainc|gammaIncomplete|gammaP|lowerGamma)')
SITE = re.compile(r'(?<![\w.$])1(?:\.0)?\s*-\s*((?:[A-Za-z_$][\w$]*\.)*' + CDF + r')\s*\(')


def test_no_upper_tail_as_one_minus_cdf_in_app_js():
    offenders = []
    for n, line in enumerate((ROOT / 'app.js').read_text(encoding='utf-8').splitlines(), 1):
        code = line.split('//', 1)[0]
        if SITE.search(code):
            offenders.append('%d: %s' % (n, line.strip()))
    assert offenders == []
