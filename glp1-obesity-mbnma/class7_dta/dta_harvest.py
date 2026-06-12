"""GENERALITY class 7 - DIAGNOSTIC TEST ACCURACY (DTA): the 6th OUTCOME TYPE, paired sensitivity/specificity
with a between-study correlation (the bivariate / Reitsma structure), distinct from continuous, binary,
survival and count/rate. Registry-native comparative DTA of oncologic IMAGING MODALITIES (PET / MRI / CT /
ultrasound) for cancer lesion / nodal / metastatic detection -- the same comparative-DTA paradigm as the
canonical Scheidler CT/MRI/LAG dataset, but harvested from AACT.

Per study AACT posts Sensitivity and Specificity as PERCENTAGES, each with its own subgroup denominator
(the disease-positive n1 for Se, the disease-negative n0 for Sp). We reconstruct the 2x2:
    TP = round(Se/100 * n1), FN = n1 - TP, TN = round(Sp/100 * n0), FP = n0 - TN
exactly the round(% x N) reconstruction RA/psoriasis use for responders, with the same fail-closed plausibility
(rates in [1,99]%, each subgroup N >= 10, no negative cells). This is a registry-reconstructed DTA cohort, NOT
2x2 tables read from full text. No IPD. Reports a reconciling screening funnel."""
import io, sys, os, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class7_dta'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')

# index-test families (the "agents" of a comparative DTA). Order = priority when a title names more than one.
MODALITY = [('PET', r'\bPET\b|positron|fdg'), ('MRI', r'\bMRI\b|magnetic reson|mpmri|multiparametric'),
            ('CT', r'\bCT\b|computed tomograph|colonograph'), ('ultrasound', r'ultrasound|sonograph|\bUS\b|\bEUS\b')]
TARGET = [('prostate', r'prostate'), ('colorectal', r'colorect|colon|bowel|rectal'), ('breast', r'breast'),
          ('lung', r'lung|pulmonary'), ('liver', r'liver|hepatocell|hcc'), ('cervical', r'cervix|cervical'),
          ('lymph-node', r'lymph node|nodal'), ('pancreatic', r'pancrea')]


def first_match(text, table):
    for label, rx in table:
        if re.search(rx, text or '', re.I):
            return label
    return None


def is_pct(units):
    return bool(re.search(r'percent|%', str(units), re.I))


oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title', 'units'])
se = oc[oc.title.str.contains(r'\bsensitivity\b', case=False, na=False)
        & ~oc.title.str.contains(r'insulin|contrast|insensit', case=False, na=False) & oc.units.map(is_pct)].copy()
sp = oc[oc.title.str.contains(r'\bspecificity\b', case=False, na=False) & oc.units.map(is_pct)].copy()
cancer_ncts = set(se.nct_id) & set(sp.nct_id)
# restrict to oncologic imaging (a coherent-ish target family); carry the cancer site for the transitivity flag
n_search = len(cancer_ncts)

OM = load_table('outcome_measurements', location=LOC,
                columns=['outcome_id', 'result_group_id', 'param_value_num'])
val = OM.assign(v=pd.to_numeric(OM.param_value_num, errors='coerce')).dropna(subset=['v'])
val = val.groupby('outcome_id').v.median()                    # one summary value per outcome (median over arms/rows)
ocnt = load_table('outcome_counts', location=LOC, columns=['outcome_id', 'count', 'units'])
ocnt = ocnt[ocnt.units == 'Participants'].assign(N=lambda d: pd.to_numeric(d['count'], errors='coerce'))
nmap = ocnt.dropna(subset=['N']).groupby('outcome_id').N.max()

st = load_table('studies', location=LOC, columns=['nct_id', 'acronym', 'brief_title', 'start_date'])
st = st.set_index('nct_id')


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


def modality_of(nct, title):
    return first_match(title, MODALITY) or first_match(st['brief_title'].get(nct, '') if nct in st.index else '', MODALITY)


def target_of(nct, title):
    return (first_match(title, TARGET)
            or first_match(st['brief_title'].get(nct, '') if nct in st.index else '', TARGET) or 'other')


