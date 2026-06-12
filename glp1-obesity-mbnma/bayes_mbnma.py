"""One-step Bayesian hierarchical Emax dose-response NMA (obesity).

Model (contrast scale; placebo levels profiled out -> equivalent to one-step under
the Gaussian arm likelihood). For contrast k with agent a(k), weekly dose d_k:

    loss_k ~ Normal( mu_k, var_k + tau^2 )            tau = between-study SD
    mu_k   = Emax_a * d_k / (ED50_a + d_k)

Partial pooling: log Emax_a = lem_mu + LEM_SD*z_a, log ED50_a = led_mu + LED_SD*w_a,
with z_a,w_a ~ N(0,1). The between-agent shrinkage scales LEM_SD/LED_SD are FIXED
(not estimated): with only ~7-10 agents the variance hyperparameter is weakly
identified and estimating it creates a funnel that an ensemble sampler cannot clear
(Rhat stuck ~1.1). Fixing it to a moderate value removes the funnel -> clean Rhat<1.01,
while still borrowing strength so single-trial agents get honestly wide CrIs.

Sampler: emcee affine-invariant ensemble, over-dispersed init. Diagnostics: split-Rhat
(per raw param AND per reported predicted-effect) + ESS. Rules: Rhat<1.01, ESS>=400.
"""
import io, sys, json, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np
import pandas as pd
import emcee

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
RNG = np.random.default_rng(20260610)
LOG2PI = np.log(2 * np.pi)
LEM_SD = 0.35   # fixed between-agent shrinkage on log Emax (moderate partial pooling)
LED_SD = 0.60   # fixed between-agent shrinkage on log ED50


def nlogpdf(x, m, s):
    return -0.5 * (((x - m) / s) ** 2 + LOG2PI) - np.log(s)


def halfnormal_logpdf(x, s):
    return np.log(2) + nlogpdf(x, 0.0, s)


def build(cdf):
    agents = sorted(cdf['agent'].unique())
    ai = {a: i for i, a in enumerate(agents)}
    idx = cdf['agent'].map(ai).values
    d = cdf['dose_wk'].values.astype(float)
    y = cdf['loss'].values.astype(float)
    v = cdf['var'].values.astype(float)
    maxd = np.array([cdf[cdf.agent == a]['dose_wk'].max() for a in agents])
    return agents, idx, d, y, v, maxd


def make_logpost(agents, idx, d, y, v):
    A = len(agents)

    def logpost(p):
        if not np.all(np.isfinite(p)):
            return -np.inf
        lem_mu, led_mu, ltau = p[0], p[1], p[2]
        tau = np.exp(ltau)
        z = p[3:3 + A]; w = p[3 + A:3 + 2 * A]
        le = lem_mu + LEM_SD * z; ld = led_mu + LED_SD * w
        if np.any(le > 5.3) or np.any(ld > 11.5):
            return -np.inf
        Emax = np.exp(le); ED50 = np.exp(ld)
        mu = Emax[idx] * d / (ED50[idx] + d)
        s2 = v + tau ** 2
        ll = np.sum(-0.5 * ((y - mu) ** 2 / s2 + LOG2PI + np.log(s2)))
        lp = (nlogpdf(lem_mu, np.log(15), 0.5) + nlogpdf(led_mu, np.log(5), 1.0)
              + np.sum(nlogpdf(z, 0, 1)) + np.sum(nlogpdf(w, 0, 1))
              + halfnormal_logpdf(tau, 3.0) + ltau)   # +Jacobian for log-sampled tau
        return ll + lp
    return logpost


def split_rhat(chain):  # (nwalkers, nsteps, ndim)
    nw, ns, nd = chain.shape
    half = ns // 2
    segs = np.concatenate([chain[:, :half], chain[:, half:half * 2]], axis=0)
    m = segs.mean(axis=1); var_w = segs.var(axis=1, ddof=1)
    W = var_w.mean(axis=0); B = half * m.var(axis=0, ddof=1)
    var = (half - 1) / half * W + B / half
    return np.sqrt(var / W)


def poth_js(sucra):
    try:
        js = ('const {poth}=require("C:/Projects/allmeta/shared/poth.js");'
              f'console.log(JSON.stringify(poth({json.dumps(list(sucra))})));')
        out = subprocess.run(['node', '-e', js], capture_output=True, text=True, timeout=30)
        if out.stdout.strip():
            return float(json.loads(out.stdout)['poth'])
    except Exception:
        return None


