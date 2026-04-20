# IPD Advanced Methods Gap Report (2026-02-26)

## Scope and interpretation
- Date checked: **February 26, 2026**.
- “Not yet implemented in R” is interpreted as: **no turnkey, maintained CRAN workflow for the exact IPD-meta method**, even if pieces can be hand-coded with generic packages (`survival`, `lme4`, Stan, etc.).

## Current R baseline (what is already available)
- [`metafor` (CRAN)](https://cran.r-project.org/web/packages/metafor/index.html): comprehensive effect-size/meta-regression framework (mainly aggregate-effect workflows, plus multilevel/meta-analytic models).
- [`meta` (CRAN)](https://cran.r-project.org/web/packages/meta/index.html): standard pairwise meta-analysis, three-level models, GLMM support.
- [`survival` (CRAN)](https://stat.ethz.ch/CRAN/web/packages/survival/index.html): core survival toolbox (Cox, KM, AFT, multi-state), not IPD-meta orchestration.
- [`lme4` (CRAN)](https://cran-e.com/package/lme4): generic mixed-effects modeling engine.
- Implemented advanced exceptions:
  - [`multinma` (CRAN)](https://www.maths.bris.ac.uk/R/web/packages/multinma/index.html): IPD+AgD Bayesian network meta-analysis / ML-NMR.
  - [`joineRmeta` docs](https://rdrr.io/cran/joineRmeta/): one-/two-stage joint longitudinal-survival meta-analytic models (single longitudinal + single event outcome design).

## Published/validated methods with remaining R gap

| Method | Validation evidence | R gap status (as of 2026-02-26) | Why this matters for IPD-Meta-Pro |
|---|---|---|---|
| One-stage treatment-covariate interaction modeling with explicit within-trial centering (avoid ecological bias) | [Riley et al., 2017 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/27910122/) includes simulation + applied example | No dedicated CRAN function found that automates within-/across-trial decomposition for IPD-MA interactions end-to-end; typically manual model coding | High-value differentiation: automatic centering/decomposition, interaction forest plots, and one-stage vs two-stage agreement diagnostics |
| One-stage IPD survival meta-analysis via Poisson piecewise-exponential modeling with random effects | [Crowther et al., 2012 (BMC)](https://bmcmedresmethodol.biomedcentral.com/articles/10.1186/1471-2288-12-34) includes simulations + real IPD application | Can be custom-built in R GLMM tooling, but no mainstream turnkey CRAN IPD-MA wrapper found for full workflow (interval splitting/collapsing + pooling diagnostics) | Strong “ahead of R workflow” target: one-click piecewise hazard IPD-MA with computational collapsing and sensitivity over interval grids |
| RMST-based IPD meta-analysis under non-proportional hazards | [Wei et al., 2015 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/26099573/) includes simulation + cancer IPD examples | [`survRM2`](https://cran-e.com/package/survRM2) supports two-group RMST comparisons, but no mainstream package found that provides full multi-trial IPD-MA RMST pipeline in one workflow | Clinically interpretable absolute-time effects and robust non-PH handling; major practical advantage over HR-only pipelines |
| Uncertainty-aware subgroup IPD reconstruction from KM curves | Base reconstruction validated in [`IPDfromKM`](https://pmc.ncbi.nlm.nih.gov/articles/PMC8168323/); advanced uncertainty-propagation framework in [RESOLVE-IPD preprint, 2025](https://arxiv.org/abs/2511.01785) | Reconstruction exists in R; subgroup uncertainty-propagation/meta layer appears research-stage and not found as maintained CRAN workflow | Enables evidence synthesis when true IPD is unavailable, with explicit uncertainty propagation instead of single deterministic reconstruction |
| Federated/privacy-preserving one-stage survival IPD synthesis | [Pseudo-observation federated survival preprint, 2025](https://arxiv.org/abs/2507.20558) and [federated DP Cox preprint, 2025](https://arxiv.org/abs/2508.19640) report simulation + real-data validation | Methods appear emerging; no widely adopted CRAN IPD-meta package found for this full federated survival synthesis workflow | Strategic long-term moat: cross-site analysis without sharing row-level IPD (important for regulated/health-system collaborations) |

## Important caveats
- Some “gaps” are packaging/workflow gaps, not pure theoretical impossibility in R.
- Two frontier items above are currently **preprints** (not yet journal-final in the sources checked).
- Inference used here: if a method requires bespoke coding across multiple general packages and no maintained turnkey CRAN workflow was found, it is treated as a practical implementation gap.

## Suggested priority order (highest leverage first)
1. Within-trial centered one-stage interaction engine (continuous/binary/survival).
2. RMST IPD-MA pipeline with non-PH diagnostics and reporting templates.
3. Poisson piecewise-exponential one-stage survival engine with random effects.
4. KM-reconstructed IPD uncertainty propagation for subgroup synthesis.
5. Federated privacy-preserving survival synthesis.
