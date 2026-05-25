# Cross-design synthesis

Combine RCT + observational with bias correction.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/cross-design/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** Combine RCT + observational with bias correction.

## Method papers

- Welton NJ, Cooper NJ, Ades AE, Lu G, Sutton AJ. Mixed treatment comparison with multiple outcomes reported inconsistently across trials: evaluation of antivirals for treatment of influenza A and B. Stat Med. 2008;27(27):5620-5639. doi:10.1002/sim.3445
- Ibrahim JG, Chen MH. Power Prior Distributions for Regression Models. Statist Sci. 2000;15(1):46-60. doi:10.1214/ss/1009212673

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
