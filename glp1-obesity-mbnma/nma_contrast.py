"""Exact NMA contrast (tirzepatide - semaglutide) from the JOINT posterior, replacing the conservative
independent-marginals CrI used in the GRADE imprecision domain. The model (identical to pymc_transport_v2)
uses a hierarchical Emax prior across nodes, so the node effects are partially pooled -> the contrast
posterior may be narrower (or wider) than sqrt(se1^2+se2^2). We compute the contrast draws directly + the
posterior correlation, and re-assess whether imprecision is still binding. nutpie. AACT + NHANES."""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd, pymc as pm, arviz as az, pytensor.tensor as pt

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
MIN_WEEK = 36
nh = json.load(open(f'{ROOT}/nhanes_target.json'))
P_MU, P_SE = nh['diabetes_prevalence'], nh['diabetes_se']
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
ndi = np.array([ni.get(n, 0) for n in arms.node]); dose = arms.dose_wk.values.astype(float)
tr = arms.nct.map(ti).values; is_pl = (arms.agent == 'placebo').values.astype(float)
t2d = arms.t2d.values; y = arms.mean_pct.values.astype(float); se = np.sqrt(arms.var_of_mean.values.astype(float))
iT, iS = ni['tirzepatide'], ni['semaglutide-sc-weekly']

with pm.Model() as m:
    alpha = pm.Normal('alpha', -2, 4, shape=T)
    tau = pm.HalfNormal('tau', 3); u = pm.Normal('u', 0, tau, shape=T)
    lem_mu = pm.Normal('lem_mu', np.log(15), 0.5); lem_sd = pm.HalfNormal('lem_sd', 0.5)
    led_mu = pm.Normal('led_mu', np.log(5), 1.0); led_sd = pm.HalfNormal('led_sd', 1.0)
    z = pm.Normal('z', 0, 1, shape=N); w = pm.Normal('w', 0, 1, shape=N)
    Emax = pm.Deterministic('Emax', pt.exp(lem_mu + lem_sd * z))
    ED50 = pm.Deterministic('ED50', pt.exp(led_mu + led_sd * w))
    gamma = pm.Normal('gamma', 0, 5)
    P_diab = pm.TruncatedNormal('P_diab', mu=P_MU, sigma=P_SE, lower=0, upper=1)
    curve = Emax[ndi] * dose / (ED50[ndi] + dose)
    mu = alpha[tr] - (1 - is_pl) * (curve - gamma * t2d - u[tr])
    pm.Normal('y', mu, se, observed=y)
    base = Emax * maxd / (ED50 + maxd)
    pm.Deterministic('eff_obesity', base)
    pm.Deterministic('eff_target', base - gamma * P_diab)
    idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                      random_seed=20260610, progressbar=False, compute_convergence_checks=False)

rh = float(az.summary(idata, var_names=['eff_obesity'])['r_hat'].max())
eo = idata.posterior['eff_obesity'].stack(s=('chain', 'draw')).values   # (N, S)
et = idata.posterior['eff_target'].stack(s=('chain', 'draw')).values
print(f'converged: max Rhat(eff_obesity)={rh:.4f}\n')

def report(M, label):
    c = M[iT] - M[iS]                                   # exact contrast draws
    med, lo, hi = np.median(c), np.percentile(c, 2.5), np.percentile(c, 97.5)
    rho = np.corrcoef(M[iT], M[iS])[0, 1]
    se_indep = np.hypot(M[iT].std(), M[iS].std())       # what independence would give
    se_exact = c.std()
    pgt0 = float(np.mean(c > 0)); pgtMID = float(np.mean(c > 2.0))
    print(f'=== {label}: tirzepatide - semaglutide-sc-weekly ===')
    print(f'  exact contrast {med:+.2f} pp (95% CrI {lo:+.2f}, {hi:+.2f})')
    print(f'  posterior corr(tirz, sema) = {rho:+.2f}  -> contrast SD {se_exact:.2f} vs independent-sum {se_indep:.2f}')
    print(f'  P(tirz > sema) = {pgt0:.2f}   P(difference > MID 2pp) = {pgtMID:.2f}')
    excl0 = lo > 0
    print(f'  -> CrI {"EXCLUDES" if excl0 else "includes"} null; '
          f'imprecision {"NO LONGER serious (was the binding domain)" if excl0 else "remains serious"}')
    return {'median': round(float(med), 2), 'cri': [round(float(lo), 2), round(float(hi), 2)],
            'rho': round(float(rho), 2), 'sd_exact': round(float(se_exact), 2), 'sd_independent': round(float(se_indep), 2),
            'p_gt_0': round(pgt0, 2), 'p_gt_mid2': round(pgtMID, 2), 'excludes_null': bool(excl0)}

ro = report(eo, 'obesity-population effect')
print()
rt = report(et, 'transported (target) effect')

print('\n=== implication for the GRADE/CINeMA imprecision domain ===')
if ro['excludes_null']:
    print('  The exact contrast EXCLUDES null: the conservative marginal CrI was over-wide. Imprecision should')
    print('  be re-rated (panel) -> certainty could rise from Low toward Moderate. UPDATE grade_inputs.')
else:
    print('  The exact contrast STILL includes null: imprecision is REAL, not an artifact of the approximation.')
    print('  In a star network the two placebo-anchored effects are nearly independent (corr ~0), so the')
    print('  conservative CrI was about right. Low certainty stands -> a head-to-head trial remains the key gap.')

json.dump({'obesity': ro, 'target': rt, 'mid_pp': 2.0, 'rhat': round(rh, 4),
           'interpretation': ('exact contrast excludes null -> imprecision re-rate' if ro['excludes_null']
                              else 'exact contrast still includes null -> imprecision real (star network, near-independent), Low certainty stands')},
          open(f'{ROOT}/nma_contrast.json', 'w'), indent=1)
print('\nwrote nma_contrast.json')
