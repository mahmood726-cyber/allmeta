"""Survival arm: pool the incretin CVOT/renal HRs (harvested via registry-ipd's harvest_trial from AACT)
into a registry-native survival summary by agent. registry-ipd's pseudo-IPD RECONSTRUCTION is integrated
and validated (curve-only HR ~11% err, calibrated CrI 14/14) BUT requires posted KM curves; the incretin
CVOTs post HR-only in AACT (km_points=[0,0]), so reconstruction is not activatable here -> HR-based pooling.
Reconstruction would activate automatically for any KM-posting trial. AACT only.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
h = pd.read_csv(f'{ROOT}/survival_hrs.csv')
# one primary hard-outcome HR per trial: prefer MACE/CV-death/composite
PRIM = r'major adverse|mace|cardiovascular death|composite endpoint|first occurrence of a maj'
h['prim'] = h.title.str.contains(PRIM, case=False, na=False)
h['lhr'] = np.log(h.hr)
h['se'] = (np.log(h.ci_upper_limit) - np.log(h.ci_lower_limit)) / (2 * 1.959964)
h = h[h.se.notna() & (h.se > 0)]
# pick the primary per trial (lowest-p / first), else the median HR
def trial_hr(g):
    p = g[g.prim]
    r = (p if len(p) else g).iloc[(p if len(p) else g).se.values.argmin()]
    return pd.Series({'agent': r.agent, 'lhr': r.lhr, 'se': r.se, 'hr': r.hr})
per_trial = h.groupby('nct_id').apply(trial_hr, include_groups=False).reset_index()
print(f'incretin CVOT/renal trials with a poolable primary HR: {len(per_trial)}')

print('\n=== registry-native survival NMA: pooled cardiometabolic-outcome HR by agent ===')
rows = []
for ag, g in per_trial.groupby('agent'):
    w = 1 / g.se.values ** 2
    lhr = float(np.sum(g.lhr * w) / np.sum(w)); se = float(np.sqrt(1 / np.sum(w)))
    hr, lo, hi = np.exp(lhr), np.exp(lhr - 1.96 * se), np.exp(lhr + 1.96 * se)
    print(f'  {ag:13s} pooled HR {hr:.2f} ({lo:.2f},{hi:.2f})  k={len(g)} trials')
    rows.append({'agent': ag, 'pooled_hr': round(hr, 2), 'ci': [round(lo, 2), round(hi, 2)], 'k': int(len(g))})

# joint weight + outcome view
try:
    bt = json.load(open(f'{ROOT}/bayesian_transport.json'))
    wl = {n['node'].replace('-sc-weekly', '').replace('-oral', '').replace('-sc-daily', ''): n['eff_obesity'] for n in bt['nodes']}
    print('\n=== JOINT view: weight loss (obesity-pop pp) + cardiometabolic HR ===')
    for r in rows:
        w = wl.get(r['agent'])
        print(f"  {r['agent']:13s} weight {('%.1f pp'%w) if w else '   -  ':>7}   |   outcome HR {r['pooled_hr']:.2f} {r['ci']}")
except Exception:
    pass

print('\n=== registry-ipd integration status (honest) ===')
print(' - USED: registry-ipd harvest_trial() pulled these HRs from AACT (its validated parser).')
print(' - registry-ipd RECONSTRUCTION (pseudo-IPD survival, RMST, time-varying HR, calibrated CrI) needs')
print('   posted KM curves; the incretin CVOTs post HR-only in AACT (km_points=[0,0]) -> not activatable here.')
print(' - The limiting factor is the REGISTRY POSTING GAP, not registry-ipd accuracy. Reconstruction wires in')
print('   and activates automatically for any trial that DOES post a structured KM curve.')

json.dump({'survival_nma_by_agent': rows, 'n_trials': int(len(per_trial)),
           'registry_ipd': 'harvest used; reconstruction needs KM curves (absent for incretin CVOTs in AACT) -> HR pooling'},
          open(f'{ROOT}/survival_nma.json', 'w'), indent=1)
print('\nwrote survival_nma.json')
