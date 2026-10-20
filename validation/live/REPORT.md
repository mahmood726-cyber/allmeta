# Live adapters: implementation and verification report

The numerical root cause is fixed in the working tree. Final acceptance is
**not complete**: the unchanged TEST.ps1 rejects the required shared-engine
file, and this sandbox cannot launch Edge to regenerate browser exports.

## Round 5: applied root-cause correction

Both reported failures (`coef.1.p`, `club.1.p`) exposed the same page p-value
through two independent R references. The CORR fit and CR2 covariance were
correct. `shared/rve.js` calls `AlmStats.pt`; its incomplete-beta continued
fraction in `shared/stats-qt.js:58` stopped at `EPS=3e-7`, before reaching the
accuracy required by the archived absolute `1e-9` p-value criterion.

Applied the one-line correction `EPS=1e-14` to that algorithm. This tightens
numerical convergence, not a test tolerance. The p-value changes from
`0.5062231072335901` to `0.5062231052610613`; robumeta returns
`0.506223105260988`, and clubSandwich returns `0.506223105260916`.
The robumeta error decreases from about `1.97e-9` to `7.3e-14`.

The user's latest direction to fix the root cause was treated as authorization
for this correction despite the original lane restriction. TASK.md/DESIGN.md
and TEST.ps1 still exclude shared-engine edits. No scope gate, comparison,
reference, corpus, existing test, or adapter tolerance was changed. Landing
this correction in the base branch and updating the feature branch would
resolve the scope conflict without loosening the scope test. That repository
integration is still outstanding; the local fix is not claimed as acceptance.

`diagnose-rve-precision.mjs` now supports both the old and corrected source:
when the fix is present it reconstructs the old convergence setting only in
the isolated control VM. It asserts the complete CORR/CR2 fit, non-inference
values, generated R script and comparison rules are identical. Diagnostic
captures remain separate from browser exports.

## Verification on the applied source

Fresh Node captures execute the original page scripts and adapters with DOM
storage stubs. The unchanged desktop checker then runs the actual R packages:

| App | Desktop R parity | Planted copy | Exit codes |
| --- | --- | --- | --- |
| NMA inconsistency | 52/52 | 51/52, only `split.0.direct` fails | 0 / 1 |
| Multivariate | 10/10 | 9/10, only `mu1` fails | 0 / 1 |
| RVE | 40/40 | 39/40, only `coef.0.estimate` fails | 0 / 1 |

Evidence: [node-smoke/round5-results.log](node-smoke/round5-results.log).
These are numerical checks on the applied source, not browser evidence.

- Existing `tests/test_stats_qt.py`: **24 passed**, unchanged.
- Export server regression suite: **2 passed**, including its planted defect.
- All three Node snapshot smoke checks passed (no refit, stale/missing result
  refusal, unique quantities and CommonJS export).
- The precision diagnostic confirms the old and corrected p-values above.
- `git diff --check` passes.

The unchanged [full acceptance run](round5-test.log) prints
`SOME_TESTS_FAILED`: scope rejects `shared/stats-qt.js`; browser tests and
exporting fail with `spawn EPERM`. The exporter writes no replacement files
on launch failure. Consequently that run's RVE 38/40 result uses the old
round-4 browser export, not the corrected engine. Existing browser exports
were deliberately not replaced by Node captures.

The supplied round-4 host FEEDBACK.md remains the most recent browser evidence:
6/6 browser tests passed; webR NMA 52/52, multivariate 10/10; RVE correctly
refused unavailable pinned packages. A new host run must verify the corrected
source and refresh all browser exports after the scope conflict is resolved.

Desktop versions observed: R **4.6.0**, netmeta **3.7.0**, metafor **5.2.1**,
mvmeta **1.0.3**, robumeta **2.1**, clubSandwich **0.7.0**, jsonlite **2.0.0**.
Host round-4 browser versions: webR **0.5.5**, R **4.5.1**, netmeta **3.4-0**,
metafor **4.8-0**, mvmeta **1.0.3**. The bundled serializer is jsonlite **2.0.0**.

## Quantities and tolerances


All values come from the page's existing result accessor. Input text is read
from the DOM; NMA reuses the page parser, and the other adapters preserve the
page's row-parsing rules. `currentState` never runs an estimator. Pending input
and missing/refused results are rejected. RVE additionally checks that a
coefficient table exists because its original accessor survives failed fits.

