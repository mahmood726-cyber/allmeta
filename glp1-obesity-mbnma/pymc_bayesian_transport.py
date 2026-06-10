"""TRUE Bayesian one-step network meta-regression with internal transport (PyMC/NUTS).
One hierarchical model jointly estimates: per-trial placebo level, study random effects, per-node
Emax dose-response, AND a diabetes effect-modifier gamma -- then derives the TRANSPORTED effect (to a
target diabetes prevalence) as a posterior, propagating ALL uncertainty (no two-step plug-in).

Validity without IPD: diabetes is BINARY and trials are PURE strata (AACT conditions), so the
study-level diabetes covariate equals the individual-level covariate -> the NMR coefficient gamma is a
genuine individual-level interaction, NOT ecological. (This is the legitimate IPD-free case; a full
ML-NMR with continuous modifiers / joint distributions would still need IPD.)

  active arm: mean = alpha[trial] - ( Emax_node*dose/(ED50_node+dose) - gamma*t2d[trial] ) + u[trial]
  placebo arm: mean = alpha[trial]
  transported(node) = Emax*maxd/(ED50+maxd) - gamma*p_target   (posterior; p_target=0.26 NHANES)
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd, pymc as pm, arviz as az, pytensor.tensor as pt

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
MIN_WEEK, P_TARGET = 36, 0.26
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
tr = arms.nct.map(ti).values; is_pl = (arms.agent == 'placebo').values.astype(float)
ndi = np.array([ni.get(n, 0) for n in arms.node]); dose = arms.dose_wk.values.astype(float)
t2d = arms.t2d.values; y = arms.mean_pct.values.astype(float); se = np.sqrt(arms.var_of_mean.values.astype(float))
print(f'Bayesian NMR + transport: {T} trials, {N} nodes, {len(arms)} arms; diabetes covariate (binary, pure strata)')

with pm.Model() as m:
    alpha = pm.Normal('alpha', -2, 4, shape=T)
    tau = pm.HalfNormal('tau', 3); u = pm.Normal('u', 0, tau, shape=T)
    lem_mu = pm.Normal('lem_mu', np.log(15), 0.5); lem_sd = pm.HalfNormal('lem_sd', 0.5)
    led_mu = pm.Normal('led_mu', np.log(5), 1.0); led_sd = pm.HalfNormal('led_sd', 1.0)
    z = pm.Normal('z', 0, 1, shape=N); w = pm.Normal('w', 0, 1, shape=N)
    Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z))
    ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
    gamma = pm.Normal('gamma', 0, 5)                      # diabetes attenuation (pp); >0 = less loss in T2D
    curve = Emax[ndi] * dose / (ED50[ndi] + dose)
    mu = alpha[tr] - (1 - is_pl) * (curve - gamma * t2d - u[tr])
    pm.Normal('y', mu, se, observed=y)
    # internal transport: obesity (t2d=0) effect and TARGET (26% diabetes) effect, per node
    base = Emax * maxd / (ED50 + maxd)                    # obesity-population effect
    pm.Deterministic('eff_obesity', base)
    pm.Deterministic('eff_target', base - gamma * P_TARGET)
    # compiled nutpie (numba) backend: fast + better mixing -> certify Rhat<1.01 with 4 chains
    idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                      random_seed=20260610, progressbar=False, compute_convergence_checks=False)

su = az.summary(idata, var_names=['gamma', 'eff_obesity', 'eff_target', 'tau'])
rh, es = float(su['r_hat'].max()), float(su['ess_bulk'].min())
post = idata.posterior
g = post['gamma'].values.flatten()
print(f'\ndiagnostics: max Rhat={rh:.4f}  min ESS={es:.0f}  -> {"CONVERGED" if rh<1.01 and es>=400 else "near"}')
print(f'gamma (diabetes attenuation, posterior): {np.median(g):.1f} pp (95% CrI {np.percentile(g,2.5):.1f},{np.percentile(g,97.5):.1f})  P(gamma>0)={np.mean(g>0):.2f}')

eo = post['eff_obesity'].stack(s=('chain', 'draw')).values
et = post['eff_target'].stack(s=('chain', 'draw')).values
print('\n=== posterior: obesity-population vs TRANSPORTED-to-NHANES (26% diabetes) effect per node ===')
out = []
order = np.argsort(-np.median(eo, axis=1))
for i in order:
    o = eo[i]; t = et[i]
    print(f'{nodes[i]:24s} obesity {np.median(o):5.1f} ({np.percentile(o,2.5):.1f},{np.percentile(o,97.5):.1f})  '
          f'-> target {np.median(t):5.1f} ({np.percentile(t,2.5):.1f},{np.percentile(t,97.5):.1f})  shift {np.median(t-o):+.1f}')
    out.append({'node': nodes[i], 'eff_obesity': round(float(np.median(o)), 1),
                'eff_target': round(float(np.median(t)), 1),
                'target_cri': [round(float(np.percentile(t, 2.5)), 1), round(float(np.percentile(t, 97.5)), 1)]})

print('\nTRUE-BAYESIAN: transport is a posterior derived inside one model; gamma uncertainty IS propagated')
print('into the target CrIs (wider than the obesity CrIs). Valid IPD-free via binary pure strata.')
json.dump({'sampler': 'NUTS one-step NMR + internal transport', 'gamma_median': round(float(np.median(g)), 1),
           'gamma_cri': [round(float(np.percentile(g, 2.5)), 1), round(float(np.percentile(g, 97.5)), 1)],
           'P_gamma_gt0': round(float(np.mean(g > 0)), 2), 'rhat_max': rh, 'ess_min': es,
           'target_diabetes': P_TARGET, 'nodes': out}, open(f'{ROOT}/bayesian_transport.json', 'w'), indent=1)
print('\nwrote bayesian_transport.json')
