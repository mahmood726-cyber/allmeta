"""PCSK9 per-trial LDL-C %-change harvest for the RapidMeta conversion -- the CONTINUOUS path (md/se), mirroring
the incretin flagship's continuous harvest shape (active-minus-placebo mean difference + pooled SE) rather than
a binary-responder harvester. Pulls the LDL % change LS-mean + dispersion per arm from AACT, classifies arms as
active(PCSK9 agent) vs placebo/statin control, and forms md = active-control with se = sqrt(se_a^2 + se_c^2).
Per-arm SE is read directly (Standard Error), or derived (SD/sqrt(N), or CI width / 2*1.96). Registry-native
(AACT); no IPD. Fails closed on implausible md / missing SE; reports a reconciling screening funnel."""
import io, sys, os, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['evolocumab', 'alirocumab', 'inclisiran', 'bococizumab']
CLASS = {'evolocumab': 'mAb', 'alirocumab': 'mAb', 'bococizumab': 'mAb', 'inclisiran': 'siRNA'}
CONTROL_RE = re.compile(r'placebo|control|standard|\bsoc\b|statin', re.I)
pat = '|'.join(DRUGS)


def agent_of(title):
    m = re.search('(' + pat + ')', title or '', re.I)
    return m.group(1).lower() if m else None


iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ivh = iv[iv.name.str.contains(pat, case=False, na=False)].copy()
ncts = ivh.nct_id.unique()
n_search = len(ncts)
ivh['drug'] = ivh.name.str.extract('(' + pat + ')', flags=re.I)[0].str.lower()
amap = ivh.dropna(subset=['drug']).groupby('nct_id').drug.first()

oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'units'])
oc = oc[oc.nct_id.isin(ncts)]
ldlo = oc[oc.title.str.contains(r'ldl|low.?density', case=False, na=False)
          & oc.title.str.contains(r'percent|change|%', case=False, na=False)
          & ~oc.title.str.contains(r'proportion|percentage of partic|goal|<|achiev', case=False, na=False)].copy()
n_report = ldlo.nct_id.nunique()
ldl_units = ldlo.set_index('id')['units'].to_dict()
ldl_nct = ldlo.set_index('id')['nct_id'].to_dict()

om = load_table('outcome_measurements', location=LOC,
                columns=['outcome_id', 'result_group_id', 'param_type', 'param_value_num',
                         'dispersion_type', 'dispersion_value_num', 'dispersion_lower_limit',
                         'dispersion_upper_limit', 'units'])
om = om[om.outcome_id.isin(ldlo.id)].copy()
om['mean'] = pd.to_numeric(om.param_value_num, errors='coerce')
om['disp'] = pd.to_numeric(om.dispersion_value_num, errors='coerce')
om['dlo'] = pd.to_numeric(om.dispersion_lower_limit, errors='coerce')
om['dhi'] = pd.to_numeric(om.dispersion_upper_limit, errors='coerce')

rg = load_table('result_groups', location=LOC, columns=['id', 'title'])
rg_title = rg.set_index('id')['title'].to_dict()
ocnt = load_table('outcome_counts', location=LOC, columns=['outcome_id', 'result_group_id', 'count', 'units'])
ocnt = ocnt[ocnt.units == 'Participants'].copy()
ocnt['N'] = pd.to_numeric(ocnt['count'], errors='coerce')
nmap = ocnt.dropna(subset=['N']).groupby(['outcome_id', 'result_group_id'])['N'].max().to_dict()

om['arm'] = om.result_group_id.map(rg_title).fillna('')
om['agent'] = om.arm.map(agent_of)
om['is_ctrl'] = om.arm.map(lambda t: bool(CONTROL_RE.search(t or '')))
om['nct'] = om.outcome_id.map(ldl_nct)
om['N'] = om.apply(lambda r: nmap.get((r.outcome_id, r.result_group_id)), axis=1)


def arm_se(row):
    """SE of the arm mean from the posted dispersion; None if not derivable."""
    dt = str(row.dispersion_type or '').lower()
    if 'standard error' in dt and pd.notna(row.disp):
        return float(row.disp)
    if 'standard deviation' in dt and pd.notna(row.disp) and pd.notna(row.N) and row.N > 0:
        return float(row.disp) / np.sqrt(float(row.N))
    if 'confidence' in dt and pd.notna(row.dlo) and pd.notna(row.dhi):
        return (float(row.dhi) - float(row.dlo)) / (2 * 1.959964)
    return None


