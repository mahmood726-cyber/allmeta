# NMA Inconsistency

Node-splitting inconsistency tests for network meta-analysis. Detects local inconsistency between direct and indirect evidence for each comparison.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/nma-inconsistency/

<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->

## When to use

- **Category:** Network MA
- **Data shape:** independent two-arm contrast rows: A, B, effect, SE, optional study ID. Multi-arm studies are refused because covariance is unsupported.
- **Purpose:** Node-splitting + design-by-treatment Q.

## Cite as

Click **📑 Cite as** inside the app for ready-to-paste Vancouver + BibTeX citations covering both the allmeta release and the relevant method paper(s).

## Reproducibility

- JSON exports include `_provenance` with `app: "nma-inconsistency"`, `version` and full `sha` from `shared/build-info.js`. CSV and Markdown exports include the same metadata as `_provenance.app`, `_provenance.version` and `_provenance.sha`.
- Methods+Results TXT and Markdown reports include Application, Application version and Build SHA headers.
- These values describe the loaded build identity, which can differ from the source checkout commit. Record the checkout commit separately.
- If shared build information is unavailable, exports remain usable without provenance metadata; no build identity is invented.
- For apps with a parity-checked engine, `shared/specs/` contains the R-reference test vectors. Run `python -m pytest tests/` for the full suite.
- Click **📝 Verify in R** to open a Shinylive R session with the current data pre-loaded for independent re-computation (where supported).

<!-- ALM-AUTO-README-END -->
