"""Shared per-TRIAL binary-responder harvester for RapidMeta conversion of the binary/ordinal-responder classes
(RA = ACR ladder, psoriasis = PASI ladder, ...). One audited implementation so the classes can't drift; the
v2 correctness logic (timepoint-aware, unit-aware, arm-clean, fail-closed plausibility, reconciling funnel) lives
HERE only. Registry-native (AACT); no IPD.

Usage (thin per-class wrapper):
    from rm_harvest_binary import harvest_binary_responder
    out = harvest_binary_responder(LOC, drugs=DRUGS, classmap=CLASS,
                                   level_pattern=r'pasi.?(75|90|100)', levels=[90, 75, 100])
    json.dump(out, open('.../X_trials.json', 'w'), indent=1)
"""
import re
import numpy as np, pandas as pd
from aact_kit import load_table

CONTROL_RE = re.compile(r'placebo|control|standard of care|\bsoc\b|\bmtx\b|methotrexate|vehicle', re.I)
OL_RE = re.compile(r'open[\s-]?label|\bOL\b|extension|\bOLE\b|re[\s-]?treat|run[\s-]?in|rescue', re.I)
PCT_RE = re.compile(r'percent|proportion', re.I)
COUNT_RE = re.compile(r'particip|number|count|subjects', re.I)


def parse_weeks(classification):
    if not isinstance(classification, str):
        return None
    m = re.search(r'(\d+(?:\.\d+)?)\s*(week|wk|month|mo|day|year|yr)', classification.lower())
    if not m:
        return None
    v = float(m.group(1)); u = m.group(2)
    return (v if u.startswith('w') else v * 4.345 if (u.startswith('m') and 'o' in u)
            else v / 7.0 if u.startswith('d') else v * 52.0 if u.startswith('y') else v * 4.345)


def harvest_binary_responder(LOC, drugs, classmap, level_pattern, levels, label='resp'):
    pat = '|'.join(drugs)

    def agent_of(title):
        m = re.search('(' + pat + ')', title or '', re.I)
        return m.group(1).lower() if m else None

    iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
    ncts = iv[iv.name.str.contains(pat, case=False, na=False)].nct_id.unique()
    n_search = len(ncts)
    oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'units', 'param_type'])
    oc = oc[oc.nct_id.isin(ncts)].copy()
    oc['level'] = oc.title.str.extract(level_pattern, flags=re.I, expand=False)
    oc = oc.dropna(subset=['level']); oc['level'] = oc.level.astype(int)
    n_report = oc.nct_id.nunique()
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
        return None

    OM['arm'] = OM.result_group_id.map(rg_title).fillna('')
    OM['agent'] = OM.arm.map(agent_of)
    OM['is_ol'] = OM.arm.map(lambda t: bool(OL_RE.search(t or '')))
    OM['has_ctrl_word'] = OM.arm.map(lambda t: bool(CONTROL_RE.search(t or '')))
    OM['weeks'] = OM.classification.map(parse_weeks)
    OM['level'] = OM.outcome_id.map(oc_level)
    OM['nct'] = OM.outcome_id.map(oc_nct)
    OM['N'] = OM.apply(lambda r: nmap.get((r.outcome_id, r.result_group_id)), axis=1)

    trials = []
    skip = {'no_control_arm': 0, 'no_active_arm': 0, 'no_shared_timepoint': 0, 'implausible_or_small': 0,
            'no_value': 0}
    for nct, gall in OM.groupby('nct'):
        headline = next((lv for lv in levels if (gall.level == lv).any()), None)
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
        shared = set(ctrl.weeks.fillna(-1)) & set(act.weeks.fillna(-1))
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
            if val > 100 or val > N:
                return int(round(val))
            return int(round((val * 100 if val <= 1 else val) / 100.0 * N))

        tE, cE = to_events(a.val, tN), to_events(c.val, cN)
        if not (0 <= tE <= tN and 0 <= cE <= cN) or min(tN, cN) < 10 or (cE / cN - tE / tN) > 0.20:
            skip['implausible_or_small'] += 1; continue
        outs = [{'shortLabel': f'{label}{lv}', 'title': f'{label}{lv} response: {a.agent} vs control',
                 'type': 'binary'} for lv in levels if ((gall.level == lv) & (gall.agent == a.agent)).any()]
        trials.append({
            'nct': nct, 'name': trial_name(nct), 'year': year(nct),
            'phase': str(st['phase'].get(nct, 'PHASE3')).replace('PHASE', '') or '3',
            'group': f'{a.agent} ({classmap.get(a.agent, "?")}) vs control',
            'tE': tE, 'tN': tN, 'cE': cE, 'cN': cN,
            'allOutcomes': outs or [{'shortLabel': f'{label}{headline}', 'title': f'{label}{headline} response',
                                     'type': 'binary'}],
            'rob': ['some-concerns'] * 5,
            '_agent': a.agent, '_headline': f'{label}{headline}', '_timepoint_wk': None if tp < 0 else round(tp, 1),
        })

    trials = sorted(trials, key=lambda t: -(t['tN'] + t['cN']))
    n_inc = len(trials)
    skip['no_measurement_rows'] = int(n_report - OM.nct.nunique())
    accounted = n_inc + sum(skip.values())
    return {'trials': trials,
            'screening': {'search_hits': int(n_search), 'acr_reporting': int(n_report), 'included': int(n_inc),
                          'excluded': {k: int(v) for k, v in skip.items()},
                          'funnel_reconciles': bool(accounted == n_report)}}
