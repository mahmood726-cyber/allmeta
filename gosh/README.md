# GOSH Plot

Graphical display of study heterogeneity (GOSH) — visualises all-subset pooled estimates to detect influential studies and heterogeneous subsets.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/gosh/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** Robustness of pooled effect to subset choice.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->

## Study inclusion extras

Refresh the separate extras panel to highlight subsets with or without a study, sort per-study mean/median estimate and mean I2 comparisons, and choose I2/H2/Q or DL tau2/tau for the highlight axis. These are descriptive summaries of overlapping subsets; no p-values are calculated. The original plot and summary remain separate.

The second R-validation panel checks the extras against its own pinned corpus and supports live webR and offline replay. See [extras validation and reproduction](validate/plus/README.md) for scope, sampling conventions and refusals.
