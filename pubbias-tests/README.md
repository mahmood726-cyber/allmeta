# Publication Bias Tests

Suite of publication-bias and small-study-effect tests: Egger, Peters, Begg, Harbord, trim-and-fill, PET-PEESE, and Copas.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/pubbias-tests/

## Extras: PET-PEESE and leave-one-out sensitivity

The **PET-PEESE and leave-one-out sensitivity** section gives PET and PEESE limit estimates with 95% t intervals, the
conditional PET-PEESE choice (PEESE when PET's intercept test rejects at two-sided 5%, otherwise PET), and a one-click
leave-one-out table of Egger, Begg, trim-and-fill, PET/PEESE, Thompson-Sharp and, for 2x2 data, Peters and Harbord, flagging omissions
that move a p-value across 0.05, change trim-and-fill k0 or change the PET-PEESE branch. It has its own
"Validate the extras in R" panel; see [validate/README-plus.md](validate/README-plus.md).

The Thompson-Sharp row of the main results table is now the REML random-effects meta-regression test of
`metafor::regtest(rma(yi, vi, method="REML"), model="rma", predictor="sei")`; the previous build tested a different
quantity and agreed with R in none of the 152 paper configurations. It now agrees in 151 (largest difference 6e-13) and
refuses together with R in the remaining one; the comparison is part of the extras replay.

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
