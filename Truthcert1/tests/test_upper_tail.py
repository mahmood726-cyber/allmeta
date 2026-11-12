"""p-values on the production page's own inline scripts are upper tails computed directly
(shared/upper-tail.js), never 1 - pnorm (pnorm here is A&S 26.2.17: absolute error ~7.5e-8, and
1 - pnorm(z) is exactly 0 for z > ~8.3).

app.min.js is not covered: it is a minified build with no matching source in the repository
(see the Truthcert1 note in the tails2 lane report), so its 91 sites are documented, not changed.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / 'TruthCert-PairwisePro-v1.0-production.html'


def test_page_loads_upper_tail_before_inline_engine():
    html = PAGE.read_text(encoding='utf-8')
    i = html.find('<script src="../shared/upper-tail.js"></script>')
    j = html.find('function pnorm(x, mean = 0, sd = 1)')
    assert 0 <= i < j


def test_no_upper_tail_as_one_minus_pnorm_in_inline_code():
    site = re.compile(r'(?<![\w.$])1\s*-\s*(?:pnorm|pt|pchisq|normalCDF|tCDF|chiSquareCDF)\s*\(')
    offenders = []
    for n, line in enumerate(PAGE.read_text(encoding='utf-8').splitlines(), 1):
        code = line.split('//', 1)[0]
        if site.search(code) and '<-' not in code:
            offenders.append('%d: %s' % (n, line.strip()[:160]))
    assert offenders == []
