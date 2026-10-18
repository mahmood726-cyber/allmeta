# Limit Meta-Analysis

Limit meta-analysis for estimating the pooled effect in the absence of publication bias (Rücker-Schwarzer method).

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/limit-ma/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Pairwise MA
- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).
- **Purpose:** RÃ¼cker shrinkage toward zero-variance limit.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- Receipts and JSON exports include `producedBy` (app version, git SHA, build timestamp) — see `shared/build-info.js`.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->

## Sensitivity comparisons

The separate `#alm-plus` panel compares RE(DL), limit, trim-and-fill, PET, PEESE, conditional PET-PEESE, and a three-parameter selection model. It includes small-study tests with p-values, a combined funnel, and a second pinned validation panel. See [the sensitivity validation protocol](validate/README-plus.md) for sources, limits, and reproduction commands.

The original R replay remains 55,524/55,525, including its documented refusal mismatch, at 1e-9 normalized relative tolerance. The sensitivity corpus has 169 configurations and its own manifest; it does not change the paper corpus.
