"""Independent SciPy/NumPy references for supported advanced HTA workflows.

No application JavaScript is loaded. REML uses restricted-profile likelihood;
PM uses scalar bracketing; fixed-effect NMA uses numpy.linalg.solve. NMA effect
direction is explicitly treatment minus reference (log odds for binary data).
Continuous fixtures test the shipped approximate Hedges-g variance convention,
not every possible SMD estimator. These fixtures do not validate multi-arm,
Bayesian or random-effects NMA, HKSJ, node splitting, or DTA.

Run: python HTA/validation/advanced_synthesis_reference.py --write
Check committed references: omit --write. Inputs and structure match exactly;
computed values use 1e-8 absolute/relative tolerance for platform-dependent
profile-optimiser rounding (stricter than the application regression limits).
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.optimize import brentq
from scipy.stats import chi2, norm, t
from reml_profile_reference import reference as reml

PAIRWISE = [
    dict(study='Synthetic1', effect=.2, se=.1, year=2020),
    dict(study='Synthetic2', effect=.5, se=.2, year=2021),
    dict(study='Synthetic3', effect=-.1, se=.15, year=2022),
    dict(study='Synthetic4', effect=.4, se=.12, year=2023),
]
BINARY = [
    dict(study='AB1', treatment='A', n=100, events=10),
    dict(study='AB1', treatment='B', n=100, events=20),
    dict(study='AC1', treatment='A', n=120, events=30),
    dict(study='AC1', treatment='C', n=110, events=20),
    dict(study='BC1', treatment='B', n=80, events=25),
    dict(study='BC1', treatment='C', n=90, events=15),
]
CONTINUOUS = [
    dict(study='AB1', treatment='A', n=40, mean=10, sd=2),
    dict(study='AB1', treatment='B', n=35, mean=11, sd=2.5),
    dict(study='AC1', treatment='A', n=50, mean=9, sd=2),
    dict(study='AC1', treatment='C', n=45, mean=8, sd=1.5),
    dict(study='BC1', treatment='B', n=60, mean=11, sd=3),
    dict(study='BC1', treatment='C', n=65, mean=9, sd=2.5),
]


def pairwise(data, method, level):
    y = np.array([d['effect'] for d in data]); v = np.square([d['se'] for d in data])
    w = 1 / v; mu0 = np.dot(w, y) / w.sum(); q = np.dot(w, (y-mu0)**2)
    df = len(y)-1
    if df == 0:
        tau2 = 0.
    elif method == 'REML':
        tau2 = reml('advanced', y.tolist(), np.sqrt(v).tolist())['tau2']
    elif method == 'DL':
        tau2 = max(0., (q-df)/(w.sum()-np.dot(w, w)/w.sum()))
    elif method == 'PM':
        def score(tau2):
            weights = 1/(v+tau2); mu = np.dot(weights, y)/weights.sum()
            return np.dot(weights, (y-mu)**2)-df
        if score(0) <= 0:
            tau2 = 0.
        else:
            upper = max(1., float(np.var(y)))
            while score(upper) > 0:
                upper *= 2
            tau2 = brentq(score, 0., upper, xtol=1e-14)
    else:
        raise ValueError(method)
    wr = 1/(v+tau2); mu = np.dot(wr, y)/wr.sum(); se = np.sqrt(1/wr.sum())
    z = norm.ppf((1+level)/2)
    result = dict(effect=float(mu), se=float(se), ci_lower=float(mu-z*se), ci_upper=float(mu+z*se),
                  pValue=float(2*norm.sf(abs(mu/se))), tauSquared=float(tau2),
                  Q=float(q), I2=float(max(0., (q-df)/q*100)) if q > 0 and df else 0.,
                  weights=(wr/wr.sum()*100).tolist())
    if len(y) >= 3:
        # Cochrane Handbook v6.5: t_{k-1} at every k; undefined/not reported for k <= 2.
        crit = t.ppf((1+level)/2, df)
        ps = np.sqrt(se**2+tau2)
        result['prediction'] = [float(mu-crit*ps), float(mu+crit*ps)]
    return result


def network(data, outcome, ref):
    treatments = [ref]+sorted({d['treatment'] for d in data}-{ref})
    by_study = {}
    for row in data:
        by_study.setdefault(row['study'], []).append(row)
    x, y, variances = [], [], []
    for arms in by_study.values():
        assert len(arms) == 2
        a, b = arms
        if outcome == 'binary':
            cells = np.array([a['events'], a['n']-a['events'], b['events'], b['n']-b['events']], float)
            if np.any(cells == 0):
                cells += .5
            effect = np.log(cells[2]/cells[3])-np.log(cells[0]/cells[1])
            variance = np.sum(1/cells)
        else:
            dof = a['n']+b['n']-2
            sd = np.sqrt(((a['n']-1)*a['sd']**2+(b['n']-1)*b['sd']**2)/dof)
            effect = (b['mean']-a['mean'])/sd*(1-3/(4*dof-1))
            variance = (a['n']+b['n'])/(a['n']*b['n'])+effect**2/(2*(a['n']+b['n']))
        row = np.zeros(len(treatments)-1)
        if a['treatment'] != ref: row[treatments.index(a['treatment'])-1] = -1
        if b['treatment'] != ref: row[treatments.index(b['treatment'])-1] = 1
        x.append(row); y.append(effect); variances.append(variance)
    x, y, v = np.array(x), np.array(y), np.array(variances)
    information = x.T @ np.diag(1/v) @ x
    beta = np.linalg.solve(information, x.T @ (y/v))
    covariance = np.linalg.solve(information, np.eye(len(beta)))
    q = float(np.sum((y-x@beta)**2/v)); df = len(y)-len(beta)
    means = np.r_[0., beta]; full_covariance = np.zeros((len(means), len(means))); full_covariance[1:, 1:] = covariance
    z = norm.ppf(.975)
    effects = []
    for i, name in enumerate(treatments[1:]):
        se = np.sqrt(covariance[i, i])
        effects.append(dict(treatment=name, vsReference=ref, mean=float(beta[i]), se=float(se),
                            ci_lower=float(beta[i]-z*se), ci_upper=float(beta[i]+z*se),
                            pValue=float(2*norm.sf(abs(beta[i]/se)))))
    scores = []
    for i, name in enumerate(treatments):
        values = [norm.cdf((means[i]-means[j])/np.sqrt(full_covariance[i,i]+full_covariance[j,j]-2*full_covariance[i,j])) for j in range(len(means)) if i != j]
        scores.append(dict(treatment=name, pScore=float(np.mean(values)*100)))
    league = []
    for i in range(len(means)):
        league.append([])
        for j in range(len(means)):
            se = np.sqrt(full_covariance[i,i]+full_covariance[j,j]-2*full_covariance[i,j])
            diff = means[j]-means[i]
            league[-1].append(dict(effect=float(diff), ci_lower=float(diff-z*se), ci_upper=float(diff+z*se)))
    return dict(reference=ref, effects=effects, varCov=covariance.tolist(), Q=q, df=df,
                pValueQ=float(chi2.sf(q, df)) if df else None, scores=scores, league=league, treatments=treatments)


def fixtures():
    variants = [('heterogeneous', PAIRWISE), ('two-study', PAIRWISE[:2]), ('homogeneous', [dict(study=f'H{i}', effect=.2, se=se) for i, se in enumerate([.1,.2,.3])]),
                ('unequal', [dict(study=f'U{i}', effect=y, se=se) for i, (y, se) in enumerate(zip([-.3,.15,1.2,.8,-.1],[.01,.08,.25,.7,.04]))])]
    pairs = [dict(name=name, data=data, method=method, confidenceLevel=level, expected=pairwise(data, method, level))
             for name, data in variants for method in ['REML','DL','PM'] for level in [.9,.95,.99]]
    nmas = []
    precise = [dict(d, n=10_000_000, events={'A':2_500_000,'B':2_505_000,'C':2_499_000}[d['treatment']]) for d in BINARY]
    for outcome, data in [('binary', BINARY), ('continuous', CONTINUOUS), ('binary-zero', [dict(d, events=0) if i == 0 else d for i,d in enumerate(BINARY)]), ('binary-precise', precise)]:
        for ref in ['A', 'B']:
            nmas.append(dict(name=outcome+'-'+ref, outcomeType='binary' if outcome.startswith('binary') else 'continuous',
                             data=data, reference=ref, expected=network(data, 'binary' if outcome.startswith('binary') else 'continuous', ref)))
    return dict(scipy_version=scipy.__version__, numpy_version=np.__version__, pairwise=pairs, network=nmas,
                sensitivity={method: dict(cumulative=[pairwise(PAIRWISE[:i], method, .95) for i in range(1,5)],
                                          leaveOneOut=[pairwise(PAIRWISE[:i]+PAIRWISE[i+1:], method, .95) for i in range(4)]) for method in ['REML','DL','PM']})


def compare(actual, expected, estimated=False, path='root'):
    if isinstance(actual, dict):
        assert set(actual) == set(expected), path
        for key in actual:
            if key.endswith('_version'): continue
            compare(actual[key], expected[key], estimated or key in ['expected','cumulative','leaveOneOut'], path+'.'+key)
    elif isinstance(actual, list):
        assert len(actual) == len(expected), path
        for i, (a, e) in enumerate(zip(actual, expected)): compare(a, e, estimated, path+f'[{i}]')
    elif isinstance(actual, (int,float)):
        if estimated and isinstance(actual, float):
            assert np.isclose(actual, expected, atol=1e-8, rtol=1e-8), (path,actual,expected)
        else:
            assert actual == expected, (path,actual,expected)
    else:
        assert actual == expected, path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--write', action='store_true'); args = parser.parse_args()
    destination = Path(__file__).with_name('advanced_synthesis_fixtures.json'); output = fixtures()
    if args.write:
        destination.write_text(json.dumps(output, indent=2, allow_nan=False)+'\n')
    else:
        compare(output, json.loads(destination.read_text()))
    print(f"Independent references checked: {len(output['pairwise'])} pairwise, {len(output['network'])} network, plus cumulative/leave-one-out fits.")
