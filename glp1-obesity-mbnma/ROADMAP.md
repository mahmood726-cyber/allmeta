# Roadmap — turning the panel critique into a defensible methods contribution

Constraint (DATA_SOURCES.md): AACT/CT.gov arm-level + PubMed ABSTRACTS only (no full text).
Human-attested layer (RapidMeta): screening, RoB-2, GRADE filled/checked by humans — closes the
SR-process gaps that cannot be automated. Each workstream below maps a PANEL criticism to a
registry-native capability and a VALIDATED method (journal/preprint, vetted in advanced-stats.md).
Excluded on purpose: conformal-PI for federated MA (arXiv:2604.23847) — on HOLD, not yet validated
on real data (demonstrates the "if validated" discipline).

| # | Workstream | Panel criticism it answers | Data | Validated method |
|---|---|---|---|---|
| A | **Missing-evidence / registry-vs-literature DELTA** | "registry-only is narrower/biased" (the #1 path-to-breakthrough) | AACT results + PubMed abstract cross-check | **ROB-ME** (Cochrane Ch.13, 2024+); results-posted-vs-registered-vs-published denominator; comparison-adjusted funnel |
| B | **True one-step arm-based MBNMA** | "one-step claim FALSE — multi-arm placebo covariance ignored" (verified error) | arms_full (arm-level) | Arm-based hierarchical NMA carrying within-trial shared-control covariance (advanced-stats shared-control rule) |
| C | **Transitivity / effect-modifier assessment** | "transitivity untested; star network" | AACT `baseline_measurements` (age/BMI/sex/diabetes%/baseline wt) | CINeMA-style transitivity table + NMA meta-regression on modifiers |
| D | **Single-trial-node robustness** | "top-2 ranks are k=1; wide CrI is prior-imposed" | cohort | **INSPECT-SR** trustworthiness (medRxiv 2025.09.03, validated); leave-one-trial-out; relabel k=1 as insufficient-evidence |
| E | **Population de-confounding** | "oral-sema node mixes T2D + obesity" | AACT `conditions`/eligibility | split indication as node/covariate before pooling |
| F | **Heterogeneity / small-study sensitivity** | "single tau; small-study/publication bias" | contrasts | **Multiplicative-heterogeneity NMA** (arXiv:2601.11735, switch if AIC favours by >=2); risk-difference sensitivity (arXiv:2505.20168) |
| G | **Pre-registration + honest framing** | "post-hoc metric; overclaim; 57-vs-29" | — | pre-register ranking estimand; POTH per-draw with CrI; rename to "registry-native rapid synthesis" |
| H | **Richer registry dimensions modern metas add** | (new capability) | AACT `reported_events` (AEs), `drop_withdrawals` | benefit-risk: pair % weight-loss with GI-AE NMA from registry safety data |

## Recommended sequence
1. **A (flagship)** — finishes the ghost work into the registry-vs-literature delta + ROB-ME. This is
   the novel, publishable claim and the data is ready.
2. **B** — fixes the one genuine statistical error the panel verified; makes the Bayesian honest.
3. **C + D** — transitivity table (baseline_measurements) + INSPECT-SR/LOO on the k=1 apex.
4. then E/F/G/H as the analysis matures; human attestation (RoB-2/GRADE) via RapidMeta throughout.

## Honest framing target (per panel)
Not "a better meta" or "breakthrough" — a **methods/automation contribution**: *"registry-native
dose-response synthesis that captures results-posted-but-unpublished evidence a literature search
misses, quantifies the reporting-bias delta with ROB-ME, and is reproducible from a pinned CT.gov
mirror — with human-attested RoB-2/GRADE."* That is genuinely new and defensible.
