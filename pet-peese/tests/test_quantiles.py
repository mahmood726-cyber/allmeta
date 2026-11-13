"""The normal CDF behind the PET / PEESE p-values agrees with R 4.6.0 pnorm, and pFromZ is the two-sided tail.

Before the fix pnorm() in index.html was Abramowitz-Stegun 7.1.26 (relative error 5e-5 at x = -3) and
pFromZ(z) = 2 * (1 - pnorm(|z|)), which also loses the tail by cancellation (exactly 0 once z > ~8.3).
Reference: tests/quantile_r460.json (tests/quantile_reference.R).
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'quantile_r460.json').read_text(encoding='utf-8'))


def _run(*specs):
    out = subprocess.run(['node', str(HERE / 'quantile_harness.cjs'), str(HERE.parent / 'index.html'), *specs],
                         capture_output=True, text=True, timeout=120, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def test_pnorm_equals_r():
    got = _run('pnorm:pnorm')['pnorm']
    bad = ['x=%g: page %r, R %r' % (x, g, r) for x, g, r in zip(R['x'], got, R['pnorm']) if not abs(g - r) <= 1e-12 * r]
    assert len(got) == len(R['x']) and bad == []


def test_pfromz_is_two_sided_tail():
    v = _run('pnorm:pnorm', 'pFromZ:pnorm')
    ref = R['p2norm']   # R 2 * pnorm(-abs(x))
    bad = ['z=%g: page %r, R %r' % (x, g, r) for x, g, r in zip(R['x'], v['pFromZ'], ref) if not abs(g - r) <= 1e-12 * r]
    assert bad == []
