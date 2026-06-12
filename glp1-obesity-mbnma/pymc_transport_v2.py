"""Improved Bayesian transport (proven advice items): CONSUMES the NHANES microdata target instead of
hardcoding (Item 1 wiring); propagates target-prevalence UNCERTAINTY via a stochastic P_diab (Item 2);
reports POTH on the transported posterior (Item 6); tags k=1 nodes (Item 8). Arm-based one-step model
already carries multi-arm shared-control covariance (alpha[trial]+u[trial]) — Item 3 already satisfied.
nutpie backend. AACT + NHANES microdata (public reference).
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd, pymc as pm, arviz as az, pytensor.tensor as pt

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
MIN_WEEK = 36
nh = json.load(open(f'{ROOT}/nhanes_target.json'))
P_MU, P_SE = nh['diabetes_prevalence'], nh['diabetes_se']            # microdata-derived (Item 1 + 2)
print(f'CONSUMING NHANES microdata target: diabetes {100*P_MU:.1f}% (SE {100*P_SE:.1f}%) — not hardcoded')

arms = pd.read_csv(f'{ROOT}/arms_full.csv')
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))
pop = pd.read_csv(f'{ROOT}/population_conditions.csv', index_col=0)['population'].to_dict()


def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a


arms = arms[(arms.wk >= MIN_WEEK) | (arms.wk < 0)]
has_pl = {n for n, g in arms.groupby('nct') if (g.agent == 'placebo').any()}
arms = arms[arms.nct.isin(has_pl) & arms.var_of_mean.notna()].copy()
arms['node'] = [node_of(a, d, s) for a, d, s in zip(arms.agent, arms.dose_mg, arms.schedule)]
arms['t2d'] = arms.nct.map(lambda n: 1.0 if pop.get(n) == 'T2D' else 0.0)
trials = sorted(arms.nct.unique()); ti = {t: i for i, t in enumerate(trials)}
act = arms[arms.agent != 'placebo']; nodes = sorted(act.node.unique()); ni = {n: i for i, n in enumerate(nodes)}
T, N = len(trials), len(nodes)
maxd = np.array([act[act.node == n]['dose_wk'].max() for n in nodes])
kper = {n: act[act.node == n].nct.nunique() for n in nodes}                       # Item 8: trials per node
tr = arms.nct.map(ti).values; is_pl = (arms.agent == 'placebo').values.astype(float)
ndi = np.array([ni.get(n, 0) for n in arms.node]); dose = arms.dose_wk.values.astype(float)
t2d = arms.t2d.values; y = arms.mean_pct.values.astype(float); se = np.sqrt(arms.var_of_mean.values.astype(float))

with pm.Model() as m:
    alpha = pm.Normal('alpha', -2, 4, shape=T)                          # shared placebo per trial (multi-arm)
    tau = pm.HalfNormal('tau', 3); u = pm.Normal('u', 0, tau, shape=T)  # shared trial RE (multi-arm covariance)
    lem_mu = pm.Normal('lem_mu', np.log(15), 0.5); lem_sd = pm.HalfNormal('lem_sd', 0.5)
    led_mu = pm.Normal('led_mu', np.log(5), 1.0); led_sd = pm.HalfNormal('led_sd', 1.0)
    z = pm.Normal('z', 0, 1, shape=N); w = pm.Normal('w', 0, 1, shape=N)
    Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z))
    ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
    gamma = pm.Normal('gamma', 0, 5)
    # target prevalence is now a STOCHASTIC node carrying NHANES sampling uncertainty (Item 2)
    P_diab = pm.TruncatedNormal('P_diab', mu=P_MU, sigma=P_SE, lower=0, upper=1)
    curve = Emax[ndi] * dose / (ED50[ndi] + dose)
    mu = alpha[tr] - (1 - is_pl) * (curve - gamma * t2d - u[tr])
    pm.Normal('y', mu, se, observed=y)
    base = Emax * maxd / (ED50 + maxd)
    pm.Deterministic('eff_obesity', base)
    pm.Deterministic('eff_target', base - gamma * P_diab)
    idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                      random_seed=20260610, progressbar=False, compute_convergence_checks=False)

su = az.summary(idata, var_names=['gamma', 'eff_obesity', 'eff_target', 'P_diab'])
rh, es = float(su['r_hat'].max()), float(su['ess_bulk'].min())
print(f'diagnostics: max Rhat={rh:.4f}  min ESS={es:.0f}  -> {"CONVERGED" if rh<1.01 and es>=400 else "CHECK"}')
post = idata.posterior
eo = post['eff_obesity'].stack(s=('chain', 'draw')).values
et = post['eff_target'].stack(s=('chain', 'draw')).values
Pd = post['P_diab'].values.flatten()
print(f'P_diab posterior (consumed): {100*np.median(Pd):.1f}% (95% {100*np.percentile(Pd,2.5):.1f},{100*np.percentile(Pd,97.5):.1f})')


def poth_sucra(M):  # M: (N, nsamp). POTH from posterior-mean SUCRA (rank-probability based, NOT per-draw).
    R = (-M).argsort(0).argsort(0) + 1                # rank per draw across nodes
    sucra = ((N - R) / (N - 1)).mean(axis=1)          # SUCRA = mean rank-prob per node
    return float(np.mean((sucra - 0.5) ** 2) / ((N + 1) / (12 * (N - 1))))


poth_ob = poth_sucra(eo); poth_tg = poth_sucra(et)
print('\n=== node effects + transported (microdata target, P-uncertainty propagated) ===')
out = []
for i in np.argsort(-np.median(eo, axis=1)):
    tag = '  [k=1 INSUFFICIENT]' if kper[nodes[i]] == 1 else ''
    print(f'{nodes[i]:22s} obesity {np.median(eo[i]):5.1f}  -> target {np.median(et[i]):5.1f} '
          f'({np.percentile(et[i],2.5):.1f},{np.percentile(et[i],97.5):.1f})  k={kper[nodes[i]]}{tag}')
    out.append({'node': nodes[i], 'k': kper[nodes[i]], 'k1_insufficient': kper[nodes[i]] == 1,
                'eff_obesity': round(float(np.median(eo[i])), 1), 'eff_target': round(float(np.median(et[i])), 1),
                'target_cri': [round(float(np.percentile(et[i], 2.5)), 1), round(float(np.percentile(et[i], 97.5)), 1)]})
print(f'\nPOTH (Item 6, SUCRA-based): obesity {poth_ob:.3f} -> transported {poth_tg:.3f}')
print(f'  -> the hierarchy {"SURVIVES" if poth_tg>0.5 else "does NOT survive"} transport '
      f'(POTH stays {">" if poth_tg>0.67 else "<"} 0.67 -> {"still informative" if poth_tg>0.67 else "non-informative"}).')

json.dump({'nhanes_target_consumed': {'diabetes': P_MU, 'se': P_SE}, 'rhat_max': rh, 'ess_min': es,
           'P_diab_posterior_pct': round(100 * float(np.median(Pd)), 1),
           'poth_obesity': round(poth_ob, 3), 'poth_transported': round(poth_tg, 3),
           'nodes': out}, open(f'{ROOT}/transport_v2.json', 'w'), indent=1)
print('\nwrote transport_v2.json')
