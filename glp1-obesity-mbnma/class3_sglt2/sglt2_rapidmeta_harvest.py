"""SGLT2 per-trial HF/CV-composite hazard-ratio harvest for the RapidMeta conversion -- the SURVIVAL/HR path
(vs the binary-responder rm_harvest_binary used by RA/psoriasis). Pulls one published HR + 95% CI per trial
from AACT outcome_analyses (the same primary HF/CV composite endpoint the class-3 core repoint pools), maps it
onto the kit's publishedHR / hrLCI / hrUCI slots. Registry-native (AACT); no IPD. Fails closed on implausible
HRs and degenerate CIs, and reports a reconciling screening funnel."""
import io, sys, os, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class3_sglt2'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['empagliflozin', 'dapagliflozin', 'canagliflozin', 'ertugliflozin', 'sotagliflozin']
CLASS = {d: 'SGLT2i' for d in DRUGS}
PRIM = (r'hospitali.*heart failure|heart failure.*hospitali|cardiovascular death.*heart failure|'
        r'worsening heart failure|composite')

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
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.str.contains('hazard', case=False, na=False)].merge(
    oc[['id', 'title']], left_on='outcome_id', right_on='id', how='left')
cv = oa[oa.title.str.contains(PRIM, case=False, na=False)].copy()
n_report = cv.nct_id.nunique()
cv['hr'] = pd.to_numeric(cv.param_value, errors='coerce')
cv['lo'] = pd.to_numeric(cv.ci_lower_limit, errors='coerce')
cv['hi'] = pd.to_numeric(cv.ci_upper_limit, errors='coerce')

skip = {'no_hr_value': 0, 'implausible_hr': 0, 'degenerate_ci': 0, 'no_agent': 0}
good = cv[cv.hr.notna() & cv.lo.notna() & cv.hi.notna()].copy()
skip['no_hr_value'] = int(n_report - good.nct_id.nunique())
good = good[(good.lo > 0) & (good.hi > good.lo)]
# most-precise HR per trial (narrowest CI on the log scale)
good['selhr'] = (np.log(good.hi) - np.log(good.lo)) / (2 * 1.959964)
good = good[good.selhr > 0].sort_values('selhr').drop_duplicates('nct_id')

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
    hr, lo, hi = float(r.hr), float(r.lo), float(r.hi)
    if not (0.3 <= hr <= 1.3):
        skip['implausible_hr'] += 1; continue
    if not (lo < hr < hi):
        skip['degenerate_ci'] += 1; continue
    trials.append({
        'nct': nct, 'name': trial_name(nct), 'year': year(nct),
        'phase': str(st['phase'].get(nct, 'PHASE3')).replace('PHASE', '') or '3',
        'group': f'{agent} ({CLASS[agent]}) vs placebo',
        'publishedHR': round(hr, 3), 'hrLCI': round(lo, 3), 'hrUCI': round(hi, 3),
        'allOutcomes': [{'shortLabel': 'HF/CV', 'type': 'survival',
                         'title': f'HF-hospitalisation / CV-death composite HR: {agent} vs placebo',
                         'publishedHR': round(hr, 3), 'hrLCI': round(lo, 3), 'hrUCI': round(hi, 3)}],
        'rob': ['some-concerns'] * 5,
        '_agent': agent,
    })

trials = sorted(trials, key=lambda t: t['publishedHR'])
n_inc = len(trials)
accounted = n_inc + sum(skip.values())
out = {'trials': trials,
       'screening': {'search_hits': int(n_search), 'hr_reporting': int(n_report), 'included': int(n_inc),
                     'excluded': {k: int(v) for k, v in skip.items()},
                     'funnel_reconciles': bool(accounted == n_report)}}
json.dump(out, open(f'{HERE}/sglt2_trials.json', 'w', encoding='utf-8'), indent=1)
s = out['screening']
print(f"SGLT2 harvest: {s['search_hits']} search -> {s['hr_reporting']} HF/CV-HR-reporting -> {s['included']} "
      f"included (reconciles={s['funnel_reconciles']})")
print(f"  excluded: {s['excluded']}")
print(f"  agents: {sorted(set(t['_agent'] for t in trials))}")
if trials:
    t0 = trials[0]
    print(f"  best HR: {t0['name'][:24]} {t0['_agent']} HR={t0['publishedHR']} ({t0['hrLCI']},{t0['hrUCI']})")
print(f"wrote sglt2_trials.json ({n_inc} trials)")
