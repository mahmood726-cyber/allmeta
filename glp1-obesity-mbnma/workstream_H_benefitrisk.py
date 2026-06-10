"""Workstream H: benefit-risk — pair % weight loss with GI adverse events (nausea) per node,
registry-native from AACT reported_events. A direction modern metas take (CINeMA benefit-risk)
that literature metas rarely do at arm level. AACT-only.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
ncts = sorted(arms.nct.unique())
ALIAS = {'semaglutide': ['semaglutide', 'nn9535'], 'tirzepatide': ['tirzepatide', 'ly3298176'],
         'retatrutide': ['retatrutide', 'ly3437943'], 'orforglipron': ['orforglipron', 'ly3502970'],
         'survodutide': ['survodutide', 'bi 456906'], 'mazdutide': ['mazdutide', 'ibi362'],
         'cagrilintide': ['cagrilintide'], 'danuglipron': ['danuglipron', 'pf-06882961']}
A2 = {a: g for g, al in ALIAS.items() for a in al}


def node_of_title(title):
    t = (title or '').lower()
    if 'placebo' in t and not any(a in t for a in A2):
        return 'placebo'
    if 'pooled' in t:
        return None
    ag = next((A2[a] for a in A2 if a in t), None)
    if not ag:
        return None
    m = re.findall(r'(\d+(?:\.\d+)?)\s*mg', t)
    dose = max(float(x) for x in m) if m else None
    if ag == 'semaglutide':
        sched = 'daily' if re.search(r'daily|qd|oral|tablet', t) else 'weekly'
        return 'semaglutide-sc-weekly' if sched == 'weekly' else ('semaglutide-oral' if (dose or 0) >= 3 else 'semaglutide-sc-daily')
    return ag


re_ = load_table('reported_events', location=LOC,
                 columns=['nct_id', 'ctgov_group_code', 'adverse_event_term', 'subjects_affected', 'subjects_at_risk'])
re_ = re_[re_.nct_id.isin(ncts) & re_.adverse_event_term.str.contains('nausea', case=False, na=False)]
rg = load_table('result_groups', location=LOC, columns=['nct_id', 'ctgov_group_code', 'result_type', 'title'])
rg = rg[rg.nct_id.isin(ncts)]
rgmap = {(r.nct_id, r.ctgov_group_code): r.title for r in rg.itertuples()}

rows = []
for r in re_.itertuples():
    title = rgmap.get((r.nct_id, r.ctgov_group_code))
    nd = node_of_title(title)
    if nd is None or pd.isna(r.subjects_at_risk) or r.subjects_at_risk in (0, None):
        continue
    rows.append({'nct': r.nct_id, 'node': nd, 'aff': float(r.subjects_affected or 0), 'risk': float(r.subjects_at_risk)})
ae = pd.DataFrame(rows)
# pool nausea incidence per node (sum affected / sum at-risk across that node's active arms)
naus = ae[ae.node != 'placebo'].groupby('node').agg(aff=('aff', 'sum'), atrisk=('risk', 'sum'))
naus['nausea_pct'] = (100 * naus.aff / naus.atrisk).round(1)
plac = ae[ae.node == 'placebo']
plac_pct = round(100 * plac.aff.sum() / plac.risk.sum(), 1) if len(plac) else float('nan')

# weight-loss effect per node (observed max-dose, >=36wk), reuse simple compute
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))
def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a
eff = {}
for nct, g in arms.groupby('nct'):
    pl = g[g.agent == 'placebo']
    if pl.empty or pd.isna(pl.var_of_mean.iloc[0]):
        continue
    pm = pl.mean_pct.iloc[0]
    for _, r in g[(g.agent != 'placebo') & (g.wk >= 36)].iterrows():
        nd = node_of(r.agent, r.dose_mg, r.schedule)
        eff.setdefault(nd, []).append(pm - r.mean_pct)
effmax = {k: round(max(v), 1) for k, v in eff.items()}

print(f'placebo nausea incidence: {plac_pct}%')
print('\n=== benefit-risk by node: weight loss vs nausea (registry-native) ===')
print(f'{"node":24s} weight-loss(pp)  nausea(%)  net (loss per 10% extra nausea)')
out = []
for nd in sorted(naus.index):
    wl = effmax.get(nd); nz = naus.nausea_pct[nd]
    excess = nz - plac_pct
    ratio = round(wl / (excess / 10), 1) if (wl and excess and excess > 0) else None
    print(f'{nd:24s} {str(wl):>13s}   {nz:>7}   {ratio if ratio is not None else "-"}')
    out.append({'node': nd, 'weight_loss_pp': wl, 'nausea_pct': float(nz), 'nausea_excess_pp': round(excess, 1)})
json.dump({'placebo_nausea_pct': plac_pct, 'nodes': out}, open(f'{ROOT}/benefit_risk.json', 'w'), indent=1)
print('\nwrote benefit_risk.json')
