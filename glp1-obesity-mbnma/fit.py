"""Prototype dose-response surface + extraction validation for the GLP-1/GIP
obesity NMA. Reads arms.csv (from extract.py).

Steps:
 1. Validate extracted arm means vs PUBLISHED values (registry-ipd discipline:
    held-out ground truth, report % error — never silently trust the tool).
 2. Build within-trial contrasts vs each trial's placebo (weight LOSS = positive).
 3. Fit a per-agent Emax model  loss = Emax*dose/(ED50+dose)  by inverse-variance
    weighted nonlinear least squares (same model form as allmeta bma-bmd.js).
 4. Sanity report: monotonicity, Emax plausibility, cross-agent dose to reach -10%.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'

# Published primary % weight change (efficacy/trial-product estimand where AACT posts it).
# Source: trial primary publications. Used as held-out ground truth for extraction QC.
PUBLISHED = {
    ('NCT04184622', 'placebo', 0.0): -2.4,    # SURMOUNT-1, NEJM 2022 (efficacy estimand)
    ('NCT04184622', 'tirzepatide', 5.0): -16.0,
    ('NCT04184622', 'tirzepatide', 10.0): -21.4,
    ('NCT04184622', 'tirzepatide', 15.0): -22.5,
    ('NCT03552757', 'placebo', 0.0): -3.4,     # STEP 2, Lancet 2021
    ('NCT03552757', 'semaglutide', 1.0): -7.0,
    ('NCT03552757', 'semaglutide', 2.4): -9.6,
}


def validate(df):
    print('=== Extraction validation vs published ground truth ===')
    rows = []
    for (nct, agent, dose), pub in PUBLISHED.items():
        m = df[(df.nct == nct) & (df.agent == agent) & (np.abs(df.dose_mg - dose) < 1e-6)]
        if m.empty:
            rows.append((nct, agent, dose, pub, None, None)); continue
        got = m['mean_pct'].iloc[0]
        err = abs(got - pub)
        rows.append((nct, agent, dose, pub, got, err))
    vd = pd.DataFrame(rows, columns=['nct', 'agent', 'dose', 'published', 'extracted', 'abs_err_pp'])
    print(vd.to_string(index=False))
    ok = vd.dropna()
    if len(ok):
        print(f"\nmatched {len(ok)}/{len(vd)} anchors; max abs err {ok.abs_err_pp.max():.2f} pp; "
              f"mean {ok.abs_err_pp.mean():.2f} pp")
        print("PASS" if ok.abs_err_pp.max() < 0.5 else "CHECK: some anchors differ >0.5pp (estimand mismatch?)")
    return vd


def emax(d, Emax, ED50):
    return Emax * d / (ED50 + d)


def fit_agent(sub):
    """sub: rows for one agent with columns dose, loss (positive), var. IVW Emax."""
    d = sub['dose'].values.astype(float)
    y = sub['loss'].values.astype(float)
    w = 1.0 / np.clip(sub['var'].values.astype(float), 1e-6, None)
    sigma = 1.0 / np.sqrt(w)
    try:
        p0 = [max(y.max(), 1.0), np.median(d[d > 0]) if (d > 0).any() else 1.0]
        popt, pcov = curve_fit(emax, d, y, p0=p0, sigma=sigma, absolute_sigma=True,
                               bounds=([0, 1e-3], [np.inf, np.inf]), maxfev=20000)
        return popt, pcov
    except Exception as e:
        return None, str(e)


def main():
    df = pd.read_csv(f'{ROOT}/arms.csv')
    # Dedup multiple estimands per arm: keep the most precise (min var_of_mean) row
    # per (nct, agent, dose). Honest simplification — estimand harmonization is a
    # scale-phase task (documented in SPEC.md).
    before = len(df)
    df = (df.sort_values('var_of_mean')
            .drop_duplicates(['nct', 'agent', 'dose_mg'], keep='first')
            .reset_index(drop=True))
    print(f'deduped {before} -> {len(df)} arms (one estimand per nct/agent/dose)\n')
    validate(df)

    # within-trial contrasts vs placebo (weight LOSS positive)
    contrasts = []
    for nct, g in df.groupby('nct'):
        pl = g[g.agent == 'placebo']
        if pl.empty:
            continue
        pmean = pl['mean_pct'].iloc[0]
        pvar = pl['var_of_mean'].iloc[0]
        for _, r in g[g.agent != 'placebo'].iterrows():
            if pd.isna(r['var_of_mean']) or pd.isna(pvar):
                continue
            contrasts.append({
                'nct': nct, 'agent': r['agent'], 'dose': r['dose_mg'],
                'loss': pmean - r['mean_pct'],            # positive = more weight loss than placebo
                'var': r['var_of_mean'] + pvar,           # contrast variance
            })
    cdf = pd.DataFrame(contrasts)
    print('\n=== within-trial placebo contrasts (weight loss, pp) ===')
    print(cdf.to_string(index=False))
    cdf.to_csv(f'{ROOT}/contrasts.csv', index=False)

    print('\n=== per-agent Emax dose-response (pooled across trials) ===')
    for agent, sub in cdf.groupby('agent'):
        doses = sorted(sub['dose'].unique())
        if len(doses) < 2:
            print(f"{agent:13s}: only {len(doses)} dose level(s) {doses} — need >=2 for Emax; skipped")
            continue
        popt, pcov = fit_agent(sub)
        if popt is None:
            print(f"{agent:13s}: fit failed ({pcov})"); continue
        Emax, ED50 = popt
        se = np.sqrt(np.diag(pcov)) if hasattr(pcov, 'shape') else [np.nan, np.nan]
        mono = all(sub.sort_values('dose').groupby('dose')['loss'].mean().diff().dropna() >= -0.5)
        # dose to reach 10pp loss
        d10 = (ED50 * 10 / (Emax - 10)) if Emax > 10 else None
        print(f"{agent:13s}: Emax={Emax:5.1f}pp (SE {se[0]:.1f})  ED50={ED50:5.2f}mg (SE {se[1]:.2f})  "
              f"doses={doses}  monotone={mono}  dose@-10%={d10:.2f}mg" if d10 else
              f"{agent:13s}: Emax={Emax:5.1f}pp (SE {se[0]:.1f})  ED50={ED50:5.2f}mg  doses={doses}  monotone={mono}  (Emax<10pp)")


if __name__ == '__main__':
    main()
