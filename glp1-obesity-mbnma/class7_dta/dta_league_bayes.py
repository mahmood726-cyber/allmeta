"""GENERALITY class 7 depth -- Bayesian BIVARIATE (Reitsma-type) DTA league: the 6th outcome type's full-depth
slice. Fits a hierarchical model on the paired (logit-Se, logit-Sp) of every study, with a 2x2 between-study
covariance (the bivariate correlation that distinguishes DTA from a pair of independent proportions), binomial
likelihood on the reconstructed cells (TP~Bin(n1,Se), TN~Bin(n0,Sp)), per-modality means (nutpie). Posterior
draws -> pooled Se/Sp per index test (PET/MRI/CT/ultrasound) + Youden J + diagnostic OR, every pairwise contrast
from the draw matrix (J-difference CrI + P(superiority)), GRADE/CINeMA certainty with the SAME domains as the
flagship plus DTA-specific self-flags: a THRESHOLD-effect check (Spearman corr(logit Se, logit(1-Sp))>0.6 ->
report SROC not pooled point) and a CROSS-TARGET transitivity flag (multiple cancer sites mixed). AACT only."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
from collections import Counter

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class7_dta'
NPZ = f'{HERE}/dta_biv_draws.npz'
th = json.load(open(f'{HERE}/dta_trials.json', encoding='utf-8'))
trials = th['trials']
mods = sorted(set(t['modality'] for t in trials))
mi = {m: i for i, m in enumerate(mods)}
M = len(mods)
kper = {m: sum(1 for t in trials if t['modality'] == m) for m in mods}

tp = np.array([t['tp'] for t in trials]); fn = np.array([t['fn'] for t in trials])
tn = np.array([t['tn'] for t in trials]); fp = np.array([t['fp'] for t in trials])
n1 = tp + fn; n0 = tn + fp
midx = np.array([mi[t['modality']] for t in trials])
print(f'DTA bivariate league: {len(trials)} studies, {M} index tests {kper}\n')


def logit(p):
    return np.log(p / (1 - p))


# --- threshold-effect self-flag (per modality): corr(logit Se, logit(1-Sp)) > 0.6 -> SROC, not a single point
def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    if len(a) < 3 or np.std(ra) == 0 or np.std(rb) == 0:
        return 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


thr_flag = {}
for m in mods:
    idx = [i for i, t in enumerate(trials) if t['modality'] == m]
    se = np.clip(np.array([trials[i]['sens'] for i in idx]), 1e-3, 1 - 1e-3)
    sp = np.clip(np.array([trials[i]['spec'] for i in idx]), 1e-3, 1 - 1e-3)
    rho_thr = spearman(logit(se), logit(1 - sp))
    thr_flag[m] = {'spearman': round(rho_thr, 2), 'threshold_effect': bool(rho_thr > 0.6)}

# --- cross-target transitivity flag: the network mixes cancer sites -> effect-modification by target
targets = sorted(set(t['target'] for t in trials))
cross_target = len([x for x in targets if x != 'other']) > 1

# --- Bayesian hierarchical bivariate fit (nutpie); posterior draws of per-modality (logitSe, logitSp) ---
if not os.path.exists(NPZ):
    import pymc as pm
    with pm.Model() as model:
        mu_se = pm.Normal('mu_se', mu=1.2, sigma=1.0, shape=M)         # per-modality mean logit-Se
        mu_sp = pm.Normal('mu_sp', mu=1.2, sigma=1.0, shape=M)         # per-modality mean logit-Sp
        chol, corr, sds = pm.LKJCholeskyCov('chol', n=2, eta=2.0,
                                            sd_dist=pm.HalfNormal.dist(1.0), compute_corr=True)
        z = pm.Normal('z', 0.0, 1.0, shape=(len(trials), 2))
        re = pm.Deterministic('re', z @ chol.T)                        # study-level correlated random effects
        lse = mu_se[midx] + re[:, 0]
        lsp = mu_sp[midx] + re[:, 1]
        pm.Binomial('tp_obs', n=n1, p=pm.math.sigmoid(lse), observed=tp)
        pm.Binomial('tn_obs', n=n0, p=pm.math.sigmoid(lsp), observed=tn)
        idata = pm.sample(4000, tune=4000, chains=4, nuts_sampler='nutpie', target_accept=0.99,
                          random_seed=20260612, progressbar=False, compute_convergence_checks=False)
    import arviz as az
    rh = float(az.summary(idata, var_names=['mu_se', 'mu_sp'])['r_hat'].max())
    se_d = idata.posterior['mu_se'].stack(s=('chain', 'draw')).values   # (M, ndraws)
    sp_d = idata.posterior['mu_sp'].stack(s=('chain', 'draw')).values
    rho = float(az.summary(idata, var_names=['chol_corr'])['mean'].iloc[1]) if True else 0.0
    np.savez(NPZ, mu_se=se_d, mu_sp=sp_d, mods=np.array(mods),
             kper=np.array([kper[m] for m in mods]), rhat=rh, rho=rho)
    print(f'fit done, Rhat={rh:.4f}, between-study corr~{rho:.2f}, saved {NPZ}')

d = np.load(NPZ, allow_pickle=True)
mu_se = d['mu_se']; mu_sp = d['mu_sp']; mods = list(d['mods'])
kper = {mods[i]: int(d['kper'][i]) for i in range(len(mods))}
M = len(mods); rhat = float(d['rhat']); rho_biv = float(d['rho'])
sig = lambda x: 1 / (1 + np.exp(-x))
Se = sig(mu_se); Sp = sig(mu_sp)                       # (M, ndraws) pooled draws
J = Se + Sp - 1                                         # Youden J draws
DOR = (Se / (1 - Se)) * (Sp / (1 - Sp))
medJ = np.median(J, axis=1)
order = list(np.argsort(-medJ))                        # best (highest J) first


def certainty(i, j, crosses0):
    down = 1; notes = ['indirect (comparative DTA; not head-to-head)']
    if crosses0:
        down += 1; notes.append('imprecision: J-difference CrI crosses 0')
    if kper[mods[i]] == 1 or kper[mods[j]] == 1:
        down += 1; notes.append('k=1 node INSUFFICIENT')
    if thr_flag[mods[i]]['threshold_effect'] or thr_flag[mods[j]]['threshold_effect']:
        down += 1; notes.append('threshold effect -> SROC, not a single operating point')
    return ['High', 'Moderate', 'Low', 'Very low'][min(down, 3)], '; '.join(notes)


cells = {}
for a in range(M):
    for b in range(M):
        if a == b:
            continue
        i, j = order[a], order[b]
        c = J[i] - J[j]                                # Youden-J difference draws (i better-ranked)
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c > 0))                   # P(test i has higher Youden J than j)
        lvl, note = certainty(i, j, crosses0)
        cells[(i, j)] = {'j_diff': float(np.median(c)), 'cri_jdiff': [float(lo), float(hi)],
                         'p_superiority': psup, 'certainty': lvl, 'note': note}

print('=== DTA bivariate Bayesian league (Youden J; rows vs cols) ===')
for a in range(M):
    i = order[a]
    row = f'{mods[i][:11]:11s}(k={kper[mods[i]]:>2d})  Se={np.median(Se[i]):.2f} Sp={np.median(Sp[i]):.2f} J={medJ[i]:.2f} DOR={np.median(DOR[i]):>5.1f}'
    print(row)
cnt = Counter(v['certainty'] for k, v in {frozenset(k): v for k, v in cells.items()}.items())
k1 = [m for m in mods if kper[m] == 1]
print(f'\nlead by Youden J: {mods[order[0]]} (J={medJ[order[0]]:.2f})')
print(f'certainty across {sum(cnt.values())} comparisons: {dict(cnt)}   Rhat={rhat:.4f}')
print(f'threshold-effect flags: { {m: thr_flag[m]["threshold_effect"] for m in mods} }')
print(f'cross-target heterogeneity (mixed cancer sites {targets}): {cross_target}')

heterogeneity_flag = cross_target or any(thr_flag[m]['threshold_effect'] for m in mods)
results = {
    'class': 'oncologic imaging modalities (comparative DTA)',
    'outcome_type': 'diagnostic test accuracy (paired sensitivity/specificity, bivariate Reitsma)',
    'index_tests': mods, 'kper': kper,
    'pooled': {mods[i]: {'sens': round(float(np.median(Se[i])), 3), 'spec': round(float(np.median(Sp[i])), 3),
                         'sens_cri': [round(float(np.percentile(Se[i], 2.5)), 3), round(float(np.percentile(Se[i], 97.5)), 3)],
                         'spec_cri': [round(float(np.percentile(Sp[i], 2.5)), 3), round(float(np.percentile(Sp[i], 97.5)), 3)],
                         'youden_j': round(float(medJ[i]), 3), 'dor': round(float(np.median(DOR[i])), 1)} for i in range(M)},
    'threshold_flags': thr_flag, 'cross_target_flag': bool(cross_target), 'targets': targets,
    'between_study_corr': round(rho_biv, 2), 'rhat': round(rhat, 4),
    'heterogeneity_flag': bool(heterogeneity_flag),
}
json.dump(results, open(f'{HERE}/dta_results.json', 'w', encoding='utf-8'), indent=1)

league = {
    'class': 'oncologic imaging modalities (comparative DTA)',
    'outcome': 'diagnostic test accuracy -- Youden J (Se+Sp-1) from a Bayesian bivariate Reitsma model',
    'inference': 'hierarchical bivariate (logit-Se, logit-Sp) with 2x2 between-study covariance, binomial likelihood (nutpie); contrasts from posterior draws',
    'ranking': [mods[i] for i in order], 'kper': kper,
    'median_youden_j': {mods[i]: round(float(medJ[i]), 3) for i in range(M)},
    'pooled_sens': {mods[i]: round(float(np.median(Se[i])), 3) for i in range(M)},
    'pooled_spec': {mods[i]: round(float(np.median(Sp[i])), 3) for i in range(M)},
    'rhat': round(rhat, 4), 'between_study_corr': round(rho_biv, 2),
    'comparisons': [{'a': mods[i], 'b': mods[j], 'j_diff': round(cells[(i, j)]['j_diff'], 3),
                     'cri_jdiff': [round(x, 3) for x in cells[(i, j)]['cri_jdiff']],
                     'p_superiority': round(cells[(i, j)]['p_superiority'], 3),
                     'certainty': cells[(i, j)]['certainty'], 'note': cells[(i, j)]['note']}
                    for a in range(M) for b in range(M) if a < b for i, j in [(order[a], order[b])]],
    'certainty_counts': dict(cnt), 'k1_insufficient': k1, 'lead': mods[order[0]],
    'heterogeneity_flag': bool(heterogeneity_flag),
    'depth_note': ('SIXTH outcome type = diagnostic test accuracy. Full-depth Bayesian BIVARIATE (Reitsma) '
                   'league: paired (logit-Se, logit-Sp) with a 2x2 between-study covariance, binomial likelihood '
                   'on registry-reconstructed cells (nutpie), ranked by Youden J with P(superiority). The engine '
                   'self-flags DTA-specific threats the other classes cannot: a threshold-effect check per '
                   'modality (Spearman corr(logitSe, logit(1-Sp))) and a cross-target transitivity flag because '
                   'the AACT network mixes cancer sites -> the cross-modality ranking is NOT a clean winner, the '
                   'DTA echo of the asthma I2=96% / RA proportional-odds flags. Registry-reconstructed 2x2 '
                   '(round(% x N) from posted Se/Sp + subgroup denominators), NOT full-text 2x2 tables. No IPD.'),
}
json.dump(league, open(f'{HERE}/dta_league.json', 'w', encoding='utf-8'), indent=1)
print('\nwrote dta_results.json + dta_league.json (+ dta_biv_draws.npz)')
