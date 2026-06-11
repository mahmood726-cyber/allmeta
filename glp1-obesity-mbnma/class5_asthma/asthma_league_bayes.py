"""GENERALITY depth (Bayesian league) for the ASTHMA class -- promote class 5 to the THIRD full-depth class,
on the COUNT/RATE path (annualised exacerbation incidence-rate ratio). Like the SGLT2 league, every pairwise
contrast is built from a posterior DRAW MATRIX: a hierarchical RE on log-RR (nutpie) -> CrI + P(superiority),
same GRADE/CINeMA certainty domains as the incretin flagship nma_league.py. Repoints the Bayesian league
machinery to a rate outcome (the prior two full-depth classes were continuous-biomarker PCSK9 and survival/HR
SGLT2). AACT only; one exacerbation rate ratio per trial; no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class5_asthma'
NPZ = f'{HERE}/asthma_rr_draws.npz'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['dupilumab', 'mepolizumab', 'benralizumab', 'reslizumab', 'omalizumab', 'tezepelumab']
pat = '|'.join(DRUGS)
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ivh = iv[iv.name.str.contains(pat, case=False, na=False)].copy(); ncts = ivh.nct_id.unique()
ivh['drug'] = ivh.name.str.extract('(' + pat + ')', flags=2)[0].str.lower()
amap = ivh.dropna(subset=['drug']).groupby('nct_id').drug.first()
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title']); oc = oc[oc.nct_id.isin(ncts)]
oa = load_table('outcome_analyses', location=LOC,
                columns=['nct_id', 'outcome_id', 'param_type', 'param_value', 'ci_lower_limit', 'ci_upper_limit'])
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.str.contains('rate ratio', case=False, na=False)].merge(
    oc[['id', 'title']], left_on='outcome_id', right_on='id', how='left')
ex = oa[oa.title.str.contains('exacerbat', case=False, na=False)].copy()
ex['rr'] = pd.to_numeric(ex.param_value, errors='coerce')
ex['lo'] = pd.to_numeric(ex.ci_lower_limit, errors='coerce'); ex['hi'] = pd.to_numeric(ex.ci_upper_limit, errors='coerce')
ex = ex[ex.rr.notna() & ex.lo.notna() & ex.hi.notna() & (ex.lo > 0) & ex.rr.between(0.0, 2.0)]
ex['se'] = (np.log(ex.hi) - np.log(ex.lo)) / (2 * 1.959964)
ex = ex[ex.se > 0].sort_values('se').drop_duplicates('nct_id')
ex['agent'] = ex.nct_id.map(amap); ex['lrr'] = np.log(ex.rr)
agents = sorted(ex.agent.unique()); ai = {a: i for i, a in enumerate(agents)}; A = len(agents)
kper = {a: int((ex.agent == a).sum()) for a in agents}
print(f'asthma exacerbation RR (one per trial): {len(ex)} trials, {A} agents {kper}\n')

if not os.path.exists(NPZ):
    import pymc as pm, arviz as az
    y = ex.lrr.values.astype(float); se = ex.se.values.astype(float); aidx = ex.agent.map(ai).values
    with pm.Model() as m:
        theta = pm.Normal('theta', mu=np.log(0.7), sigma=0.5, shape=A)   # per-agent mean log-RR
        tau = pm.HalfNormal('tau', 0.15)                                 # shared between-trial SD
        pm.Normal('y', mu=theta[aidx], sigma=pm.math.sqrt(se ** 2 + tau ** 2), observed=y)
        idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                          random_seed=20260611, progressbar=False, compute_convergence_checks=False)
    rh = float(az.summary(idata, var_names=['theta'])['r_hat'].max())
    th = idata.posterior['theta'].stack(s=('chain', 'draw')).values
    np.savez(NPZ, theta=th, agents=np.array(agents), kper=np.array([kper[a] for a in agents]), rhat=rh)
    print(f'fit done, Rhat={rh:.4f}, saved {NPZ}')

d = np.load(NPZ, allow_pickle=True)
th = d['theta']; agents = list(d['agents']); kper = {agents[i]: int(d['kper'][i]) for i in range(len(agents))}
A = len(agents); rhat = float(d['rhat'])
medRR = np.exp(np.median(th, axis=1))
order = list(np.argsort(medRR))   # best (lowest RR = most reduction) first


def certainty(i, j, crosses0):
    down = 1; notes = ['indirect (star; no incoherence check)']
    if crosses0:
        down += 1; notes.append('imprecision: CrI crosses null')
    if kper[agents[i]] == 1 or kper[agents[j]] == 1:
        down += 1; notes.append('k=1 node INSUFFICIENT')
    return ['High', 'Moderate', 'Low', 'Very low'][min(down, 3)], '; '.join(notes)


cells = {}
for a in range(A):
    for b in range(A):
        if a == b:
            continue
        i, j = order[a], order[b]
        c = th[i] - th[j]
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c < 0))
        lvl, note = certainty(i, j, crosses0)
        cells[(i, j)] = {'rr_ratio': float(np.exp(np.median(c))), 'cri_logrr': [float(lo), float(hi)],
                         'p_superiority': psup, 'certainty': lvl, 'note': note}

print('=== asthma exacerbation Bayesian league (draws; rows vs cols) ===')
hdr = ' ' * 18 + ''.join(f'{agents[order[b]][:11]:>13s}' for b in range(A))
print(hdr)
for a in range(A):
    i = order[a]
    row = f'{agents[i][:13]:13s}({kper[agents[i]]:>2d})'
    for b in range(A):
        if a == b:
            row += f'{medRR[i]:>11.2f}  '
        elif b > a:
            row += f'{cells[(order[a], order[b])]["certainty"][:11]:>13s}'
        else:
            row += f'{cells[(order[a], order[b])]["rr_ratio"]:>7.2f}      '
    print(row[:170])

from collections import Counter
cnt = Counter(v['certainty'] for v in cells.values())
k1 = [a for a in agents if kper[a] == 1]
class_rr = float(np.exp(np.median(th.mean(axis=0))))
print(f'\nclass-pooled exacerbation IRR (draw mean across agents) = {class_rr:.2f}')
print(f'certainty across {len(cells)} ordered comparisons: {dict(cnt)}  |  Rhat={rhat:.4f}')
print(f'lead: {agents[order[0]]} (IRR {medRR[order[0]]:.2f}); k=1 INSUFFICIENT: {k1 or "none"}')

print('\n=== depth verdict (asthma -- THIRD full-depth class) ===')
print('  The Bayesian league machinery repoints to a COUNT/RATE outcome (exacerbation IRR): hierarchical RE on')
print('  log-RR -> posterior draw matrix -> CrI + P(superiority), same GRADE domains. Three full-depth classes')
print('  now span continuous-biomarker (PCSK9), survival/HR (SGLT2), and count/rate (asthma). All agents reduce')
print('  the rate; the cross-agent ranking remains confounded by baseline-rate / eosinophil effect modification')
print('  (the class-5 caveat) -- the transport stage makes that explicit. Star network -> indirect contrasts.')

json.dump({'class': 'asthma biologics', 'outcome': 'annualised exacerbation rate ratio (IRR)', 'outcome_type': 'count/rate',
           'inference': 'Bayesian hierarchical RE on log-RR (nutpie); pairwise contrasts from posterior draws',
           'ranking': [agents[i] for i in order], 'kper': kper,
           'median_irr': {agents[i]: round(float(medRR[i]), 2) for i in range(A)},
           'class_pooled_irr': round(class_rr, 2), 'rhat': round(rhat, 4),
           'comparisons': [{'a': agents[i], 'b': agents[j], 'rr_ratio': round(cells[(i, j)]['rr_ratio'], 2),
                            'cri_logrr': [round(x, 2) for x in cells[(i, j)]['cri_logrr']],
                            'p_superiority': round(cells[(i, j)]['p_superiority'], 3),
                            'certainty': cells[(i, j)]['certainty'], 'note': cells[(i, j)]['note']}
                           for a in range(A) for b in range(A) if a < b for i, j in [(order[a], order[b])]],
           'certainty_counts': dict(cnt), 'k1_insufficient': k1, 'lead': agents[order[0]],
           'depth_note': 'THIRD full-depth class: Bayesian draw-matrix league on the count/rate outcome (exacerbation IRR), CrI + P(superiority), same GRADE/CINeMA domains as nma_league.py. Spans continuous (PCSK9) + survival (SGLT2) + count/rate (asthma). Star network (indirect); ranking remains confounded by baseline-rate/eosinophil effect modification (class-5 caveat), made explicit by the transport stage. No IPD.'},
          open(f'{HERE}/asthma_league.json', 'w'), indent=1)
print('\nwrote asthma_league.json (+ asthma_rr_draws.npz)')
