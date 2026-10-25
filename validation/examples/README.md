# Published examples

`manifest.json` lists the additional examples. `AUDIT.md` covers all paper 2–19
apps and all their existing built-in choices. The UI fetches only same-origin
JSON and loads a dataset only when **Load real example** is pressed. Each choice
shows the original publication, package/version, licence note and any subset or
method assumption.

The source JSON contains raw package values, not precalculated findings.
`export_sources.py` decodes the pinned public R data blobs in `sources.json`
with pyreadr and checks the Git blob identity before writing. No numbers from
rounded HTML documentation tables are transcribed. `wire_pages.py` verifies
that stripping the two added script tags restores each original page byte for
byte using `page-baselines.json`.

Validation order (from the repository root):

1. `node --test "hub/shared/tests/unit/**/*.test.mjs"`
2. Run `features-examples.spec.mjs` using the existing features Playwright
   configuration. It tests default preservation, explicit loading, citations,
   actual displayed results and a planted display mutation; a missing citation
   must refuse loading. It writes `<app>/<dataset>.app.json` from the live page,
   plus typed CSV/plain-text evidence under
   `hub/shared/tests/rchecks-out/examples/` for the reviewer gate.
3. `Rscript --vanilla hub/shared/tests/rchecks/examples.R`

The R entry point delegates to `check_examples.R`, also runnable directly.
It loads the original versioned source objects from `source-data/`, using base
R's `load()`. These are byte-for-byte copies of the pinned upstream blobs in
`sources.json`, not new data or statistical references. The source index pins
package/version/object/blob identity and file MD5; the exporter and unit tests
also verify the upstream Git blob hash. The installed analysis-package version
does not determine which source version is read. Analysis packages must already
be installed; this script installs nothing. It fails on missing browser evidence,
wrong source records, altered subsets/signs/denominators, missing result keys or
numerical mismatches. Each model runs the original live adapter's R analysis
expressions. The transport removes the final JSON serializer (and P16's JSON
bootstrap), reads the resulting named R object directly, and never calls jsonlite.
The two apps without base live adapters use their existing published recipes:
meta-regression's PM/adhoc `metafor::rma` export and component-NMA's
`netmeta::discomb` oracle. Existing tolerances are unchanged; the added gate also
requires absolute differences <= 1e-6. The multilevel page's separate MoM panel
is rebuilt from the source rows using metafor FE/DL component fits and its stated
variance-share/cluster-HKSJ equations. Missing primary summary fields in older
adapters are read from the original page's result objects, not fitted again in JS.

Full precision R comparisons and exact displayed rounding checks are separate.
The R run prints `EXAMPLES n/N`, exits nonzero on failure and prints
`R_CHECK_PASS` only after every example and its planted-defect controls pass.
`PLANT_DETECTED` requires rejection of an altered source row, source version,
blob identity, result and displayed value; a missing artifact or dependency
cannot count as plant detection. Artifacts from a previous browser run are
removed before each corresponding test. Worker restarts retain evidence from
earlier successful tests instead of deleting the entire run. Missing R packages
or browser artifacts are failures, never skipped passes.

The added panel sits beside `#alm-features` after the original page content.
Dedicated layout controls remove/reinsert it and plant the former above-plot
placement; the archived plot geometry must remain unchanged. Heterogeneity
loads the existing R script builder before capture without booting R. The
publication-bias display reader finds the named Trim-and-fill row, independently
of any subsequent experimental selection-model output.

Unresolved task constraint: the reviewer's package allowlist is
`metafor/meta/netmeta/metadat`, while the required unchanged live recipes use
`mada` (DTA), `metasens` (limit MA), and `robumeta/clubSandwich` (RVE). The gate
currently fails closed for these three apps. Resolving that conflict requires a
task decision; it cannot be made green by silently substituting another model
or removing the three examples. See `STUCK_FAILURES.md`.
