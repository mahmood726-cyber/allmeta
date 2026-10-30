"""Apply the prepared repair only after actual old-code RED and control GREEN.

Run by the wrapper after p09-beta-check.mjs. This is one-shot job scaffolding;
neither tests nor the application import it. All run evidence stays in temp.
"""
import hashlib
import json
from pathlib import Path
import tempfile

root = Path(__file__).resolve().parents[4]
app_path = root / 'proportion-ma/index.html'
source = app_path.read_bytes().decode('utf-8')
newline = '\r\n' if '\r\n' in source else '\n'
start = source.index('    function logBeta(')
end = source.index('    // --- transforms ---')
kernel = source[start:end]
evidence = json.loads((Path(tempfile.gettempdir()) / 'rev2-p09-f5-beta-before.json').read_text())
assert evidence['sourceSHA256'] == hashlib.sha256(kernel.encode()).hexdigest()
results = {row['name']: row['status'] for row in evidence['results']}
for name in (
    'control: native R oracle matches input and script hashes and records versions',
    'control: ordinary interval is ordered and contains the estimate',
    'control: ordinary interval matches native R at existing 1e-9 tolerance',
    'control: a convergent continued fraction still returns a finite positive value',
    'control: beta CDF and quantile endpoints remain exact',
):
    assert results[name] == 'PASS', name
for name in (
    'plant P09-R5: balanced-billion interval is ordered and contains the estimate',
    'plant P09-R5: balanced-trillion interval is ordered and contains the estimate',
    'plant P09-R5: balanced-billion interval matches native R at existing 1e-9 tolerance',
    'plant P09-R5: balanced-trillion interval matches native R at existing 1e-9 tolerance',
    'plant P09-R5: a larger iteration cap alone does not excuse CDF cancellation',
    'plant P09-R5: exhausted continued fraction explicitly fails',
    'plant P09-R5: inversion refuses nonfinite or out-of-range CDF results',
):
    assert results[name] == 'FAIL', name

fixed = kernel.replace('\r\n', '\n')

def replace_once(old, new):
    global fixed
    assert fixed.count(old) == 1, old
    fixed = fixed.replace(old, new, 1)

replace_once('    function betaIncReg(x, a, b) {', '''    // Stirling remainder and binomial deviance avoid subtracting O(n log n)
    // log-gamma terms to obtain an O(log n) beta prefactor at large counts.
    function betaStirlingError(z) {
      if (z < 16) return logGamma(z) - (z - 0.5) * Math.log(z) + z - 0.5 * Math.log(2 * Math.PI);
      var z2 = z * z;
      return (1 / 12 - (1 / 360 - (1 / 1260 - (1 / 1680 - 1 / (1188 * z2)) / z2) / z2) / z2) / z;
    }

    // x*log(x/mean) + mean-x, evaluated by a convergent series near x=mean.
    function betaDeviance(x, mean) {
      if (Math.abs(x - mean) < 0.1 * (x + mean)) {
        var v = (x - mean) / (x + mean), term = 2 * x * v;
        var sum = (x - mean) * v;
        v *= v;
        for (var j = 1; j < 1000; j++) {
          term *= v;
          var next = sum + term / (2 * j + 1);
          if (next === sum) return sum;
          sum = next;
        }
        throw new Error('Beta deviance did not converge');
      }
      return x * Math.log(x / mean) + mean - x;
    }

    function betaLogPrefactor(x, a, b) {
      var s = a + b;
      // Retain the ordinary-count path; cancellation grows with s*log(s).
      if (s < 100000) return -logBeta(a, b) + a * Math.log(x) + b * Math.log(1 - x);
      return 0.5 * (Math.log(a) + Math.log(b) - Math.log(s) - Math.log(2 * Math.PI)) +
        betaStirlingError(s) - betaStirlingError(a) - betaStirlingError(b) -
        betaDeviance(a, s * x) - betaDeviance(b, s * (1 - x));
    }

    function betaIncReg(x, a, b) {''')
replace_once('''      var bt = Math.exp(-logBeta(a, b) + a * Math.log(x) + b * Math.log(1 - x));
      if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
      return 1 - bt * betacf(1 - x, b, a) / b;''', '''      var bt = Math.exp(betaLogPrefactor(x, a, b));
      var value = x < (a + 1) / (a + b + 2) ?
        bt * betacf(x, a, b) / a : 1 - bt * betacf(1 - x, b, a) / b;
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid beta CDF');
      return value;''')
replace_once('var MAX = 200, EPS', 'var MAX = 2000000, EPS')
replace_once('''        if (Math.abs(del - 1) < EPS) return h;
      }
      return h;''', '''        if (Math.abs(del - 1) < EPS && Number.isFinite(h) && h > 0) return h;
      }
      throw new Error('Beta continued fraction did not converge');''')
replace_once('''        var q = betaIncReg(mid, a, b);
        if (q < p)''', '''        var q = betaIncReg(mid, a, b);
        if (!Number.isFinite(q) || q < 0 || q > 1) throw new Error('Invalid beta CDF during inversion');
        if (q < p)''')
source = source[:start] + fixed.replace('\n', newline) + source[end:]
app_path.write_bytes(source.encode('utf-8'))
print('Applied beta repair after verified old-code failures and passing controls.')
