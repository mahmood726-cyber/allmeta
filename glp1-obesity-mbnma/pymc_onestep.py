"""EXPERIMENTAL — no external R oracle; validated only against its own Python output / internal MC coverage (NUTS Rhat + ESS); not for primary published estimates without independent confirmation.

Workstream B: TRUE one-step arm-based Bayesian MBNMA (fixes the panel-verified error).

The contrast model (pymc_mbnma.py) treated 54 contrasts as independent, but 38/54 share a
placebo arm within multi-arm trials -> within-trial covariance ignored -> anti-conservative CrIs.
Here we model at the ARM level with a per-trial shared baseline alpha[i] and a per-trial active
random effect u[i], so every arm of a multi-arm trial shares one placebo level and one trial
deviation (the shared-control structure, advanced-stats rule). This is the genuine one-step MBNMA.

  y_arm ~ Normal(mu, se_arm)
  placebo arm: mu = alpha[trial]
  active  arm: mu = alpha[trial] - Emax_node * dose/(ED50_node + dose) + u[trial]
  alpha[i]~N(-2,4); u[i]~N(0,tau); tau~HalfN(3); logEmax,logED50 hierarchical across nodes.
"""
import io, sys, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd, pymc as pm, arviz as az, pytensor.tensor as pt

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
MIN_WEEK = 36
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))


def node_of(a, d, sched):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if sched == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a


# keep arms at >=36wk in trials that have a placebo arm
arms = arms[(arms.wk >= MIN_WEEK) | (arms.wk < 0)]
has_pl = {n for n, g in arms.groupby('nct') if (g.agent == 'placebo').any()}
arms = arms[arms.nct.isin(has_pl) & arms.var_of_mean.notna()].copy()
arms['node'] = [node_of(a, d, s) for a, d, s in zip(arms.agent, arms.dose_mg, arms.schedule)]

trials = sorted(arms.nct.unique()); ti = {t: i for i, t in enumerate(trials)}
act = arms[arms.agent != 'placebo'].copy()
nodes = sorted(act.node.unique()); ni = {n: i for i, n in enumerate(nodes)}
T, N = len(trials), len(nodes)
maxd = np.array([act[act.node == n]['dose_wk'].max() for n in nodes])
print(f'one-step arm-based MBNMA: {T} trials, {N} nodes, {len(arms)} arms ({len(act)} active)')

tr_all = arms.nct.map(ti).values
is_pl = (arms.agent == 'placebo').values.astype(float)
node_all = np.array([ni.get(n, 0) for n in arms.node])   # placebo node index unused (is_pl masks)
dose_all = arms.dose_wk.values.astype(float)
y = arms.mean_pct.values.astype(float)
se = np.sqrt(arms.var_of_mean.values.astype(float))

with pm.Model() as m:
    alpha = pm.Normal('alpha', -2.0, 4.0, shape=T)
    tau = pm.HalfNormal('tau', 3.0)
    u = pm.Normal('u', 0.0, tau, shape=T)
    lem_mu = pm.Normal('lem_mu', np.log(15), 0.5); lem_sd = pm.HalfNormal('lem_sd', 0.5)
    led_mu = pm.Normal('led_mu', np.log(5), 1.0); led_sd = pm.HalfNormal('led_sd', 1.0)
    z = pm.Normal('z', 0, 1, shape=N); w = pm.Normal('w', 0, 1, shape=N)
    Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z))
    ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
    loss_curve = Emax[node_all] * dose_all / (ED50[node_all] + dose_all)
    mu = alpha[tr_all] - (1 - is_pl) * (loss_curve - u[tr_all])
    pm.Normal('y', mu, se, observed=y)
    pred = pm.Deterministic('pred', Emax * maxd / (ED50 + maxd))
    idata = pm.sample(2500, tune=1500, chains=2, cores=1, target_accept=0.95,
                      random_seed=20260610, progressbar=False, compute_convergence_checks=False)

su = az.summary(idata, var_names=['Emax', 'ED50', 'pred', 'tau'])
rh, es = float(su['r_hat'].max()), float(su['ess_bulk'].min())
print(f'diagnostics: max Rhat={rh:.4f}  min ESS={es:.0f}  -> {"CONVERGED" if rh<1.01 and es>=400 else "CHECK"}')

post = idata.posterior
pred_s = post['pred'].stack(s=('chain', 'draw')).values
P = pred_s.T
ranks = (-P).argsort(axis=1).argsort(axis=1) + 1
sucra = ((N - ranks) / (N - 1)).mean(axis=0)
poth = float(np.mean((sucra - 0.5) ** 2) / ((N + 1) / (12 * (N - 1))))
order = np.argsort(-sucra)

# compare CrI widths to the contrast-based fit
try:
    cb = json.load(open(f'{ROOT}/pymc_ranking.json'))
    cb_w = {cb['agents'][i]: cb['pred_cri'][1][i] - cb['pred_cri'][0][i] for i in range(len(cb['agents']))}
except Exception:
    cb_w = {}

print('\n=== one-step arm-based hierarchy (multi-arm covariance modelled) ===')
print(f'{"node":24s} pred (95% CrI)        width  vs-contrast-width')
for i in order:
    lo, hi = np.percentile(pred_s[i], 2.5), np.percentile(pred_s[i], 97.5)
    wd = hi - lo; cbw = cb_w.get(nodes[i])
    cmp = f'{cbw:.1f} -> {wd:.1f} ({"WIDER" if cbw and wd>cbw else "narrower"})' if cbw else 'n/a'
    print(f'{nodes[i]:24s} {np.median(pred_s[i]):5.1f} ({lo:4.1f},{hi:5.1f})   {wd:4.1f}   {cmp}')
print(f'\nPOTH (one-step) = {poth:.3f}  | tau = {np.median(post["tau"].values):.2f}')
print('Contrast-model POTH was 0.850; ranking order:', [nodes[i] for i in order])

json.dump({'sampler': 'NUTS one-step arm-based', 'nodes': nodes, 'sucra': sucra.tolist(),
           'poth': poth, 'pred_median': np.median(pred_s, axis=1).tolist(),
           'pred_cri': [np.percentile(pred_s, 2.5, axis=1).tolist(), np.percentile(pred_s, 97.5, axis=1).tolist()],
           'rhat_max': rh, 'ess_min': es, 'order': [nodes[i] for i in order]},
          open(f'{ROOT}/onestep_ranking.json', 'w'), indent=1)
print('\nwrote onestep_ranking.json')
