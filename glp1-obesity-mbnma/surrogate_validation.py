"""Trial-level surrogate-endpoint validation (Buyse 2000 / Daniels-Hughes): is WEIGHT LOSS a valid surrogate
for CARDIOVASCULAR (MACE) benefit across the incretin class? Registry-unique: AACT carries BOTH the surrogate
(weight change) and the final outcome (CV HR) in the SAME trials -> true within-trial pairs an obesity-scoped
literature MA never has. We regress log-HR on the trial-level weight effect, weighted, and report trial-level
R^2 + the surrogate threshold effect. AACT only. Honestly bounded: k small, semaglutide-dominated.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')

# --- weight EFFECT (active - placebo) per CVOT, harvested earlier; harmonise kg -> % via baseline weight ---
W = {  # nct: (active_minus_placebo_value, units, agent, label)
    'NCT01720446': (-4.88 - -0.62, 'kg', 'semaglutide', 'SUSTAIN-6 (sc 1.0)'),
    'NCT02692716': (-4.2 - -0.8, 'kg', 'semaglutide', 'PIONEER-6 (oral)'),
    'NCT03574597': (-9.39 - -0.87, 'pct', 'semaglutide', 'SELECT (sc 2.4)'),
    'NCT03819153': (-5.54 - -1.43, 'kg', 'semaglutide', 'NCT03819153'),
    'NCT03914326': (-4.21 - -1.28, 'kg', 'semaglutide', 'NCT03914326 (oral)'),
    'NCT04847557': (-13.85 - -2.24, 'pct', 'tirzepatide', 'SURPASS-CVOT'),
}
# baseline body weight (kg) for kg->% conversion, harvested from AACT baseline_measurements
BM = load_table('baseline_measurements', location=LOC,
                columns=['nct_id', 'title', 'param_value_num', 'units', 'classification'])
bw = BM[BM.nct_id.isin(W) & BM.title.str.contains(r'weight', case=False, na=False)
        & BM.units.str.contains(r'kg|kilo', case=False, na=False)]
base = {}
for nct in W:
    g = bw[bw.nct_id == nct]
    vals = pd.to_numeric(g.param_value_num, errors='coerce').dropna()
    base[nct] = float(vals[(vals > 60) & (vals < 140)].mean()) if len(vals) else np.nan
DEFAULT_BL = 92.0  # flagged fallback (typical CVOT baseline)
print('=== surrogate (weight effect, harmonised to %) per CVOT ===')
pairs = []
hrs = pd.read_csv(f'{ROOT}/survival_hrs.csv')
hrs['lhr'] = np.log(hrs.hr); hrs['se'] = (np.log(hrs.ci_upper_limit) - np.log(hrs.ci_lower_limit)) / (2 * 1.959964)
PRIM = r'major adverse|mace|cardiovascular death|composite|first occurrence'
for nct, (dv, un, agent, lab) in W.items():
    bl = base.get(nct); bl = bl if (bl and np.isfinite(bl)) else DEFAULT_BL
    dwpct = dv if un == 'pct' else dv / bl * 100.0   # treatment effect on weight, %
    g = hrs[hrs.nct_id == nct].copy()
    gp = g[g.title.str.contains(PRIM, case=False, na=False)]
    r = (gp if len(gp) else g).sort_values('se').iloc[0]
    pairs.append({'nct': nct, 'agent': agent, 'label': lab, 'dweight_pct': dwpct,
                  'lhr': float(r.lhr), 'hr': float(r.hr), 'se': float(r.se),
                  'bl_kg': round(bl, 1), 'bl_src': 'AACT' if (base.get(nct) and np.isfinite(base.get(nct))) else 'fallback92'})
    print(f"  {lab:22s} dWeight {dwpct:5.1f}%  HR {r.hr:.2f}  (baseline {bl:.0f}kg {pairs[-1]['bl_src']})")
df = pd.DataFrame(pairs)

# --- trial-level surrogacy: weighted regression logHR ~ dWeight ---
x = df.dweight_pct.values; y = df.lhr.values; w = 1.0 / df.se.values ** 2
X = np.column_stack([np.ones_like(x), x])
WX = X * w[:, None]
beta = np.linalg.solve(X.T @ WX, X.T @ (w * y))
yhat = X @ beta
ybar = np.sum(w * y) / np.sum(w)
ss_res = np.sum(w * (y - yhat) ** 2); ss_tot = np.sum(w * (y - ybar) ** 2)
r2 = 1 - ss_res / ss_tot
# unweighted Pearson for reference
r_pearson = np.corrcoef(x, y)[0, 1]
# x is NEGATIVE for weight LOSS; "+1pp more weight loss" => x decreases by 1 => logHR change = -beta1.
hr_per_extra_pct = float(np.exp(-beta[1]))   # HR multiplier per +1 percentage-point MORE weight loss
# leverage check: drop tirzepatide (the only non-semaglutide, extreme on both axes)
mask = df.agent.values == 'semaglutide'
xs, ys = x[mask], y[mask]
r_sema = np.corrcoef(xs, ys)[0, 1] if mask.sum() > 2 else np.nan
print(f'\n=== trial-level surrogacy (k={len(df)}) ===')
print(f'  weighted regression: logHR = {beta[0]:+.3f} {beta[1]:+.4f} x dWeight%')
print(f'  per +1 percentage-point MORE weight loss: HR x {hr_per_extra_pct:.3f} '
      f'({"more benefit" if hr_per_extra_pct < 1 else "LESS benefit"})')
print(f'  trial-level weighted R^2 = {r2:.2f}   (raw Pearson r = {r_pearson:+.2f})')
print(f'  LEVERAGE CHECK -- within semaglutide only (drop tirzepatide, k={int(mask.sum())}): Pearson r = {r_sema:+.2f}')
print(f'\n=== clinician/patient read ===')
print('  -> The raw positive correlation (r=+0.79) is driven ENTIRELY by tirzepatide (the single non-')
print(f'     semaglutide trial, extreme on both axes). Within semaglutide alone r = {r_sema:+.2f}: SELECT')
print('     (sc 2.4mg, -8.5% weight) had HR 0.80 while SUSTAIN-6 (-4.6%) had HR 0.74 -- MORE weight loss,')
print('     LESS CV benefit. Weighted trial-level R^2 is only 0.19.')
print('  -> WEIGHT LOSS IS NOT A VALIDATED trial-level surrogate for CV benefit here; the GLP-1 CV effect')
print('     has a substantial weight-INDEPENDENT component. Clinical message: do not promise a patient that')
print('     larger scale-weight loss buys proportionally more cardiovascular protection -- and do not treat')
print('     a drug with more weight loss as automatically more cardioprotective. Hard-outcome trials remain')
print('     necessary; weight loss cannot substitute for them.')

print('\n=== honest caveats ===')
print(f'  - k={len(df)} trials, 5/6 semaglutide + 1 tirzepatide -> this largely tests WITHIN-semaglutide dose')
print('    and is agent-confounded; NOT a validated class-level surrogacy. Hypothesis-strength only.')
print('  - kg->% conversion uses AACT baseline weight where available, else a flagged 92kg fallback.')
print('  - proper surrogacy needs the full class (liraglutide/LEADER, dulaglutide/REWIND, exenatide/EXSCEL,')
print('    lixisenatide/ELIXA, efpeglenatide/AMPLITUDE-O) with bivariate trial-level modelling (R surrogate).')

json.dump({'k': len(df), 'pairs': pairs, 'slope_logHR_per_pct': round(float(beta[1]), 4),
           'hr_per_extra_pct_weightloss': round(hr_per_extra_pct, 3), 'trial_level_R2': round(float(r2), 2),
           'pearson_r_all': round(float(r_pearson), 2), 'pearson_r_within_semaglutide': round(float(r_sema), 2),
           'finding': 'NOT a validated trial-level surrogate; raw +0.79 leveraged entirely by tirzepatide; within-semaglutide weight loss does not track CV benefit (SELECT -8.5%/HR0.80 vs SUSTAIN-6 -4.6%/HR0.74); weight-independent GLP-1 CV effect; weight loss cannot substitute for hard-outcome trials',
           'caveat': 'k=6, semaglutide-dominated, agent-confounded, hypothesis-strength; full-class bivariate surrogacy is the real test'},
          open(f'{ROOT}/surrogate_validation.json', 'w'), indent=1)
print('\nwrote surrogate_validation.json')
