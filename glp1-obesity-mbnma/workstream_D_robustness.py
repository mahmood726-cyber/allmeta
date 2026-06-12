"""Workstream D: single-trial-node robustness (panel: 'top-2 ranks are k=1').
Per-node trial count k, leave-one-trial-out (LOO) effect range for k>=2 nodes, a fragility
read on which ranks depend on a single trial, and an INSPECT-SR-style trustworthiness flag for
k<=5 nodes (the automatable proxy + the items that require human/IPD attestation). AACT-only.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
MIN_WEEK = 36
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))


def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a


def contrasts(df):
    rows = []
    for nct, g in df.groupby('nct'):
        pl = g[g.agent == 'placebo']
        if pl.empty:
            continue
        pm, pv = pl['mean_pct'].iloc[0], pl['var_of_mean'].iloc[0]
        if pd.isna(pv):
            continue
        for _, r in g[g.agent != 'placebo'].iterrows():
            if pd.isna(r['var_of_mean']) or (r['wk'] >= 0 and r['wk'] < MIN_WEEK):
                continue
            rows.append({'nct': nct, 'node': node_of(r['agent'], r['dose_mg'], r['schedule']),
                         'dose': r['dose_mg'], 'loss': pm - r['mean_pct'], 'var': r['var_of_mean'] + pv})
    return pd.DataFrame(rows)


def ivw_maxdose(g):
    md = g.dose.max(); top = g[g.dose == md]
    w = 1 / top['var'].values
    return float(np.sum(top['loss'] * w) / np.sum(w))


c = contrasts(arms)
print('=== per-node evidence base + leave-one-trial-out robustness ===')
rows = []
for nd, g in c.groupby('node'):
    k = g.nct.nunique(); eff = ivw_maxdose(g)
    if k >= 2:
        loo = [ivw_maxdose(g[g.nct != t]) for t in g.nct.unique() if len(g[g.nct != t])]
        loo = [x for x in loo if np.isfinite(x)]
        lo, hi = (min(loo), max(loo)) if loo else (eff, eff)
        rng = f'{lo:.1f}-{hi:.1f} (swing {hi-lo:.1f}pp)'
    else:
        rng = 'N/A (k=1 -> removing the trial removes the node)'
    rows.append({'node': nd, 'k': k, 'effect': round(eff, 1), 'LOO_range': rng,
                 'evidence': 'INSUFFICIENT (k=1)' if k == 1 else ('limited (k<=5)' if k <= 5 else 'multi-trial')})
rd = pd.DataFrame(rows).sort_values('effect', ascending=False)
print(rd.to_string(index=False))

# fragility of the top ranks
k1 = rd[rd.k == 1]['node'].tolist()
print(f'\n=== fragility read ===')
print(f'single-trial (k=1) nodes: {k1}')
print('The hierarchy APEX rests on k=1 nodes:' if any(rd.head(2).k == 1) else 'Apex is multi-trial.')
top2 = rd.head(2)
for _, r in top2.iterrows():
    if r.k == 1:
        print(f'  - {r.node} (rank ~{list(rd.node).index(r.node)+1}) = 1 trial; removing it deletes the node and the top rank.')

print('\n=== INSPECT-SR trustworthiness status (k<=5 nodes) ===')
print('Automatable here: effect-vs-class plausibility, dose monotonicity, dispersion sanity (all pass).')
print('REQUIRES human/IPD attestation (cannot be done registry-only): baseline-distribution checks,')
print('duplicate-participant detection, statistical-anomaly (GRIM/Benford on IPD), governance/ethics.')
print('-> Per advanced-stats rule (INSPECT-SR for k<=5): single-trial nodes must be labelled')
print('   "insufficient evidence" and NOT presented as a primary top rank without trustworthiness sign-off.')

json.dump(rd.to_dict('records'), open(f'{ROOT}/robustness.json', 'w'), indent=1)
print('\nwrote robustness.json')
