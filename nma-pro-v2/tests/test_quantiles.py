"""nma-pro-v8.0.html's normal / t / chi-square quantiles and CDFs, its critical values and its log-normal
survival / hazard agree with R 4.6.0, including df 100 .. 1e6 and tail probabilities down to 1e-12.

Before the fix (measured with tests/quantile_harness.cjs on the grid of tests/quantile_r460.json):
- Stats.pnorm and the Web Worker's Stats.pnorm were Abramowitz-Stegun 7.1.26: pnorm(-3) = 0.00134997
  (R 0.00134990, relative error 5e-5); P-scores use them.
- Stats.qt(p, 2) used 2*sqrt(p(1-p))/(2p-1), which is not the df = 2 quantile: qt(0.975, 2) = 0.329 (R 4.303), and
  qt(0.5, 2) = Infinity. The prediction interval uses Stats.qt(., n - p - 1), so a network with n - p - 1 = 2 had a
  13-fold too narrow interval. For other df qt bisected Stats.pt from [-10, 10] to an absolute 1e-8.
- Stats.pchisq switched to Wilson-Hilferty above df 100: pchisq at the R 1e-12 quantile for df 120 = 1.6e-12.
- Stats.qchisq bisected to an absolute 1e-8: qchisq(1e-12, 1) = 3.7e-9 (R 1.57e-24), qchisq(0.001, 1) relative
  error 1.6e-3.
- getCritVal(c) for a level other than 0.90 / 0.95 / 0.99 with (1 + c) / 2 > 0.97575 returned 1.96
  (getCritVal(0.98) = 1.96, R qnorm(0.99) = 2.326).
- SurvivalNMA's log-normal survival was 1 - 0.5 (1 + erfApprox(.)), erfApprox being A-S 7.1.26 (absolute error
  1.5e-7), so S(t) lost all precision in the upper tail and the hazard phi / S went wrong there.
qnorm (Acklam, relative error ~1e-9) is checked at 1e-8, as for Pairwiseai and bucher.
Reference values: tests/quantile_r460.json (tests/quantile_reference.R).
"""
import json
import subprocess
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'quantile_r460.json').read_text(encoding='utf-8'))


@lru_cache(maxsize=1)
def _run():
    out = subprocess.run(['node', str(HERE / 'quantile_harness.cjs')], capture_output=True, text=True,
                         timeout=300, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def _bad(got, ref, tol, label, atol=0.0):
    return ['%s[%d]: page %r, R %r' % (label, i, g, r) for i, (g, r) in enumerate(zip(got, ref))
            if not (isinstance(g, (int, float)) and abs(g - r) <= max(tol * abs(r), atol))]


def test_grid_covers_df_100_to_1e6_and_p_1e12():
    assert {120, 200, 500, 1000, 1e4, 1e5, 1e6} <= set(R['df'])
    assert {120, 200, 500, 1000, 1e4, 1e5, 1e6} <= set(R['chidf'])
    assert min(R['p']) == 1e-12


def test_qnorm_and_pnorm_equal_r():
    v = _run()
    assert _bad(v['qnorm'], R['qnorm'], 1e-8, 'qnorm') == []
    assert _bad(v['pnorm'], R['pnorm'], 1e-12, 'pnorm') == []


def test_worker_pnorm_equals_r():
    v = _run()
    assert _bad(v['worker_pnorm'], R['pnorm'], 1e-12, 'worker pnorm') == []


def test_qt_and_pt_equal_r():
    v = _run()
    bad = []
    for j, d in enumerate(R['df']):
        bad += _bad(v['qt'][j], R['qt'][j], 1e-8, 'qt(df=%g)' % d, atol=1e-300)
        bad += _bad(v['pt'][j], R['pt'][j], 1e-9, 'pt(df=%g)' % d)
    assert bad == []


def test_qchisq_and_pchisq_equal_r():
    v = _run()
    assert v['pchisq_n'] == R['pchisq_n']
    bad = []
    for j, d in enumerate(R['chidf']):
        bad += _bad(v['qchisq'][j], R['qchisq'][j], 1e-8, 'qchisq(df=%g)' % d)
        bad += _bad(v['pchisq'][j], R['pchisq'][j], 1e-9, 'pchisq(df=%g)' % d)
    assert bad == []


def test_critical_values_equal_r():
    v = _run()
    assert _bad(v['crit_conf'], R['crit_conf'], 1e-8, 'getCritVal(conf)') == []
    assert _bad(v['crit_t'], R['crit_t'], 1e-8, 'getCritVal(0.95, df)') == []


def test_lognormal_survival_and_hazard_equal_r():
    v = _run()
    bad = []
    for j, par in enumerate(R['lpar']):
        bad += _bad(v['slnorm'][j], R['slnorm'][j], 1e-12, 'S_lnorm(%g,%g)' % tuple(par))
        bad += _bad(v['hlnorm'][j], R['hlnorm'][j], 1e-10, 'h_lnorm(%g,%g)' % tuple(par))
    assert bad == []
    assert _bad(v['erf'], R['erf'], 1e-12, 'erf', atol=1e-15) == []
