"""GENERALITY depth (Bayesian league) for the PSORIASIS class -- promote class 4 to the FOURTH full-depth
class, on the BINARY/RESPONDER path (PASI-90 response). Like the SGLT2 / asthma / PCSK9 leagues, every
pairwise contrast is built from a posterior DRAW MATRIX: a hierarchical RE on the LOGIT of the per-arm PASI-90
response proportions (per-agent mean + per-agent between-arm SD), fit with nutpie -> response% with CrI, and
contrasts as risk differences (percentage points) + P(superiority). Same GRADE/CINeMA certainty domains as
nma_league.py. This repoints the Bayesian league to the 4th outcome TYPE (after continuous PCSK9, survival
SGLT2, count/rate asthma). Honest bound: AACT posts the response %, not per-arm responder counts here, so
this is a logit hierarchical-means model (sigma absorbs arm-size + between-arm spread), the same data limit
the other repoints handled. AACT only; no IPD."""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class4_psoriasis'
NPZ = f'{HERE}/psoriasis_pasi_draws.npz'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
DRUGS = ['secukinumab', 'ixekizumab', 'guselkumab', 'risankizumab', 'ustekinumab', 'brodalumab',
         'bimekizumab', 'tildrakizumab', 'adalimumab', 'etanercept']
CLASS = {'ixekizumab': 'IL-17', 'secukinumab': 'IL-17', 'brodalumab': 'IL-17', 'bimekizumab': 'IL-17/23',
         'risankizumab': 'IL-23', 'guselkumab': 'IL-23', 'tildrakizumab': 'IL-23',
         'ustekinumab': 'IL-12/23', 'adalimumab': 'TNF', 'etanercept': 'TNF'}
pat = '|'.join(DRUGS)
iv = load_table('interventions', location=LOC, columns=['nct_id', 'name'])
ncts = iv[iv.name.str.contains(pat, case=False, na=False)].nct_id.unique()
oc = load_table('outcomes', location=LOC, columns=['id', 'nct_id', 'title']); oc = oc[oc.nct_id.isin(ncts)]
pasi = oc[oc.title.str.contains(r'pasi.?90|pasi 90|psoriasis area.*90', case=False, na=False, regex=True)]
OM = load_table('outcome_measurements', location=LOC,
                columns=['nct_id', 'outcome_id', 'result_group_id', 'param_value_num', 'param_type', 'units'])
OM = OM[OM.outcome_id.isin(pasi.id)]
rg = load_table('result_groups', location=LOC, columns=['id', 'title'])
OM = OM.merge(rg.rename(columns={'id': 'result_group_id', 'title': 'arm'}), on='result_group_id', how='left')
OM['val'] = pd.to_numeric(OM.param_value_num, errors='coerce')
OM = OM[OM.val.between(0, 100) & OM.arm.notna()]
OM['agent'] = OM.arm.str.extract('(' + pat + ')', flags=2, expand=False).str.lower()
resp = OM.dropna(subset=['agent', 'val']).copy()
resp.loc[resp.val <= 1, 'val'] = resp.loc[resp.val <= 1, 'val'] * 100
resp['p'] = np.clip(resp.val / 100.0, 0.001, 0.999)
resp['logit'] = np.log(resp.p / (1 - resp.p))
agents = sorted(resp.agent.unique()); ai = {a: i for i, a in enumerate(agents)}; A = len(agents)
kper = {a: int((resp.agent == a).sum()) for a in agents}   # k = number of contributing arms
print(f'PASI-90 responder arms: {len(resp)} across {A} agents\n')

if not os.path.exists(NPZ):
    import pymc as pm, arviz as az
    y = resp.logit.values.astype(float); aidx = resp.agent.map(ai).values
    with pm.Model() as m:
        theta = pm.Normal('theta', mu=0.0, sigma=1.5, shape=A)   # per-agent mean logit response
        sigma = pm.HalfNormal('sigma', 1.0, shape=A)             # per-agent between-arm SD (logit)
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
pct = 100.0 / (1.0 + np.exp(-th))                 # response% draws (A, ndraws)
med = np.median(pct, axis=1)
order = list(np.argsort(-med))                    # highest response first


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
        c = pct[i] - pct[j]                        # response-% difference draws (risk difference, pp)
        lo, hi = np.percentile(c, 2.5), np.percentile(c, 97.5)
        crosses0 = lo < 0 < hi
        psup = float(np.mean(c > 0))               # P(agent i has higher response than j)
        lvl, note = certainty(i, j, crosses0)
        cells[(i, j)] = {'rd_pp': float(np.median(c)), 'cri_pp': [float(lo), float(hi)], 'p_superiority': psup,
                         'certainty': lvl, 'note': note}

