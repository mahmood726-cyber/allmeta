"""The normal CDF behind the production page agrees with R 4.6.0 pnorm.

Before the fix the page-level pnorm() was Abramowitz-Stegun 26.2.17 with 7-digit coefficients (relative error
5e-5 at x = -3). Reference: tests/quantile_r460.json
(tests/quantile_reference.R).
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'quantile_r460.json').read_text(encoding='utf-8'))


def test_pnorm_equals_r():
    out = subprocess.run(['node', str(HERE / 'quantile_harness.cjs'), str(HERE.parent / 'TruthCert-PairwisePro-v1.0-production.html'), 'pnorm:pnorm'],
                         capture_output=True, text=True, timeout=120, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    got = json.loads(out.stdout)['pnorm']
    bad = ['x=%g: page %r, R %r' % (x, g, r) for x, g, r in zip(R['x'], got, R['pnorm']) if not abs(g - r) <= 1e-12 * r]
    assert len(got) == len(R['x']) and bad == []


def test_qchisq_equals_r():
    # Lane pwrest: app.min.js declared qchisq twice and the later Wilson-Hilferty approximation won
    # (qchisq(0.025, 5) = 0.798, R 0.831). The page's qchisq is now the exact one (shared/heterogeneity-ci.js).
    out = subprocess.run(['node', str(HERE / 'quantile_harness.cjs'), str(HERE.parent / 'TruthCert-PairwisePro-v1.0-production.html'), 'qnorm:qnorm', 'qchisq:qchisq'],
                         capture_output=True, text=True, timeout=120, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    got = json.loads(out.stdout)['qchisq']
    bad = ['p=%g df=%g: page %r, R %r' % (p, d, g, r)
           for d, grow, rrow in zip(R['chidf'], got, R['qchisq'])
           for p, g, r in zip(R['p'], grow, rrow) if not abs(g - r) <= 1e-9 * r]
    assert len(got) == len(R['chidf']) and bad == [], bad[:5]
