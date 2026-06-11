"""GENERALITY TEST - repoint the registry-native pipeline to a SECOND drug class: PCSK9 inhibitors.
Harvests (1) LDL-C % change effect (active-placebo) per agent for the efficacy NMA, and (2) the
LDL-reduction + MACE-HR pairs from the PCSK9 CV-outcome trials, for the surrogate test. The headline:
LDL-C is an ESTABLISHED validated CV surrogate, so the SAME method that found weight loss is NOT a
surrogate should find LDL IS -> differential validation that the method discriminates. AACT only."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['evolocumab', 'alirocumab', 'inclisiran', 'bococizumab']
pat = '|'.join(DRUGS)
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ivh = iv[iv.name.str.contains(pat, case=False, na=False)].copy()
ncts = ivh.nct_id.unique()
ivh['drug'] = ivh.name.str.extract('(' + pat + ')', flags=2)[0].str.lower()
amap = ivh.dropna(subset=['drug']).groupby('nct_id').drug.first()

oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'units'])
oc = oc[oc.nct_id.isin(ncts)]
# LDL % change outcomes
ldlo = oc[oc.title.str.contains(r'ldl|low.?density', case=False, na=False)
          & oc.title.str.contains(r'percent|change|%', case=False, na=False)
          & ~oc.title.str.contains(r'proportion|percentage of partic|goal|<|achiev', case=False, na=False)]
OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num', 'units'])
OM = OM[OM.outcome_id.isin(ldlo.id)]
rg = load_table('result_groups', location=LOC, columns=['id', 'nct_id', 'title'])
OM = OM.merge(rg[['id', 'title']], left_on='result_group_id', right_on='id', how='left', suffixes=('', '_g'))
OM['val'] = pd.to_numeric(OM.param_value_num, errors='coerce')
OM['is_pl'] = OM.title.str.contains(r'placebo|standard|control', case=False, na=False)
OM['ounit'] = OM['units']

# LDL effect (active - placebo, % change) per trial; keep % units only
rows = []
for nct in ldlo.nct_id.unique():
    g = OM[OM.nct_id == nct]
    if g.empty:
        continue
    un = str(g.ounit.iloc[0]).lower()
    if 'percent' not in un and '%' not in un:
        continue
    pl, ac = g[g.is_pl], g[~g.is_pl]
    if pl.empty or ac.empty:
        continue
    dv = ac.val.min() - pl.val.mean()         # most-lowering active arm vs placebo (more negative = more LDL drop)
    if not np.isfinite(dv) or dv > 5 or dv < -90:
        continue
    rows.append({'nct': nct, 'agent': amap.get(nct), 'ldl_pct': round(float(dv), 1)})
ldl = pd.DataFrame(rows).dropna(subset=['agent'])
print(f'LDL-effect trials harvested: {len(ldl)} across {ldl.agent.nunique()} agents')
print('  median LDL % change by agent (active-placebo):')
for a, gg in ldl.groupby('agent'):
    print(f'    {a:12s} {gg.ldl_pct.median():6.1f}%  (k={len(gg)})')
ldl.to_csv(f'{HERE}/pcsk9_ldl.csv', index=False)

# CV MACE HRs
oa = load_table('outcome_analyses', location=LOC,
                columns=['nct_id', 'outcome_id', 'param_type', 'param_value', 'ci_lower_limit', 'ci_upper_limit'])
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.str.contains('hazard', case=False, na=False)].merge(
    oc[['id', 'title']], left_on='outcome_id', right_on='id', how='left')
PRIM = r'major adverse|mace|cardiovascular|composite|first occurrence|myocardial'
cv = oa[oa.title.str.contains(PRIM, case=False, na=False)].copy()
cv['hr'] = pd.to_numeric(cv.param_value, errors='coerce')
cv['lo'] = pd.to_numeric(cv.ci_lower_limit, errors='coerce'); cv['hi'] = pd.to_numeric(cv.ci_upper_limit, errors='coerce')
cv = cv[cv.hr.notna() & cv.lo.notna() & (cv.lo > 0) & (cv.hr.between(0.3, 1.3))]
cv['selhr'] = (np.log(cv.hi) - np.log(cv.lo)) / (2 * 1.959964)
cv = cv.sort_values('selhr').drop_duplicates('nct_id'); cv['agent'] = cv.nct_id.map(amap)
ldlmap = ldl.set_index('nct').ldl_pct.to_dict()
pairs = []
for _, r in cv.iterrows():
    pairs.append({'nct': r.nct_id, 'agent': r.agent, 'hr': round(float(r.hr), 3),
                  'se_logHR': round(float(r.selhr), 4), 'ldl_pct': ldlmap.get(r.nct_id), 'title': str(r.title)[:46]})
pd.DataFrame(pairs).to_csv(f'{HERE}/pcsk9_pairs.csv', index=False)
print(f'\nCV-outcome trials (LDL + MACE HR pairs):')
for p in pairs:
    print(f"  {p['nct']} {p['agent']:12s} LDL {str(p['ldl_pct'])+'%':>7s}  MACE HR {p['hr']}  ({p['title']})")
print('\nwrote pcsk9_ldl.csv + pcsk9_pairs.csv')
