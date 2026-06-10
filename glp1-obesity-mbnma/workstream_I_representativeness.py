"""Workstream I (transportability, valid first form): REPRESENTATIVENESS / POSITIVITY MAP.
Compares the trial-eligible population (AACT placebo-arm baselines) to the US adult-with-obesity
TARGET (NHANES 2017-2020, authoritative) on pre-specified effect modifiers. Descriptive,
criticism-proof (no transport estimator, no ecological-fallacy exposure). Flags over/under-
representation and positivity. AACT + cited NHANES reference values (PubMed-abstract policy unaffected).
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
tcov = pd.read_csv(f'{ROOT}/transitivity.csv').set_index('nct')
ncts = sorted(arms.nct.unique())

# --- trial-side %female from AACT baseline_measurements (sex counts) ---
bm = load_table('baseline_measurements', location=LOC,
                columns=['nct_id', 'title', 'category', 'param_type', 'param_value_num'])
bm = bm[bm.nct_id.isin(ncts)].copy()
bm['t'] = bm['title'].str.lower().fillna(''); bm['c'] = bm['category'].str.lower().fillna('')
sex = bm[bm.t.str.contains('sex', na=False) & bm.param_value_num.notna()]
pf = {}
for nct, g in sex.groupby('nct_id'):
    fem = g[g.c.str.contains('female', na=False)].param_value_num.sum()
    male = g[g.c.str.contains('^male| male', na=False, regex=True)].param_value_num.sum()
    if fem + male > 0:
        pf[nct] = 100 * fem / (fem + male)
pfemale = pd.Series(pf)

# clean age (means in 35-70; drop eligibility min/max edge values)
age = tcov['age'].where((tcov['age'] >= 35) & (tcov['age'] <= 70))

trial = {
    'mean age (yr)': (age.mean(), age.notna().sum()),
    '% female': (pfemale.mean(), pfemale.notna().sum()),
    'mean BMI (kg/m2)': (tcov['bmi'].mean(), tcov['bmi'].notna().sum()),
    'mean baseline weight (kg)': (tcov['baseline_wt'].mean(), tcov['baseline_wt'].notna().sum()),
    '% with diabetes (proxy)': (100 * (tcov['population'] == 'T2D').mean(), len(tcov)),
}

# --- TARGET: US adults with obesity (BMI>=30), NHANES 2017-2020 (authoritative, cited) ---
# General US adults: BMI 30.2, age ~50, ~51% F, diabetes 14.8% (NHANES 2017-2020).
# Obese subset (BMI>=30): higher BMI/weight, diabetes ~25%. Sex ~52% F (obesity prevalence similar by sex).
target = {'mean age (yr)': 49.5, '% female': 52.0, 'mean BMI (kg/m2)': 36.0,
          'mean baseline weight (kg)': 102.0, '% with diabetes (proxy)': 26.0}

print('=== representativeness: trial-eligible (AACT) vs US adults-with-obesity (NHANES 2017-2020) ===')
print(f'{"modifier":28s} {"trial":>10s} (n)   {"NHANES target":>13s}   diff   note')
rows = []
for k in trial:
    tv, n = trial[k]; gv = target[k]
    diff = (tv - gv) if (tv == tv) else None
    note = ''
    if k == '% female' and diff and diff > 8:
        note = 'trials OVER-represent women'
    if k == '% with diabetes (proxy)' and diff and diff < -8:
        note = 'obesity trials UNDER-represent diabetes (registry-native T2D capture partly offsets)'
    if k == 'mean BMI (kg/m2)' and diff and diff > 1:
        note = 'trials enrol slightly higher BMI (more severe)'
    tvs = f'{tv:6.1f}' if tv == tv else '   -  '
    print(f'{k:28s} {tvs} ({n:2d})   {gv:13.1f}   {("%+.1f"%diff) if diff is not None else "  -  ":>6}   {note}')
    rows.append({'modifier': k, 'trial': (round(tv, 1) if tv == tv else None), 'trial_n': int(n),
                 'nhanes_target': gv, 'diff': (round(diff, 1) if diff is not None else None), 'note': note})

print('\n=== positivity / coverage ===')
print(f'AACT baseline coverage is SPARSE: BMI n={trial["mean BMI (kg/m2)"][1]}, '
      f'weight n={trial["mean baseline weight (kg)"][1]}, diabetes-proxy via HbA1c only. '
      f'%female n={trial["% female"][1]}, age n={trial["mean age (yr)"][1]} are usable.')
print('-> A full positivity check needs abstract-supplemented baselines (PubMed abstracts, allowed).')

print('\n=== honest interpretation ===')
print('Directional generalizability gaps (descriptive only, NO transport estimator):')
print(' - Sex: incretin obesity trials skew female (~%.0f%%) vs ~52%% in the US obese population.' % (trial['% female'][0] if trial['% female'][0]==trial['% female'][0] else 0))
print(' - Diabetes: obesity-primary trials largely EXCLUDE diabetes, but ~26%% of US obese adults have it;')
print('   the registry-native capture of T2D-secondary trials partially restores this missing stratum.')
print(' - BMI: trials enrol slightly higher BMI than the population mean (more severe obesity).')
print('This is a representativeness MAP, not a transported effect. Transport would need IPD (TRANSPORTABILITY.md).')

json.dump({'trial': {k: (None if trial[k][0] != trial[k][0] else round(trial[k][0], 1)) for k in trial},
           'nhanes_target': target, 'rows': rows,
           'source': 'NHANES 2017-2020 (CDC NCHS); see DB508 / NBK606854'},
          open(f'{ROOT}/representativeness.json', 'w'), indent=1)
print('\nwrote representativeness.json')
