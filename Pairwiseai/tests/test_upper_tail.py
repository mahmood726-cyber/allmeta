"""p-values in the bundle are upper tails computed directly (shared/upper-tail.js), never 1 - CDF.

Before the fix the bundle computed them as 1 - pnorm / 1 - pt / 1 - pchisq; pnorm is A&S 7.1.26 (absolute
error ~1e-7, and 1 - pnorm(z) is exactly 0 once z > ~8.3), so a pooled z of 15.2 gave p = 0 (R 1.8e-52) and
every normal p-value carried an absolute error of ~1e-7. Reference values: tests/upper_tail_r460.json
(tests/upper_tail_reference.R, R 4.6.0).
"""
import json
import os
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PAGE = ROOT / 'TruthCert-PairwisePro-v1.0-bundle.html'
R = json.loads((HERE / 'upper_tail_r460.json').read_text(encoding='utf-8'))


def _run_harness():
    env = dict(os.environ, PAGE=str(PAGE))
    out = subprocess.run(['node', str(HERE / 'upper_tail_harness.cjs')], capture_output=True, text=True,
                         timeout=180, encoding='utf-8', env=env)
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def test_p_values_equal_r_upper_tails():
    v = _run_harness()
    bad = []
    for k, stat in (('fe', 'z'), ('small', 'z'), ('hksj', 't'), ('het', 'Q')):
        assert abs(v[k][stat] - R[k][stat]) <= 1e-9 * abs(R[k][stat]), k
        if abs(v[k]['p'] - R[k]['p']) > 1e-9 * R[k]['p']:
            bad.append('%s: page %r, R %r' % (k, v[k]['p'], R[k]['p']))
    assert bad == []


def test_page_loads_upper_tail():
    html = PAGE.read_text(encoding='utf-8')
    i = html.find('<script src="../shared/upper-tail.js"></script>')
    j = html.find('function calculatePooledEstimate(')
    assert 0 <= i < j


def test_no_upper_tail_as_one_minus_cdf_in_code():
    # The page also writes R scripts for export (template strings containing `1 - pnorm(...)` in R syntax);
    # those are R code and are excluded (lines containing the R assignment `<-`).
    site = re.compile(r'(?<![\w.$])1\s*-\s*(?:pnorm|pt|pchisq|normalCDF|tCDF|chiSquareCDF)\s*\(')
    offenders = []
    for n, line in enumerate(PAGE.read_text(encoding='utf-8').splitlines(), 1):
        code = line.split('//', 1)[0]
        if site.search(code) and '<-' not in code:
            offenders.append('%d: %s' % (n, line.strip()[:160]))
    assert offenders == []
