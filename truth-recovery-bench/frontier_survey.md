# Frontier Survey & Roadmap — Measuring Truth in Evidence Synthesis

**Date:** 2026-06-14
**Author:** truth-recovery-bench frontier push
**Scope:** Survey the 2023–2026 evidence-synthesis methods frontier (incl. preprints),
map it against what the truth-recovery yardstick + unified estimator already have,
prioritise the next leap, and execute + measure the highest-value first step.

> **Truth-first contract.** Every citation below is a real paper/package with a URL.
> Every measured number in §4 is produced by `harness.py` on seeded known-truth
> simulations and is reproducible (`python harness.py --profile compare --reps 400`).
> Honest negatives (where our estimator or the new competitors *lose*) are reported,
> not hidden.

---

## 0. Where we stand (the bar the frontier must beat)

The yardstick (`truth-recovery-bench/`) injects **heterogeneity (true τ²) AND a
parameterised publication-selection mechanism together**, then scores every method
on recovery of the **true μ** (bias, RMSE, coverage-of-truth, width, type-I, fail-rate)
across a 55-cell × 1000-rep seeded grid. The current registry (17 methods):

| Family | In the bench |
|---|---|
| RE pooling | DL, REML, PM, HKSJ |
| Selection models | Vevea–Hedges step, Copas–Shi, **p-uniform\*** (new), PVS (penalised model-averaged Vevea) |
| Small-study regression | PET-PEESE, **WLS** (new), **WAAP** (new) |
| Bayesian model averaging | RoBMA-core (effect×heterogeneity only, **no** pub-bias models) |
| Robust / nonparametric | GRMA (grey-relational + effect-guard), Trim-and-fill |
| Amortized / partial-id | **NPE** (SBI), **PartialID** (Manski bounds), **Unified** (headline) |

Headline measured result (committed `REPORT.md`): the **Unified** estimator (NPE
de-biased point ⊕ calibrated ×1.15 gated NPE/PartialID interval) holds **coverage
≥0.90 on every one of 55 cells** (min 0.927), **type-I ≤0.054**, **mean |bias| ≈0.016**
under selection, **no small-k blow-up** (k=5 RMSE 0.16 vs Vevea 9.18), at **−13% width**
vs the parameter-free union.

The companion **known-truth audit of ~24 method repos** (`truth-recovery-sweep/RUNNING_TABLE.md`)
found two cross-cutting pathologies the frontier work must keep targeting:
1. **Over-detection on no-signal data** (5 repos): cumulative-changepoint PELT FPR
   0.97–0.998 (metashift), KDE multimodality FP 64–74% (meta-entropy), topological
   feature FP 86–100% (tda-ma), forced-4-species clustering (meta-genome), multiverse
   false-robustness up to 0.46 (MultiverseMA).
2. **Silent failure under misspecification**: transportability extrapolation coverage
   collapse to 0.078 *with no CI widening* (metaTransportEngine); a DL denominator bug
   silently degrading to fixed-effect (dose-response-pro); FE-CI under heterogeneity
   (LivingNMA). The common thread: **intervals that do not widen when the model is wrong.**

These two failure families are the design targets for everything below.

---

## 1. The frontier (2023–2026, incl. preprints)

Marked: ✅ already represented · 🟡 partially/related · ❌ gap.

### A. Publication-bias correction & selection models

