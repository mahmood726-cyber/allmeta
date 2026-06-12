"""Wire the AACT-extracted obesity cohort into a rapidmeta-kit config, so the full
attested SR workflow (screening, RoB-2, GRADE SoF, CINeMA, PRISMA) wraps our
synthesis core. Reads arms_full.csv (+ candidates.csv) and writes rapidmeta_config.json.

Each non-placebo arm becomes a continuous outcome with md = (active - placebo) mean
% weight change and se = sqrt(var_active + var_placebo). rob is left at 'some-concerns'
for human attestation via the dashboard's rob2-autofill panel.
"""
import io, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')

arms = pd.read_csv(f'{ROOT}/arms_full.csv')
cand = pd.read_csv(f'{ROOT}/candidates.csv').set_index('nct')
ncts = sorted(arms['nct'].unique())

st = load_table('studies', location=LOC, columns=['nct_id', 'acronym', 'brief_title', 'start_date', 'phase'])
st = st[st['nct_id'].isin(ncts)].set_index('nct_id')


def trial_name(nct):
    ac = st['acronym'].get(nct) if nct in st.index else None
    if isinstance(ac, str) and ac.strip():
        return ac.strip()
    bt = st['brief_title'].get(nct) if nct in st.index else None
    if isinstance(bt, str) and bt.strip():
        return (bt.strip()[:46] + '...') if len(bt) > 48 else bt.strip()
    return nct


def year(nct):
    sd = st['start_date'].get(nct) if nct in st.index else None
    try:
        return int(str(sd)[:4])
    except Exception:
        return 2022


trials = []
for nct, g in arms.groupby('nct'):
    pl = g[g.agent == 'placebo']
    if pl.empty:
        continue
    pmean, pvar, pN = pl['mean_pct'].iloc[0], pl['var_of_mean'].iloc[0], pl['n'].iloc[0]
    if pd.isna(pvar):
        continue
    outs = []
    maxN = pN if pd.notna(pN) else None
    for _, r in g[g.agent != 'placebo'].sort_values('dose_mg').iterrows():
        if pd.isna(r['var_of_mean']):
            continue
        md = round(float(r['mean_pct'] - pmean), 2)            # active - placebo (negative favours active)
        se = round(float(math.sqrt(r['var_of_mean'] + pvar)), 3)
        outs.append({'shortLabel': f"{r['agent']} {r['dose_mg']:g} mg",
                     'title': f"% body-weight change: {r['agent']} {r['dose_mg']:g} mg vs placebo",
                     'type': 'continuous', 'md': md, 'se': se,
                     'estimandType': f"{r['dose_mg']:g} mg {r['schedule']}"})
        if pd.notna(r['n']):
            maxN = max(maxN or 0, r['n'])
    if not outs:
        continue
    trials.append({
        'nct': nct, 'name': trial_name(nct),
        'phase': str(cand['phase'].get(nct, 'II')).replace('PHASE', '') or 'II',
        'year': year(nct),
        'tN': int(maxN) if maxN else None, 'cN': int(pN) if pd.notna(pN) else None,
        'group': 'Incretin agonist vs placebo',
        'allOutcomes': outs,
        'rob': ['some-concerns'] * 5,   # placeholder -> human attests via rob2-autofill
    })

config = {
    'drug': 'Incretin receptor agonists',
    'drug_lower': 'incretin receptor agonists',
    'slug': 'incretin_obesity_dr_nma',
    'condition': 'obesity',
    'comparator': 'Placebo',
    'title': 'Incretin receptor agonists for obesity - dose-response network meta-analysis',
    'hero_h2': 'Dose-response NMA of GLP-1 / GIP / glucagon agonists for weight loss in obesity',
    'nyt_headline': 'Newer obesity drugs ranked by dose and weight loss',
    'pico': {
        'pop': 'Adults with obesity or overweight',
        'int': 'GLP-1, GIP and glucagon receptor agonists (dose-ranging)',
        'comp': 'Placebo',
        'out': 'Percent change in body weight',
        'subgroup': 'By agent and by dose',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
}
json.dump(config, open(f'{ROOT}/rapidmeta_config.json', 'w'), indent=1)
print(f'wrote rapidmeta_config.json: {len(trials)} trials, '
      f'{sum(len(t["allOutcomes"]) for t in trials)} continuous arm-outcomes')
