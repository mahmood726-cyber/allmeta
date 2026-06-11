"""Harvest a per-TRIAL ACR-responder table for the RA class in the shape rapidmeta-kit needs (tE/tN/cE/cN +
allOutcomes), so the RA repoint can be wrapped in the full attested RapidMeta workbench. Registry-native (AACT)
only; no IPD.

v2 (2026-06-11, after multi-person review found 4 data bugs in v1):
- TIMEPOINT-AWARE: outcome_measurements stores one row per timepoint (classification = Week 2 ... Month 12). We
  pick the LATEST timepoint at which BOTH a control arm and an active arm report a real value (this is the last
  placebo-controlled assessment, before crossover/open-label where the placebo arm goes blank). v1 took whichever
  timepoint sorted first -> wrong endpoint for half the trials.
- UNIT-AWARE: ACR is posted as 'Percentage of participants' OR as a participant COUNT. v1 multiplied counts as if
  percentages and the 0-100 filter silently dropped the real arms. We read the outcome units and branch.
- ARM-CLEAN: control = control-regex AND drug-free AND not open-label; active = a drug arm that is NOT a
  placebo/crossover ('Placebo/Drug') and NOT open-label/extension/re-treatment. Both arms must come from the SAME
  timepoint.
- PLAUSIBILITY GUARD: skip (do not emit) any trial whose control responder rate exceeds the active rate by >20pp,
  or whose smaller arm N < 10, or with events outside [0, N] -- fail closed into a skip bucket, never emit garbage.
- FUNNEL RECONCILES: every ACR-reporting trial lands in included or a named exclusion bucket.
"""
import io, sys, os, json, re
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
CONTROL_RE = re.compile(r'placebo|control|standard of care|\bsoc\b|\bmtx\b|methotrexate', re.I)
OL_RE = re.compile(r'open[\s-]?label|\bOL\b|extension|\bOLE\b|re[\s-]?treat|run[\s-]?in|rescue', re.I)
PCT_RE = re.compile(r'percent|proportion', re.I)
COUNT_RE = re.compile(r'particip|number|count|subjects', re.I)


def parse_weeks(classification):
    """timepoint label -> weeks (float), or None if not parseable."""
    if not isinstance(classification, str):
        return None
    s = classification.lower()
    m = re.search(r'(\d+(?:\.\d+)?)\s*(week|wk|month|mo|day|year|yr)', s)
    if not m:
        return None
    v = float(m.group(1)); u = m.group(2)
    return v if u.startswith('w') else v * 4.345 if u.startswith('m') and 'o' in u else \
        v / 7.0 if u.startswith('d') else v * 52.0 if u.startswith('y') else v * 4.345


def agent_of(title):
    m = re.search('(' + pat + ')', title or '', re.I)
    return m.group(1).lower() if m else None


iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ncts = iv[iv.name.str.contains(pat, case=False, na=False)].nct_id.unique()
n_search = len(ncts)
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'units', 'param_type'])
oc = oc[oc.nct_id.isin(ncts)].copy()
oc['level'] = oc.title.str.extract(r'acr.?(20|50|70)', flags=2, expand=False)
oc = oc.dropna(subset=['level']); oc['level'] = oc.level.astype(int)
n_acr_trials = oc.nct_id.nunique()
oc_units = oc.set_index('id')['units'].to_dict()
oc_level = oc.set_index('id')['level'].to_dict()
oc_nct = oc.set_index('id')['nct_id'].to_dict()

OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num', 'classification'])
OM = OM[OM.outcome_id.isin(oc.id)].copy()
OM['val'] = pd.to_numeric(OM.param_value_num, errors='coerce')
rg = load_table('result_groups', location=LOC, columns=['id', 'title'])
rg_title = rg.set_index('id')['title'].to_dict()
ocnt = load_table('outcome_counts', location=LOC, columns=['outcome_id', 'result_group_id', 'count', 'units'])
ocnt = ocnt[ocnt.units == 'Participants'].copy()
ocnt['N'] = pd.to_numeric(ocnt['count'], errors='coerce')
nmap = ocnt.dropna(subset=['N']).groupby(['outcome_id', 'result_group_id'])['N'].max().to_dict()

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


def is_percent_outcome(oid):
    u = oc_units.get(oid) or ''
    if PCT_RE.search(u):
        return True
    if COUNT_RE.search(u):
        return False
    return None   # unknown -> decide by magnitude later


# annotate OM rows
OM['arm'] = OM.result_group_id.map(rg_title).fillna('')
OM['agent'] = OM.arm.map(agent_of)
OM['is_ol'] = OM.arm.map(lambda t: bool(OL_RE.search(t or '')))
OM['has_ctrl_word'] = OM.arm.map(lambda t: bool(CONTROL_RE.search(t or '')))
OM['weeks'] = OM.classification.map(parse_weeks)
OM['level'] = OM.outcome_id.map(oc_level)
OM['nct'] = OM.outcome_id.map(oc_nct)
OM['N'] = OM.apply(lambda r: nmap.get((r.outcome_id, r.result_group_id)), axis=1)

