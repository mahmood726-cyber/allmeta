# Publication Bias Tests

Suite of publication-bias and small-study-effect tests: Egger, Peters, Begg, Harbord, trim-and-fill, PET-PEESE, and Copas.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/pubbias-tests/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** Egger, Begg, Harbord, Thompson-Sharp, Peters.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
