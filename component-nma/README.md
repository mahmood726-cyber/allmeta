# Component NMA

Component network meta-analysis for multi-component interventions. Decomposes treatment effects into additive component contributions.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/component-nma/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Network MA
- **Data shape:** independent two-arm contrasts: component labels for A and B, effect, and SE. Multi-arm bus imports are refused; pasted rows carry no study identifier.
- **Purpose:** Additive component model.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Results export as JSON, CSV, Markdown, and Methods+Results reports. This page does not attach build metadata or a signed receipt.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.

<!-- ALM-AUTO-README-END -->

## Statistical scope

One additive random-effects model is fitted with a generalized DL moment
estimator and normal 95% intervals. Only the whole label `control` denotes an
empty intervention; `+` splits other labels into lowercase components. The
component contrast design must have full column rank, even for disconnected
treatment networks. There is no common-effect selector, p-value display,
standard NMA comparison, or additivity-difference test. Q, its residual df,
and tau-squared are exposed in data exports. Zero residual df gives null tau2
and sampling-variance effect intervals. Failed inputs clear tables, plot and
export state. JSON/CSV/Markdown and prose reports are generic results exports;
this page does not supply a signed receipt or build-identity field.
