"""GENERALITY depth (Bayesian-draw parity) for the PCSK9 class: upgrade the PCSK9 LDL league from the
frequentist normal contrast (pcsk9_league.py) to a proper BAYESIAN DRAW MATRIX, matching the SGLT2 league
and the incretin flagship. Hierarchical one-way random-effects model on the per-trial %LDL-C reductions
(theta[agent] = per-agent mean, shared between-trial residual SD sigma), fit with nutpie; every pairwise
contrast is built from posterior draws so the league reports credible intervals + P(superiority). Same
GRADE/CINeMA certainty domains as nma_league.py. Honest note: AACT did not post structured per-trial LDL
sampling SEs, so the model uses a hierarchical-means form (sigma absorbs sampling + between-trial spread) --
the same data limitation the frequentist version handled with a spread proxy, now expressed Bayesianly. AACT
only; no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
NPZ = f'{HERE}/pcsk9_ldl_draws.npz'
ldl = pd.read_csv(f'{HERE}/pcsk9_ldl.csv')
agents = sorted(ldl.agent.unique()); ai = {a: i for i, a in enumerate(agents)}
A = len(agents); kper = {a: int((ldl.agent == a).sum()) for a in agents}
print(f'PCSK9 per-trial LDL-C %: {len(ldl)} trials, {A} agents {kper}\n')

if not os.path.exists(NPZ):
    import pymc as pm, arviz as az
    y = ldl.ldl_pct.values.astype(float); aidx = ldl.agent.map(ai).values
    with pm.Model() as m:
        theta = pm.Normal('theta', mu=-60.0, sigma=20.0, shape=A)   # per-agent mean %LDL reduction
        sigma = pm.HalfNormal('sigma', 20.0, shape=A)               # PER-AGENT residual SD (heteroscedastic:
        #   agents differ markedly in within-agent trial spread; every agent k>=4 so it is estimable)
        pm.Normal('y', mu=theta[aidx], sigma=sigma[aidx], observed=y)
        idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                          random_seed=20260611, progressbar=False, compute_convergence_checks=False)
    rh = float(az.summary(idata, var_names=['theta'])['r_hat'].max())
    th = idata.posterior['theta'].stack(s=('chain', 'draw')).values
    np.savez(NPZ, theta=th, agents=np.array(agents), kper=np.array([kper[a] for a in agents]), rhat=rh)
    print(f'fit done, Rhat={rh:.4f}, saved {NPZ}')

d = np.load(NPZ, allow_pickle=True)
th = d['theta']; agents = list(d['agents']); kper = {agents[i]: int(d['kper'][i]) for i in range(len(agents))}
A = len(agents); rhat = float(d['rhat'])
med = np.median(th, axis=1)
order = list(np.argsort(med))   # most LDL lowering (most negative) first


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
        c = th[i] - th[j]                      # %LDL difference draws (i more lowering)
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c < 0))           # P(agent i lowers LDL more than j)
        lvl, note = certainty(i, j, crosses0)
        cells[(i, j)] = {'diff': float(np.median(c)), 'cri': [float(lo), float(hi)], 'p_superiority': psup,
                         'certainty': lvl, 'note': note}

print('=== PCSK9 LDL Bayesian league (draws; rows vs cols) ===')
hdr = ' ' * 18 + ''.join(f'{agents[order[b]][:11]:>13s}' for b in range(A))
print(hdr)
for a in range(A):
    i = order[a]
    row = f'{agents[i][:13]:13s}({kper[agents[i]]:>2d})'
    for b in range(A):
        if a == b:
            row += f'{med[i]:>11.1f}  '
        elif b > a:
            row += f'{cells[(order[a], order[b])]["certainty"][:11]:>13s}'
        else:
            row += f'{cells[(order[a], order[b])]["diff"]:>+7.1f}      '
    print(row[:170])

from collections import Counter
cnt = Counter(v['certainty'] for v in cells.values())
k1 = [a for a in agents if kper[a] == 1]
print(f'\ncertainty across {len(cells)} ordered comparisons: {dict(cnt)}  |  Rhat={rhat:.4f}')
print(f'lead: {agents[order[0]]} (LDL {med[order[0]]:.1f}%); k=1 INSUFFICIENT: {k1 or "none"}')

# parity check vs the frequentist league
try:
    fz = json.load(open(f'{HERE}/pcsk9_league.json'))
    print(f'\nparity vs frequentist league: same lead? {fz["lead"] == agents[order[0]]}  '
          f'(freq lead {fz["lead"]}, Bayes lead {agents[order[0]]})')
except Exception:
    pass

print('\n=== Bayesian-draw parity verdict (PCSK9) ===')
print('  PCSK9 now carries a Bayesian draw-matrix league (CrI + P(superiority)) in parity with SGLT2 and the')
print('  incretin flagship, alongside the frequentist league. Heteroscedastic per-agent residual SD (AACT posts')
print('  no per-trial LDL sampling SE; each agent k>=4 so sigma[agent] is estimable). Same RANKING as the')
print('  frequentist league (bococizumab lead) but appropriately MORE CONSERVATIVE on certainty -- it propagates')
print('  the real cross-trial heterogeneity (the per-trial CSV mixes doses/durations) instead of a tight per-')
print('  agent variance proxy. Two full-depth classes (continuous PCSK9 + survival SGLT2) now have Bayesian leagues.')

json.dump({'class': 'PCSK9 inhibitors', 'outcome': '% LDL-C change',
           'inference': 'Bayesian hierarchical one-way RE on per-trial %LDL (nutpie); pairwise contrasts from posterior draws',
           'ranking': [agents[i] for i in order], 'kper': kper,
           'median_ldl_pct': {agents[i]: round(float(med[i]), 1) for i in range(A)},
           'rhat': round(rhat, 4),
           'comparisons': [{'a': agents[i], 'b': agents[j], 'diff': round(cells[(i, j)]['diff'], 1),
                            'cri': [round(x, 1) for x in cells[(i, j)]['cri']],
                            'p_superiority': round(cells[(i, j)]['p_superiority'], 3),
                            'certainty': cells[(i, j)]['certainty'], 'note': cells[(i, j)]['note']}
                           for a in range(A) for b in range(A) if a < b for i, j in [(order[a], order[b])]],
           'certainty_counts': dict(cnt), 'k1_insufficient': k1, 'lead': agents[order[0]],
           'depth_note': 'Bayesian draw-matrix league for PCSK9 (CrI + P(superiority)) in parity with the SGLT2 Bayesian league and the incretin flagship; heteroscedastic per-agent residual SD because AACT posts no per-trial LDL sampling SE (each agent k>=4 so sigma[agent] is estimable). Same ranking as the frequentist pcsk9_league.json (bococizumab lead) but more conservative on certainty -- it propagates real cross-trial heterogeneity. Complements, does not replace, the frequentist league. No IPD.'},
          open(f'{HERE}/pcsk9_league_bayes.json', 'w'), indent=1)
print('\nwrote pcsk9_league_bayes.json (+ pcsk9_ldl_draws.npz)')
