"""80-digit algebra diagnostic, never a replacement for a native R fit oracle."""
import json
from decimal import Decimal as D, localcontext
from pathlib import Path

fixtures = Path(__file__).parent / 'fixtures'
inputs = json.loads((fixtures / 'p12-conditioning-input.json').read_text(), parse_float=D, parse_int=D)
refs = json.loads((fixtures / 'p12-conditioning-reference.json').read_text(), parse_float=D, parse_int=D)
with localcontext() as ctx:
    ctx.prec = 80
    for name in ('heterogeneous', 'heterogeneous_x10', 'heterogeneous_x100'):
        d = inputs[name]
        te, se = d['te'], d['se']
        k = D(len(te))
        w0 = [1 / (s * s) for s in se]
        sw = sum(w0)
        mu = sum(t * w for t, w in zip(te, w0)) / sw
        q = sum(w * (t - mu) ** 2 for t, w in zip(te, w0))
        tau2 = max(D(0), (q - (k - 1)) / (sw - sum(w * w for w in w0) / sw))
        tau = tau2.sqrt()
        x = [1 / (s * s + tau2).sqrt() for s in se]
        xb = sum(x) / k
        sxx = sum((v - xb) ** 2 for v in x)
        centered = ((1 - tau * xb) ** 2 / sxx + tau2 / k).sqrt()
        expanded = ((1 + tau2 * sum(v * v for v in x) / k - 2 * tau * xb) / sxx).sqrt()
        ref = refs['cases'][name]
        def difference(value):
            return str(abs(value - centered) / max(D(1), abs(centered)))
        print(json.dumps(dict(name=name, decimal_precision=ctx.prec, tau2=str(tau2),
                              centered_se=str(centered), expanded_se=str(expanded),
                              native_se_normalized_error=difference(ref['native']['limit_se']),
                              R_centered_se_normalized_error=difference(ref['diagnostic']['centered_se']))))
