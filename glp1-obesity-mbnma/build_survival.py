"""Time-to-event arm: pull incretin survival/HR outcomes from AACT, identify the clinically-hard
endpoints (CV/renal/MACE/death), and assess KM-curve reconstructability (for registry-ipd) vs
reported-HR-only. Builds the registry-native survival summary alongside the weight-loss MBNMA.
AACT only.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
AGENTS = ['semaglutide', 'tirzepatide', 'dulaglutide', 'liraglutide', 'retatrutide', 'orforglipron', 'mazdutide']

iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
iv['n'] = iv.name.str.lower().fillna('')
nct_agent = {}
for a in AGENTS:
    for n in iv[iv.n.str.contains(a, na=False)].nct_id.unique():
        nct_agent.setdefault(n, a)        # first agent
ncts = set(nct_agent)

oa = load_table('outcome_analyses', location=LOC,
                columns=['nct_id', 'outcome_id', 'param_type', 'param_value', 'ci_lower_limit', 'ci_upper_limit', 'p_value'])
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.astype(str).str.contains('Hazard', case=False, na=False)].copy()
out = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'time_frame'])
out = out[out.nct_id.isin(ncts)].set_index('id')
oa['title'] = oa.outcome_id.map(lambda i: out['title'].get(i, '') if i in out.index else '')
oa['agent'] = oa.nct_id.map(nct_agent)

HARD = r'cardiovas|mace|myocardial|stroke|cv death|cardiac|heart failure|hospitali|renal|kidney|nephropath|esrd|egfr|death|mortalit|major adverse'
hard = oa[oa.title.str.contains(HARD, case=False, na=False)].copy()
hard['hr'] = pd.to_numeric(hard.param_value, errors='coerce')
hard = hard[hard.hr.notna() & (hard.hr > 0)]
print(f'incretin trials with a HARD-outcome HR in AACT: {hard.nct_id.nunique()} trials, {len(hard)} HR rows')
print('\n=== hard-outcome HRs by agent (registry-native survival signal) ===')
for ag, g in hard.groupby('agent'):
    hrs = g.hr.values
    print(f'  {ag:13s} {g.nct_id.nunique()} trials, {len(hrs)} HRs; median HR {np.median(hrs):.2f} '
          f'(range {hrs.min():.2f}-{hrs.max():.2f})')

# show the marquee CVOT/renal HRs
print('\n=== marquee hard-outcome HRs (HR<1 = benefit) ===')
mq = hard[hard.title.str.contains('major adverse|mace|cardiovascular death|kidney|renal|heart failure', case=False, na=False)]
for r in mq.sort_values('hr').head(14).itertuples():
    ci = f'({r.ci_lower_limit},{r.ci_upper_limit})' if pd.notna(r.ci_lower_limit) else ''
    print(f'  {r.agent:12s} {str(r.nct_id)} HR={r.hr:.2f} {ci}  {str(r.title)[:52]}')

# KM-curve reconstructability: do these trials post survival PROBABILITY at multiple timepoints?
om = load_table('outcome_measurements', location=LOC, columns=['nct_id', 'outcome_id', 'param_type', 'units'])
om = om[om.nct_id.isin(set(hard.nct_id))]
km_like = om[om.param_type.astype(str).str.contains('Number|Median', case=False, na=False)
             | om.units.astype(str).str.contains('probab|percent.*surviv|km', case=False, na=False)]
print(f'\nKM-reconstructability: of {hard.nct_id.nunique()} hard-outcome trials, '
      f'{km_like.nct_id.nunique()} post curve-like measurements (registry-ipd reconstruct candidates);')
print('the rest are reported-HR-only -> pooled directly. (AACT rarely stores full KM curves -> reconstruction')
print(' applies to the curve-posting subset; the survival NMA pools the reported HRs for the rest.)')

hard[['nct_id', 'agent', 'hr', 'ci_lower_limit', 'ci_upper_limit', 'title']].to_csv(f'{ROOT}/survival_hrs.csv', index=False)
json.dump({'hard_outcome_trials': int(hard.nct_id.nunique()), 'hr_rows': int(len(hard)),
           'by_agent': {ag: {'trials': int(g.nct_id.nunique()), 'median_hr': round(float(np.median(g.hr)), 2)}
                        for ag, g in hard.groupby('agent')},
           'km_reconstruct_candidates': int(km_like.nct_id.nunique())},
          open(f'{ROOT}/survival_summary.json', 'w'), indent=1)
print('\nwrote survival_hrs.csv, survival_summary.json')
