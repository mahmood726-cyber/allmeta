"""NUTS-certified one-step Bayesian hierarchical Emax dose-response NMA (PyMC).

Same model as bayes_mbnma.py, but sampled with NUTS (gradient HMC) which handles the
hierarchical funnel that emcee could not -> here the between-agent shrinkage variances
lem_sd/led_sd are ESTIMATED (not fixed), and we target Rhat<1.01.

  log Emax_a = lem_mu + lem_sd*z_a ,  log ED50_a = led_mu + led_sd*w_a  (non-centred)
  loss_k ~ Normal(Emax_a*d/(ED50_a+d), sqrt(var_k + tau^2))
"""
import io, sys, json, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd, pymc as pm, arviz as az, pytensor.tensor as pt

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
cdf = pd.read_csv(f'{ROOT}/contrasts_full.csv')
agents = sorted(cdf['agent'].unique()); ai = {a: i for i, a in enumerate(agents)}
idx = cdf['agent'].map(ai).values
dose = cdf['dose_wk'].values.astype(float)
loss = cdf['loss'].values.astype(float)
var = cdf['var'].values.astype(float)
maxd = np.array([cdf[cdf.agent == a]['dose_wk'].max() for a in agents])
A = len(agents)
print(f'NUTS Bayesian MBNMA: {A} nodes, {len(loss)} contrasts')

with pm.Model() as model:
    lem_mu = pm.Normal('lem_mu', np.log(15), 0.5)
    led_mu = pm.Normal('led_mu', np.log(5), 1.0)
    lem_sd = pm.HalfNormal('lem_sd', 0.5)
    led_sd = pm.HalfNormal('led_sd', 1.0)
    tau = pm.HalfNormal('tau', 3.0)
    z = pm.Normal('z', 0, 1, shape=A)
    w = pm.Normal('w', 0, 1, shape=A)
    Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z))
    ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
    mu = Emax[idx] * dose / (ED50[idx] + dose)
    pm.Normal('y', mu, pt.sqrt(var + tau ** 2), observed=loss)
    pred = pm.Deterministic('pred', Emax * maxd / (ED50 + maxd))
    idata = pm.sample(1000, tune=1000, chains=2, cores=1, target_accept=0.9,
                      random_seed=20260610, progressbar=False, compute_convergence_checks=False)

su = az.summary(idata, var_names=['Emax', 'ED50', 'pred', 'tau', 'lem_sd', 'led_sd'])
rhat_max = float(su['r_hat'].max()); ess_min = float(su['ess_bulk'].min())
print(f'\ndiagnostics: max Rhat={rhat_max:.4f} (target<1.01)  min ESS={ess_min:.0f} (target>=400)')
print('CONVERGED' if rhat_max < 1.01 and ess_min >= 400 else 'NOT converged')

post = idata.posterior
pred_s = post['pred'].stack(s=('chain', 'draw')).values  # (A, nsamp)
Emax_s = post['Emax'].stack(s=('chain', 'draw')).values
tau_s = post['tau'].stack(s=('chain', 'draw')).values
print(f"\nbetween-study tau: {np.median(tau_s):.2f} (95% CrI {np.percentile(tau_s,2.5):.2f},{np.percentile(tau_s,97.5):.2f})")
print('\n=== posterior per node (predicted % weight loss @ max dose) ===')
for i, a in enumerate(agents):
    pr = pred_s[i]
    print(f'{a:22s} pred@{maxd[i]:g}mg = {np.median(pr):5.1f}pp ({np.percentile(pr,2.5):4.1f},{np.percentile(pr,97.5):5.1f})  '
          f'Emax={np.median(Emax_s[i]):.1f}')

P = pred_s.T  # (nsamp, A)
ranks = (-P).argsort(axis=1).argsort(axis=1) + 1
sucra = ((A - ranks) / (A - 1)).mean(axis=0)
poth = float(np.mean((sucra - 0.5) ** 2) / ((A + 1) / (12 * (A - 1))))
order = np.argsort(-sucra)
print('\n=== NUTS Bayesian hierarchy (posterior SUCRA) ===')
for rk, i in enumerate(order, 1):
    print(f'  {rk}. {agents[i]:22s} SUCRA={sucra[i]:.3f}  P(best)={np.mean(ranks[:,i]==1):.2f}  pred={np.median(pred_s[i]):.1f}pp')
try:
    js = ('const {poth}=require("C:/Projects/allmeta/shared/poth.js");'
          f'console.log(JSON.stringify(poth({json.dumps(sucra.tolist())})));')
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, timeout=30)
    pj = json.loads(out.stdout)['poth'] if out.stdout.strip() else None
except Exception:
    pj = None
print(f'\nPOTH = {poth:.3f}; allmeta poth.js = {pj} (match {pj is not None and abs(pj-poth)<1e-6})')

json.dump({'sampler': 'NUTS/PyMC', 'agents': agents, 'sucra': sucra.tolist(), 'poth': poth,
           'pred_median': np.median(pred_s, axis=1).tolist(),
           'pred_cri': [np.percentile(pred_s, 2.5, axis=1).tolist(), np.percentile(pred_s, 97.5, axis=1).tolist()],
           'tau_median': float(np.median(tau_s)), 'rhat_max': rhat_max, 'ess_min': ess_min,
           'converged': bool(rhat_max < 1.01 and ess_min >= 400),
           'order': [agents[i] for i in order]}, open(f'{ROOT}/pymc_ranking.json', 'w'), indent=2)
print('\nwrote pymc_ranking.json')