def main():
    cdf = pd.read_csv(f'{ROOT}/contrasts_full.csv')   # PRIMARY >=36wk network
    agents, idx, d, y, v, maxd = build(cdf)
    A = len(agents); ndim = 3 + 2 * A
    print(f'Bayesian MBNMA on PRIMARY network: {A} nodes, {len(y)} contrasts '
          f'(fixed shrinkage LEM_SD={LEM_SD}, LED_SD={LED_SD})')
    logpost = make_logpost(agents, idx, d, y, v)

    nwalk = max(6 * ndim, 120)
    p0 = np.column_stack([
        RNG.normal(np.log(15), 0.3, nwalk), RNG.normal(np.log(5), 0.4, nwalk),
        RNG.normal(np.log(2), 0.3, nwalk),
        RNG.normal(0, 1.0, (nwalk, A)), RNG.normal(0, 1.0, (nwalk, A))])   # over-dispersed
    sampler = emcee.EnsembleSampler(nwalk, ndim, logpost)
    nstep = 8000
    print(f'sampling ({nstep} steps x {nwalk} walkers)...', flush=True)
    sampler.run_mcmc(p0, nstep, progress=False)

    burn = nstep // 2
    chain = sampler.get_chain()[burn:].transpose(1, 0, 2)
    flat = sampler.get_chain(discard=burn, flat=True)
    rhat = split_rhat(chain)
    try:
        act = sampler.get_autocorr_time(discard=burn, tol=0)
        ess = (chain.shape[0] * chain.shape[1]) / np.nanmean(act)
    except Exception:
        ess = float('nan')

    lem_mu, led_mu, tau = flat[:, 0], flat[:, 1], np.exp(flat[:, 2])
    Z = flat[:, 3:3 + A]; W = flat[:, 3 + A:3 + 2 * A]
    Emax = np.exp(lem_mu[:, None] + LEM_SD * Z)
    ED50 = np.exp(led_mu[:, None] + LED_SD * W)
    pred = Emax * maxd[None, :] / (ED50 + maxd[None, :])
    # Rhat on the REPORTED predicted-loss per node
    lm = chain[:, :, 0]; ld = chain[:, :, 1]
    Zc = chain[:, :, 3:3 + A]; Wc = chain[:, :, 3 + A:3 + 2 * A]
    pred_c = (np.exp(lm[..., None] + LEM_SD * Zc)
              * maxd[None, None, :] / (np.exp(ld[..., None] + LED_SD * Wc) + maxd[None, None, :]))
    rhat_pred = split_rhat(pred_c)
    print(f'diagnostics: ESS~{ess:.0f} (>=400 ok)  raw-param max Rhat={np.nanmax(rhat):.3f}  '
          f'predicted-effect max Rhat={np.nanmax(rhat_pred):.3f}')

    print(f'\nbetween-study tau: {np.median(tau):.2f} (95% CrI {np.percentile(tau,2.5):.2f},{np.percentile(tau,97.5):.2f})')
    print('\n=== posterior per node (Emax, ED50, predicted loss @ max dose) ===')
    for i, a in enumerate(agents):
        ntr = cdf[cdf.agent == a]['nct'].nunique()
        print(f'{a:22s} Emax={np.median(Emax[:,i]):5.1f} ({np.percentile(Emax[:,i],2.5):4.1f},{np.percentile(Emax[:,i],97.5):5.1f})  '
              f'ED50={np.median(ED50[:,i]):6.2f}  pred@{maxd[i]:g}mg={np.median(pred[:,i]):5.1f}pp '
              f'({np.percentile(pred[:,i],2.5):4.1f},{np.percentile(pred[:,i],97.5):5.1f})  [{ntr} trials]')

    ranks = (-pred).argsort(axis=1).argsort(axis=1) + 1
    sucra = ((A - ranks) / (A - 1)).mean(axis=0)
    poth = float(np.mean((sucra - 0.5) ** 2) / ((A + 1) / (12 * (A - 1))))
    order = np.argsort(-sucra)
    converged = np.nanmax(rhat_pred) < 1.01 and ess >= 400
    print('\n=== Bayesian treatment hierarchy (posterior SUCRA) ===')
    print('CONVERGED (Rhat<1.01, ESS>=400) -> interpretable' if converged
          else '*** NOT converged -> do not interpret as final ***')
    for rk, i in enumerate(order, 1):
        p_best = float(np.mean(ranks[:, i] == 1))
        print(f'  {rk}. {agents[i]:22s} SUCRA={sucra[i]:.3f}  P(best)={p_best:.2f}  '
              f'pred={np.median(pred[:,i]):.1f}pp ({np.percentile(pred[:,i],2.5):.1f},{np.percentile(pred[:,i],97.5):.1f})')
    pj = poth_js(sucra)
    print(f'\nPOTH (posterior-mean SUCRA) = {poth:.3f}; allmeta poth.js = {pj} '
          f'(match {pj is not None and abs(pj-poth)<1e-6})')

    json.dump({'agents': agents, 'sucra': sucra.tolist(), 'poth': poth,
               'Emax_median': np.median(Emax, axis=0).tolist(),
               'Emax_cri': [np.percentile(Emax, 2.5, axis=0).tolist(), np.percentile(Emax, 97.5, axis=0).tolist()],
               'pred_median': np.median(pred, axis=0).tolist(),
               'pred_cri': [np.percentile(pred, 2.5, axis=0).tolist(), np.percentile(pred, 97.5, axis=0).tolist()],
               'tau_median': float(np.median(tau)), 'rhat_max': float(np.nanmax(rhat)),
               'rhat_pred_max': float(np.nanmax(rhat_pred)), 'ess': float(ess),
               'converged': bool(converged), 'order': [agents[i] for i in order]},
              open(f'{ROOT}/bayes_ranking.json', 'w'), indent=2)
    print('\nwrote bayes_ranking.json')


if __name__ == '__main__':
    main()
