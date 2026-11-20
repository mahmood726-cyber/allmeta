"""Heterogeneity Q p-values are upper tails P(chi2_df > Q), computed directly (shared/upper-tail.js).

Before the fix chiSqCDF() returned an UPPER-tail-like quantity (2 * (1 - Phi(sqrt(x))) for 1 df; for df > 1
1 - Phi(z * sqrt(df / 2)), a Wilson-Hilferty tail with the wrong scale), so `Qp = 1 - chiSqCDF(Q, df)` was
roughly the LOWER tail: the built-in sample gave p = 0.646 (R 0.130) and, with tau2 = 0, p = 0.806 (R 0.0046);
Q = 1814 on 10 df gave p = 1 (R ~0). Reference values: tests/upper_tail_r460.json (tests/upper_tail_reference.R).
Since the Q-test fix (tests/test_q_standard.py) the page's Q is the standard Q_E at tau2 = 0 for every tau2 setting,
so each row without _tau0 now carries the same Q as its _tau0 row.
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


def test_heterogeneity_p_equals_r_upper_tail():
    v = _run_harness()
    keys = [k for k in R if k != 'R']
    assert len(keys) == 8 and set(keys) == set(v)
    bad = []
    for k in keys:
        assert abs(v[k]['Q'] - R[k]['Q']) <= 1e-9 * R[k]['Q'] and v[k]['df'] == R[k]['df'], k
        p, ref = v[k]['Qp'], R[k]['p']
        ok = (0 <= p < 1e-300) if ref == 0 else abs(p - ref) <= 1e-9 * ref
        if not ok:
            bad.append('%s: page %r, R %r' % (k, p, ref))
    assert bad == []


def test_page_loads_upper_tail():
    html = (ROOT / 'dose-response-pro.html').read_text(encoding='utf-8')
    i = html.find('<script src="../shared/upper-tail.js"></script>')
    j = html.find('function solveGLS(')
    assert 0 <= i < j


CDF = (r'(?:pnorm|normalCDF|normalCdf|normCDF|normCdf|_normalCDF|Phi|_Phi|tCDF|_tCDF|tcdf|_tcdf|'
       r'pchisq|chiSqCDF|chiSquareCDF|chiSquaredCDF|chi2CDF|_chiSquareCDF|pf|fCDF|fcdf|'
       r'_gammaCDF|gammaCDF|gammainc|gammaP|lowerGamma)')
SITE = re.compile(r'(?<![\w.$])1(?:\.0)?\s*-\s*((?:[A-Za-z_$][\w$]*\.)*' + CDF + r')\s*\(')


def test_no_upper_tail_as_one_minus_cdf():
    offenders = []
    for n, line in enumerate((ROOT / 'dose-response-pro.html').read_text(encoding='utf-8').splitlines(), 1):
        code = line.split('//', 1)[0]
        if SITE.search(code):
            offenders.append('%d: %s' % (n, line.strip()))
    assert offenders == []