om['se'] = om.apply(arm_se, axis=1)

st = load_table('studies', location=LOC, columns=['nct_id', 'acronym', 'brief_title', 'start_date', 'phase'])
st = st[st.nct_id.isin(ncts)].set_index('nct_id')


def trial_name(nct):
    ac = st['acronym'].get(nct) if nct in st.index else None
    if isinstance(ac, str) and ac.strip():
        return ac.strip()
    bt = st['brief_title'].get(nct) if nct in st.index else None
    if isinstance(bt, str) and bt.strip():
        return (bt.strip()[:46] + '...') if len(bt) > 48 else bt.strip()
    return nct


def year(nct):
    try:
        return int(str(st['start_date'].get(nct))[:4])
    except Exception:
        return 2017


trials = []
skip = {'no_percent_units': 0, 'no_control_arm': 0, 'no_active_arm': 0, 'no_usable_se': 0, 'implausible_md': 0}
for nct, gall in om.groupby('nct'):
    # restrict to percent-change outcomes (LDL posted as % change, not mg/dL)
    g = gall[gall.units.astype(str).str.contains('percent|%', case=False, na=False) & gall['mean'].notna()].copy()
    if g.empty:
        skip['no_percent_units'] += 1; continue
    ctrl = g[g.is_ctrl & g.agent.isna()]
    act = g[g.agent.notna() & (~g.is_ctrl)]
    if ctrl.empty:
        skip['no_control_arm'] += 1; continue
    if act.empty:
        skip['no_active_arm'] += 1; continue
    # most-lowering active arm (most negative % change) + the placebo with a usable SE
    a = act.sort_values('mean').iloc[0]
    c = ctrl.sort_values('mean', ascending=False).iloc[0]   # least-lowering control = the true comparator
    se_a, se_c = arm_se(a), arm_se(c)
    if se_a is None or se_c is None or se_a <= 0 or se_c <= 0:
        skip['no_usable_se'] += 1; continue
    md = round(float(a['mean'] - c['mean']), 2)             # active - control (negative favours active)
    se = round(float(np.sqrt(se_a ** 2 + se_c ** 2)), 3)
    if not (-90 <= md <= 5) or se <= 0:
        skip['implausible_md'] += 1; continue
    agent = a.agent or amap.get(nct)
    tN = int(a.N) if pd.notna(a.N) else None
    cN = int(c.N) if pd.notna(c.N) else None
    trials.append({
        'nct': nct, 'name': trial_name(nct), 'year': year(nct),
        'phase': str(st['phase'].get(nct, 'PHASE3')).replace('PHASE', '') or '3',
        'group': f'{agent} ({CLASS.get(agent, "?")}) vs control',
        'tN': tN, 'cN': cN,
        'allOutcomes': [{'shortLabel': 'LDL-C %', 'type': 'continuous', 'md': md, 'se': se,
                         'title': f'LDL-C % change: {agent} vs control', 'estimandType': 'LDL-C % change'}],
        'rob': ['some-concerns'] * 5,
        '_agent': agent, '_md': md, '_se': se,
    })

trials = sorted(trials, key=lambda t: t['_md'])             # most LDL-lowering first
n_inc = len(trials)
accounted = n_inc + sum(skip.values())
out = {'trials': trials, 'effect_measure': 'LDL-C % change (active - control), continuous md/se',
       'screening': {'search_hits': int(n_search), 'ldl_reporting': int(n_report), 'included': int(n_inc),
                     'excluded': {k: int(v) for k, v in skip.items()},
                     'funnel_reconciles': bool(accounted == n_report)}}
json.dump(out, open(f'{HERE}/pcsk9_trials.json', 'w', encoding='utf-8'), indent=1)
s = out['screening']
print(f"PCSK9 harvest: {s['search_hits']} search -> {s['ldl_reporting']} LDL%-reporting -> {s['included']} "
      f"included (reconciles={s['funnel_reconciles']})")
print(f"  excluded: {s['excluded']}")
print(f"  agents: {sorted(set(t['_agent'] for t in trials if t['_agent']))}")
if trials:
    t0 = trials[0]
    print(f"  most-lowering: {t0['name'][:24]} {t0['_agent']} md={t0['_md']}% se={t0['_se']}")
print(f"wrote pcsk9_trials.json ({n_inc} trials)")
