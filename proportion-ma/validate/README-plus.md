# Binomial-normal GLMM extras

The separate `#alm-plus` section fits event counts using the bundled webR runtime and `metafor::rma.glmm(measure="PLO")`. It never uses corpus lookup to fit user input. It shows the original transformed-scale result alongside the GLMM, with a separate JSON export. All new controls and validation output are within `#alm-plus`; the original adapter explicitly excludes it from its element-specific display queries. The original engine, input parser, exports, corpus and manifest remain unchanged.

## Documented cross-build exceptions

The GLMM is computed by R itself running in the browser (webR). Parity here compares R-in-browser (R 4.5.1, metafor 4.8-0, lme4 2.0-1) with native R (R 4.6.0, metafor 5.2-1, lme4 2.0-6), rather than a JavaScript estimator with R. Across all 240 configurations, **2,139/2,166 comparable assertions pass; 27 documented cross-build differences remain failures in 23 configurations; 28 browser refusals**. Native R also refuses 28 configurations, but two refusal identities differ.

The strict suite requires every configuration exactly once, all comparisons outside the documented set to pass, and the exact documented failing IDs and fields to remain present. Each failure is listed with `knownException: true` and its diagnosed reason; it is never added to the pass count. Additional, missing or changed failures fail the contract. This is a documented-exceptions contract, not whole-corpus numerical parity. The warning and export labels remain visible; see [the per-configuration diagnosis](diagnostics/README.md).

## Protocol

Maximum likelihood, seven adaptive quadrature points, bobyqa with maxfun=100000 and rhoend=1e-9. Confidence limits are normal Wald limits; prediction limits use t_(k-1) and are omitted for fewer than three studies. The pooled proportion is inverse-logit of the fitted intercept, not a marginal population-average probability. Tau-squared is on the logit scale. The existing transformed-scale variance may be on a different scale.

Inputs require safe integer counts with 0 <= events <= total and total > 0. Fewer than two studies, all-zero/all-total events, nonfinite estimates and convergence/Hessian/identifiability/gradient/fallback warnings produce explicit refusals. Runtime or package failure is reported as unavailable, never replaced by a cached or common-effect estimate. Inputs changing during a fit invalidate the pending result.

## Validation scope

The second panel, **Validate the extras in R**, checks the current GLMM result against a fresh live R execution. This is a rerun of the same R implementation, not an independent JavaScript estimator. The bundled repository uses metafor 4.8-0; native references used metafor 5.2-1 and meta 8.5-0. Version differences are displayed and discrepancies beyond tolerance fail.

The offline tier verifies six LF-byte SHA-256 pins, compares the archived native metafor and meta results, and exercises the same presentation and JSON export code used by live fits. It checks each status/refusal, nine numerical fields for successful fits, every displayed result field, every exported result field, row labels, exported input records and provenance. Expected total: 7248 checks across 240 configurations (212 fits, 28 refusals). **It does not execute the optimiser offline**, and its pass is not evidence of webR numerical parity. No new plot is drawn. This panel checks values and DOM text; it does not resist CSS deliberately injected into the page.

Counts, statuses, reasons, input records and labels are exact. Iterative quantities use |app-reference| / max(1,|reference|) <= 1e-6. Display strings are compared against the exact formatted metafor values, separately from numerical comparison with meta, so tolerance-equivalent values on opposite sides of a rounding boundary do not fail. No p-values are displayed or exported.

## Corpus and reproducibility

`plus-source.R` records mappings and row exclusions for the installed metadat 1.6-0 catalogue. `plus-corpus/manifest.json` records every one of 114 candidates: 62 used, 52 excluded. `row-audit.json` records excluded source rows; `corpus.json` retains source row numbers. The input records match the original archived corpus. Candidate IDs identify package datasets and mapping/group configurations; they are not publication identifiers or independent clinical findings. The corpus is a numerical benchmark, not a claim that heterogeneous outcomes are clinically poolable.

`generate-plus.R` regenerates native references and cross-package comparisons. `check-plus.mjs` checks pins, inputs, all native pairs, refusal contracts, negative comparisons and preservation of original source. Run from the repository root:

    node proportion-ma/validate/check-plus.mjs --write-r

This also generates `validate/runtime-plus.R` from the exact browser script. Run that generated script with the configured native R libraries, capture its output, then validate it:

    node proportion-ma/validate/check-plus.mjs --runtime-log <captured-log>

Each runtime configuration is checked against both archived backends (4352 comparisons). Generated runtime scripts are temporary and need not be committed. Native R runs print library paths and package versions. Package installation is not attempted.

Run `hub/shared/tests/proportion-ma-plus.spec.mjs` with a Playwright configuration pointing to the authorised local server. It includes base-commit and updated original replays, offline positive/negative tests and an exhaustive live webR corpus test. A listed test is not a passed test. See the lane REPORT.md and BROWSER_TODO.md for measured results and exact commands.

| Item | Static or dynamic | Source |
|---|---|---|
| Fit protocol, mappings, tolerances | Static | plus-core.js, plus-source.R |
| Reference estimates and refusals | Generated from source counts | plus-corpus/*.json, native R logs |
| User GLMM result | Dynamic local R execution | plus-ui.js / bundled R runner |
| Offline replay result | Dynamic comparison and DOM/export replay of pinned fits | plus-adapter.js |
| Browser parity | Measured separately from native parity; see lane report | proportion-ma-plus.spec.mjs |

## Exclusion review

All excluded candidate schemas were reviewed. Installed metadat 1.6-0 help was also inspected for potentially ambiguous names: dat.bonett2010 ai is Cronbach alpha; dat.huber2000 contains patient-level recurrence counts; dat.white2020 obs/exp_obs are identifiers/design labels and its effect is a correlation. Nested dat.maire2019 contains trend statistics; dat.moura2021 and dat.lim2014 contain correlations. In dat.nielweise2008, t1i/t2i are catheter days, not binomial totals. These exclusions do not infer denominators from column names. The source help is reproducible with utils::help(dataset, package="metadat").

## Evidence and warning catalogue

The live comparison retains 27 failed assertions across 23 configurations under the documented-exceptions contract. See [the diagnostic evidence](diagnostics/README.md) for the numerical cause and per-configuration classification. A generated input warning catalogue labels these configurations in the UI and JSON export; it contains no fitted outputs, never changes the R calculation, and never counts a numerical failure as a pass. Other input counts are labelled as not independently verified. The offline replay and same-runtime live rerun do not establish cross-runtime parity.

Run `node proportion-ma/validate/check-plus-diagnostics.mjs` from the repository root to verify every warning mapping against source inputs and retained diagnostic evidence. Numerical tolerances and reference corpus pins remain unchanged.
