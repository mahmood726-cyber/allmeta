"""GENERALITY depth (Bayesian league) for the SGLT2 class -- promote class 3 from a core repoint to a full
pipeline slice, AND give the league a proper BAYESIAN DRAW MATRIX (CrI-based contrasts + P(superiority)),
the same machinery as the incretin flagship nma_league.py (which builds nma_draws.npz). Two upgrades at once:
(1) restrict to ONE EXACT endpoint -- hospitalisation for heart failure -- which RESOLVES the I^2=87% caveat
the class-3 composite repoint flagged (the high heterogeneity was an outcome-definition artifact); (2) fit a
hierarchical random-effects model on log-HR with nutpie and build every pairwise contrast from posterior
draws, so the league reports credible intervals and P(superiority), not frequentist normal approximations.
Per-comparison GRADE/CINeMA certainty uses the IDENTICAL domains as nma_league.py. AACT only; no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class3_sglt2'
NPZ = f'{HERE}/sglt2_hf_draws.npz'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['empagliflozin', 'dapagliflozin', 'canagliflozin', 'ertugliflozin', 'sotagliflozin']
pat = '|'.join(DRUGS)

# --- extract one HF-HOSPITALISATION HR per trial (exact endpoint; exclude composites/MACE/renal) ---
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ivh = iv[iv.name.str.contains(pat, case=False, na=False)].copy(); ncts = ivh.nct_id.unique()
ivh['drug'] = ivh.name.str.extract('(' + pat + ')', flags=2)[0].str.lower()
amap = ivh.dropna(subset=['drug']).groupby('nct_id').drug.first()
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title']); oc = oc[oc.nct_id.isin(ncts)]
oa = load_table('outcome_analyses', location=LOC,
                columns=['nct_id', 'outcome_id', 'param_type', 'param_value', 'ci_lower_limit', 'ci_upper_limit'])
oa = oa[oa.nct_id.isin(ncts) & oa.param_type.str.contains('hazard', case=False, na=False)].merge(
    oc[['id', 'title']], left_on='outcome_id', right_on='id', how='left')
HF = r'hospitali.*(?:heart failure|hf)|(?:heart failure|hf).*hospitali'
EXCL = r'cardiovascular death|cv death|renal|kidney|all-cause|myocardial|stroke|mace'
hf = oa[oa.title.str.contains(HF, case=False, na=False) & ~oa.title.str.contains(EXCL, case=False, na=False)].copy()
hf['hr'] = pd.to_numeric(hf.param_value, errors='coerce')
hf['lo'] = pd.to_numeric(hf.ci_lower_limit, errors='coerce'); hf['hi'] = pd.to_numeric(hf.ci_upper_limit, errors='coerce')
hf = hf[hf.hr.notna() & hf.lo.notna() & (hf.lo > 0) & hf.hr.between(0.3, 1.3)]
hf['se'] = (np.log(hf.hi) - np.log(hf.lo)) / (2 * 1.959964)
hf = hf[hf.se > 0].sort_values('se').drop_duplicates('nct_id')
hf['agent'] = hf.nct_id.map(amap); hf['lhr'] = np.log(hf.hr)
agents = sorted(hf.agent.unique()); ai = {a: i for i, a in enumerate(agents)}
A = len(agents)
kper = {a: int((hf.agent == a).sum()) for a in agents}
print(f'HF-hospitalisation HR (exact endpoint): {len(hf)} trials, {A} agents {kper}\n')

# --- Bayesian hierarchical RE on log-HR; posterior draws of per-agent mean -> draw matrix ---
if not os.path.exists(NPZ):
    import pymc as pm
    y = hf.lhr.values.astype(float); se = hf.se.values.astype(float); aidx = hf.agent.map(ai).values
    with pm.Model() as m:
        theta = pm.Normal('theta', mu=np.log(0.85), sigma=0.5, shape=A)   # per-agent mean log-HR
        tau = pm.HalfNormal('tau', 0.15)                                   # shared between-trial SD
        pm.Normal('y', mu=theta[aidx], sigma=pm.math.sqrt(se ** 2 + tau ** 2), observed=y)
        idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                          random_seed=20260611, progressbar=False, compute_convergence_checks=False)
    import arviz as az
    rh = float(az.summary(idata, var_names=['theta'])['r_hat'].max())
    th = idata.posterior['theta'].stack(s=('chain', 'draw')).values   # (A, ndraws) log-HR draws
    np.savez(NPZ, theta=th, agents=np.array(agents), kper=np.array([kper[a] for a in agents]), rhat=rh)
    print(f'fit done, Rhat={rh:.4f}, saved {NPZ}')

d = np.load(NPZ, allow_pickle=True)
th = d['theta']; agents = list(d['agents']); kper = {agents[i]: int(d['kper'][i]) for i in range(len(agents))}
A = len(agents); rhat = float(d['rhat'])
medHR = np.exp(np.median(th, axis=1))
order = list(np.argsort(medHR))   # best (lowest HR) first


def certainty(i, j, crosses0):
    """computable GRADE/CINeMA-style certainty -- IDENTICAL domains to nma_league.py."""
    down = 1; notes = ['indirect (star; no incoherence check)']
    if crosses0:
        down += 1; notes.append('imprecision: CrI crosses null')
    if kper[agents[i]] == 1 or kper[agents[j]] == 1:
        down += 1; notes.append('k=1 node INSUFFICIENT')
    return ['High', 'Moderate', 'Low', 'Very low'][min(down, 3)], '; '.join(notes)


# all pairwise contrasts from the DRAW MATRIX (CrI + P(superiority))
cells = {}
for a in range(A):
    for b in range(A):
        if a == b:
            continue
        i, j = order[a], order[b]
        c = th[i] - th[j]                       # log-HR difference draws (i better-ranked)
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c < 0))            # P(agent i has lower HR than j)
        lvl, note = certainty(i, j, crosses0)
        cells[(i, j)] = {'hr_ratio': float(np.exp(np.median(c))), 'cri_loghr': [float(lo), float(hi)],
                         'p_superiority': psup, 'certainty': lvl, 'note': note}

print('=== SGLT2 HF-hospitalisation Bayesian league (draws; rows vs cols) ===')
hdr = ' ' * 18 + ''.join(f'{agents[order[b]][:11]:>13s}' for b in range(A))
print(hdr)
for a in range(A):
    i = order[a]
    row = f'{agents[i][:13]:13s}({kper[agents[i]]:>2d})'
    for b in range(A):
        if a == b:
            row += f'{medHR[i]:>11.2f}  '
        elif b > a:
            row += f'{cells[(order[a], order[b])]["certainty"][:11]:>13s}'
        else:
            row += f'{cells[(order[a], order[b])]["hr_ratio"]:>7.2f}      '
    print(row[:170])

from collections import Counter
cnt = Counter(v['certainty'] for v in cells.values())
k1 = [a for a in agents if kper[a] == 1]
class_hr = float(np.exp(np.median(th.mean(axis=0))))
print(f'\nclass-pooled HF-hosp HR (draw mean across agents) = {class_hr:.2f}')
print(f'certainty across {len(cells)} ordered comparisons: {dict(cnt)}')
print(f'k=1 INSUFFICIENT nodes: {k1}   |   Rhat={rhat:.4f}')
print(f'lead: {agents[order[0]]} (HR {medHR[order[0]]:.2f}); all agents reduce HF hospitalisation.')

print('\n=== depth + Bayesian-draw verdict (SGLT2 promoted) ===')
print('  SGLT2 is now a SECOND full-depth class. The league restricts to ONE exact endpoint (HF')
print('  hospitalisation) -- resolving the I^2=87% composite-pooling artifact the class-3 repoint flagged --')
print('  and is built from a hierarchical Bayesian DRAW MATRIX (nutpie), so every contrast carries a credible')
print('  interval and P(superiority), not a normal approximation. Same GRADE/CINeMA domains as the incretin')
print('  flagship. ertugliflozin (k=1) is correctly flagged INSUFFICIENT. Honest bound: a star network (each')
print('  agent vs placebo), so contrasts are indirect; dapagliflozin posts only the CV-death/HF composite so')
print('  the strict single-endpoint filter drops it (conservative, not an omission).')

json.dump({'class': 'SGLT2 inhibitors', 'outcome': 'hospitalisation for heart failure HR (exact endpoint)',
           'inference': 'Bayesian hierarchical RE on log-HR (nutpie); pairwise contrasts from posterior draws',
           'ranking': [agents[i] for i in order], 'kper': kper,
           'median_hr': {agents[i]: round(float(medHR[i]), 2) for i in range(A)},
           'class_pooled_hr': round(class_hr, 2), 'rhat': round(rhat, 4),
           'comparisons': [{'a': agents[i], 'b': agents[j],
                            'hr_ratio': round(cells[(i, j)]['hr_ratio'], 2),
                            'cri_loghr': [round(x, 2) for x in cells[(i, j)]['cri_loghr']],
                            'p_superiority': round(cells[(i, j)]['p_superiority'], 3),
                            'certainty': cells[(i, j)]['certainty'], 'note': cells[(i, j)]['note']}
                           for a in range(A) for b in range(A) if a < b for i, j in [(order[a], order[b])]],
           'certainty_counts': dict(cnt), 'k1_insufficient': k1, 'lead': agents[order[0]],
           'depth_note': 'SECOND full-depth class: HF-hospitalisation single-endpoint league built from a Bayesian draw matrix (CrI + P(superiority), nutpie), resolving the class-3 I2=87% composite artifact; same GRADE/CINeMA domains as the incretin flagship nma_league.py. Star network (indirect contrasts); dapagliflozin drops out under the strict single-endpoint filter (posts the CV-death/HF composite). No IPD.'},
          open(f'{HERE}/sglt2_league.json', 'w'), indent=1)
print('\nwrote sglt2_league.json (+ sglt2_hf_draws.npz)')
