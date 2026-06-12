"""Workstream B (transport, labelled SENSITIVITY): transport node effects to the NHANES US
obese-adult target on the diabetes modifier. The diabetes-attenuation slope is estimated from
WITHIN-AGENT obesity-vs-T2D contrasts (semaglutide 2.4 mg) -> avoids the across-trial ecological
fallacy for the modifier itself. Reported strictly as an external-validity SENSITIVITY analysis
with caveats; NOT a primary real-world effect (no IPD; see TRANSPORTABILITY.md). AACT + abstracts only.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))
tcov = pd.read_csv(f'{ROOT}/transitivity.csv').set_index('nct')
pop = tcov['population'].to_dict()
NHANES_DIAB = 0.26


def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a


def contrasts():
    rows = []
    for nct, g in arms.groupby('nct'):
        pl = g[g.agent == 'placebo']
        if pl.empty or pd.isna(pl.var_of_mean.iloc[0]):
            continue
        pm, pv = pl.mean_pct.iloc[0], pl.var_of_mean.iloc[0]
        for _, r in g[(g.agent != 'placebo') & (g.wk >= 36)].iterrows():
            if pd.isna(r.var_of_mean):
                continue
            rows.append({'nct': nct, 'node': node_of(r.agent, r.dose_mg, r.schedule), 'agent': r.agent,
                         'dose': r.dose_mg, 'loss': pm - r.mean_pct, 'var': r.var_of_mean + pv,
                         't2d': 1.0 if pop.get(nct) == 'T2D' else 0.0})
    return pd.DataFrame(rows)


c = contrasts()

# --- diabetes-attenuation slope from WITHIN-AGENT semaglutide 2.4 mg (obesity vs T2D) ---
sem = c[(c.agent == 'semaglutide') & (np.abs(c.dose - 2.4) < 1e-6)]
ob = sem[sem.t2d == 0]; t2 = sem[sem.t2d == 1]
def ivw(d):
    w = 1 / d['var'].values; return float(np.sum(d.loss * w) / np.sum(w)), float(np.sqrt(1 / np.sum(w)))
if len(ob) and len(t2):
    eo, seo = ivw(ob); et, set_ = ivw(t2)
    beta = eo - et            # attenuation going 0% -> 100% diabetes (pp)
    beta_se = np.sqrt(seo**2 + set_**2)
    print(f'diabetes-attenuation (semaglutide 2.4 mg, within-agent): obesity {eo:.1f}pp (k={ob.nct.nunique()}) '
          f'vs T2D {et:.1f}pp (k={t2.nct.nunique()})  -> beta = {beta:.1f} pp per 100% diabetes (SE {beta_se:.1f})')
else:
    beta, beta_se = 3.4, 1.5
    print(f'within-agent split unavailable; using literature-consistent beta={beta} pp.')

# --- transport each node effect to the target diabetes level ---
print('\n=== sensitivity transport to NHANES US obese-adult target (diabetes 26%) ===')
print(f'{"node":24s} trial-eff  p_trial  ->  transported (NHANES)   shift')
rows = []
for nd, g in c.groupby('node'):
    md = g.dose.max(); top = g[g.dose == md]; e, se = ivw(top)
    p_trial = float((top.t2d * (1 / top['var'])).sum() / (1 / top['var']).sum())  # var-wtd diabetes frac
    shift = -beta * (NHANES_DIAB - p_trial)
    et = e + shift
    print(f'{nd:24s} {e:6.1f}     {p_trial:4.2f}    ->   {et:6.1f}              {shift:+.1f}')
    rows.append({'node': nd, 'trial_effect': round(e, 1), 'p_diabetes_trial': round(p_trial, 2),
                 'transported_effect': round(et, 1), 'shift_pp': round(shift, 1)})

print('\n*** SENSITIVITY ANALYSIS — explicit caveats ***')
print(' - NOT a primary real-world effect: we have no IPD; rigorous transport (ML-NMR/MAIC) needs it.')
print(' - Modifier slope beta is from a within-agent obesity-vs-T2D contrast (semaglutide) -> avoids')
print('   ecological fallacy for the MODIFIER, but assumes the same diabetes-attenuation applies to')
print('   other agents (a stated, testable assumption).')
print(' - Diabetes is one modifier; unmeasured-modifier and joint-distribution effects are not captured.')
print(' - Effect: transport to a more-diabetic real-world population REDUCES weight loss modestly')
print('   (obesity nodes shift ~%.1f pp), consistent with the representativeness gap.' % (-beta*NHANES_DIAB))

json.dump({'beta_diabetes_pp': round(beta, 1), 'beta_se': round(float(beta_se), 1),
           'target_diabetes': NHANES_DIAB, 'nodes': rows,
           'framing': 'external-validity SENSITIVITY analysis; not a primary effect; no IPD'},
          open(f'{ROOT}/transport_sensitivity.json', 'w'), indent=1)
print('\nwrote transport_sensitivity.json')
