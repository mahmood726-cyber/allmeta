"""Critical values and Knapp-Hartung (HK/SJ) inference against R (tests/hksj_r460.json, tests/hksj_reference.R).

Before: normCDFinv() returned 3.542 for p = 0.975 (a garbled Beasley-Springer-Moro evaluation; qnorm(0.01) came out
+33.08), and tCriticalValue() built on it (Cornish-Fisher, normal above 100 df) returned 10.14 for qt(0.975, 4). Every
Wald CI from getContrastInference / the method comparison was therefore a ~99.96% interval labelled 95%, and the HK/SJ
and prediction intervals were several times too wide (sample quadratic: live CI [0.92, 1.06], R [0.951, 1.028]).
HK/SJ also scaled by Q_RE / (k - 1) with t on k - 1 df (k = studies) for a model with one random effect per
observation; the documented R choice for this model is metafor rma.mv(random = ~ 1 | obs, test = "adhoc"):
s2 = Q_RE / (n - p) floored at 1, t on n - p df.
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'hksj_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'hksj_harness.cjs')], capture_output=True, text=True, timeout=300,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def test_quantiles_equal_r():
    bad = ['%s: page %r, R %r' % (k, V['quantiles'][k], r) for k, r in R['quantiles'].items()
           if _rel(V['quantiles'][k], r) > 1e-9]
    assert bad == []


def test_wald_contrast_uses_qnorm():
    for key, r in R['cases'].items():
        w = V['cases'][key]['contrast']['wald']
        assert w['method'] == 'Wald' and _rel(w['crit'], r['crit_wald']) <= 1e-12, (key, w)
        assert _rel(w['se'], r['contrast_se_wald']) <= 1e-8, (key, w['se'], r['contrast_se_wald'])


def test_hksj_equals_metafor_rma_mv_adhoc():
    bad = []
    for key, r in R['cases'].items():
        p = V['cases'][key]
        if p['dfHKSJ'] != r['ddf']:
            bad.append('%s: df page %r, R %r' % (key, p['dfHKSJ'], r['ddf']))
        for a, b in zip(p['seHKSJ'], r['se_hk']):
            if _rel(a, b) > 1e-8:
                bad.append('%s: coefficient SE page %r, R %r' % (key, p['seHKSJ'], r['se_hk']))
                break
        hk = p['contrast']['hk']
        if hk['method'] != 'HK/SJ' or _rel(hk['se'], r['contrast_se_hk']) > 1e-8 or _rel(hk['crit'], r['crit_hk']) > 1e-9:
            bad.append('%s: contrast page se %r crit %r, R se %r crit %r' % (key, hk['se'], hk['crit'],
                                                                           r['contrast_se_hk'], r['crit_hk']))
    assert bad == []


def test_floor_is_exercised():
    # the tau2 = 1 cases have s2 < 1, so they check the max(1, s2) floor (metafor "adhoc", not "knha")
    s2 = [r['s2'] for k, r in R['cases'].items() if k.endswith('_tau1')]
    assert s2 and max(s2) < 1
    s2 = [r['s2'] for k, r in R['cases'].items() if k.endswith('_DL')]
    assert s2 and min(s2) > 1
