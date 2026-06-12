"""Full multi-comparison league table with per-comparison certainty. Re-fits the Bayesian NMA ONCE,
saves the joint posterior draw matrix (nma_draws.npz) so every pairwise contrast gets a proper CrI +
P(superiority), then assigns a computable GRADE/CINeMA-style certainty per cell (imprecision from the
contrast CrI; k=1 INSUFFICIENT flag; indirect star-network + no-incoherence baseline). Transported (target)
effects. nutpie. AACT + NHANES. Decision-support DRAFT; RoB/values are the panel's."""
import io, sys, re, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
NPZ = f'{ROOT}/nma_draws.npz'
MIN_WEEK = 36

if not os.path.exists(NPZ):
    import pymc as pm, arviz as az, pytensor.tensor as pt
    nh = json.load(open(f'{ROOT}/nhanes_target.json')); P_MU, P_SE = nh['diabetes_prevalence'], nh['diabetes_se']
    arms = pd.read_csv(f'{ROOT}/arms_full.csv')
    arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))
    pop = pd.read_csv(f'{ROOT}/population_conditions.csv', index_col=0)['population'].to_dict()
    def node_of(a, d, s):
        if a == 'semaglutide':
            return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
        return a
    arms = arms[(arms.wk >= MIN_WEEK) | (arms.wk < 0)]
    has_pl = {n for n, gp in arms.groupby('nct') if (gp.agent == 'placebo').any()}
    arms = arms[arms.nct.isin(has_pl) & arms.var_of_mean.notna()].copy()
    arms['node'] = [node_of(a, d, s) for a, d, s in zip(arms.agent, arms.dose_mg, arms.schedule)]
    arms['t2d'] = arms.nct.map(lambda n: 1.0 if pop.get(n) == 'T2D' else 0.0)
    trials = sorted(arms.nct.unique()); ti = {t: i for i, t in enumerate(trials)}
    act = arms[arms.agent != 'placebo']; nodes = sorted(act.node.unique()); ni = {n: i for i, n in enumerate(nodes)}
    T, N = len(trials), len(nodes)
    maxd = np.array([act[act.node == n]['dose_wk'].max() for n in nodes])
    kper = {n: int(act[act.node == n].nct.nunique()) for n in nodes}
    ndi = np.array([ni.get(n, 0) for n in arms.node]); dose = arms.dose_wk.values.astype(float)
    tr = arms.nct.map(ti).values; is_pl = (arms.agent == 'placebo').values.astype(float)
    t2d = arms.t2d.values; y = arms.mean_pct.values.astype(float); se = np.sqrt(arms.var_of_mean.values.astype(float))
    with pm.Model() as m:
        alpha = pm.Normal('alpha', -2, 4, shape=T); tau = pm.HalfNormal('tau', 3); u = pm.Normal('u', 0, tau, shape=T)
        lem_mu = pm.Normal('lem_mu', np.log(15), 0.5); lem_sd = pm.HalfNormal('lem_sd', 0.5)
        led_mu = pm.Normal('led_mu', np.log(5), 1.0); led_sd = pm.HalfNormal('led_sd', 1.0)
        z = pm.Normal('z', 0, 1, shape=N); w = pm.Normal('w', 0, 1, shape=N)
        Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z)); ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
        gamma = pm.Normal('gamma', 0, 5); P_diab = pm.TruncatedNormal('P_diab', mu=P_MU, sigma=P_SE, lower=0, upper=1)
        curve = Emax[ndi] * dose / (ED50[ndi] + dose)
        pm.Normal('y', alpha[tr] - (1 - is_pl) * (curve - gamma * t2d - u[tr]), se, observed=y)
        base = Emax * maxd / (ED50 + maxd)
        pm.Deterministic('eff_obesity', base); pm.Deterministic('eff_target', base - gamma * P_diab)
        idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                          random_seed=20260610, progressbar=False, compute_convergence_checks=False)
    rh = float(az.summary(idata, var_names=['eff_target'])['r_hat'].max())
    et = idata.posterior['eff_target'].stack(s=('chain', 'draw')).values
    np.savez(NPZ, et=et, nodes=np.array(nodes), kper=np.array([kper[n] for n in nodes]), rhat=rh)
    print(f'fit done, Rhat={rh:.4f}, saved {NPZ}')

