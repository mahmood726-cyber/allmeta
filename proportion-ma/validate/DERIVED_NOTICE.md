# P09 derived-number reconciliation, 2026-10-30

Fresh paired replay of the recovered pre-fix page and the supplied fixed page
passes all 298116 checks across 2160 configurations, with 198 matched refusals
on each page. The adapter, corpus, references and tolerances are unchanged.
The observed maximum differences below use `abs(App-R)/max(1,abs(R))`.

| Quantity | Pre-fix maximum | Fixed maximum |
| --- | ---: | ---: |
| seRE | 6.106226635438361e-16 | 5.551115123125783e-16 |
| tau2 | 4.5303204736917725e-15 | 4.349107654744102e-15 |
| i2 | 1.454392162258955e-14 | 3.056443986793056e-13 |
| piLo | 1.9340085088970227e-13 | 1.9317880628477724e-13 |
| yi | 2.2180625848860057e-16 | 1.7069679003611782e-15 |
| vi | 0 | 1.3877787807814457e-17 |

These are the six changed maxima in this paired run. All other maxima are equal
between its two pages. The largest remains `study_rel = 4.003676082781863e-11`.
The fixed formulas preserve corrected non-event counts at extreme boundaries;
their different floating-point rounding also propagates into ordinary pooled
quantities. Passing the existing tolerances does not imply bitwise invariance.

[replay.json](../../hub/shared/tests/artifacts/p09-review/replay.json) retains all
27 maxima for each page, source/dependency/assertion hashes, outcomes and the
complete aggregate unit-test inventory. Raw TAP results are alongside it.
Node was v24.13.0; both pages used the current shared dependencies. This is a
page-only historical replay, not a recreation of an entire historical build.

The earlier fixing job's `REPLAY.md` was also recovered read-only. It records
`piLo` maxima of 2.3669954885008337e-13 and 2.362554596402333e-13. Its `piHi`,
`poolPiLo` and `poolPiHi` maxima also differ from this fresh run. Those historical
records have not been rewritten or substituted into the current evidence. The
cause of the cross-run differences has not been independently isolated; the
current paired source and dependency hashes make this run reproducible.

Publication attribution remains incomplete: `adapter.js` supplies the
`mahmood726-cyber/proportion-reproducible` repository and a null DOI; the provided
materials contain no manuscript or paper title. No published number was edited,
and no manuscript-level numerical invariance or reconciliation is claimed.
