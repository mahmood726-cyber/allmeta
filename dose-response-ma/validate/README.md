# Dose-response validation adapter

Tier 2 replays the shipped `AlmDoseResponse.fitDR`, never stored engine outputs.
Each check is one model/covariance/approach/method/moderator combination. The
paper expects 724 combinations: 576 fitted results and 148 matched refusals.
Matched refusals mean the same combination is refused, not identical error text.
All applicable coefficient, covariance, heterogeneity, log-likelihood, Q, Wald,
goodness-of-fit, residual and prediction metrics must pass for a fitted combination
to count as passed. Exceptions are failures. Counts are computed at runtime and
checked against the packaged `expected/paper_values.json` values.

## Provenance and integrity

Source: [reproducible repository](https://github.com/mahmood726-cyber/dose-response-ma-reproducible),
[archived software DOI](https://doi.org/10.5281/zenodo.23135712).
`MANIFEST.json` records source and packaged file SHA-256 values. Local Git attributes
preserve LF bytes in JSON on Windows clones so checkout cannot invalidate hashes. The shared widget
must verify original file bytes before handing parsed JSON to `corpus.run` as a
record (or Map) keyed by the declared relative path. The adapter makes no requests.
Missing data, invalid schema and duplicate combination identifiers are refused.
The widget owns byte verification; direct calls to `corpus.run` require already
verified inputs. Progress callbacks receive `(completed, total)`.

`reference.json` combines `results/full/corpus.csv` and `dosresmeta.jsonl` without
rounding or regenerating references. Entire studies with missing cases or totals
are excluded, as in `bench/run_engine.mjs`; excluded identifiers are retained.
Moderator values come from the reference's `covariate_by_study`. Empty datasets
remain represented. The source `data/` directory has no files. The published
corpus includes the package's explicitly simulated `sim_os` dataset; it is a
validation fixture, not new clinical evidence. Dataset attribution remains to
the dosresmeta package and the studies cited by that package.

Comparison code is copied from `hub/shared/tests/_dr_parity_check.mjs`, matching
`analysis/make_outputs.py`. The full reference output in the reproducible repo
is authoritative; the older `_dr_parity_fixture.json` is not substituted for it.
Two-stage REML/ML use 1e-3 SE/variance-scaled tolerances because a flat likelihood
can move the optimizer's stopping point; log likelihood remains 1e-6 relative.
Direct fits use 1e-6, with 1e-5 for Wald/predictions because matrix inversion and
extreme doses amplify rounding. Q and goodness-of-fit use 1e-9. See adapter source
for the exact per-quantity definitions; no tolerances are widened to obtain counts.

## Live R

Uses dosresmeta 2.2.0 with mixmeta; the shared runner owns same-origin webR loading,
package integrity checks and session/package version reporting. The generated R
script uses the current data, accepted studies, covariance, approach, estimator,
moderator, knots and prediction settings. It builds Harrell's normalized spline
basis directly, without rms/Hmisc. Numeric IDs replace user study labels only
within R, preserving study order. No user strings are interpolated into R code.
PM/DL are explicitly unavailable through dosresmeta; use the reproducible repo.

`appValues` reads the page's full-precision result snapshot, including coefficients,
SEs, covariance matrices, log likelihood, Q, Wald tests, goodness of fit and
predictions. Live tolerances default to 1e-6; scaled absolute tolerances use the
app's SE/variance because the R result arrives later. Wald/Q/log-likelihood/D
use the paper's relative tolerances. Live prediction and prediction-SE rows are
separate; tier 2 retains the paper's stricter combined prediction metric. The
script fails on non-finite quantities and prints one `ALMJSON:` line with `%.17g`
precision. Version metadata is the shared runner's responsibility.

| Item | Static or dynamic | Disclosure |
|---|---|---|
| R corpus, expected paper values | Static source data | Frozen source files; hashes recorded; not current research output |
| Expected 724 in paper metadata | Static contract | Source-backed expectation, never used as computed result |
| App values and corpus counts | Dynamic | Recomputed by the shipped engine |
| Comparison tolerances | Static method specification | Copied from published parity definitions |
| R script and live tolerances | Dynamic | Built from current inputs and full-precision page results |

No external resource hosts are used by this adapter. Repository/DOI/Codespaces
URLs are navigation links only. The only index changes are the validation mount
and three local script tags. The shared widget and vendored webR packages are integrated. See
`../../INTEGRATION_REPORT.md` for verified results and request logs.
