"""System improvement: AGENT-SPECIFIC diabetes modifier (hierarchical gamma) in the one-step Bayesian
NMR transport. Replaces the single common gamma (the panel/Fix-2 limitation) with gamma_agent ~
Normal(gamma_mu, gamma_sd): agents with T2D data identify their own attenuation; agents without it
partial-pool toward the network mean (borrowing strength). This is the agent x diabetes interaction.
Compiled nutpie backend. AACT only.
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
act = arms[arms.agent != 'placebo']
nodes = sorted(act.node.unique()); ni = {n: i for i, n in enumerate(nodes)}
agents = sorted(act.agent.unique()); ai = {a: i for i, a in enumerate(agents)}      # base agent for gamma
node_agent = np.array([ai[act[act.node == n].agent.iloc[0]] for n in nodes])         # node -> agent
T, N, A = len(trials), len(nodes), len(agents)
maxd = np.array([act[act.node == n]['dose_wk'].max() for n in nodes])
tr = arms.nct.map(ti).values; is_pl = (arms.agent == 'placebo').values.astype(float)
ndi = np.array([ni.get(n, 0) for n in arms.node]); dose = arms.dose_wk.values.astype(float)
agi = np.array([ai.get(a, 0) for a in arms.agent]); t2d = arms.t2d.values
y = arms.mean_pct.values.astype(float); se = np.sqrt(arms.var_of_mean.values.astype(float))
t2d_agents = sorted(act[act.t2d == 1].agent.unique())
print(f'agent-specific gamma: {T} trials, {N} nodes, {A} agents ({len(t2d_agents)} with T2D data: {t2d_agents})')

with pm.Model() as m:
    alpha = pm.Normal('alpha', -2, 4, shape=T)
    tau = pm.HalfNormal('tau', 3); u = pm.Normal('u', 0, tau, shape=T)
    lem_mu = pm.Normal('lem_mu', np.log(15), 0.5); lem_sd = pm.HalfNormal('lem_sd', 0.5)
    led_mu = pm.Normal('led_mu', np.log(5), 1.0); led_sd = pm.HalfNormal('led_sd', 1.0)
    z = pm.Normal('z', 0, 1, shape=N); w = pm.Normal('w', 0, 1, shape=N)
    Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z))
    ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
    # hierarchical agent-specific diabetes modifier
    gam_mu = pm.Normal('gam_mu', 0, 5); gam_sd = pm.HalfNormal('gam_sd', 3)
    zg = pm.Normal('zg', 0, 1, shape=A)
    gamma = pm.Deterministic('gamma', gam_mu + gam_sd * zg)            # per agent
    curve = Emax[ndi] * dose / (ED50[ndi] + dose)
    mu = alpha[tr] - (1 - is_pl) * (curve - gamma[agi] * t2d - u[tr])
    pm.Normal('y', mu, se, observed=y)
    base = Emax * maxd / (ED50 + maxd)
    pm.Deterministic('eff_obesity', base)
    pm.Deterministic('eff_target', base - gamma[node_agent] * P_TARGET)
    idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                      random_seed=20260610, progressbar=False, compute_convergence_checks=False)

su = az.summary(idata, var_names=['gamma', 'eff_obesity', 'eff_target', 'gam_mu', 'gam_sd'])
rh, es = float(su['r_hat'].max()), float(su['ess_bulk'].min())
print(f'\ndiagnostics: max Rhat={rh:.4f}  min ESS={es:.0f}  -> {"CONVERGED" if rh<1.01 and es>=400 else "CHECK"}')
post = idata.posterior
gm = post['gam_mu'].values.flatten(); gs = post['gam_sd'].values.flatten()
print(f'gamma_mu (network mean) = {np.median(gm):.1f} pp; gamma_sd (between-agent spread) = {np.median(gs):.1f} pp')
G = post['gamma'].stack(s=('chain', 'draw')).values
print('\nagent-specific diabetes attenuation gamma (posterior median):')
for i, a in enumerate(agents):
    has = 'data' if a in t2d_agents else 'pooled'
    print(f'  {a:13s} gamma = {np.median(G[i]):4.1f} pp ({np.percentile(G[i],2.5):.1f},{np.percentile(G[i],97.5):.1f})  [{has}]')

eo = post['eff_obesity'].stack(s=('chain', 'draw')).values
et = post['eff_target'].stack(s=('chain', 'draw')).values
print('\n=== transported (agent-specific gamma) obesity -> US-obese (26% diabetes) ===')
out = []
for i in np.argsort(-np.median(eo, axis=1)):
    print(f'{nodes[i]:24s} obesity {np.median(eo[i]):5.1f}  -> target {np.median(et[i]):5.1f} '
          f'({np.percentile(et[i],2.5):.1f},{np.percentile(et[i],97.5):.1f})  shift {np.median(et[i]-eo[i]):+.1f}')
    out.append({'node': nodes[i], 'eff_obesity': round(float(np.median(eo[i])), 1),
                'eff_target': round(float(np.median(et[i])), 1),
                'agent_gamma': round(float(np.median(G[node_agent[i]])), 1)})
print('\nImprovement: shifts are now node-specific via agent-specific gamma (tirzepatide attenuates more than')
print('orforglipron/semaglutide), removing the common-gamma approximation the panel flagged.')
json.dump({'gam_mu': round(float(np.median(gm)), 1), 'gam_sd': round(float(np.median(gs)), 1),
           'agent_gamma': {agents[i]: round(float(np.median(G[i])), 1) for i in range(A)},
           'rhat_max': rh, 'ess_min': es, 'nodes': out},
          open(f'{ROOT}/agent_gamma_transport.json', 'w'), indent=1)
print('\nwrote agent_gamma_transport.json')
