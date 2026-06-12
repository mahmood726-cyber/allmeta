"""Harvest weight-change effect (active-placebo) + primary MACE HR for the FULL incretin CVOT class
(8 agents) -> class-wide trial-level (surrogate, final-outcome) pairs for proper surrogacy. AACT only.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['exenatide', 'lixisenatide', 'efpeglenatide', 'albiglutide', 'liraglutide', 'dulaglutide',
         'semaglutide', 'tirzepatide']
pat = '|'.join(DRUGS)
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ivh = iv[iv.name.str.contains(pat, case=False, na=False)].copy()
ncts = ivh.nct_id.unique()
ivh['drug'] = ivh.name.str.extract('(' + pat + ')', flags=2)[0].str.lower()
amap = ivh.dropna(subset=['drug']).groupby('nct_id').drug.first()

# --- primary MACE HR per CVOT ---
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title'])
oc = oc[oc.nct_id.isin(ncts)]
oa = load_table('outcome_analyses', location=LOC,
                columns=['nct_id', 'outcome_id', 'param_type', 'param_value', 'ci_lower_limit', 'ci_upper_limit'])
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.str.contains('hazard', case=False, na=False)]
oa = oa.merge(oc[['id', 'title']], left_on='outcome_id', right_on='id', how='left')
PRIM = r'major adverse|mace|cardiovascular|composite|first occurrence|death'
hr = oa[oa.title.str.contains(PRIM, case=False, na=False)].copy()
hr['hrv'] = pd.to_numeric(hr.param_value, errors='coerce')
hr['lo'] = pd.to_numeric(hr.ci_lower_limit, errors='coerce'); hr['hi'] = pd.to_numeric(hr.ci_upper_limit, errors='coerce')
hr = hr[hr.hrv.notna() & hr.lo.notna() & hr.hi.notna() & (hr.lo > 0)]
hr['selhr'] = (np.log(hr.hi) - np.log(hr.lo)) / (2 * 1.959964)
# one per trial: prefer the 3-point MACE / lowest SE
hr['mace3'] = hr.title.str.contains(r'major adverse|mace|composite', case=False, na=False)
hr = hr.sort_values(['mace3', 'selhr'], ascending=[False, True]).drop_duplicates('nct_id')
hr['agent'] = hr.nct_id.map(amap)

# --- weight-change outcome per CVOT (active - placebo), harmonised to % ---
wt = oc[oc.title.str.contains(r'weight', case=False, na=False)
        & ~oc.title.str.contains(r'birth|percentage of partic|proportion|category', case=False, na=False)]
OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num', 'units'])
OM = OM[OM.outcome_id.isin(wt.id)]
rg = load_table('result_groups', location=LOC, columns=['id', 'nct_id', 'title'])
OM = OM.merge(rg[['id', 'title']], left_on='result_group_id', right_on='id', how='left', suffixes=('', '_g'))
OM['ounit'] = OM['units']
OM['val'] = pd.to_numeric(OM.param_value_num, errors='coerce')
OM['is_pl'] = OM.title.str.contains(r'placebo|standard|control', case=False, na=False)

# baseline weight for kg->%
BM = load_table('baseline_measurements', location=LOC, columns=['nct_id', 'title', 'param_value_num', 'units'])
bw = BM[BM.nct_id.isin(ncts) & BM.title.str.contains(r'weight', case=False, na=False)
        & BM.units.str.contains(r'kg|kilo', case=False, na=False)]
def baseline(nct):
    v = pd.to_numeric(bw[bw.nct_id == nct].param_value_num, errors='coerce').dropna()
    v = v[(v > 60) & (v < 140)]
    return float(v.mean()) if len(v) else 92.0

rows = []
for nct in hr.nct_id.unique():
    g = OM[OM.nct_id == nct]
    if g.empty:
        continue
    pl = g[g.is_pl]; ac = g[~g.is_pl]
    if pl.empty or ac.empty:
        continue
    unit = str(g.ounit.iloc[0]).lower()
    is_pct = 'percent' in unit or '%' in unit
    # take the most-negative active arm (approved/max dose) vs placebo mean
    a = ac.val.min(); p = pl.val.mean()
    dv = a - p
    bl = baseline(nct)
    dwpct = dv if is_pct else dv / bl * 100.0
    h = hr[hr.nct_id == nct].iloc[0]
    rows.append({'nct': nct, 'agent': h.agent, 'dweight_pct': round(float(dwpct), 2),
                 'unit': 'pct' if is_pct else 'kg', 'baseline_kg': round(bl, 1),
                 'hr': round(float(h.hrv), 3), 'logHR': round(float(np.log(h.hrv)), 4),
                 'se_logHR': round(float(h.selhr), 4), 'mace_title': str(h.title)[:50]})
df = pd.DataFrame(rows)
print(f'CVOTs with a MACE HR: {hr.nct_id.nunique()};  with BOTH HR and weight effect: {len(df)}')
print(df[['nct', 'agent', 'dweight_pct', 'unit', 'hr', 'se_logHR']].to_string(index=False))
print(f"\nagents covered: {sorted(df.agent.dropna().unique())}  ({df.agent.nunique()} agents)")
df.to_csv(f'{ROOT}/class_surrogate_pairs.csv', index=False)
print('wrote class_surrogate_pairs.csv')