se['modk'] = [modality_of(n, t) for n, t in zip(se.nct_id, se.title)]
sp['modk'] = [modality_of(n, t) for n, t in zip(sp.nct_id, sp.title)]
se['Se'] = se.id.map(val); se['n1'] = se.id.map(nmap)
sp['Sp'] = sp.id.map(val); sp['n0'] = sp.id.map(nmap)

trials = []
skip = {'no_modality': 0, 'no_value_or_denom': 0, 'implausible_rate': 0, 'tiny_subgroup': 0, 'no_pair': 0}
for nct in sorted(cancer_ncts):
    se_t = se[se.nct_id == nct]; sp_t = sp[sp.nct_id == nct]
    # pair Se & Sp that share a modality; if neither titles a modality, fall back to the trial-level modality
    paired = False
    mods = [m for m in (set(se_t['modk']) | set(sp_t['modk'])) if isinstance(m, str)]
    if not mods:
        m0 = modality_of(nct, '')
        mods = [m0] if isinstance(m0, str) else []
    if not mods:
        skip['no_modality'] += 1; continue
    best = None
    for mod in mods:
        s1 = se_t[(se_t['modk'] == mod) | se_t['modk'].isna()].dropna(subset=['Se', 'n1'])
        s0 = sp_t[(sp_t['modk'] == mod) | sp_t['modk'].isna()].dropna(subset=['Sp', 'n0'])
        if mod is None or s1.empty or s0.empty:
            continue
        a = s1.sort_values('n1', ascending=False).iloc[0]
        b = s0.sort_values('n0', ascending=False).iloc[0]
        cand = (mod, float(a.Se), int(a.n1), float(b.Sp), int(b.n0))
        if best is None or cand[2] + cand[4] > best[2] + best[4]:
            best = cand
    if best is None:
        skip['no_pair'] += 1; continue
    mod, Se, n1, Sp, n0 = best
    Se = Se * 100 if Se <= 1 else Se
    Sp = Sp * 100 if Sp <= 1 else Sp
    if not (1 <= Se <= 100 and 1 <= Sp <= 100):
        skip['implausible_rate'] += 1; continue
    if min(n1, n0) < 10:
        skip['tiny_subgroup'] += 1; continue
    tp = int(round(Se / 100 * n1)); fn = n1 - tp
    tn = int(round(Sp / 100 * n0)); fp = n0 - tn
    if min(tp, fn, tn, fp) < 0:
        skip['implausible_rate'] += 1; continue
    trials.append({
        'nct': nct, 'name': trial_name(nct), 'year': year(nct),
        'modality': mod, 'target': target_of(nct, ' '.join(list(se_t.title) + list(sp_t.title))),
        'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn, 'n1': n1, 'n0': n0,
        'sens': round(Se / 100, 4), 'spec': round(Sp / 100, 4),
        '_modality': mod,
    })

# account skips that fired before modality (no_modality) -- recompute clean funnel
n_inc = len(trials)
accounted = n_inc + sum(skip.values())
out = {'trials': trials, 'outcome_type': 'diagnostic test accuracy (paired sensitivity/specificity, bivariate)',
       'index_tests': sorted(set(t['modality'] for t in trials)),
       'screening': {'search_hits': int(n_search), 'se_sp_reporting': int(n_search), 'included': int(n_inc),
                     'excluded': {k: int(v) for k, v in skip.items()},
                     'funnel_reconciles': bool(accounted == n_search)}}
json.dump(out, open(f'{HERE}/dta_trials.json', 'w', encoding='utf-8'), indent=1)
s = out['screening']
print(f"DTA harvest: {s['search_hits']} Se&Sp(%)-reporting -> {s['included']} included "
      f"(reconciles={s['funnel_reconciles']})")
print(f"  excluded: {s['excluded']}")
by = {}
for t in trials:
    by.setdefault(t['modality'], []).append(t)
for m in sorted(by, key=lambda m: -len(by[m])):
    g = by[m]
    print(f"  {m:11s} k={len(g):2d}  pooled Se~{np.mean([t['sens'] for t in g]):.2f} Sp~{np.mean([t['spec'] for t in g]):.2f}")
print(f"  target sites: {sorted(set(t['target'] for t in trials))}")
print(f"wrote dta_trials.json ({n_inc} trials)")
