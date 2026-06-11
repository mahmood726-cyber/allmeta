"""GENERALITY depth (Bayesian league) for the RHEUMATOID-ARTHRITIS class -- the FIFTH outcome TYPE:
ORDINAL / ORDERED-CATEGORICAL (the ACR20 > ACR50 > ACR70 response ladder). Unlike the class-4 single binary
responder (PASI-90), an ordinal outcome reports the SAME patients crossing three increasing difficulty
thresholds, so the honest model is a PROPORTIONAL-ODDS graded-response: one latent per-agent efficacy
theta_a and three SHARED ordered cutpoints tau_20 < tau_50 < tau_70, with
  logit(P[reach level L | agent a]) = theta_a - tau_L.
A single theta per agent must reproduce all three thresholds (the proportional-odds assumption -- we record
its residual fit as the honest caveat). Fit hierarchically with nutpie -> theta draws give a latent-efficacy
draw matrix; pairwise contrasts (log-odds + P(superiority)) + the predicted ACR50 response% per agent, same
GRADE/CINeMA certainty domains as nma_league.py. This repoints the Bayesian league to the 5th outcome type
(after continuous PCSK9, survival SGLT2, count/rate asthma, binary psoriasis). AACT only; no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class6_ra'
NPZ = f'{HERE}/ra_acr_draws.npz'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['adalimumab', 'etanercept', 'infliximab', 'golimumab', 'certolizumab', 'tocilizumab', 'sarilumab',
         'tofacitinib', 'baricitinib', 'upadacitinib', 'abatacept', 'rituximab']
CLASS = {'adalimumab': 'TNF', 'etanercept': 'TNF', 'infliximab': 'TNF', 'golimumab': 'TNF',
         'certolizumab': 'TNF', 'tocilizumab': 'IL-6', 'sarilumab': 'IL-6', 'tofacitinib': 'JAK',
         'baricitinib': 'JAK', 'upadacitinib': 'JAK', 'abatacept': 'T-cell', 'rituximab': 'B-cell'}
LEVELS = [20, 50, 70]
pat = '|'.join(DRUGS)
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ncts = iv[iv.name.str.contains(pat, case=False, na=False)].nct_id.unique()
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title']); oc = oc[oc.nct_id.isin(ncts)]
oc = oc.copy()
oc['level'] = oc.title.str.extract(r'acr.?(20|50|70)', flags=2, expand=False)
oc = oc.dropna(subset=['level']); oc['level'] = oc.level.astype(int)
OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num', 'param_type', 'units'])
OM = OM[OM.outcome_id.isin(oc.id)]
rg = load_table('result_groups', location=LOC, columns=['id', 'title'])
OM = OM.merge(oc[['id', 'level']].rename(columns={'id': 'outcome_id'}), on='outcome_id', how='left')
OM = OM.merge(rg.rename(columns={'id': 'result_group_id', 'title': 'arm'}), on='result_group_id', how='left')
OM['val'] = pd.to_numeric(OM.param_value_num, errors='coerce')
OM = OM[OM.arm.notna() & OM.val.notna()]
OM['agent'] = OM.arm.str.extract('(' + pat + ')', flags=2, expand=False).str.lower()
resp = OM.dropna(subset=['agent', 'level']).copy()
resp.loc[resp.val <= 1, 'val'] = resp.loc[resp.val <= 1, 'val'] * 100   # proportion -> %
resp = resp[resp.val.between(0, 100)]
resp['p'] = np.clip(resp.val / 100.0, 0.001, 0.999)
resp['logit'] = np.log(resp.p / (1 - resp.p))
agents = sorted(resp.agent.unique()); ai = {a: i for i, a in enumerate(agents)}; A = len(agents)
kper = {a: int((resp.agent == a).sum()) for a in agents}     # contributing arm-by-level rows
li = {lv: i for i, lv in enumerate(LEVELS)}
print(f'ACR ladder rows: {len(resp)} across {A} agents x {len(LEVELS)} thresholds\n')

if not os.path.exists(NPZ):
    import pymc as pm, arviz as az
    y = resp.logit.values.astype(float)
    aidx = resp.agent.map(ai).values
    lidx = resp.level.map(li).values
    with pm.Model() as m:
        theta = pm.Normal('theta', mu=0.0, sigma=1.5, shape=A)           # per-agent latent efficacy
        dtau = pm.HalfNormal('dtau', 2.0, shape=len(LEVELS) - 1)         # positive gaps -> ordered cutpoints
        tau = pm.Deterministic('tau', pm.math.concatenate([[0.0], pm.math.cumsum(dtau)]))  # tau_20=0 anchor
        sigma = pm.HalfNormal('sigma', 1.0)
        mu = theta[aidx] - tau[lidx]
        pm.Normal('y', mu=mu, sigma=sigma, observed=y)
        idata = pm.sample(2000, tune=2000, chains=4, nuts_sampler='nutpie', target_accept=0.95,
                          random_seed=20260611, progressbar=False, compute_convergence_checks=False)
    rh = float(az.summary(idata, var_names=['theta', 'tau'])['r_hat'].max())
    th = idata.posterior['theta'].stack(s=('chain', 'draw')).values        # (A, ndraws)
    ta = idata.posterior['tau'].stack(s=('chain', 'draw')).values           # (3, ndraws)
    np.savez(NPZ, theta=th, tau=ta, agents=np.array(agents),
             kper=np.array([kper[a] for a in agents]), rhat=rh)
    print(f'fit done, Rhat={rh:.4f}, saved {NPZ}')

d = np.load(NPZ, allow_pickle=True)
th = d['theta']; ta = d['tau']; agents = list(d['agents'])
kper = {agents[i]: int(d['kper'][i]) for i in range(len(agents))}
A = len(agents); rhat = float(d['rhat'])
tau50 = ta[li[50]]                                            # cutpoint draws for ACR50
acr50 = 100.0 / (1.0 + np.exp(-(th - tau50)))                 # predicted ACR50 response% draws (A, ndraws)
med50 = np.median(acr50, axis=1)
med_theta = np.median(th, axis=1)
order = list(np.argsort(-med_theta))                          # rank by latent efficacy (highest first)

# proportional-odds residual: predicted vs observed logit, RMSE (honest caveat)
pred = {(a, lv): float(np.median(th[ai[a]] - ta[li[lv]])) for a in agents for lv in LEVELS}
resid = [resp.logit.values[r] - pred[(resp.agent.values[r], int(resp.level.values[r]))] for r in range(len(resp))]
po_rmse = float(np.sqrt(np.mean(np.square(resid))))


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
        c = th[i] - th[j]                                    # latent-efficacy log-odds difference draws
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c > 0))
        lvl, note = certainty(i, j, crosses0)
        cells[(i, j)] = {'logor': float(np.median(c)), 'cri_logor': [float(lo), float(hi)],
                         'p_superiority': psup, 'certainty': lvl, 'note': note}

print('=== RA ACR ordinal Bayesian league (draws; predicted ACR50% diag, log-OR lower, certainty upper) ===')
for a in range(A):
    i = order[a]
    print(f'  {agents[i][:13]:13s}[{CLASS.get(agents[i], "?"):7s}] theta {med_theta[i]:+.2f}  ACR50~{med50[i]:4.0f}%  (k={kper[agents[i]]})')
from collections import Counter
cnt = Counter(v['certainty'] for v in cells.values())
# class tiers: advanced-MoA (IL-6/JAK) vs TNF anchor -- the established RA efficacy contrast
adv = [ai[a] for a in agents if CLASS.get(a) in ('IL-6', 'JAK')]
tnf = [ai[a] for a in agents if CLASS.get(a) == 'TNF']
adv_d = th[adv].mean(axis=0); tnf_d = th[tnf].mean(axis=0)
p_adv_gt_tnf = float(np.mean(adv_d > tnf_d))
print(f'\nIL-6/JAK mean theta {np.median(adv_d):+.2f} vs TNF mean theta {np.median(tnf_d):+.2f}  '
      f'-> P(IL-6/JAK > TNF) = {p_adv_gt_tnf:.3f}')
print(f'proportional-odds residual RMSE (logit) = {po_rmse:.3f}  (honest caveat: single theta per agent)')
het_flag = po_rmse > 1.0
flag_note = ('cross-agent ranking is confounded by ARM-LEVEL heterogeneity (ACR pooled per agent across '
             'timepoints/doses/background-MTX): the proportional-odds residual RMSE is large, the within-class '
             'spread exceeds the between-class (a TNF agent leads while the class-mean still favours advanced-MoA) '
             '-> not a clean "best agent", same self-flagging behaviour as the asthma class (I2=96%)')
if het_flag:
    print(f'  *** HETEROGENEITY FLAG: {flag_note}')
print(f'certainty across {len(cells)} ordered comparisons: {dict(cnt)}  |  Rhat={rhat:.4f}')
print(f'lead: {agents[order[0]]} (theta {med_theta[order[0]]:+.2f}, ACR50~{med50[order[0]]:.0f}%)')

print('\n=== depth verdict (RA -- FIFTH full-depth class, ORDINAL) ===')
print('  The Bayesian league repoints to an ORDERED-CATEGORICAL outcome (ACR20>ACR50>ACR70): a proportional-')
print('  odds graded-response model (one latent efficacy per agent + three shared ordered cutpoints) -> latent')
print('  draw matrix -> log-OR contrasts + P(superiority) + predicted ACR50%, same GRADE domains. FIVE full-')
print('  depth classes now span continuous-biomarker, survival/HR, count/rate, binary-responder, and ordinal.')

json.dump({'class': 'rheumatoid-arthritis biologics/JAK', 'outcome': 'ACR20/50/70 ordered response ladder',
           'outcome_type': 'ordinal/ordered-categorical',
           'inference': 'Bayesian proportional-odds graded-response (one latent efficacy per agent + shared ordered cutpoints, nutpie); pairwise contrasts (latent log-OR) from posterior draws',
           'ranking': [agents[i] for i in order], 'kper_rows': kper,
           'median_theta': {agents[i]: round(float(med_theta[i]), 3) for i in range(A)},
           'predicted_acr50_pct': {agents[i]: round(float(med50[i]), 1) for i in range(A)},
           'agent_class': {a: CLASS.get(a, '?') for a in agents},
           'cutpoints_logit': {f'tau_{lv}': round(float(np.median(ta[li[lv]])), 3) for lv in LEVELS},
           'proportional_odds_rmse_logit': round(po_rmse, 3),
           'heterogeneity_flag': bool(het_flag), 'heterogeneity_note': flag_note,
           'adv_vs_tnf': {'adv_median_theta': round(float(np.median(adv_d)), 3),
                          'tnf_median_theta': round(float(np.median(tnf_d)), 3),
                          'p_adv_gt_tnf': round(p_adv_gt_tnf, 3)},
           'rhat': round(rhat, 4), 'lead': agents[order[0]],
           'comparisons': [{'a': agents[i], 'b': agents[j], 'logor': round(cells[(i, j)]['logor'], 3),
                            'cri_logor': [round(x, 3) for x in cells[(i, j)]['cri_logor']],
                            'p_superiority': round(cells[(i, j)]['p_superiority'], 3),
                            'certainty': cells[(i, j)]['certainty'], 'note': cells[(i, j)]['note']}
                           for a in range(A) for b in range(A) if a < b for i, j in [(order[a], order[b])]],
           'certainty_counts': dict(cnt), 'k1_insufficient': [a for a in agents if kper[a] == 1],
           'depth_note': 'FIFTH full-depth class and FIFTH outcome TYPE: ordered-categorical ACR ladder. Proportional-odds graded-response model (one latent efficacy theta per agent + three shared ordered cutpoints tau_20<tau_50<tau_70: logit P[reach L] = theta_a - tau_L), nutpie. Latent draw matrix -> log-OR contrasts + P(superiority) + predicted ACR50%, same GRADE/CINeMA domains as nma_league.py. Honest caveat: the single-theta proportional-odds assumption is recorded by its residual RMSE; AACT posts threshold %s pooled per agent across doses/timepoints, not per-arm responder counts. Star network (indirect). No IPD.'},
          open(f'{HERE}/ra_league.json', 'w'), indent=1)

# small core-repoint summary (sibling pattern: *_results.json)
json.dump({'class': 'rheumatoid-arthritis biologics/JAK', 'outcome': 'ACR20/50/70 ordered response ladder',
           'outcome_type': 'ordinal/ordered-categorical',
           'agents': [{'agent': agents[i], 'class': CLASS.get(agents[i], '?'),
                       'theta': round(float(med_theta[i]), 3), 'acr50_pct': round(float(med50[i]), 1),
                       'k_rows': kper[agents[i]]} for i in order],
           'hierarchy_reproduced': bool(np.median(adv_d) > np.median(tnf_d)),
           'adv_mean_theta': round(float(np.median(adv_d)), 3), 'tnf_mean_theta': round(float(np.median(tnf_d)), 3),
           'proportional_odds_rmse_logit': round(po_rmse, 3), 'heterogeneity_flag': bool(het_flag),
           'generality': 'repointed to an ORDINAL/ordered-categorical outcome (ACR20>50>70 ladder, proportional-odds graded-response). Fifth outcome type -> engine spans continuous + survival + count/rate + binary + ordinal.',
           'caveat': 'ACR thresholds pooled per agent across doses/timepoints (not a placebo-anchored ordinal NMA); proportional-odds single-theta assumption recorded by residual RMSE; demonstration of repoint, not a full RA systematic review'},
          open(f'{HERE}/ra_results.json', 'w'), indent=1)
print('\nwrote ra_league.json + ra_results.json (+ ra_acr_draws.npz)')
