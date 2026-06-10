"""Workstream C: transitivity / effect-modifier assessment (panel: 'transitivity untested').
Pulls baseline covariates per trial from AACT baseline_measurements (age, %female, BMI, baseline
weight, HbA1c) and tabulates them by node, so the exchangeability assumption can be inspected and
the diabetes-vs-obesity population-mix (panel weakness #6) is made visible (HbA1c discriminates).
Also flags the oral-semaglutide node's indication mixing. AACT-only.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
arms = pd.read_csv(f'{ROOT}/arms_full.csv')


def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a
arms['node'] = [node_of(a, d, s) for a, d, s in zip(arms.agent, arms.dose_mg, arms.schedule)]
ncts = sorted(arms.nct.unique())

bm = load_table('baseline_measurements', location=LOC,
                columns=['nct_id', 'title', 'param_type', 'param_value_num', 'units'])
bm = bm[bm.nct_id.isin(ncts)].copy()
bm['t'] = bm['title'].str.lower().fillna('')


def measure(nct, pat, exclude=None):
    d = bm[(bm.nct_id == nct) & bm.t.str.contains(pat, na=False, regex=True) & bm.param_value_num.notna()]
    if exclude:
        d = d[~d.t.str.contains(exclude, na=False, regex=True)]
    return float(d['param_value_num'].mean()) if len(d) else np.nan


rows = []
for nct in ncts:
    age = measure(nct, r'\bage')
    bmi = measure(nct, r'body mass index|\bbmi\b')
    wt = measure(nct, r'body weight|^weight$|baseline.*weight')
    hba1c = measure(nct, r'hba1c|glycosylated h.emoglobin')
    # %female from sex counts
    sx = bm[(bm.nct_id == nct) & bm.t.str.contains('female', na=False)]
    rows.append({'nct': nct, 'age': age, 'bmi': bmi, 'baseline_wt': wt, 'hba1c': hba1c})
cov = pd.DataFrame(rows).set_index('nct')
# population tag from HbA1c (T2D enroll ~>=6.5%; obesity ~<6.0)
cov['population'] = np.where(cov.hba1c >= 6.5, 'T2D', np.where(cov.hba1c < 6.0, 'obesity', np.where(cov.hba1c.notna(), 'mixed/prediab', 'unknown')))

# attach node(s) per trial (a trial can map to one node here since agent+route fixed per active arm)
trial_node = arms[arms.agent != 'placebo'].groupby('nct')['node'].agg(lambda s: s.mode().iat[0] if len(s.mode()) else s.iat[0])
cov['node'] = trial_node
covf = cov[cov.node.notna()]

print('=== transitivity table: covariate distribution by node (mean across trials) ===')
agg = covf.groupby('node').agg(k=('age', 'size'), age=('age', 'mean'), bmi=('bmi', 'mean'),
                               baseline_wt=('baseline_wt', 'mean'), hba1c=('hba1c', 'mean'))
print(agg.round(1).to_string())

print('\n=== population mix by node (HbA1c-derived) ===')
pm = covf.groupby(['node', 'population']).size().unstack(fill_value=0)
print(pm.to_string())

# flag the oral-semaglutide mixing the panel named
oral = covf[covf.node == 'semaglutide-oral']
if len(oral):
    print('\n=== semaglutide-oral node (panel weakness #6: T2D vs obesity mixing) ===')
    print(oral[['hba1c', 'population', 'bmi']].round(1).to_string())
    print(f"  -> HbA1c range {oral.hba1c.min():.1f}-{oral.hba1c.max():.1f}; "
          f"populations present: {sorted(oral.population.unique())}")

cov.reset_index().to_csv(f'{ROOT}/transitivity.csv', index=False)
json.dump(agg.round(2).reset_index().to_dict('records'), open(f'{ROOT}/transitivity.json', 'w'), indent=1)
print('\nwrote transitivity.csv, transitivity.json')
