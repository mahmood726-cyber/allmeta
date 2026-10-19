"""Independent reference for the four HTA REML regression fixtures.

Requires NumPy and SciPy. This optimises the restricted profile likelihood
itself; it does not call the application or reuse its score/iteration code.
A logarithmic grid locates a candidate basin; bounded minimisation and an
explicit zero-boundary comparison resolve the optimum for these fixtures.
This four-fixture check is not a general proof of global optimisation.
"""
from __future__ import annotations
import json
import numpy as np
import scipy
from scipy.optimize import minimize_scalar

CASES = [
    ('four-study', [.2,.5,-.1,.4], [.1,.2,.15,.12]),
    ('homogeneous', [.2,.2,.2], [.1,.2,.3]),
    ('equal-variance', [-.6,.1,.4,.8], [.2,.2,.2,.2]),
    ('unequal', [-.3,.15,1.2,.8,-.1], [.01,.08,.25,.7,.04]),
]

def reference(name: str, effects: list[float], ses: list[float]) -> dict:
    y, v = np.asarray(effects), np.square(ses)
    def negative_log_likelihood(t: float) -> float:
        w = 1.0 / (v + t)
        mu = np.sum(w * y) / np.sum(w)
        return float(.5 * (np.sum(np.log(v + t)) + np.log(np.sum(w)) + np.sum(w * (y-mu)**2)))
    grid = np.r_[0., np.geomspace(1e-12, max(10., float(np.var(y)*100)), 1000)]
    i = min(range(len(grid)), key=lambda j: negative_log_likelihood(float(grid[j])))
    tau2 = 0.
    if i:
        opt = minimize_scalar(negative_log_likelihood,
                              bounds=(grid[i-1], grid[min(i+1, len(grid)-1)]),
                              method='bounded', options={'xatol': 1e-14})
        if not opt.success:
            raise RuntimeError(f'Optimisation failed for {name}: {opt.message}')
        if opt.fun < negative_log_likelihood(0.):
            tau2 = float(opt.x)
    w = 1.0 / (v + tau2)
    return dict(name=name, effects=effects, ses=ses, tau2=tau2,
                mu=float(np.sum(w*y)/np.sum(w)), se=float(np.sqrt(1.0/np.sum(w))),
                negative_log_likelihood=negative_log_likelihood(tau2),
                zero_boundary=negative_log_likelihood(0.))

if __name__ == '__main__':
    print(json.dumps({'scipy_version': scipy.__version__,
                      'fixtures': [reference(*case) for case in CASES]}, indent=2))