| Method | Citation / URL | Core idea | In portfolio? |
|---|---|---|---|
| **p-uniform\*** | van Aert & van Assen, *Psychological Methods* 26 (2021); restated *Psychon. Bull. Rev.* (2025) [link](https://link.springer.com/article/10.3758/s13423-025-02812-4); CRAN [`puniform`](https://cran.r-project.org/package=puniform) | Conditional likelihood: each study's normal density ÷ probability of its *own* significance category → invariant to the publication-probability ratio; jointly estimates μ and τ². Outperforms p-uniform/RE under bias; comparable to 3PSM. | ✅ **added this session** |
| **RoBMA-PSMA** (full) | Bartoš, Maier, Wagenmakers, Doucouliagos & Stanley, *Research Synthesis Methods* 14(1):99–116 (2023) [link](https://onlinelibrary.wiley.com/doi/full/10.1002/jrsm.1594); Maier, Bartoš & Wagenmakers, *Psychological Methods* 28(1):107–122 (2023) [link](https://pubmed.ncbi.nlm.nih.gov/35588075/) | Bayesian model-averaging across **complementary** pub-bias adjustments (6 weight-function selection models + PET-PEESE) *and* effect/heterogeneity models; inclusion Bayes factors quantify evidence *for absence* of bias; performs well under high heterogeneity. | 🟡 RoBMA-**core** only (no pub-bias models — needs MCMC) |
| **Andrews–Kasy** | Andrews & Kasy, *American Economic Review* 109(8):2766–94 (2019) [link](https://www.aeaweb.org/articles?id=10.1257/aer.20180310); [arXiv:1711.10527](https://arxiv.org/abs/1711.10527) | Nonparametric identification of the conditional publication probability (from replications or a meta-study); GMM/ML bias-corrected estimator + confidence sets given the selection function. The econometrics-standard selection correction. | ❌ gap (single-cutoff version ≈ Vevea; the GMM/meta-study estimator is distinct) |
| **Mathur–VanderWeele sensitivity** | Mathur & VanderWeele, *JRSS-C* 69(5):1091 (2020) [link](https://academic.oup.com/jrsssc/article/69/5/1091/7058673); R [`PublicationBias`](https://mathurlabstanford.github.io/PublicationBias/), [`multibiasmeta`](https://mathurlabstanford.github.io/multibiasmeta/) | Worst-case/sensitivity framing: for an assumed selection ratio η (affirmative:nonaffirmative publish odds), reweight nonaffirmative studies by η → bias-corrected estimate; report the η that would explain away the result. Assumption-light, robust to η-misspecification by design. | ❌ gap (a sensitivity *curve*, complements PartialID) |
| **WLS** (unrestricted weighted least squares) | Stanley & Doucouliagos, *Stat. Med.* 34:2116 (2015) | FE/WLS point + multiplicative variance φ=Q/(k−1), t_{k−1}. Argues FE point is *less* pub-bias-biased than RE because RE up-weights small (more-selected) studies. | ✅ **added this session** |
| **WAAP** (weighted average of adequately powered) | Stanley, Doucouliagos & Ioannidis, *Stat. Med.* 36:1580 (2017) | WLS restricted to studies with SE ≤ \|WLS\|/2.8 (≥80% power); WLS fallback. Underpowered (often-selected) studies are dropped. | ✅ **added this session** |
| **Bayesian Copas selection** | Bai et al., [arXiv:2005.02930](https://arxiv.org/pdf/2005.02930) | Robust Bayesian Copas selection model with bias quantification + correction; relaxes the frequentist Copas identification problems. | 🟡 frequentist Copas–Shi only |
| 3PSM / step weight-function (Vevea–Hedges) | reviewed in Bartoš et al., *AMPPS* (2022) [link](https://journals.sagepub.com/doi/10.1177/25152459221109259); pubbiassuite audit ranks 3PSM best corrector | Step-function selection model; consistently strong in simulation; the de-facto modern default. | ✅ Vevea–Hedges + PVS |

### B. Robust / heterogeneity-aware pooling & outliers

| Method | Citation / URL | Core idea | In portfolio? |
|---|---|---|---|
| **tMeta** (t-distributed RE) | Wang, Zhao, Jiang, Shi & Pan, [arXiv:2406.04150](https://arxiv.org/pdf/2406.04150) (2024/25), PMC12527545 | Marginal effect ~ Student-t → simultaneously *accommodates and detects* outlying studies; fast EM, no numerical integration. Directly targets the Normal-RE assumption every bench estimator shares. | ❌ gap (our `heavy_tail` stress scenario is exactly its use-case) |
| **Median / mode robust pooling** | Bom & Rachinger; "median & mode as robust MA estimators under small-study effects & outliers", PMC7359861 (2020) | Pooled median/mode is robust to small-study effects and outliers; near-unbiased when funnel is asymmetric. | 🟡 GRMA covers the robust-location niche |
| **GRMA + effect-guard** | GRMA_paper (audited, STRONG-validated: 2–2.5× lower RMSE than DL/REML under 20% contamination) | Grey-relational robust pooling; the *guard* is the active ingredient. | ✅ |
| Henmi–Copas robust CI | Henmi & Copas, *Stat. Med.* 29:2969–83 (2010) [link](https://onlinelibrary.wiley.com/doi/abs/10.1002/sim.4029); few-studies extension Henmi et al., *RSM* (2021) [link](https://onlinelibrary.wiley.com/doi/full/10.1002/jrsm.1482), [arXiv:2002.07598](https://arxiv.org/pdf/2002.07598) | CI built on the **FE point estimate** (robust to τ̂²) with a reference distribution that accounts for τ̂² uncertainty via a moment-matched gamma for Q + root-finding → better coverage than DL *and* less sensitive to publication bias. The on-theme "honest interval" method. | ❌ gap (needs the gamma moment-match + uniroot port — see roadmap P1) |

### C. Prediction intervals & coverage (the interval-honesty axis)

| Method | Citation / URL | Core idea | In portfolio? |
|---|---|---|---|
| HKSJ / Hartung–Knapp | Partlett & Riley, *Stat. Med.* 36 (2017) [link](https://onlinelibrary.wiley.com/doi/10.1002/sim.7140); Röver et al. (HKSJ mod.) | HK variance correction; best coverage when heterogeneity large / study sizes similar, but under-covers at low I² + varied sizes. | ✅ HKSJ (with floor) |
| **Confidence-distribution / parametric-bootstrap PI** | Nagashima, Noma & Furukawa, *SMMR* 28(6) (2019) [link](https://journals.sagepub.com/doi/10.1177/0962280218773520); R `pimeta` | Bootstrap PI that accounts for τ̂² uncertainty; valid coverage even with few studies — where the standard t_{k−1} PI fails. | ❌ gap (PI not yet scored in the bench) |
| **Conformal PI for RE meta-analysis** | `predintma::pred_int_conformal_df` [link](https://rdrr.io/github/femiguez/predintma/); systematic review [arXiv:2509.21660](https://arxiv.org/pdf/2509.21660) (2025) | Distribution-free PI via subsampling/conformal — finite-sample validity without the Normal-RE assumption. | 🟡 NPE uses Mondrian CQR for the CI; conformal *PI* for a new study not yet scored |
| **Edgington / combining-p RE prediction** | "Edgington's Method for RE Meta-Analysis Part II: Prediction", [arXiv:2510.13216](https://arxiv.org/pdf/2510.13216) (2025) | p-value-combination route to RE prediction intervals; robust alternative when normality is doubtful. | ❌ gap |
| NMA prediction intervals | Noma et al., *RSM* (2023) [link](https://onlinelibrary.wiley.com/doi/abs/10.1002/jrsm.1651) | Improved PI construction for network meta-analysis. | ❌ (NMA out of bench scope) |

### D. Simulation-based / neural / amortized inference

| Method | Citation / URL | Core idea | In portfolio? |
|---|---|---|---|
| **Amortized NPE** (ours) | NPE in `sbi.py` + DeepSets φ(D) + Mondrian CQR (Romano et al. 2019) | Train once on a mixture of selection mechanisms → instant posterior + conformal interval on any new MA. | ✅ **this is ahead of the published MA field** (see §2c) |
| **Simformer / all-in-one SBI** | Gloeckler et al., [arXiv:2404.09636](https://arxiv.org/abs/2404.09636) (ICML 2024) | Transformer + diffusion for *arbitrary* conditioning (any subset of params/data) in one amortized model — would let one network serve point, CI, PI, τ², and missing-data variants. | ❌ gap (architecture upgrade path for NPE) |
| **Neural methods for amortized inference (review)** | Zammit-Mangion et al., *Annual Review of Statistics* (2025) [link](https://www.annualreviews.org/content/journals/10.1146/annurev-statistics-112723-034123); [arXiv:2404.12484](https://arxiv.org/pdf/2404.12484) | Survey of amortized neural inference; design patterns (embedding nets, normalizing flows, calibration). | reference |
| **Robust Bayesian SBI** | [arXiv:2504.09475](https://arxiv.org/abs/2504.09475) (2025) | Density-ratio prior classes → robustness of amortized posteriors to prior/DGP misspecification. Directly addresses NPE's OOD failure mode. | ❌ gap (robustness layer for NPE) |
| **Amortized generalized-Bayes NPE** | [arXiv:2601.22367](https://arxiv.org/abs/2601.22367) (2026) | Single NPE amortizing the *tempered/generalized-Bayes* posterior family — power-likelihood robustness with no inference-time cost. | ❌ gap |
| BayesFlow ecosystem | [awesome-amortized-inference](https://github.com/bayesflow-org/awesome-amortized-inference) | Tooling/reference for amortized inference. | reference |

### E. Partial identification & sensitivity bounds

| Method | Citation / URL | Core idea | In portfolio? |
|---|---|---|---|
| **Manski-style partial-id** (ours) | PartialID in `robust_selection.py` | Union of CIs over a severity ladder → honest wide interval when the mechanism is unknown. | ✅ |
| Mathur–VanderWeele η-sensitivity | (see §A) | Bias as a function of the selection ratio; report the η needed to nullify. | ❌ gap (complements PartialID with an interpretable severity axis) |
| Copas-bound sensitivity | Copas–Shi profile + `metasens` | Effect as a function of the number of unpublished studies. | 🟡 Copas–Shi point only |

### F. Calibration (SBC, conformal, coverage diagnostics)

| Method | Citation / URL | Core idea | In portfolio? |
|---|---|---|---|
| **Simulation-based calibration (SBC)** | Talts et al. 2018; used in our `train_sbi.py` (PIT uniformity) | Rank/PIT statistics must be uniform if the posterior is calibrated. | ✅ (NPE diagnostics) |
| **Conformalized quantile regression** | Romano, Patterson & Candès 2019 | Finite-sample conditional coverage by conformalizing quantile predictions. | ✅ (Mondrian CQR in NPE) |
| **Living synthetic benchmarks** | "Living Synthetic Benchmarks: A Neutral and Cumulative Framework for Simulation Studies", [arXiv:2510.19489](https://arxiv.org/pdf/2510.19489) (2025) | A *neutral, cumulative* simulation-study framework so method comparisons accrete rather than reset — the meta-methodology our yardstick should adopt/publish into. | 🟡 our bench is exactly this in spirit; not yet framed as a neutral community benchmark |

### G. Benchmarking "does method X recover the truth"

| Work | Citation / URL | Finding relevant to us |
|---|---|---|
| Pub-bias method comparison (Jan 2025) | *Research Synthesis Methods* (2025), summarized in [AMPPS tutorial](https://journals.sagepub.com/doi/10.1177/25152459221109259) | PET-PEESE keeps false positives near nominal under typical psych conditions; step selection models among most popular & robust. Matches our pubbiassuite audit (3PSM best; PET-PEESE worse than naive under Copas). |
| Six-method pub-bias detection | *Zeitschrift für Psychologie* 227(4) (2019) [link](https://econtent.hogrefe.com/doi/10.1027/2151-2604/a000386) | Comparative power of bias-detection tests; Egger/Begg underpowered at small k (reproduced in our audit). |
| Econometrics meta-analysis overview | [arXiv:2412.10608](https://arxiv.org/pdf/2412.10608) (2024) | Consolidates WLS/WAAP/PET-PEESE/endogenous-kink — the small-study-regression family we just added. |

---

## 2. Gap map

### (a) SOTA methods to ADD as competitors/baselines

Prioritised by value × feasibility:

1. **p-uniform\*** — ✅ **DONE this session.** Conditional-likelihood selection model, distinct estimation route from Vevea. *(measured in §4)*
2. **WLS + WAAP** — ✅ **DONE this session.** The economics small-study-regression family; cheap, exact. *(measured in §4)*
3. **Henmi–Copas robust CI** — **P1.** The single most on-theme *interval* method (FE point + τ̂²-uncertainty-aware reference distribution, explicitly "robust to publication bias"). Needs a faithful port of the gamma moment-match + `uniroot` (metafor `hc.rma.uni`). Deferred today to avoid shipping a guessed formula.
4. **tMeta (t-RE)** — **P1.** Direct competitor on the `heavy_tail` stress scenario; EM is tractable.
5. **RoBMA-PSMA (full)** — **P2.** The Bayesian-model-averaging gold standard *with* pub-bias models. Needs MCMC (PyMC/Stan) → heavier compute; run as an offline competitor, not in the per-rep loop.
6. **Andrews–Kasy GMM** + **Mathur–VanderWeele η-sensitivity** — **P2.** Round out the selection-correction family with an econometrics-standard estimator and an interpretable sensitivity axis.
7. **Nagashima parametric-bootstrap PI** + **conformal PI** — **P2.** Needed once the bench scores *prediction* intervals (new metric), not just CIs.

### (b) Ideas to make the UNIFIED estimator measurably better

Targeted at the two audit failure families (over-detection; silent failure under misspecification):

1. **Robustify NPE against OOD selection mechanisms** (density-ratio prior classes, [arXiv:2504.09475]; generalized-Bayes tempering, [arXiv:2601.22367]). NPE's known dip is under *strong p-step at large k* and under domain shift (log-OR). A robust-SBI training objective should shrink that dip and reduce reliance on the PartialID gate. **Measurable target:** raise NPE-alone min-coverage from 0.886 to ≥0.92 *without* widening past the current Unified.
2. **Add an OOD/misspecification detector that widens the interval** — the audit's deepest lesson is "intervals that don't widen when the model is wrong." Use an SBC/PIT mismatch or a posterior-predictive discrepancy at inference time as a *continuous* gate severity (today PartialID gates only on point-disagreement). **Target:** on `mixed_strong`/`heavy_tail` (misspecified), coverage stays ≥0.90 by *automatic* widening, mirroring how metaTransportEngine *should* have behaved.
3. **Calibrate the ×1.15 factor out-of-sample** — it is currently tuned in-sample. Replace with a per-instance conformal scale conditioned on (k, observed selection-severity proxy) so no global magic constant is needed. **Target:** match current width at honest min-coverage with a *data-driven* radius.
4. **Ensemble the de-biased point with p-uniform\*/WLS by mechanism signature** — §4 will show NPE, p-uniform\*, and WLS/WAAP have *disjoint* winning regions (p-step vs Copas/funnel). A mechanism classifier picking the locally-best corrector could dominate any single method. **This is the strongest single lever** and the recommended P0 after this session.

### (c) Where our truth-recovery framing is already AHEAD of the published field

- **Joint heterogeneity × publication-selection truth-recovery scoring.** The published comparisons (Bartoš 2022/23; Z. Psychol. 2019; econ overview 2024) score bias/coverage but rarely inject τ² *and* a parameterised selection mechanism *together* and score recovery of the *unconditional* true μ as the published-only analyst sees it. Our DGP (oversample-until-k-published) is more faithful.
- **Amortized NPE for meta-analysis.** Amortized SBI is exploding in stat.ME generally (Simformer, Annual-Review 2025), but its application *to meta-analytic pooling with publication selection* — with conformal finite-sample coverage and SBC diagnostics — is not something the MA methods literature has published. We have a working, calibrated instance.
- **A dormant partial-identification backstop fused with a parametric estimator.** The Unified design (calibrated estimator interval that *only* widens via Manski bounds under genuine disagreement) is a novel composition versus the field's "pick one selection model" or "model-average within one paradigm" (RoBMA).
- **A cumulative known-truth audit across ~24 heterogeneous method repos**, surfacing the *cross-cutting* over-detection / silent-failure families — closer to the "Living Synthetic Benchmarks" (arXiv:2510.19489, 2025) ideal than any single published simulation study.

---

## 3. Roadmap (prioritised)

| Pri | Item | Why | Compute | Status |
|---|---|---|---|---|
| **P0** | **Mechanism-aware ensemble corrector** (NPE ⊕ p-uniform\* ⊕ WLS/WAAP, selected by a learned mechanism signature) | §4 shows disjoint winning regions; biggest expected truth-recovery gain | light (offline, reuses dumps) | next |
| **P0** | **OOD-widening gate** driven by SBC/PIT or posterior-predictive discrepancy | kills the audit's "silent failure under misspecification" family inside our own estimator | light–medium | next |
| **P1** | Port **Henmi–Copas** CI (gamma moment-match + uniroot) | on-theme honest-interval competitor; coverage axis | light | designed, not built |
| **P1** | Implement **tMeta** (t-RE, EM) | beats Normal-RE on `heavy_tail`; new robustness baseline | light | — |
| **P1** | Robust-SBI retrain (density-ratio / tempered objective) | shrink NPE OOD dip; reduce gate reliance | **heavy** (GPU/long CPU retrain) | flagged |
| **P2** | **RoBMA-PSMA** as offline competitor (PyMC) | Bayesian-model-averaging gold standard w/ pub-bias | **heavy** (MCMC) | flagged |
| **P2** | Add **prediction-interval** metric + Nagashima bootstrap & conformal PI | extends truth-measurement from CI to new-study prediction | medium | — |
| **P2** | **Andrews–Kasy GMM** + **Mathur–VanderWeele η-sensitivity** | complete the selection-correction family | light–medium | — |
| **P3** | Reframe the bench as a **neutral, living community benchmark** (arXiv:2510.19489) + publish | turn the yardstick into the field's shared truth-meter | doc/infra | — |

### First step executed this session (P-of-§2a items 1–2)

Implemented **p-uniform\***, **WLS**, and **WAAP** faithfully into `methods.py`
(validated: all three are unbiased with ~nominal coverage under no selection), added a
reproducible `compare` profile to `harness.py`, and ran a **seeded head-to-head**
(35 cells: primary μ=0.3 grid k∈{5,10,15,25,50} × 5 scenarios + type-I μ=0 at k∈{10,25},
**400 reps/cell, all 17 methods on identical seeds**). Results in §4.

---

## 4. Measured results of the first step

> Reproduce: `python harness.py --profile compare --reps 400 --procs 4 --out results_compare.json`
> (the bounded-ML fix to `p_uniform_star` was then applied via `patch_puniform.py`,
> which re-runs ONLY p-uniform* on the identical per-cell seeds). Tables: `python report_compare.py`.
> Seed `BASE_SEED=20260611`.

**Run:** profile=compare, reps=400/cell, 25 primary + 10 type-I cells, all on identical seeds (BASE_SEED=20260611).

### 4.1 Mean |bias| by selection mechanism (primary grid, μ=0.3, τ²=0.05, mean over k∈{5,10,15,25,50})

| Method | none | step_weak | step_strong | copas_weak | copas_strong |
|---|---|---|---|---|---|
| DL | 0.003 | 0.068 | 0.194 | 0.056 | 0.110 |
| REML | 0.003 | 0.068 | 0.193 | 0.057 | 0.111 |
| HKSJ | 0.003 | 0.068 | 0.194 | 0.056 | 0.110 |
| VeveaHedges | 0.008 | 0.204 | 0.181 | 0.227 | 0.122 |
| Copas | 0.003 | 0.066 | 0.183 | 0.047 | 0.097 |
| RoBMA | 0.089 | 0.055 | 0.270 | 0.078 | 0.149 |
| PET-PEESE | 0.024 | 0.030 | 0.074 | 0.028 | 0.028 |
| TrimFill | 0.004 | 0.060 | 0.154 | 0.031 | 0.060 |
| GRMA | 0.005 | 0.076 | 0.216 | 0.065 | 0.129 |
| p-uniform* *(new)* | 0.007 | 0.016 | 0.079 | 0.067 | 0.143 |
| WLS *(new)* | 0.004 | 0.062 | 0.172 | 0.042 | 0.084 |
| WAAP *(new)* | 0.010 | 0.059 | 0.143 | 0.039 | 0.067 |
| NPE | 0.055 | 0.010 | 0.046 | 0.010 | 0.040 |
| PartialID | 0.059 | 0.019 | 0.059 | 0.018 | 0.054 |
| Unified | 0.055 | 0.010 | 0.046 | 0.010 | 0.040 |

### 4.2 Overall (mean over the 25 primary cells)

| Method | mean bias | mean RMSE | mean cov | min cov | mean width |
|---|---|---|---|---|---|
| DL | +0.086 | 0.135 | 0.680 | 0.000 | 0.325 |
| REML | +0.086 | 0.135 | 0.678 | 0.000 | 0.325 |
| HKSJ | +0.086 | 0.135 | 0.742 | 0.000 | 0.404 |
| VeveaHedges | +0.088 | 1.868 | 0.810 | 0.545 | 0.502 |
| Copas | +0.079 | 0.133 | 0.685 | 0.003 | 0.317 |
| RoBMA | +0.075 | 0.211 | 0.703 | 0.062 | 0.666 |
| PET-PEESE | +0.006 | 0.188 | 0.797 | 0.175 | 0.689 |
| TrimFill | +0.062 | 0.130 | 0.731 | 0.077 | 0.331 |
| GRMA | +0.097 | 0.156 | 0.698 | 0.000 | 0.444 |
| p-uniform* *(new)* | +0.047 | 0.234 | 0.865 | 0.440 | 0.592 |
| WLS *(new)* | +0.072 | 0.128 | 0.714 | 0.003 | 0.341 |
| WAAP *(new)* | +0.064 | 0.136 | 0.841 | 0.185 | 0.819 |
| NPE | +0.002 | 0.107 | 0.982 | 0.945 | 0.536 |
| PartialID | +0.006 | 0.115 | 0.961 | 0.865 | 0.658 |
| Unified | +0.002 | 0.107 | 0.992 | 0.975 | 0.616 |

### 4.3 Type-I error at μ=0 (mean reject-0 over k∈{10,25} × 5 scenarios; target ≤0.05–0.07)

| Method | mean type-I | mean cov(0) |
|---|---|---|
| DL | 0.284 | 0.716 |
| REML | 0.282 | 0.718 |
| HKSJ | 0.232 | 0.768 |
| VeveaHedges | 0.130 | 0.870 |
| Copas | 0.275 | 0.725 |
| RoBMA | 0.024 | 0.976 |
| PET-PEESE | 0.175 | 0.824 |
| TrimFill | 0.266 | 0.734 |
| GRMA | 0.236 | 0.764 |
| p-uniform* *(new)* | 0.150 | 0.851 |
| WLS *(new)* | 0.279 | 0.721 |
| WAAP *(new)* | 0.265 | 0.735 |
| NPE | 0.035 | 0.965 |
| PartialID | 0.024 | 0.976 |
| Unified | 0.019 | 0.981 |

### 4.4 Honest read (auto-generated from the numbers above)

- **Under p-step selection** lowest |bias|: NPE 0.028, Unified 0.028, PartialID 0.039, p-uniform* 0.048.
- **Under Copas/funnel selection** lowest |bias|: NPE 0.025, Unified 0.025, PET-PEESE 0.028, PartialID 0.036.
- **Tightest honest interval** (min cov ≥0.90), lowest mean width: NPE 0.536, Unified 0.616.
- **Best type-I control**: Unified 0.019, PartialID 0.024, RoBMA 0.024, NPE 0.035.

### 4.5 Honest interpretation -- wins AND losses

**The known-truth verdict is unambiguous about the standard methods.** Classic
random-effects pooling (DL/REML/HKSJ) and the frequentist selection models
(Copas, GRMA) **catastrophically under-cover the true mu under publication
selection**: mean coverage 0.68-0.74 with *minimum coverage 0.000* at the worst
cells -- on strongly-selected data the 95% CI essentially *never* contains the
truth, while reporting tight intervals (width 0.32). They are confidently wrong.
This is the entire indictment that motivates truth-recovery scoring.

**The Unified / NPE estimator wins the truth-recovery contest.** Lowest |bias|
under *both* p-step (0.046 at step_strong) and Copas (0.040) selection, mean
coverage 0.99 (min 0.975), and the best type-I control of any method (0.019 at
mu=0), at a width (0.62) far tighter than the other honestly-covering methods
(PET-PEESE 0.69, RoBMA 0.67, WAAP 0.82). It is the only method that is both
**unbiased and honestly-covered** across the grid.

**Where the estimator LOSES (reported, not hidden):**
- **On truly clean data it pays a de-biasing tax.** Under *no* selection the
  amortized NPE/Unified carry |bias| ~0.055 -- an order of magnitude worse than
  DL/REML/WLS (~0.003-0.005), because the estimator was trained expecting some
  selection and slightly over-corrects when there is none. On genuinely unbiased
  data, plain RE pooling beats the estimator on bias.
- **The honesty premium is width.** Its interval (0.54-0.62) is ~2x the (wrong)
  DL interval (0.33). Honest coverage is not free.

**The new SOTA competitors behave exactly as theory predicts -- a clean,
mechanism-dependent split:**
- **p-uniform*** is the best *non-amortized* corrector under its design target,
  p-step selection (|bias| 0.079 at step_strong, matching PET-PEESE 0.074 and
  beating DL's 0.194), and is ~unbiased + nominally-covered under no selection
  (0.007, 0.95). **But it loses under Copas/funnel selection** (0.143 -- mechanism
  mismatch: Copas is precision-correlated, not a clean p-step) and shows the
  **documented small-k instability**: even after faithful bounding, a few k=5 reps
  hit the search bound (flagged `ok=False`), inflating its mean RMSE to 0.234 and
  dropping min-coverage to 0.44. This *empirically reproduces* the field's k>=10
  recommendation for selection models, and is the live argument for the bounded
  **PVS** variant already in the portfolio.
- **WLS / WAAP** (small-study regression) **win under Copas/funnel selection**
  (WAAP 0.067, WLS 0.084 at copas_strong -- better than every RE method) because
  funnel asymmetry is what they target; they only *partially* correct pure p-step
  selection (0.143 / 0.172) and, like all FE-point methods, badly under-cover and
  over-reject under the null (type-I 0.27). They never blow up (cheap, closed-form).
- **PET-PEESE** is the strongest classical corrector on bias (0.074 step / 0.028
  Copas) but under-covers (min 0.175) and over-rejects (type-I 0.175).

**The actionable signal for the roadmap (P0):** NPE, p-uniform*, and WLS/WAAP have
**disjoint winning regions** (amortized-everywhere vs p-step vs Copas/funnel). A
mechanism-aware ensemble that routes to the locally-best corrector is the
highest-value next lever -- and the NPE "clean-data de-biasing tax" is the concrete
loss such an ensemble (or an OOD-aware gate) should erase.

---

## 5. Flags (need heavier compute or a decision)

- **Robust-SBI retrain (P1)** and **RoBMA-PSMA (P2)** need a long CPU/GPU retrain and an
  MCMC stack respectively — out of scope for an interactive session; both should run
  offline/overnight. *Decision needed:* commit GPU time for the NPE robustness retrain?
- **Prediction-interval scoring (P2)** changes the bench contract (methods must return a
  PI, not just a CI). *Decision needed:* extend the method contract, or score PI in a
  parallel harness?
- **Henmi–Copas (P1)** is ready to build but I declined to ship a guessed formula today;
  it needs the exact metafor `hc.rma.uni` gamma moment-match + `uniroot` helpers ported
  and unit-tested against `metafor::hc()` before it enters the leaderboard.
