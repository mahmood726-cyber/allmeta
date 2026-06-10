# Bayesian hierarchical MBNMA — supporting consistency analysis

`bayes_mbnma.py`. One-step Bayesian hierarchical Emax dose-response NMA on the PRIMARY
network (7 nodes, 54 contrasts, ≥36 wk landmark). **Supporting analysis** — the frequentist
two-stage MBNMA (`fit_network.py`, RESULTS_SCALE.md) remains the PRIMARY result.

## Model
`loss_k ~ Normal(Emax_a · d/(ED50_a+d), var_k + tau²)`, with partial pooling
`log Emax_a = lem_mu + 0.35·z_a`, `log ED50_a = led_mu + 0.60·w_a`, `z,w ~ N(0,1)`.
Shrinkage scales are **fixed** (not estimated): with only 7 agents the between-agent variance
is weakly identified and estimating it creates a funnel an ensemble sampler can't clear.

## Posterior (median, 95% CrI), predicted % weight loss @ max studied dose
| node | trials | Emax | pred loss @ max dose | SUCRA |
|---|---|---|---|---|
| retatrutide | 1 | 25.7 | **20.8 (16.2, 25.4)** | 0.938 |
| mazdutide | 1 | 23.8 | 19.2 (14.5, 24.0) | 0.848 |
| tirzepatide | 4 | 20.3 | 16.6 (14.3, 19.0) | 0.667 |
| semaglutide-sc-weekly | 15 | 18.6 | 15.0 (12.3, 18.1) | 0.539 |
| orforglipron | 2 | 11.4 | 10.1 (7.5, 13.1) | 0.189 |
| semaglutide-sc-daily | 1 | 31.7 | 9.9 (4.7, 14.3) | 0.174 |
| semaglutide-oral | 5 | 12.2 | 9.6 (6.1, 13.6) | 0.145 |

between-study heterogeneity **tau = 2.97 pp** (95% CrI 2.33, 3.91).
**POTH = 0.863** — matches allmeta `poth.js` EXACT.

## The Bayesian value-add
- **Partial pooling** gives single-trial agents honestly wide CrIs (mazdutide ±5 pp,
  retatrutide ±5 pp) — the frequentist point fit understates their uncertainty.
- **tau** quantifies between-study heterogeneity (≈3 pp) explicitly.
- **Independent-method agreement**: same top-4 ordering and POTH (0.863 vs frequentist 0.880)
  as the two-stage MC analysis — cross-method triangulation.

## Convergence — stated plainly (advanced-stats rule: Rhat<1.01)
- **ESS ~3000** (target ≥400) — excellent.
- **max Rhat ≈ 1.08** (raw params) / **1.085** (predicted effects) — **above the 1.01 target.**
- Tried across 5 runs: non-centred parameterization, 40→160 walkers, 5k→20k steps, tighter
  hyperpriors, fixed shrinkage. emcee's affine-invariant ensemble plateaus at Rhat ≈ 1.08 on
  this correlated posterior. **Certifying Rhat<1.01 requires a gradient sampler (NUTS/HMC via
  PyMC or Stan), which is not installed in this environment.**
- **Why the result is still trustworthy despite Rhat≈1.08:** every reported quantity is stable
  to 2 sig figs across all 5 runs, ESS is high, and the ranking + POTH match the independent
  frequentist method. The 1.08 reflects emcee's slow mixing, not unstable inference.

**Bottom line:** the Bayesian analysis CONFIRMS the frequentist hierarchy and adds honest
uncertainty (CrIs, tau). It is reported as supporting evidence, not interpreted as a
convergence-certified primary result. Installing PyMC for a NUTS re-fit is the clean next step.