| App | Keys on built-in example | Rules | Source |
| --- | --- | --- | --- |
| NMA inconsistency | 52: `tau2`, `dbt.Q`, `dbt.df`, `dbt.p`; for six comparisons, `split.i.direct`, `directSE`, `indirect`, `indirectSE`, `difference`, `differenceSE`, `z`, `p` | FE/DL numeric values: relative `1e-9`; PM-derived values: relative `1e-6`; all p-values: absolute `1e-9`; global df exact | `nma-inconsistency/validate/adapter.js:120-122`, `nma-inconsistency/validate/README.md:11` |
| Multivariate | 10: `k`, `mu1`, `mu2`, `se1`, `se2`, `variance1`, `variance2`, `covariance`, `rho`, `logLik` | Relative `1e-6`; two-study fits relative `1e-9`; k exact; unavailable correlation is null | P18 `multivariate-ma-reproducible/bench/compare.py:67-69`; stricter than the rounded checks in `hub/shared/tests/multivariate-ma-parity.spec.mjs:29-36` |
| RVE | 40: `k`, `clusters`, `coefficients`, `tau2`; three coefficients each with `coef.i.estimate`, `se`, `t`, `df`, `p`, `ci_lo`, `ci_hi`; independent `club.i.estimate`, `se`, `t`, `df`, `p` | Relative `1e-9` for estimates/SE/t/df/tau2; absolute `1e-9` for p/CI limits; counts exact | P15 `rve-reproducible/bench/compare_engine.py:7-13,31-39`; stricter than `hub/shared/tests/rve-meta-cr2-parity.spec.mjs:54-58` |

Relative difference is `abs(app-R)/max(1,abs(R))`. Numeric comparisons accept
null only against null. Missing keys, unknown comparison kinds, and invalid
tolerances fail. Exact comparisons follow `AlmValidate.compare`.

P18's accessor does not expose confidence limits or between-study SDs at full
precision; this adapter uses its stored means, SEs and covariance components.
It does not reconstruct estimates from rounded cards or refit the model.

Local archive comparator SHA-256 values, for source identification:

- P18 `bench/compare.py`: `fa0d5f38c125f16adc43a41197be1b52dda1faa1f8b224e5fc8082561450d6f1`
- P15 `bench/compare_engine.py`: `6b8dd7922188ff9af2b1e55f3aa78cdb5c72d52800e3c93c06f69d9d0f099d1a`

## Reference recipes and plot objects

- NMA uses `netmeta::netsplit(method="Back-calculation")` with signed,
  independently checked comparison membership and
  `netmeta::decomp.design(tau.preset=tau)` for the global test. PM follows
  the archived uncentred `metafor::.QE.func` equation. Objects: `m`, `spl`,
  `dec`; plot: direct/indirect forest.
- Multivariate uses the primary P18 `mvmeta::mvmeta` oracle with four
  independent starts, the archived optimizer controls, zero-covariance and
  exact two-study boundary treatment, and the `log(k)` likelihood
  normalization. Objects: `f`, `Y`, `S`, `G`, `mu`, `CV`; plot: joint outcomes.
- RVE uses `robumeta::robu(modelweights="CORR", small=TRUE)` and separately
  `clubSandwich::coef_test(vcov="CR2", test="Satterthwaite")`. Objects: `f`,
  `tab`, `cr2`; plot: coefficient intervals. Browser unavailability is an
  expected refusal, never an RVE parity pass.

## Reproduction

Run from the repository root with the existing Playwright installation and
R packages installed:

```text
node scripts/xplat/dump-live.mjs
Rscript validation/live/check_live.R validation/live/nma-inconsistency.json
Rscript validation/live/check_live.R validation/live/multivariate-ma.json
Rscript validation/live/check_live.R validation/live/rve-meta.json
```

Set `PW_CHANNEL=msedge` for a system Edge installation. The exporter uses its
own server on an ephemeral port and fresh browser contexts. Run the same R
checker on each `.planted.json` file and require exit 1 and exactly one miss.

When browser launch is unavailable, keep diagnostic output separate:

```text
node scripts/xplat/smoke-live.mjs
Rscript validation/live/check_live.R validation/live/node-smoke/nma-inconsistency.json
Rscript validation/live/check_live.R validation/live/node-smoke/multivariate-ma.json
Rscript validation/live/check_live.R validation/live/node-smoke/rve-meta.json
node scripts/xplat/diagnose-rve-precision.mjs
python -m pytest tests/test_stats_qt.py -q -p no:cacheprovider
node --test --test-isolation=none scripts/xplat/live-server.test.mjs
```

The precision probe writes the original control, corrected candidate and
planted candidate under `precision-probe/`; their R-check exit codes should
be 1, 0 and 1. The source engine is never modified by that diagnostic.

All three adapters, additive index script tags, six browser tests, portable
exporter and desktop checker are implemented. The remaining work is resolving
the base-branch scope conflict and obtaining fresh host acceptance evidence.
