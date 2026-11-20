# High-precision Student t quantiles next to the median, for student_t_beta.test.cjs.
#   python student_t_beta_reference_mp.py      (mpmath; writes student_t_beta_reference_mp.json)
# R 4.6.0 qt(0.5 +- 1e-8, df) is off by ~1e-9 relative (it is a double-precision algorithm working
# from 2 min(p, 1 - p)); these points are therefore referenced to a 40-digit root of
# P(T <= x) = p, with p taken as the exact double the test passes. The df = 2 values agree with the
# closed form (2p - 1) / sqrt(2 p (1 - p)), and the normal limit with sqrt(2) erfinv(2p - 1).
import json
import mpmath as m
m.mp.dps = 40
DFS = [0.5, 1, 2, 3, 4, 4.5, 5, 7, 10, 12, 30, 100, 1000, 1e6, float('inf'), 2.71828182845905]   # e as jsonlite wrote it (15 significant digits)
out = []
for p in [0.5 - 1e-8, 0.5 + 1e-8]:
    P = m.mpf(p)
    for df in DFS:
        if df == float('inf'):
            q = m.sqrt(2) * m.erfinv(2 * P - 1)
        else:
            d = m.mpf(df)
            f = lambda x: m.mpf(0.5) + m.sign(x) * 0.5 * m.betainc(0.5, d / 2, 0, x * x / (d + x * x), regularized=True) - P
            q = m.findroot(f, (P - 0.5) * 2.5)
        out.append({'p': p, 'df': 'Inf' if df == float('inf') else df, 'q': float(q)})
json.dump({'mpmath': m.__version__, 'dps': 40, 'qt_near_median': out}, open('student_t_beta_reference_mp.json', 'w'), indent=1)
print(len(out), 'points; e.g.', out[2])
