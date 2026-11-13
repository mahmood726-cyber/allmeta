"""The heterogeneity Q test the page reports is the STANDARD Cochran Q (Q_E): the GLS residual quadratic form with
fixed-effect weights (tau2 = 0), df = n - p, p = P(chi2_df > Q_E), I2 = max(0, (Q_E - df) / Q_E) -- metafor rma.mv
QE / QEp and the dosresmeta::qtest convention.

Before the fix every model computed Q at the estimated random-effects tau2 (computeQStat(y, X, beta, V, tau2)), which
is not chi2(n - p) under H0, and derived I2 and the p-value from it: the built-in sample showed Q = 14.88, p = 0.137,
I2 = 32.8% where R gives Q_E = 25.41, p = 0.0046, I2 = 60.6%; and I2 differed between the fixed-effect, DL and REML
rows of the method comparison although it is a property of the data. Reference: tests/q_standard_r460.json
(tests/q_standard_reference.R, R 4.6.0 / metafor 5.2.1).
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'q_standard_r460.json').read_text(encoding='utf-8'))
DATASETS = ['sample', 'tight', 'coffee', 'milk']


def _harness():
    out = subprocess.run(['node', str(HERE / 'q_standard_harness.cjs')], capture_output=True, text=True,
                         timeout=300, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel):
    return abs(a - b) <= rel * max(abs(b), 1e-300)


def test_inputs_are_the_ones_r_was_given():
    for lab in DATASETS:
        page, ref = V[lab]['blocks'], R[lab]['blocks']
        assert len(page) == len(ref), lab
        for pb, rb in zip(page, ref):
            assert pb['id'] == rb['id'] and pb['n'] == rb['n'], lab
            for key in ('dose', 'y', 'V'):
                assert all(_close(x, y, 1e-14) for x, y in zip(pb[key], rb[key])), (lab, pb['id'], key)


def test_reported_q_is_standard_qe_equal_to_r():
    bad = []
    for lab in DATASETS:
        for model in ('quadratic', 'linear'):
            p, r = V[lab]['res'][model], R[lab]['res'][model]
            if not (_close(p['Q'], r['QE'], 1e-9) and p['df'] == r['df']):
                bad.append('%s %s: Q page %r df %r, R QE %r df %r' % (lab, model, p['Q'], p['df'], r['QE'], r['df']))
            ok_p = (0 <= p['Qp'] < 1e-300) if r['p'] == 0 else _close(p['Qp'], r['p'], 1e-9)
            if not ok_p:
                bad.append('%s %s: p page %r, R %r' % (lab, model, p['Qp'], r['p']))
            if abs(p['I2'] - r['I2']) > 1e-9:
                bad.append('%s %s: I2 page %r, R %r' % (lab, model, p['I2'], r['I2']))
    assert bad == []


def test_q_and_i2_do_not_depend_on_tau2_for_any_model():
    # Q_E is a property of the data and the design: the DL fit and the tau2 = 0 fit must report the same Q, p, I2.
    bad = []
    for lab in DATASETS:
        for model in ('quadratic', 'linear', 'spline', 'exponential'):
            p = V[lab]['res'][model]
            assert p['tau2'] > 0, (lab, model)      # every case has a positive DL tau2, so the check can fail
            if not (_close(p['Q'], p['tau0']['Q'], 1e-12) and abs(p['I2'] - p['tau0']['I2']) <= 1e-9):
                bad.append('%s %s: Q at DL %r vs tau2=0 %r; I2 %r vs %r' % (lab, model, p['Q'], p['tau0']['Q'],
                                                                         p['I2'], p['tau0']['I2']))
            i2 = max(0.0, 100 * (p['Q'] - p['df']) / p['Q'])
            assert abs(p['I2'] - i2) <= 1e-9, (lab, model)
    assert bad == []


def test_random_effects_residual_kept_separately_for_hksj():
    # HK/SJ scales by the RANDOM-effects weighted residual; it must be unchanged by the Q fix. Values: the residual
    # quadratic form at the DL tau2, reproduced independently in R (tests/upper_tail_reference.R header).
    want = {('sample', 'quadratic'): 14.878738691908367, ('sample', 'linear'): 15.799667012480906,
            ('tight', 'quadratic'): 26.843826881772564, ('tight', 'linear'): 26.958390504218187}
    for (lab, model), q in want.items():
        assert _close(V[lab]['res'][model]['QRE'], q, 1e-9), (lab, model, V[lab]['res'][model]['QRE'])
