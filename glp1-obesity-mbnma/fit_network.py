"""Two-stage model-based dose-response NMA on the full obesity cohort (arms_full.csv).

Stage 1: within-trial contrasts vs placebo (weight LOSS, pp), variance = sum of arm vars.
Stage 2: per-agent Emax dose-response  loss = Emax*dose_wk/(ED50+dose_wk)  (IVW NLS).
Ranking: Monte-Carlo each agent's predicted loss at its MAX studied weekly-equiv dose,
         propagating Emax-fit covariance (or single-dose SE) -> rank distribution ->
         SUCRA -> POTH (rank-hierarchy certainty; allmeta poth.js cross-check).

All agents share the placebo node, so the network is a connected star (dose-response NMA).
Honest: this is the two-stage MBNMA (Pedder 'split' style), not a one-step Bayesian MBNMA.
"""
import io, sys, json, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
RNG = np.random.default_rng(20260609)
MIN_WEEK = 36   # primary landmark: keep mature weight-loss timepoints, drop immature <36wk


def week_of(tf):
    import re
    m = re.findall(r'week\s*(\d+)', str(tf).lower())
    return max(int(x) for x in m) if m else -1


def emax(d, Emax, ED50):
    return Emax * d / (ED50 + d)


def node_of(agent, dose_mg, schedule):
    """Node-split agents with multiple routes/products onto separate dose-response
    curves. Oral and SC semaglutide are different products with different
    bioavailability -> cannot share a dose axis. Fit each node on its NATIVE mg
    dose (Emax ED50 is per-node, so absolute units are internal to the node)."""
    if agent == 'semaglutide':
        if schedule == 'weekly':
            return 'semaglutide-sc-weekly'      # the marketed obesity product (Wegovy)
        if dose_mg >= 3.0:
            return 'semaglutide-oral'           # oral daily high-dose (Rybelsus/OASIS)
        return 'semaglutide-sc-daily'           # phase-2 daily SC low-dose
    return agent


def contrasts(df, min_week=0):
    df = df.copy()
    df['wk'] = df['timepoint'].map(week_of)
    rows = []
    for nct, g in df.groupby('nct'):
        pl = g[g.agent == 'placebo']
        if pl.empty:
            continue
        pmean, pvar = pl['mean_pct'].iloc[0], pl['var_of_mean'].iloc[0]
        if pd.isna(pvar):
            continue
        for _, r in g[g.agent != 'placebo'].iterrows():
            if pd.isna(r['var_of_mean']):
                continue
            if r['wk'] >= 0 and r['wk'] < min_week:   # timepoint harmonization
                continue
            rows.append({'nct': nct, 'agent': node_of(r['agent'], r['dose_mg'], r['schedule']),
                         'dose_wk': r['dose_mg'], 'dose_mg': r['dose_mg'], 'schedule': r['schedule'],
                         'week': int(r['wk']), 'loss': pmean - r['mean_pct'], 'var': r['var_of_mean'] + pvar})
    return pd.DataFrame(rows)


def fit_agent(sub):
    d, y = sub['dose_wk'].values.astype(float), sub['loss'].values.astype(float)
    sig = np.sqrt(np.clip(sub['var'].values.astype(float), 1e-6, None))
    p0 = [max(y.max(), 1.0), np.median(d[d > 0]) if (d > 0).any() else 1.0]
    popt, pcov = curve_fit(emax, d, y, p0=p0, sigma=sig, absolute_sigma=True,
                           bounds=([0, 1e-3], [1e3, 1e4]), maxfev=40000)
    return popt, pcov


def poth_of(sucra):
    s = np.asarray(sucra); n = len(s)
    return float(np.mean((s - 0.5) ** 2) / ((n + 1) / (12 * (n - 1))))


