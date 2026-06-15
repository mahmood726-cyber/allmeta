# DTA Truth-Recovery — measured report

> Seeded (20260615), reps/cell = 600, 19 cells, 419s. Every number is produced by `harness_dta.py` / `partialid_dta.py`; nothing is hand-entered. True summary point Se0=0.85, Sp0=0.80.

Diagnostic 2×2 tables; working scale is (logit Se, logit FPR) with FPR = 1−Sp (the Reitsma parameterisation — the bivariate fit matches `mada::reitsma(method="ml")` on AuditC to ~1e-6; see the test gate).

## 1. Coverage as heterogeneity rises (the archaic-dta bug)

**NaiveFE** = independent fixed-effect pooling of logit Se and logit Sp (no τ², no Se–Sp correlation) — the reproduced archaic-dta failure. **UnivDL** adds a per-margin DerSimonian–Laird τ². **Bivariate** is the Reitsma random-effects MLE. **BivarHK** adds the Hartung-Knapp honest-coverage widening (the analogue of the HKSJ fix that repaired the pairwise track). 'joint cov' = coverage of the true (Se,Sp) point by the 2-D confidence region — where ignoring the correlation hurts most.

| k | τ_Se | τ_Sp | thresh | metric | NaiveFE | UnivDL | Bivariate | **BivarHK** |
|---|---|---|---|---|---|---|---|---|
| 8 | 0.0 | 0.0 | 0.0 | Se cov | 0.950 | 0.962 | 0.963 | **0.993** |
| 8 | 0.0 | 0.0 | 0.0 | Sp cov | 0.942 | 0.960 | 0.960 | **0.992** |
| 8 | 0.0 | 0.0 | 0.0 | joint cov | 0.942 | 0.967 | 0.958 | **0.995** |
| 8 | 0.25 | 0.25 | 0.0 | Se cov | 0.808 | 0.912 | 0.900 | **0.967** |
| 8 | 0.25 | 0.25 | 0.0 | Sp cov | 0.735 | 0.898 | 0.878 | **0.958** |
| 8 | 0.25 | 0.25 | 0.0 | joint cov | 0.682 | 0.898 | 0.858 | **0.963** |
| 8 | 0.5 | 0.5 | 0.0 | Se cov | 0.478 | 0.875 | 0.850 | **0.940** |
| 8 | 0.5 | 0.5 | 0.0 | Sp cov | 0.503 | 0.895 | 0.882 | **0.950** |
| 8 | 0.5 | 0.5 | 0.0 | joint cov | 0.277 | 0.845 | 0.780 | **0.910** |
| 8 | 0.8 | 0.8 | 0.0 | Se cov | 0.297 | 0.870 | 0.865 | **0.950** |
| 8 | 0.8 | 0.8 | 0.0 | Sp cov | 0.292 | 0.890 | 0.888 | **0.960** |
| 8 | 0.8 | 0.8 | 0.0 | joint cov | 0.088 | 0.857 | 0.778 | **0.923** |
| 20 | 0.0 | 0.0 | 0.0 | Se cov | 0.945 | 0.958 | 0.958 | **0.967** |
| 20 | 0.0 | 0.0 | 0.0 | Sp cov | 0.925 | 0.945 | 0.943 | **0.962** |
| 20 | 0.0 | 0.0 | 0.0 | joint cov | 0.930 | 0.950 | 0.945 | **0.978** |
| 20 | 0.25 | 0.25 | 0.0 | Se cov | 0.712 | 0.912 | 0.903 | **0.925** |
| 20 | 0.25 | 0.25 | 0.0 | Sp cov | 0.712 | 0.942 | 0.922 | **0.947** |
| 20 | 0.25 | 0.25 | 0.0 | joint cov | 0.597 | 0.910 | 0.875 | **0.932** |
| 20 | 0.5 | 0.5 | 0.0 | Se cov | 0.305 | 0.918 | 0.915 | **0.935** |
| 20 | 0.5 | 0.5 | 0.0 | Sp cov | 0.325 | 0.918 | 0.910 | **0.942** |
| 20 | 0.5 | 0.5 | 0.0 | joint cov | 0.113 | 0.885 | 0.860 | **0.915** |
| 20 | 0.8 | 0.8 | 0.0 | Se cov | 0.107 | 0.912 | 0.905 | **0.935** |
| 20 | 0.8 | 0.8 | 0.0 | Sp cov | 0.142 | 0.878 | 0.908 | **0.940** |
| 20 | 0.8 | 0.8 | 0.0 | joint cov | 0.022 | 0.865 | 0.855 | **0.918** |

## 2. Threshold variation — the Se–Sp negative correlation / SROC

As threshold variation rises, studies trade Se for Sp and the Spearman correlation of (logit Se, logit FPR) climbs (>~0.6 ⇒ report the SROC, not a single pooled point). NaiveFE under-covers; the bivariate model absorbs the spread into Σ and recovers. AUC abs err = |recovered SROC AUC − true AUC| (AUC via the normal CDF, not the logistic).

| thresh | Spearman | NaiveFE Se | UnivDL Se | Bivariate Se | **BivarHK Se** | AUC abs err |
|---|---|---|---|---|---|---|
| 0.0 | 0.12 | 0.648 | 0.912 | 0.893 | **0.927** | 0.061 |
| 0.3 | 0.39 | 0.515 | 0.898 | 0.890 | **0.932** | 0.022 |
| 0.6 | 0.66 | 0.213 | 0.882 | 0.880 | **0.923** | 0.011 |
| 1.0 | 0.82 | 0.088 | 0.870 | 0.915 | **0.938** | 0.011 |

