# Multi-persona adversarial review (2026-06-12) — obesity flagship, post-cleanup, vs published NMAs

Three independent expert personas (dose-response NMA methodologist, Bayesian biostatistician, evidence-
integrity / AMSTAR-2 reviewer) + a chair who **verified every load-bearing claim in code/JSON**. This review
builds on the earlier `PANEL_REVIEW.md` (tracking which findings still hold) and benchmarks against the current
published obesity NMA consensus. Convergent.

## Verdict
**Honest where it has evidence, overclaimed at the headline.** The engine is unusually well-disclosed
internally — but the *manuscript abstract writes checks the JSON does not cash* on four specifics, and a new
"convergence-certified one-step Bayesian" claim is not supported by the actual sampler outputs.

## Published benchmark (PubMed-verified, real)
- McGowan 2025, *Nat Med* — [DOI](https://doi.org/10.1038/s41591-025-03978-z) — NMA, 56 trials, 60,307 pts.
- Wang 2025, *Diabetes Obes Metab* — [DOI](https://doi.org/10.1111/dom.16585) — NMA, 31 trials, 24,792 pts.
- Zamanian 2025, *Eur J Pharmacol* — [DOI](https://doi.org/10.1016/j.ejphar.2025.177966) — umbrella, 15 SRs.
All three rank **tirzepatide #1 among approved agents, semaglutide #2**; none crown mazdutide/retatrutide
(phase-2 / newer). Our engine ranks **mazdutide #1 and retatrutide #2 — both k=1 — above tirzepatide.**

## Chair-verified facts
| Claim under review | Verified | Evidence |
|---|---|---|
| Covariance-correct one-step model fails the ESS≥400 rule | **YES** | `onestep_ranking.json` ess_min=**281**, rhat 1.01 |
| The convergence-passing model ignores multi-arm covariance | **YES** | `pymc_ranking.json` converged, ESS 603 = the contrast model |
| A ranking model did not converge | **YES** | `bayes_ranking.json` converged=**False**, rhat **1.10** |
| Convergence checks disabled; divergences never inspected | **YES** | `compute_convergence_checks=False` in **9** files; **0** divergence checks repo-wide |
| Analyzed network is 29 trials / 7 nodes, not 57 | **YES** | kper sums to **29**; abstract leads with "57 trials, 150 arms, 9 nodes" |
| "Reproduced exactly" rests on 3 trials | **YES** | `validate_pubmed.md` = **3** NCTs (the marquee apex trials) |
| Top-2 ranks are k=1 single phase-2 trials | **YES** | kper mazdutide=1, retatrutide=1; flagged INSUFFICIENT in `nma_league.json` |

## Load-bearing problems (chair-verified)
1. **Headline ranking inverts the published consensus on the strength of k=1 phase-2 trials [HIGH].** The
   Results "Hierarchy" sentence reads "retatrutide/mazdutide (~22) > tirzepatide (16.6)". Both apex nodes are
   single phase-2 dose-finding trials; mazdutide−tirzepatide = 3.8 pp, 95% CrI **−2.0 to 9.8** (crosses null,
   Very low certainty). Every published NMA puts tirzepatide first among approved agents. The league table
   flags this correctly; **the abstract/Results prose does not.**
2. **"Convergence-certified one-step Bayesian" is not supported [HIGH].** The one-step *covariance-correct*
   model (`onestep_ranking.json`) has ESS 281 < 400; the only convergence-passing ranking model
   (`pymc_ranking.json`) is the contrast model that treats shared-placebo arms as independent (anti-
   conservative); `bayes_ranking.json` did not converge (rhat 1.10). Divergences are never checked and
   `compute_convergence_checks=False` everywhere. The certified and covariance-correct properties never
   co-occur in one model — the phrase conflates them.
3. **Cohort denominator drifts across files [MED].** 57 (abstract) vs 63 (`medline_compare`/`ghost_delta`) vs
   38 (rapidmeta config) vs 29 (`nma_league` kper). A reader cannot tell what N the paper is about.
4. **"Reproduced exactly" generalizes from 3 marquee trials [MED].** `validate_pubmed.md` = 3 NCTs, the same
   trials that anchor the ranks (near-circular). No held-out cohort-wide extraction validation.
5. **"~10% irreducible ghost trials" overstates certainty [MED].** 6/63 = 9.5%; `GHOST_TRIALS.md` concedes the
   ghosts are high-confidence candidates pending a title/sponsor fallback pass, and the reporting-bias signal
   rests on k=2 analysable ghosts. "Irreducible" is too strong.
6. **INSPECT-SR asserted, not executed [MED].** PAPER.md cites INSPECT-SR for the k=1 apex; no inspect output
   exists, and `workstream_D_robustness.py` states the real items "cannot be done registry-only." Per the
   project's own rule (INSPECT-SR for k≤5), the three k=1 nodes are exactly the trustworthiness-critical cases.

## What the panel credited (genuine strengths — verified)
- **Unusually candid in-repo disclosure**: star-network indirectness downgrade on every league cell, k=1
  INSUFFICIENT machinery, "not a systematic review" conceded, AMSTAR-2 reality not hidden, the abstract opens by
  citing two prior panels and framing as methods+automation, not a breakthrough.
- **The ranking AGREES with the published consensus where there is real evidence**: tirzepatide (17.5) >
  semaglutide-weekly (14.6), the *only* Moderate-certainty conclusion in the network — matches McGowan/Wang/
  Zamanian.
- **The arm-based one-step model is structurally correct** (shared `alpha[trial]` + per-trial RE encodes the
  multi-arm shared-control covariance) — a real improvement; its only failure is ESS.
- **Transport propagates the full posterior** (draw-based CrIs, ESS 3000+), POTH cross-checked vs CRAN to <1e-6,
  non-centred parameterization correct, 29-test numerical baseline, pinned snapshot — reproducibility is real.

## Required wording fixes (panel-specified, to make the manuscript defensible)
- **Ranking:** *"Among nodes with k≥2, tirzepatide ranks highest, concordant with published NMAs (McGowan 2025;
  Wang 2025; Zamanian 2025). Single phase-2 nodes (mazdutide, retatrutide; k=1) give the largest point estimates
  but are flagged INSUFFICIENT and excluded from any ranking claim; their contrasts vs tirzepatide cross the null
  (mazdutide−tirzepatide 3.8 pp, 95% CrI −2.0 to 9.8)."* Delete any "newcomers beat tirzepatide" implication.
- **Convergence:** downgrade "convergence-certified one-step" to *"Rhat≈1.0 on reported summaries; divergences
  unchecked; the covariance-correct one-step fit is not yet converged (ESS 281 < 400)."*
- **Cohort:** lead the abstract with **29 trials / 7 nodes analysed** (from a 57-trial registry supply);
  reconcile the 57/63/38/29 discrepancy in one cohort-flow statement.
- **Extraction:** *"reproduced the published primary exactly in 3 estimand-pinned spot-checks; cohort-wide
  held-out validation is future work."*
- **Ghost:** keep "9.5% (6/63)", drop "irreducible", add "high-confidence candidates pending title/sponsor
  fallback; reporting-bias direction rests on k=2 analysable ghosts."

> Chair: "The repo is what it says it is — an honest registry-native methods/automation contribution, better
> disclosed than most published NMAs. The failure is narrow and fixable: the abstract leads with a phase-2,
> k=1, null-crossing ranking inversion and a 'convergence-certified' phrase the sampler outputs don't support.
> Reword to match the JSON and it's defensible; ship as-is and it overclaims against both its own data and the
> published consensus."
