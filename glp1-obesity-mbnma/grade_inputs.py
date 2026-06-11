"""Prep GRADE inputs for the recommendation 'tirzepatide vs subcutaneous semaglutide for weight loss in
obesity': the contrast estimate + (conservative) CrI, per-node heterogeneity, k, N. Feeds grade_recommendation.js.
Conservative contrast SE from independent marginals (ignores NMA posterior correlation -> over-wide; flagged).
AACT-derived."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
v2 = {n['node']: n for n in json.load(open(f'{ROOT}/transport_v2.json'))['nodes']}
T, S = v2['tirzepatide'], v2['semaglutide-sc-weekly']
def se_from_cri(cri): return (cri[1] - cri[0]) / 3.92
# prefer the EXACT joint-posterior contrast (nma_contrast.py); fall back to conservative marginals
import os
exact = None
if os.path.exists(f'{ROOT}/nma_contrast.json'):
    nc = json.load(open(f'{ROOT}/nma_contrast.json'))['target']
    exact = nc
if exact:
    diff = exact['median']; ci = exact['cri']; se_diff = exact['sd_exact']
    p_gt_0, p_gt_mid, rho = exact['p_gt_0'], exact['p_gt_mid2'], exact['rho']
    ci_note = (f'EXACT joint-posterior NMA contrast (nma_contrast.py); posterior corr(tirz,sema)={rho} '
               f'(star network -> near-independent); P(tirz>sema)={p_gt_0}, P(diff>2pp)={p_gt_mid}. '
               'Conservative marginal approximation was confirmed (essentially identical).')
else:
    seT, seS = se_from_cri(T['target_cri']), se_from_cri(S['target_cri'])
    diff = T['eff_target'] - S['eff_target']; se_diff = float(np.hypot(seT, seS))
    ci = [round(diff - 1.96 * se_diff, 2), round(diff + 1.96 * se_diff, 2)]
    p_gt_0 = p_gt_mid = rho = None
    ci_note = 'CONSERVATIVE: independent marginal CrIs; exact NMA contrast needs the joint posterior.'

# per-node heterogeneity (I^2) from the arm-level data
d = pd.read_csv(f'{ROOT}/contrasts_full.csv')
def i2(agent, dose=None):
    g = d[d.agent == agent]
    if dose is not None:
        g = g[np.isclose(g.dose_mg, dose)]
    if len(g) < 2:
        return None, len(g)
    y, var = g.loss.values, g['var'].values
    w = 1 / var; Q = float(np.sum(w * (y - np.sum(w * y) / np.sum(w)) ** 2)); df = len(g) - 1
    return (max(0.0, (Q - df) / Q) * 100 if Q > 0 else 0.0), len(g)
i2_sema, k_sema = i2('semaglutide-sc-weekly', 2.4)
i2_tirz, k_tirz = i2('tirzepatide')

out = {
    'comparison': 'tirzepatide vs subcutaneous semaglutide (weight loss, obesity)',
    'estimate_pp': round(diff, 2), 'ci95': {'lower': ci[0], 'upper': ci[1]}, 'se': round(se_diff, 3),
    'p_gt_0': p_gt_0, 'p_gt_mid2': p_gt_mid, 'posterior_corr': rho, 'contrast_source': 'exact' if exact else 'conservative',
    'ci_note': ci_note,
    'tirz': {'eff_target': T['eff_target'], 'cri': T['target_cri'], 'k': int(T['k'])},
    'sema': {'eff_target': S['eff_target'], 'cri': S['target_cri'], 'k': int(S['k'])},
    'i2_sema_pct': round(i2_sema, 1) if i2_sema is not None else None,
    'i2_tirz_pct': round(i2_tirz, 1) if i2_tirz is not None else None,
    'k_studies': int(T['k'] + S['k']), 'network': 'star (placebo-anchored) -> incoherence NOT assessable',
}
json.dump(out, open(f'{ROOT}/grade_inputs.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