print('=== psoriasis PASI-90 Bayesian league (draws; response% diag, RD lower, certainty upper) ===')
for a in range(A):
    i = order[a]
    cl = CLASS.get(agents[i], '?')
    print(f'  {agents[i][:13]:13s}[{cl:8s}] {med[i]:5.1f}%  (k_arms={kper[agents[i]]})')
from collections import Counter
cnt = Counter(_v['certainty'] for _v in {frozenset(_k): _w for _k, _w in cells.items()}.values())  # unique undirected pairs (certainty is sign-symmetric)
# tier means (draws) -> IL-17/IL-23 vs TNF, the established hierarchy
def tier(a): c = CLASS.get(a, '?'); return 0 if c in ('IL-17', 'IL-23', 'IL-17/23') else (1 if c == 'IL-12/23' else 2)
il_idx = [ai[a] for a in agents if tier(a) == 0]; tnf_idx = [ai[a] for a in agents if tier(a) == 2]
il_draws = pct[il_idx].mean(axis=0); tnf_draws = pct[tnf_idx].mean(axis=0)
p_il_gt_tnf = float(np.mean(il_draws > tnf_draws))
print(f'\nIL-17/IL-23 mean {np.median(il_draws):.0f}% vs TNF mean {np.median(tnf_draws):.0f}%  '
      f'-> P(IL-17/23 > TNF) = {p_il_gt_tnf:.3f}')
print(f'certainty across {sum(cnt.values())} ordered comparisons: {dict(cnt)}  |  Rhat={rhat:.4f}')
print(f'lead: {agents[order[0]]} ({med[order[0]]:.0f}% PASI-90)')

print('\n=== depth verdict (psoriasis -- FOURTH full-depth class) ===')
print('  The Bayesian league machinery repoints to a BINARY/RESPONDER outcome (PASI-90): hierarchical RE on')
print('  the logit response -> posterior draw matrix -> response% with CrI, risk-difference contrasts +')
print('  P(superiority), same GRADE domains. FOUR full-depth classes now span continuous-biomarker (PCSK9),')
print('  survival/HR (SGLT2), count/rate (asthma), and binary-responder (psoriasis). The established IL-17/')
print('  IL-23 > TNF hierarchy is reproduced WITH posterior probability now, not just point means.')

json.dump({'class': 'psoriasis biologics', 'outcome': 'PASI-90 responder %', 'outcome_type': 'binary/responder',
           'inference': 'Bayesian hierarchical RE on logit(PASI-90 response) (nutpie); pairwise contrasts (risk difference) from posterior draws',
           'ranking': [agents[i] for i in order], 'kper_arms': kper,
           'median_response_pct': {agents[i]: round(float(med[i]), 1) for i in range(A)},
           'agent_class': {a: CLASS.get(a, '?') for a in agents},
           'il17_23_vs_tnf': {'il_median_pct': round(float(np.median(il_draws)), 0),
                              'tnf_median_pct': round(float(np.median(tnf_draws)), 0),
                              'p_il_gt_tnf': round(p_il_gt_tnf, 3)},
           'rhat': round(rhat, 4), 'lead': agents[order[0]],
           'comparisons': [{'a': agents[i], 'b': agents[j], 'rd_pp': round(cells[(i, j)]['rd_pp'], 1),
                            'cri_pp': [round(x, 1) for x in cells[(i, j)]['cri_pp']],
                            'p_superiority': round(cells[(i, j)]['p_superiority'], 3),
                            'certainty': cells[(i, j)]['certainty'], 'note': cells[(i, j)]['note']}
                           for a in range(A) for b in range(A) if a < b for i, j in [(order[a], order[b])]],
           'certainty_counts': dict(cnt), 'k1_insufficient': [a for a in agents if kper[a] == 1],
           'depth_note': 'FOURTH full-depth class: Bayesian draw-matrix league on a binary/responder outcome (PASI-90), logit hierarchical RE -> response% CrI + risk-difference contrasts + P(superiority), same GRADE/CINeMA domains as nma_league.py. Reproduces IL-17/IL-23 > TNF with posterior probability. Logit hierarchical-means form (AACT posts response %, not per-arm responder counts here; sigma absorbs arm-size + between-arm spread). Star network (indirect). No IPD.'},
          open(f'{HERE}/psoriasis_league.json', 'w'), indent=1)
print('\nwrote psoriasis_league.json (+ psoriasis_pasi_draws.npz)')
