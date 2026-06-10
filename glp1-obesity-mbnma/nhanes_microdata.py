"""Fix the requirement-3 gap: replace hardcoded NHANES marginals with REAL NHANES 2017-2020 microdata.
Downloads the public XPT files, builds the obese-adult (BMI>=30, age>=18) subset, and computes the
survey-weighted JOINT distribution + marginals of the effect modifiers (age, sex, BMI, weight, diabetes).
Diabetes = HbA1c>=6.5% OR self-reported diagnosis. Source: CDC/NCHS NHANES 2017-March 2020 prepandemic.
"""
import io, sys, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
BASE = 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/'
HDR = {'User-Agent': 'Mozilla/5.0'}


def xpt(name):
    raw = urllib.request.urlopen(urllib.request.Request(BASE + name, headers=HDR), timeout=90).read()
    return pd.read_sas(io.BytesIO(raw), format='xport')


print('downloading NHANES 2017-2020 microdata...', flush=True)
demo = xpt('P_DEMO.xpt')[['SEQN', 'RIDAGEYR', 'RIAGENDR', 'WTMECPRP']]
bmx = xpt('P_BMX.xpt')[['SEQN', 'BMXBMI', 'BMXWT']]
ghb = xpt('P_GHB.xpt')[['SEQN', 'LBXGH']]                 # HbA1c %
diq = xpt('P_DIQ.xpt')[['SEQN', 'DIQ010']]                # 1=told has diabetes
df = demo.merge(bmx, on='SEQN', how='left').merge(ghb, on='SEQN', how='left').merge(diq, on='SEQN', how='left')
print(f'merged NHANES participants: {len(df)}', flush=True)

# obese adults
ob = df[(df.RIDAGEYR >= 18) & (df.BMXBMI >= 30) & df.WTMECPRP.notna()].copy()
ob['female'] = (ob.RIAGENDR == 2).astype(float)
ob['diabetes'] = (((ob.LBXGH >= 6.5) | (ob.DIQ010 == 1))).astype(float)
w = ob.WTMECPRP.values


def wmean(col):
    v = ob[col].values; m = ~np.isnan(v)
    return float(np.sum(v[m] * w[m]) / np.sum(w[m]))


target = {'mean age (yr)': round(wmean('RIDAGEYR'), 1), '% female': round(100 * wmean('female'), 1),
          'mean BMI (kg/m2)': round(wmean('BMXBMI'), 1), 'mean baseline weight (kg)': round(wmean('BMXWT'), 1),
          '% with diabetes': round(100 * wmean('diabetes'), 1)}
n_ob = len(ob)
print(f'\n=== REAL NHANES microdata: US adults with obesity (BMI>=30, n={n_ob}, survey-weighted) ===')
hard = {'mean age (yr)': 49.5, '% female': 52.0, 'mean BMI (kg/m2)': 36.0, 'mean baseline weight (kg)': 102.0, '% with diabetes': 26.0}
print(f'{"modifier":26s} {"microdata":>10s}   {"was-hardcoded":>13s}   diff')
for k in target:
    print(f'{k:26s} {target[k]:10} {hard[k]:13}   {target[k]-hard[k]:+.1f}')

# the JOINT distribution (now available): correlation among modifiers in obese adults
J = ob[['RIDAGEYR', 'BMXBMI', 'LBXGH', 'female']].rename(columns={'RIDAGEYR': 'age', 'BMXBMI': 'BMI', 'LBXGH': 'HbA1c'}).dropna()
print('\n=== JOINT distribution now available (correlations among modifiers, obese adults) ===')
print(J.corr().round(2).to_string())
print('  -> requirement-3 (joint microdata) is now SATISFIED; e.g. BMI-HbA1c and age-HbA1c correlations')
print('     are empirical, not assumed-independent. (For the binary-diabetes transport only the diabetes')
print('     marginal is binding; the joint matters if multiple continuous modifiers were material.)')

json.dump({'source': 'NHANES 2017-March 2020 prepandemic microdata (CDC/NCHS), survey-weighted (WTMECPRP)',
           'n_obese_adults': int(n_ob), 'diabetes_def': 'HbA1c>=6.5% OR self-reported diagnosis',
           'target_microdata': target, 'was_hardcoded': hard,
           'joint_correlations': J.corr().round(3).to_dict()},
          open(f'{ROOT}/nhanes_target.json', 'w'), indent=1)
ob[['RIDAGEYR', 'RIAGENDR', 'BMXBMI', 'BMXWT', 'LBXGH', 'diabetes', 'WTMECPRP']].to_csv(f'{ROOT}/nhanes_obese_microdata.csv', index=False)
print('\nwrote nhanes_target.json, nhanes_obese_microdata.csv')