d = np.load(NPZ, allow_pickle=True)
et = d['et']; nodes = list(d['nodes']); kper = {nodes[i]: int(d['kper'][i]) for i in range(len(nodes))}
N = len(nodes); med = np.median(et, axis=1)
order = list(np.argsort(-med))                      # best (most weight loss) first
MID = 2.0

def certainty(i, j, cri, crosses0):
    """computable GRADE/CINeMA-style per-comparison certainty (DRAFT; RoB/values = panel)."""
    down = 1  # baseline: indirect star-network comparison, no incoherence check possible (CINeMA)
    notes = ['indirect (star; no incoherence check)']
    if crosses0:
        down += 1; notes.append('imprecision: CrI crosses null')
    if kper[nodes[i]] == 1 or kper[nodes[j]] == 1:
        down += 1; notes.append('k=1 node INSUFFICIENT')
    lvl = ['High', 'Moderate', 'Low', 'Very low'][min(down, 3)]
    return lvl, '; '.join(notes)

# all pairwise contrasts (i better-ranked vs j), transported effect
print('=== pairwise contrasts (transported target effect, pp; i - j) ===')
cells = {}
for a in range(N):
    for b in range(N):
        if a == b:
            continue
        i, j = order[a], order[b]
        c = et[i] - et[j]
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c > 0))
        lvl, note = certainty(i, j, (lo, hi), crosses0)
        cells[(i, j)] = {'diff': float(np.median(c)), 'cri': [float(lo), float(hi)], 'p_sup': psup,
                         'certainty': lvl, 'note': note}

# league table: lower triangle = effect (CrI), upper = certainty; diagonal = node (median, k)
print('\n=== LEAGUE TABLE (rows vs cols; transported pp; lower=effect[95% CrI], upper=certainty) ===')
W = 22
hdr = ' ' * W + ''.join(f'{nodes[order[a]][:10]:>13s}' for a in range(N))
print(hdr)
for a in range(N):
    i = order[a]
    row = f'{nodes[i][:20]:20s}({kper[nodes[i]]})'
    for b in range(N):
        if a == b:
            row += f'{med[i]:>11.1f}  '
        elif b > a:   # upper: certainty
            row += f'{cells[(order[a],order[b])]["certainty"][:11]:>13s}'
        else:         # lower: effect
            c = cells[(order[a], order[b])]
            row += f'{c["diff"]:>6.1f}      '
    print(row[:160])

# per-comparison certainty summary
from collections import Counter
cnt = Counter(_v['certainty'] for _v in {frozenset(_k): _w for _k, _w in cells.items()}.values())  # unique undirected pairs (certainty is sign-symmetric)
print(f'\ncertainty across {sum(cnt.values())} ordered comparisons: {dict(cnt)}')
k1 = [n for n in nodes if kper[n] == 1]
print(f'k=1 INSUFFICIENT nodes (any comparison involving them is downgraded): {k1}')

json.dump({'nodes': nodes, 'kper': kper, 'order': [nodes[i] for i in order],
           'median_target': {nodes[i]: round(float(med[i]), 1) for i in range(N)},
           'comparisons': [{'a': nodes[i], 'b': nodes[j], **{k: (round(v, 2) if isinstance(v, float) else
                            ([round(x, 2) for x in v] if isinstance(v, list) else v)) for k, v in cells[(i, j)].items()}}
                           for (i, j) in cells if order.index(i) < order.index(j)],
           'certainty_counts': dict(cnt), 'k1_insufficient': k1, 'rhat': float(d['rhat']),
           'note': 'transported target effects; per-comparison certainty = computable GRADE/CINeMA domains (imprecision + k=1 + indirect star baseline); RoB/values = panel'},
          open(f'{ROOT}/nma_league.json', 'w'), indent=1)
print('\nwrote nma_league.json (+ nma_draws.npz)')
