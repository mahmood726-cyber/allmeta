"""Harvest the WEIGHT-CHANGE secondary outcome from the incretin CVOT trials (same trials that report the
CV HR) -> true within-trial (surrogate=weight, final=CV-HR) pairs for trial-level surrogacy. AACT only.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
hrs = pd.read_csv(f'{ROOT}/survival_hrs.csv')
ncts = sorted(hrs.nct_id.unique())
print(f'CVOT trials: {len(ncts)} ({", ".join(ncts)})')

OUT = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'param_type', 'units', 'time_frame'])
OUT = OUT[OUT.nct_id.isin(ncts)]
WT = OUT[OUT.title.str.contains(r'weight|body.?weight|body.?mass', case=False, na=False)
         & ~OUT.title.str.contains(r'birth|loss of|percentage of participants|proportion', case=False, na=False)]
print(f'\nweight-related outcomes found in CVOTs: {len(WT)}')
for _, r in WT.iterrows():
    print(f'  {r.nct_id}  [{r.param_type}|{r.units}]  {r.title[:70]}')

# pull the measurements for those outcome ids (mean change by arm)
OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num', 'units', 'dispersion_value_num'])
OM = OM[OM.outcome_id.isin(WT.id)]
print(f'\nweight measurements rows: {len(OM)}')
WT[['id', 'nct_id', 'title', 'param_type', 'units']].to_csv(f'{ROOT}/cvot_weight_outcomes.csv', index=False)
OM.to_csv(f'{ROOT}/cvot_weight_measurements.csv', index=False)
print('wrote cvot_weight_outcomes.csv + cvot_weight_measurements.csv')