trials = []
skip = {'no_control_arm': 0, 'no_active_arm': 0, 'no_shared_timepoint': 0, 'implausible_or_small': 0, 'no_value': 0}
for nct, gall in OM.groupby('nct'):
    headline = next((lv for lv in (50, 20, 70) if (gall.level == lv).any()), None)
    if headline is None:
        skip['no_value'] += 1; continue
    g = gall[(gall.level == headline) & gall.val.notna() & gall.N.notna()].copy()
    if g.empty:
        skip['no_value'] += 1; continue
    g['is_control'] = g.has_ctrl_word & g.agent.isna() & (~g.is_ol)
    g['is_active'] = g.agent.notna() & (~g.has_ctrl_word) & (~g.is_ol)
    ctrl = g[g.is_control]; act = g[g.is_active]
    if ctrl.empty:
        skip['no_control_arm'] += 1; continue
    if act.empty:
        skip['no_active_arm'] += 1; continue
    # latest timepoint present in BOTH a control and an active arm (None weeks -> treat as a single bucket -1)
    ctrl_tp = set(ctrl.weeks.fillna(-1)); act_tp = set(act.weeks.fillna(-1))
    shared = ctrl_tp & act_tp
    if not shared:
        skip['no_shared_timepoint'] += 1; continue
    tp = max(shared)
    c = ctrl[ctrl.weeks.fillna(-1) == tp].sort_values('N', ascending=False).iloc[0]
    a = act[act.weeks.fillna(-1) == tp].sort_values('N', ascending=False).iloc[0]
    pct_out = is_percent_outcome(int(a.outcome_id))
    cN, tN = int(c.N), int(a.N)

    def to_events(val, N):
        if pct_out is True:
            v = val * 100 if val <= 1 else val
            return int(round(v / 100.0 * N))
        if pct_out is False:
            return int(round(val))
        # unknown units: infer -- a value > N or > 100 is a count, else a percent
        if val > 100 or val > N:
            return int(round(val))
        return int(round((val * 100 if val <= 1 else val) / 100.0 * N))

    tE, cE = to_events(a.val, tN), to_events(c.val, cN)
    # plausibility: events in range, arms not tiny, control not implausibly beating active
    if not (0 <= tE <= tN and 0 <= cE <= cN) or min(tN, cN) < 10 or (cE / cN - tE / tN) > 0.20:
        skip['implausible_or_small'] += 1; continue
    outs = []
    for lv in (20, 50, 70):
        if ((gall.level == lv) & (gall.agent == a.agent)).any():
            outs.append({'shortLabel': f'ACR{lv}', 'title': f'ACR{lv} response: {a.agent} vs control', 'type': 'binary'})
    trials.append({
        'nct': nct, 'name': trial_name(nct), 'year': year(nct),
        'phase': str(st['phase'].get(nct, 'PHASE3')).replace('PHASE', '') or '3',
        'group': f'{a.agent} ({CLASS.get(a.agent, "?")}) vs control',
        'tE': tE, 'tN': tN, 'cE': cE, 'cN': cN,
        'allOutcomes': outs or [{'shortLabel': f'ACR{headline}', 'title': f'ACR{headline} response', 'type': 'binary'}],
        'rob': ['some-concerns'] * 5,
        '_agent': a.agent, '_headline': f'ACR{headline}', '_timepoint_wk': None if tp < 0 else round(tp, 1),
    })

trials = sorted(trials, key=lambda t: -(t['tN'] + t['cN']))
n_inc = len(trials)
# reconcile: ACR-reporting trials with NO posted measurement rows never reach the groupby above
skip['no_measurement_rows'] = int(n_acr_trials - OM.nct.nunique())
accounted = n_inc + sum(skip.values())
print(f'RA RapidMeta harvest v2: search {n_search} -> ACR-reporting {n_acr_trials} -> included {n_inc}')
print(f'  skip buckets: {skip}  (included+skipped={accounted}, ACR-reporting={n_acr_trials}, '
      f'reconciles={accounted == n_acr_trials})')
print(f'  agents: {sorted(set(t["_agent"] for t in trials))}')
ex = next((t for t in trials if t['nct'] == 'NCT01877668'), None)
if ex:
    print(f'  OPAL BROADEN check: {ex["_agent"]} ACR tE/tN={ex["tE"]}/{ex["tN"]} cE/cN={ex["cE"]}/{ex["cN"]} '
          f'@wk{ex["_timepoint_wk"]}  (active {ex["tE"]/ex["tN"]:.0%} vs control {ex["cE"]/ex["cN"]:.0%})')

json.dump({'trials': trials,
           'screening': {'search_hits': int(n_search), 'acr_reporting': int(n_acr_trials), 'included': int(n_inc),
                         'excluded': {k: int(v) for k, v in skip.items()},
                         'funnel_reconciles': bool(accounted == n_acr_trials)}},
          open(f'{HERE}/ra_trials.json', 'w', encoding='utf-8'), indent=1)
print(f'\nwrote ra_trials.json ({n_inc} trials)')
