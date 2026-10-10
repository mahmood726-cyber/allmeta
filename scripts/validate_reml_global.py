"""Independent seeded REML stress validation using SciPy residual contrasts.

The reference enumerates score crossings on 2048 scales and compares all roots
with zero. This is a numerical stress oracle, not a proof that its finite grid
isolates every possible root. The implementation's interval bounds and the
explicit adversarial fixtures provide complementary coverage.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import scipy
from scipy.linalg import helmert
from scipy.optimize import brentq

ROOT = Path(__file__).resolve().parents[1]


def reference(y, v):
    h = helmert(len(y))
    lam, u = np.linalg.eigh((h * v) @ h.T)
    z2 = (u.T @ h @ y) ** 2
    hi = max(float(np.sum((y-y.mean())**2)), float(max(v))) * 2
    grid = np.r_[0, np.geomspace(min(lam)*1e-12, hi, 2048)]
    den = lam[:, None] + grid
    scores = .5*np.sum((z2[:, None]-den)/den**2, axis=0)
    def score(t):
        d = lam + t
        return .5*np.sum((z2-d)/d**2)
    def ll(t):
        d = lam + t
        return -.5*np.sum(np.log(d)+z2/d)
    roots = [brentq(score, a, b, xtol=np.finfo(float).tiny, rtol=1e-14)
             for a, b, sa, sb in zip(grid[:-1], grid[1:], scores[:-1], scores[1:]) if sa*sb < 0]
    best = max([0]+roots, key=ll)
    return best, roots, ll


def evaluate(module, cases):
    code = 'const fs=require("fs"),M=require(process.argv[1]);console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,"utf8")).map(c=>M.tau2REML(c.yi,c.vi))));'
    result = subprocess.run(['node', '-e', code, str(module.resolve())],
                            input=json.dumps(cases), capture_output=True, text=True, check=True, timeout=120)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases', type=int, default=3000)
    parser.add_argument('--module', type=Path, default=ROOT/'shared/ma-core.js')
    parser.add_argument('--compare-module', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    rng = np.random.default_rng(84084)
    cases = []
    for i in range(args.cases):
        k = int(rng.integers(3, 13))
        v = 10**rng.uniform(-5, 3, k)
        y = rng.normal(size=k)*10**rng.uniform(-2, 2)
        if i % 3 == 0:
            y = rng.normal(size=k)*np.sqrt(v)*rng.uniform(.1, 2)
        cases.append({'id':f'seed84084-{i}', 'yi':y.tolist(), 'vi':v.tolist()})
    got = evaluate(args.module, cases)
    compared = evaluate(args.compare_module, cases) if args.compare_module else None
    failures, comparison_failures, nonunimodal, max_loss = [], [], 0, 0.
    for i, (c, value) in enumerate(zip(cases, got)):
        best, roots, ll = reference(np.array(c['yi']), np.array(c['vi']))
        nonunimodal += len(roots) > 1
        loss = float(ll(best)-ll(value)) if value is not None else float('inf')
        max_loss = max(max_loss, loss)
        if loss > 1e-7:
            failures.append({'id':c['id'], 'tau2':value, 'reference_tau2':best, 'loglik_loss':loss})
        if compared is not None:
            old = compared[i]
            old_loss = float(ll(best)-ll(old)) if old is not None else float('inf')
            if old_loss > 1e-7:
                comparison_failures.append({'id':c['id'], 'tau2':old, 'reference_tau2':best, 'loglik_loss':old_loss})
    record = {'seed':84084, 'cases':args.cases, 'scipy_version':scipy.__version__,
              'numpy_version':np.__version__, 'reference':'orthogonal contrasts; 2048-point score isolation and scipy.optimize.brentq',
              'likelihood_tolerance':1e-7, 'nonunimodal_cases':nonunimodal,
              'maximum_loglik_loss':max_loss, 'failures':failures,
              'input_sha256':hashlib.sha256(json.dumps(cases, sort_keys=True).encode()).hexdigest(),
              'module_sha256':hashlib.sha256(args.module.read_bytes()).hexdigest()}
    if compared is not None:
        record['comparison_module_sha256'] = hashlib.sha256(args.compare_module.read_bytes()).hexdigest()
        record['comparison_failures'] = comparison_failures
    print(json.dumps(record, indent=2))
    if args.output:
        args.output.write_text(json.dumps(record, indent=2)+'\n')
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