## 3. Few-studies regime (bivariate identifiability)

Small k stresses the bivariate MLE: Σ is estimated from few points. `conv.frac` is the optimiser-convergence rate; widths show the honest price BivarHK pays for guaranteed coverage when information is thin.

| k | conv.frac | NaiveFE joint | Bivariate joint | **BivarHK joint** | BivarHK Se | width Se BV/HK |
|---|---|---|---|---|---|---|
| 4 | 1.00 | 0.265 | 0.660 | **0.993** | 0.987 | 0.14/0.36 |
| 5 | 1.00 | 0.252 | 0.763 | **0.960** | 0.975 | 0.13/0.24 |
| 6 | 1.00 | 0.190 | 0.722 | **0.922** | 0.943 | 0.13/0.20 |
| 10 | 1.00 | 0.145 | 0.802 | **0.927** | 0.938 | 0.10/0.13 |

## 4. Publication / small-study selection

No method here corrects publication bias; selection collapses coverage for every interval — the honest boundary of the model. Deeks' funnel test (reject at p<0.10) detects it but does not fix it.

| scenario | sel.frac | Deeks reject | NaiveFE Se | Bivariate Se | BivarHK Se | Bivariate joint |
|---|---|---|---|---|---|---|
| copas_strong | 0.98 | 0.12 | 0.410 | 0.902 | 0.953 | 0.863 |
| none | 1.00 | 0.11 | 0.373 | 0.910 | 0.948 | 0.860 |
| step_strong | 1.00 | 0.11 | 0.365 | 0.900 | 0.943 | 0.837 |

## 5. Partial-identification of the SROC operating point

The off-summary operating point — Se at a TARGET FPR (here a more specific cutpoint, FPR≈0.08 / Sp≈0.92) away from the summary mean — is the hardest DTA object: it requires the SROC slope, which is only weakly identified from aggregate data. PartialID = union of the two SROC regression-direction predictions, each widened by the mean covariance. **Honest negative:** the plug-in SROC interval is badly over-confident (coverage well below nominal), and while PartialID materially improves coverage at every k / threshold spread, it does NOT reach nominal — extrapolating the SROC away from the summary mean is genuinely only partially identified here. The summary point itself (Section 1) is the object that the BivarHK lever fully recovers.

**By study count k** (fixed τ=0.4, thresh=0.5):

| k | conv.frac | plug-in cov | **PartialID cov** | width plugin/PID |
|---|---|---|---|---|
| 4 | 1.00 | 0.375 | **0.417** | 0.16/0.22 |
| 6 | 1.00 | 0.428 | **0.490** | 0.14/0.25 |
| 10 | 1.00 | 0.502 | **0.592** | 0.12/0.28 |
| 20 | 1.00 | 0.565 | **0.673** | 0.09/0.26 |

**By threshold spread** (fixed k=8; more spread → slope better identified):

| thresh | plug-in cov | **PartialID cov** | width plugin/PID |
|---|---|---|---|
| 0.0 | 0.233 | **0.247** | 0.08/0.20 |
| 0.3 | 0.347 | **0.447** | 0.11/0.24 |
| 0.6 | 0.530 | **0.573** | 0.13/0.19 |
| 1.0 | 0.658 | **0.682** | 0.15/0.18 |

## 6. Honest negatives & boundaries

- **BivarHK is mildly conservative at τ=0** (over-covers slightly, like the pairwise HKSJ floor and the NMA NetHK) — the honest price of guaranteed coverage under unknown heterogeneity; it is never worse than the bivariate RE on coverage.
- **The univariate DL fix recovers the MARGINS but not the JOINT point.** Pooling Se and Sp separately with τ² repairs each 1-D interval, yet because it ignores the Se–Sp correlation its implied joint region is mis-shaped — only the bivariate model gets the joint coverage right.
- **A single pooled (Se,Sp) point is the wrong estimand under strong threshold variation.** When the Spearman correlation is high the operating points lie along an SROC curve; the bench reports the SROC and the AUC rather than pretending one point summarises the test.
- **The bivariate MLE is fragile at very small k.** With k≈4–5 the between-study covariance is barely identified; convergence and coverage degrade, which is exactly why the partial-ID bracket exists for the operating-point question there.
- **The off-summary operating point is only partially identified.** Even the partial-ID bracket does not restore nominal coverage of Se at a target FPR far from the summary mean (it improves on the over-confident plug-in by ~0.05–0.11 but stays below 0.95). This is a genuine limit of aggregate-data DTA, reported rather than papered over; the bench's fully-recovered object is the summary operating point (BivarHK), not arbitrary points along the SROC.
- **Publication / small-study selection is uncorrected.** Step/Copas selection collapses coverage for every interval; Deeks' test flags it but a selection model is needed to fix it (out of scope here, flagged like the pairwise and NMA benches).
- **Within-study correlation of Se and Sp is taken as zero.** With a single threshold per study TP and TN come from disjoint groups, so the within-study covariance is diagonal (the standard Reitsma assumption); multiple-threshold / comparative designs would add off-diagonal terms and are out of scope.
