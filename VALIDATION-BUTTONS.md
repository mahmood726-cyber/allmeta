# Validation buttons

The shared `AlmValidate.mount(el, adapter)` widget supplies accessible controls, a results table, hash verification, version reporting and evidence links. Missing values and invalid hashes fail closed.

## Tier 1: current analysis in R

The current data run locally in webR **0.5.5**, using **metafor 4.8-0** for heterogeneity. The paper used **5.2-1**. Any discrepancy beyond the declared tolerance remains FAIL. R and package versions come from the running session; R normalizes hyphens to dots, so the verified DESCRIPTION spelling is used after checking equivalence with `packageVersion()`.

`AlmWebR.runR({script, packages, onStatus})` returns `{ok, stdout, versions}` or `{ok:false,error}`. Scripts emit one `ALMJSON:` line without jsonlite. Calls are serialized. Existing `runMetafor`, bus, modal, concordance and R download APIs remain; `buildMetaforScript` shares the extended calculation with the new adapter.

Heterogeneity checks the selected tau-squared estimator, pooled estimate, SE, normal CI, floored HKSJ CI (`test="adhoc"`), prediction interval (`test="t"`), Q, Q-based I-squared (DL definition), Q p-value, counts, and Q-profile intervals. Tight convergence controls and the enlarged Q-profile search range follow the source reference script. When DL is refused below ten studies, the widget explicitly validates the displayed PM fallback. Live tolerance is 1e-6 (relative for estimates/intervals/Q, absolute for I-squared/p-values; exact for counts).

## Local package repository

The repository layout is `r-shiny/shinylive/webr/repo/bin/emscripten/contrib/4.5/`. It contains all 32 fetched archives plus required dependency archives already present in the shipped bundle. The original metadata is preserved in `upstream-manifest.json`; `manifest.json` records every archive's hash, size, version and dependencies. `PACKAGES` indexes the complete set.

The webR 0.5.5 worker forwards `repos` to `webr::install`. The runner sets its `repoUrl` to the local repository root, but deliberately stages and extracts the exact verified binary archive bytes in R's VFS. Calling `installPackages` after a hash preflight would fetch the archive again, creating an unchecked second download. No compilation or remote dependency resolution occurs. SHA-256 and length are verified before exposing archives to R; versions are checked afterward.

The unpinned latest-CDN fallback is removed. Missing local assets cause a visible error. Script-relative URLs support a GitHub Pages project prefix. The worker uses the PostMessage channel, requiring no cross-origin isolation headers.

## Tier 2: published corpus replay

The widget verifies corpus/reference JSON against the adapter's pinned SHA-256 hashes, then runs the shipped JavaScript engine. It does not substitute saved app outputs or start R. It reports hashes, elapsed time, check counts, failures, maxima, refusals and the existing generated build stamp from `shared/build-info.js`. That stamp does not identify uncommitted lane edits.

The first HTTP load reads same-origin corpus files. After `prepare()` or a replay, the verified in-memory corpus replays offline without requests. Cold offline loading still requires previously available assets. On `file://`, a labelled picker lets the user select the manifest-listed JSON files, avoiding browser fetch restrictions while retaining byte verification.

Heterogeneity packages the reproducible repository's real `results/full/corpus.csv` and `reference.jsonl`. Original source hashes and compact-file hashes are in `heterogeneity/validate/MANIFEST.json`. Analysis identifiers and full-precision effect/SE inputs are preserved. No DOI is invented: the source README says one will be added on release.

The published `analysis/checks.py` defines **131,781 numerical checks**: REL = abs(app-R)/max(1,abs(R)) <= 1e-9; ABS <= 1e-9 for I-squared and p-values; exact counts/refusals. There are **88 meta-analyses, 704 configurations, 28 refused DL configurations and 676 compared configurations**. The per-analysis count is `9 + 8 + offered * (9 + 7*k)`.

The **120,720 displayed numbers are a separate audit**, not part of 131,781. Following `bench/run_app.mjs`, the adapter renders every configuration and checks summary cards and leave-one-out table values within half the last displayed digit. Original user inputs are restored afterward. Display failures are reported separately.

## Network hosts

- Automated validation requests: current origin only. No external CSS, JS, CDN or package repository is used.
- User-clicked links: `github.com` for evidence/re-execution, `codespaces.new` for Codespaces, and `doi.org` when an adapter has a source-backed DOI.
- `repo.r-wasm.org` in manifest source metadata is provenance only; the browser does not contact it.

## Per-app availability

| App | Tier 1 | Tier 2 | Integration status |
|---|---|---|---|
| Heterogeneity | metafor 4.8-0; paper 5.2-1 | Numerical replay and separate rendered audit | Implemented in this lane |
| Dose-response | dosresmeta 2.2.0 vendored | Contract: 724 combinations | Separate lane; not verified here |
| DTA SROC | mada 0.5.12 vendored | Contract: 855 checks | Separate lane; not verified here |
| NMA | netmeta 3.4-0 vendored; paper 3.7-0 | Contract: 410 checks | Separate lane; not verified here |
| Screen | No R oracle; honest repository link with `live:null` | ASReview benchmark replay | Separate lane; not verified here |

## Static versus dynamic disclosure

| Item | Nature | Evidence / purpose |
|---|---|---|
| R references and corpus | Static real source data | Original and compact-file SHA-256 in MANIFEST |
| Expected count and tolerances | Static contract | checks.py, make_outputs.py, expected/paper_values.json |
| Package archives and versions | Static pinned binaries | SHA-256, DESCRIPTION, upstream manifest |
| App values, differences, verdicts, maxima and counts | Dynamic | Shipped page engine and actual rendered DOM |
| Live R fits and versions | Dynamic | Actual R session and packageVersion checks |
| Build SHA | Static generated stamp | Existing shared/build-info.js; regenerate at integration/release |

See `LANE_REPORT.md` for exact commands, results and limitations. This lane does not commit, push, deploy or change submission status.
