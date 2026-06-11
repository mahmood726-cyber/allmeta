"""Asthma per-trial annualised-exacerbation rate-ratio (IRR) harvest for the RapidMeta conversion -- the
COUNT/RATE path (vs binary rm_harvest_binary and the SGLT2 survival/HR harvest). Pulls one published
incidence-rate ratio + 95% CI per trial from AACT outcome_analyses (param_type = 'rate ratio', exacerbation
outcomes), the same measure the class-5 core repoint pools. The IRR is a ratio-of-rates: it shares the
log-ratio forest math with an HR, so it is carried in the kit's publishedHR / hrLCI / hrUCI ratio slots, but
every label states it is an exacerbation IRR -- NOT a hazard ratio (made explicit in the provenance note).
Registry-native (AACT); no IPD. Fails closed on implausible IRRs and degenerate CIs; reconciling funnel."""
import io, sys, os, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class5_asthma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['dupilumab', 'mepolizumab', 'benralizumab', 'reslizumab', 'omalizumab', 'tezepelumab']
CLASS = {'dupilumab': 'anti-IL-4/13', 'mepolizumab': 'anti-IL-5', 'benralizumab': 'anti-IL-5R',
         'reslizumab': 'anti-IL-5', 'omalizumab': 'anti-IgE', 'tezepelumab': 'anti-TSLP'}

pat = '|'.join(DRUGS)
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ivh = iv[iv.name.str.contains(pat, case=False, na=False)].copy()
ncts = ivh.nct_id.unique()
n_search = len(ncts)
ivh['drug'] = ivh.name.str.extract('(' + pat + ')', flags=re.I)[0].str.lower()
amap = ivh.dropna(subset=['drug']).groupby('nct_id').drug.first()

oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title'])
oc = oc[oc.nct_id.isin(ncts)]
oa = load_table('outcome_analyses', location=LOC,
                columns=['nct_id', 'outcome_id', 'param_type', 'param_value', 'ci_lower_limit', 'ci_upper_limit'])
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.str.contains('rate ratio', case=False, na=False)].merge(
    oc[['id', 'title']], left_on='outcome_id', right_on='id', how='left')
ex = oa[oa.title.str.contains('exacerbat', case=False, na=False)].copy()
n_report = ex.nct_id.nunique()
ex['rr'] = pd.to_numeric(ex.param_value, errors='coerce')
ex['lo'] = pd.to_numeric(ex.ci_lower_limit, errors='coerce')
ex['hi'] = pd.to_numeric(ex.ci_upper_limit, errors='coerce')

skip = {'no_rr_value': 0, 'implausible_irr': 0, 'degenerate_ci': 0, 'no_agent': 0}
good = ex[ex.rr.notna() & ex.lo.notna() & ex.hi.notna()].copy()
skip['no_rr_value'] = int(n_report - good.nct_id.nunique())
good = good[(good.lo > 0) & (good.hi > good.lo)]
good['selrr'] = (np.log(good.hi) - np.log(good.lo)) / (2 * 1.959964)
good = good[good.selrr > 0].sort_values('selrr').drop_duplicates('nct_id')

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
        return 2018


trials = []
for nct, g in good.groupby('nct_id'):
    r = g.iloc[0]
    agent = amap.get(nct)
    if not isinstance(agent, str):
        skip['no_agent'] += 1; continue
    irr, lo, hi = float(r.rr), float(r.lo), float(r.hi)
    if not (0.1 <= irr <= 2.0):
        skip['implausible_irr'] += 1; continue
    if not (lo < irr < hi):
        skip['degenerate_ci'] += 1; continue
    title = f'Annualised asthma-exacerbation IRR (rate ratio): {agent} vs placebo'
    trials.append({
        'nct': nct, 'name': trial_name(nct), 'year': year(nct),
        'phase': str(st['phase'].get(nct, 'PHASE3')).replace('PHASE', '') or '3',
        'group': f'{agent} ({CLASS[agent]}) vs placebo',
        # IRR carried in the kit ratio slots (same log-ratio forest math as an HR); labelled IRR everywhere.
        'publishedHR': round(irr, 3), 'hrLCI': round(lo, 3), 'hrUCI': round(hi, 3),
        'allOutcomes': [{'shortLabel': 'exac-IRR', 'type': 'survival', 'title': title,
                         'publishedHR': round(irr, 3), 'hrLCI': round(lo, 3), 'hrUCI': round(hi, 3)}],
        'rob': ['some-concerns'] * 5,
        '_agent': agent, '_measure': 'IRR',
    })

trials = sorted(trials, key=lambda t: t['publishedHR'])
n_inc = len(trials)
accounted = n_inc + sum(skip.values())
out = {'trials': trials, 'effect_measure': 'annualised exacerbation IRR (rate ratio)',
       'screening': {'search_hits': int(n_search), 'irr_reporting': int(n_report), 'included': int(n_inc),
                     'excluded': {k: int(v) for k, v in skip.items()},
                     'funnel_reconciles': bool(accounted == n_report)}}
json.dump(out, open(f'{HERE}/asthma_trials.json', 'w', encoding='utf-8'), indent=1)
s = out['screening']
print(f"Asthma harvest: {s['search_hits']} search -> {s['irr_reporting']} exac-IRR-reporting -> {s['included']} "
      f"included (reconciles={s['funnel_reconciles']})")
print(f"  excluded: {s['excluded']}")
print(f"  agents: {sorted(set(t['_agent'] for t in trials))}")
if trials:
    t0 = trials[0]
    print(f"  best IRR: {t0['name'][:24]} {t0['_agent']} IRR={t0['publishedHR']} ({t0['hrLCI']},{t0['hrUCI']})")
print(f"wrote asthma_trials.json ({n_inc} trials)")
