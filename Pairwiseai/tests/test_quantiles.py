"""The bundle's normal / t / chi-square quantiles and CDFs and its incomplete beta agree with R 4.6.0.

Before the fix (page-effective functions, i.e. the last global definition):
- pnorm was Abramowitz-Stegun 26.2.17 with 7-digit coefficients, redefined by a later <script> block over the
  engine's A&S 7.1.26 copy: pnorm(-3) = 0.00134997 (R 0.00134990, relative error 5e-5); pt() returned that pnorm
  for df > 10000, so pt(-3, 1e6) had the same error.
- qchisq clamped its answer to >= 0.001 and polished with 20 Newton steps: qchisq(0.001, 1) = 0.001 (R 1.57e-6).
- betainc(a, b, x) used a wrong continued fraction: betainc(10, 0.5, 0.9) = -0.237 (R pbeta 0.1516).
- qt was Newton on that pt (qt(0.001, 1e6) relative error 4e-6).
qnorm (Acklam, relative error ~1e-9) is checked at 1e-8. Reference values: tests/quantile_r460.json
(tests/quantile_reference.R).
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'quantile_r460.json').read_text(encoding='utf-8'))


def _run():
    out = subprocess.run(['node', str(HERE / 'quantile_harness.cjs')], capture_output=True, text=True,
                         timeout=180, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def _bad(got, ref, tol, label):
    return ['%s[%d]: page %r, R %r' % (label, i, g, r) for i, (g, r) in enumerate(zip(got, ref))
            if not (isinstance(g, (int, float)) and abs(g - r) <= tol * abs(r))]


def test_qnorm_and_pnorm_equal_r():
    v = _run()
    assert _bad(v['qnorm'], R['qnorm'], 1e-8, 'qnorm') == []
    assert _bad(v['pnorm'], R['pnorm'], 1e-12, 'pnorm') == []


def test_qt_and_pt_equal_r():
    v = _run()
    bad = []
    for j, d in enumerate(R['df']):
        bad += _bad(v['qt'][j], R['qt'][j], 1e-8, 'qt(df=%g)' % d)
        bad += _bad(v['pt'][j], R['pt'][j], 1e-9, 'pt(df=%g)' % d)
    assert bad == []


def test_qchisq_equals_r():
    v = _run()
    bad = []
    for j, d in enumerate(R['chidf']):
        bad += _bad(v['qchisq'][j], R['qchisq'][j], 1e-8, 'qchisq(df=%g)' % d)
    assert bad == []


def test_incomplete_beta_equals_r_pbeta():
    v = _run()
    bad = []
    for j, ab in enumerate(R['beta_ab']):
        bad += _bad(v['pbeta'][j], R['pbeta'][j], 1e-10, 'pbeta(%g,%g)' % tuple(ab))
    assert bad == []
