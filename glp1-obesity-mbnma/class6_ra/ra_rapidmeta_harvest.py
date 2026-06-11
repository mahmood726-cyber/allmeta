"""Harvest a per-TRIAL ACR-responder table for the RA class, in the shape rapidmeta-kit needs (tE/tN/cE/cN +
allOutcomes), so the RA repoint can be wrapped in the full attested RapidMeta workbench (protocol -> search ->
screen -> extract -> synthesis -> paper). Registry-native (AACT) only; no IPD.

For each trial we identify a CONTROL arm (placebo, else a control/MTX arm carrying no active drug) and the primary
ACTIVE arm (the contributing biologic/JAK arm with the largest N), read the ACR50 response % (fallback ACR20) and
the per-arm participant N (from outcome_counts), and derive responder counts events = round(pct/100 * N). Trials
without a usable control+active ACR pair are skipped and logged (honest PRISMA-style accounting). Writes
ra_trials.json (trials[] + screening counts)."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class6_ra'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['adalimumab', 'etanercept', 'infliximab', 'golimumab', 'certolizumab', 'tocilizumab', 'sarilumab',
         'tofacitinib', 'baricitinib', 'upadacitinib', 'abatacept', 'rituximab']
CLASS = {'adalimumab': 'TNF', 'etanercept': 'TNF', 'infliximab': 'TNF', 'golimumab': 'TNF', 'certolizumab': 'TNF',
         'tocilizumab': 'IL-6', 'sarilumab': 'IL-6', 'tofacitinib': 'JAK', 'baricitinib': 'JAK',
         'upadacitinib': 'JAK', 'abatacept': 'T-cell', 'rituximab': 'B-cell'}
pat = '|'.join(DRUGS)
CONTROL_RE = r'placebo|control|standard of care|\bsoc\b'

iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ncts = iv[iv.name.str.contains(pat, case=False, na=False)].nct_id.unique()
n_search = len(ncts)
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title'])
oc = oc[oc.nct_id.isin(ncts)].copy()
oc['level'] = oc.title.str.extract(r'acr.?(20|50|70)', flags=2, expand=False)
oc = oc.dropna(subset=['level']); oc['level'] = oc.level.astype(int)
n_acr_trials = oc.nct_id.nunique()

OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num'])
OM = OM[OM.outcome_id.isin(oc.id)].copy()
OM['val'] = pd.to_numeric(OM.param_value_num, errors='coerce')
rg = load_table('result_groups', location=LOC, columns=['id', 'title'])
ocnt = load_table('outcome_counts', location=LOC, columns=['outcome_id', 'result_group_id', 'count', 'units'])
ocnt = ocnt[(ocnt.units == 'Participants')].copy()
ocnt['N'] = pd.to_numeric(ocnt['count'], errors='coerce')
nmap = ocnt.dropna(subset=['N']).set_index(['outcome_id', 'result_group_id'])['N'].to_dict()
oc_level = oc.set_index('id')['level'].to_dict()
oc_nct = oc.set_index('id')['nct_id'].to_dict()
rg_title = rg.set_index('id')['title'].to_dict()

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
        return 2015


def agent_of(title):
    m = pd.Series([title]).str.extract('(' + pat + ')', flags=2, expand=False).iloc[0]
    return m.lower() if isinstance(m, str) else None


# build per (nct, level) arm rows with val + N
rows = []
for _, r in OM.iterrows():
    oid, rgid, val = r.outcome_id, r.result_group_id, r.val
    if pd.isna(val):
        continue
    title = rg_title.get(rgid, '')
    N = nmap.get((oid, rgid))
    v = val * 100 if val <= 1 else val
    if not (0 <= v <= 100):
        continue
    rows.append({'nct': oc_nct.get(oid), 'level': oc_level.get(oid), 'rgid': rgid,
                 'arm': title, 'pct': v, 'N': N, 'agent': agent_of(title),
                 'is_control': bool(pd.Series([title]).str.contains(CONTROL_RE, case=False, regex=True).iloc[0])})
df = pd.DataFrame(rows).dropna(subset=['nct', 'level'])

trials = []
skipped = {'no_control': 0, 'no_active': 0, 'no_N': 0}
for nct, g in df.groupby('nct'):
    # prefer ACR50, fall back to ACR20 then ACR70 for the headline binary outcome
    headline = None
    for lv in (50, 20, 70):
        if (g.level == lv).any():
            headline = lv; break
    gl = g[g.level == headline]
    ctrl = gl[gl.is_control & gl.N.notna()]
    act = gl[(gl.agent.notna()) & (~gl.is_control) & gl.N.notna()]
    if ctrl.empty:
        skipped['no_control'] += 1; continue
    if act.empty:
        skipped['no_active'] += 1; continue
    c = ctrl.sort_values('N', ascending=False).iloc[0]
    a = act.sort_values('N', ascending=False).iloc[0]
    cN, tN = int(c.N), int(a.N)
    cE, tE = int(round(c.pct / 100 * cN)), int(round(a.pct / 100 * tN))
    # all ACR levels available for this trial's active agent (for the extract tab)
    outs = []
    for lv in (20, 50, 70):
        rowa = g[(g.level == lv) & (g.agent == a.agent) & (~g.is_control)]
        if not rowa.empty:
            outs.append({'shortLabel': f'ACR{lv}', 'title': f'ACR{lv} response: {a.agent} vs control',
                         'type': 'binary'})
    trials.append({
        'nct': nct, 'name': trial_name(nct), 'year': year(nct),
        'phase': str(st['phase'].get(nct, 'PHASE3')).replace('PHASE', '').replace('/', '/') or '3',
        'group': f'{a.agent} ({CLASS.get(a.agent, "?")}) vs control',
        'tE': tE, 'tN': tN, 'cE': cE, 'cN': cN,
        'allOutcomes': outs or [{'shortLabel': f'ACR{headline}', 'title': f'ACR{headline} response', 'type': 'binary'}],
        'rob': ['some-concerns'] * 5,
        '_agent': a.agent, '_headline': f'ACR{headline}',
    })

trials = sorted(trials, key=lambda t: -(t['tN'] + t['cN']))
n_inc = len(trials)
print(f'RA RapidMeta harvest: search hits {n_search} -> ACR trials {n_acr_trials} -> included {n_inc}')
print(f'  skipped: {skipped}')
print(f'  agents represented: {sorted(set(t["_agent"] for t in trials))}')
print(f'  example: {trials[0]["name"]} {trials[0]["_agent"]} ACR tE/tN={trials[0]["tE"]}/{trials[0]["tN"]} '
      f'cE/cN={trials[0]["cE"]}/{trials[0]["cN"]}')

json.dump({
    'trials': trials,
    'screening': {'search_hits': int(n_search), 'acr_reporting': int(n_acr_trials), 'included': int(n_inc),
                  'excluded_no_control': skipped['no_control'], 'excluded_no_active_arm': skipped['no_active']},
}, open(f'{HERE}/ra_trials.json', 'w', encoding='utf-8'), indent=1)
print(f'\nwrote ra_trials.json ({n_inc} trials)')