def poth_js(sucra):
    try:
        js = ('const {poth}=require("C:/Projects/allmeta/shared/poth.js");'
              f'console.log(JSON.stringify(poth({json.dumps(list(sucra))})));')
        out = subprocess.run(['node', '-e', js], capture_output=True, text=True, timeout=30)
        if out.stdout.strip():
            return json.loads(out.stdout)['poth']
    except Exception:
        return None


def analyze(cdf, label, out_json=None):
    print(f'\n########## {label}: {cdf.agent.nunique()} nodes ##########')
    print('=== per-node: observed effect at max dose (ranking metric) + Emax curve (shape) ===')
    agents, samples = [], {}
    for agent, sub in cdf.groupby('agent'):
        doses = sorted(sub['dose_wk'].unique()); maxd = max(doses)
        top = sub[sub['dose_wk'] == maxd]
        w = 1.0 / top['var'].values
        m = float(np.sum(top['loss'].values * w) / np.sum(w)); se = float(np.sqrt(1.0 / np.sum(w)))
        samples[agent] = RNG.normal(m, se, size=8000); agents.append(agent)
        curve = ''
        if len(doses) >= 2:
            try:
                (Em, ED50), _ = fit_agent(sub)
                degen = Em >= 999 or ED50 >= 9999
                curve = '  Emax-curve: ' + ('UNIDENTIFIED (still-rising)' if degen else f'Emax={Em:.1f}pp ED50={ED50:.2f}')
            except Exception as e:
                curve = f'  Emax fit failed: {e}'
        print(f'{agent:22s} max {maxd:g}mg: observed loss={m:5.1f}pp (SE {se:.2f})  '
              f'doses={[round(d,2) for d in doses]}  [{sub.nct.nunique()} trials]{curve}')
    A = list(samples)
    M = np.vstack([samples[a] for a in A])
    ranks = (-M).argsort(axis=0).argsort(axis=0) + 1
    n = len(A)
    sucra = np.array([np.mean((n - ranks[i]) / (n - 1)) for i in range(n)])
    order = np.argsort(-sucra)
    print(f'--- hierarchy ({label}) ---')
    for rk, i in enumerate(order, 1):
        print(f'  {rk}. {A[i]:22s} SUCRA={sucra[i]:.3f}  obs loss={samples[A[i]].mean():5.1f}pp')
    p_py = poth_of(sucra); p_js = poth_js(sucra)
    match = (p_js is not None and abs(p_js - p_py) < 1e-6)
    print(f'POTH = {p_py:.3f} (n={n}); allmeta poth.js={p_js} (match: {match})')
    if p_py < 0.5:
        print('NOTE: POTH < 0.5 -> hierarchy non-informative.')
    if out_json:
        json.dump({'label': label, 'agents': A, 'sucra': sucra.tolist(),
                   'poth': p_py, 'order': [A[i] for i in order]}, open(out_json, 'w'), indent=2)
    return sucra, order, A


def main():
    df = pd.read_csv(f'{ROOT}/arms_full.csv')
    cdf = contrasts(df, min_week=MIN_WEEK)
    cdf.to_csv(f'{ROOT}/contrasts_full.csv', index=False)
    cdf_all = contrasts(df, min_week=0)
    n_trials = df['nct'].nunique()
    n_pl = df[df.agent == 'placebo']['nct'].nunique()
    print(f'cohort: {n_trials} trials, {len(df)} arms; {n_pl} have a placebo arm (connectable).')
    print(f'timepoint landmark: >={MIN_WEEK}wk -> {len(cdf)}/{len(cdf_all)} contrasts retained')

    analyze(cdf, f'PRIMARY (>={MIN_WEEK}wk landmark)', out_json=f'{ROOT}/ranking.json')
    analyze(cdf_all, 'SENSITIVITY (all timepoints, dropped agents restored)',
            out_json=f'{ROOT}/ranking_sensitivity.json')
    print('\nwrote contrasts_full.csv, ranking.json, ranking_sensitivity.json')



if __name__ == "__main__":
    main()
