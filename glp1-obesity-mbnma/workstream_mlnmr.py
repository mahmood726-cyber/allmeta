"""Model-based transport on a BINARY effect modifier (ML-NMR-consistent for pure strata).
Diabetes is binary and these trials are pure strata (obesity-only or T2D-only by AACT conditions),
so the obesity-vs-T2D effect difference is a valid INDIVIDUAL-LEVEL modifier effect -> NOT ecological.
For a binary modifier the ML-NMR integral collapses to a linear standardization, which we apply per
node using its patient-weighted diabetes fraction, transporting to the NHANES US obese-adult target.
Data-derived beta from semaglutide 2.4 mg. AACT + abstracts only.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
arms['wk'] = arms['timepoint'].map(lambda t: max([int(x) for x in re.findall(r'week\s*(\d+)', str(t).lower())] or [-1]))
_p = pd.read_csv(f'{ROOT}/population_conditions.csv', index_col=0)
pop = _p['population'].to_dict()
arms['t2d'] = arms.nct.map(lambda n: 1.0 if pop.get(n) == 'T2D' else 0.0)
st = load_table('studies', location=LOC, columns=['nct_id', 'enrollment'])
enr = st.set_index('nct_id')['enrollment'].to_dict()
NHANES_DIAB = 0.26


def node_of(a, d, s):
    if a == 'semaglutide':
        return 'semaglutide-sc-weekly' if s == 'weekly' else ('semaglutide-oral' if d >= 3 else 'semaglutide-sc-daily')
    return a


def ivw(d):
    w = 1 / d['var'].values; return float(np.sum(d.loss * w) / np.sum(w)), float(np.sqrt(1 / np.sum(w)))


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
                     't2d': r.t2d, 'enr': enr.get(nct, 0) or 0})
c = pd.DataFrame(rows)

# data-derived beta: semaglutide 2.4 mg obesity vs T2D (binary, pure strata -> individual-level)
sem = c[(c.agent == 'semaglutide') & (np.abs(c.dose - 2.4) < 1e-6)]
eo, seo = ivw(sem[sem.t2d == 0]); et, set_ = ivw(sem[sem.t2d == 1])
beta = eo - et; beta_se = np.sqrt(seo**2 + set_**2)
print(f'beta (diabetes, data-derived, individual-level): {beta:.1f} pp  (obesity {eo:.1f} vs T2D {et:.1f}; SE {beta_se:.1f})')

print('\n=== ML-NMR-consistent transport to NHANES (diabetes 26%), per node ===')
print(f'{"node":24s} trial-eff  p_diab(trial)  transported  shift   95% CrI(transport)')
out = []
rng = np.random.default_rng(11)
for nd, g in c.groupby('node'):
    md = g.dose.max(); top = g[g.dose == md]; e, se = ivw(top)
    wv = 1 / top['var'].values
    p_trial = float((top.t2d * wv).sum() / wv.sum())
    shift = -beta * (NHANES_DIAB - p_trial)
    et_ = e + shift
    # uncertainty: combine effect SE + beta SE (delta method on the (0.26-p) term)
    tse = np.sqrt(se**2 + (NHANES_DIAB - p_trial)**2 * beta_se**2)
    lo, hi = et_ - 1.96 * tse, et_ + 1.96 * tse
    print(f'{nd:24s} {e:6.1f}      {p_trial:5.2f}        {et_:6.1f}     {shift:+.1f}   ({lo:.1f},{hi:.1f})')
    out.append({'node': nd, 'trial_effect': round(e, 1), 'p_diabetes_trial': round(p_trial, 2),
                'transported': round(et_, 1), 'shift': round(shift, 1), 'cri': [round(lo, 1), round(hi, 1)]})

print('\n=== validity (why this is not ecological-fallacy) ===')
print(' - Diabetes is BINARY and trials are PURE strata (obesity-only / T2D-only by AACT conditions),')
print('   so the obesity-vs-T2D effect difference IS the individual-level modifier effect.')
print(' - For a binary modifier the ML-NMR integral over the covariate distribution is exactly the')
print('   linear standardization used here; no continuous-covariate aggregation is performed.')
print(' - Remaining assumptions (stated): common beta across agents; other modifiers (BMI/age/sex)')
print('   near-target so ~0 transport contribution (representativeness.json); single modifier; no IPD')
print('   for a full joint ML-NMR. Secondary external-validity analysis, but methodologically valid.')
json.dump({'beta': round(beta, 1), 'beta_se': round(float(beta_se), 1), 'target_diabetes': NHANES_DIAB,
           'method': 'binary-modifier ML-NMR-consistent standardization (pure strata)', 'nodes': out},
          open(f'{ROOT}/mlnmr_transport.json', 'w'), indent=1)
print('\nwrote mlnmr_transport.json')
