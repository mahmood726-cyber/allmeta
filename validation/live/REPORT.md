# Live adapters (apps 16, 18, 15) — verification report

Adapters: `nma-inconsistency/alm-live.js`, `multivariate-ma/alm-live.js`, `rve-meta/alm-live.js` (window.AlmLiveAdapters; same contract as the
13 existing validate adapters: currentState / buildScript emitting one ALMJSON line / appValues / compare). No engine files are changed by this PR.

Results (baseimage, Windows, R 4.6.0; webR 0.5.5 in Edge), run Tue 20 Oct 2026:

| app | webR (in-browser R) | desktop R | planted copy |
|---|---|---|---|
| nma-inconsistency (16) | 52/52 (netmeta 3.4-0) | 52/52 (netmeta 3.7.0) | 51/52 (detected) |
| multivariate-ma (18) | 10/10 (mvmeta 1.0.3) | 10/10 (mvmeta 1.0.3) | 9/10 (detected) |
| rve-meta (15) | unavailable: robumeta/clubSandwich are not in the pinned webR repo (honest message, tested) | **52/52** (robumeta 2.1, clubSandwich 0.7.0; re-run Wed 21 Oct 2026) | 51/52 (detected) |

rve-meta, first run (Tue 20 Oct, before PR #146): 38/40. The two misses were the page p-values `coef.1.p` and `club.1.p`, because
`shared/stats-qt.js` stopped its incomplete-beta continued fraction at `EPS = 3e-7`. PR #146 (`MAXIT = 1000, EPS = 4e-15`) is now on main.

rve-meta re-run (Wed 21 Oct 2026, this branch = main v1.8.0 + features; baseimage, Windows, R 4.6.0, robumeta 2.1, clubSandwich 0.7.0):
`LIVECHECK rve-meta 52/52` (exit 0); planted copy `LIVECHECK rve-meta 51/52` (miss `coef.0.estimate`, exit 1). N is 52, not 40: main's
reworked page ships the robumeta `corrdat` example with three predictors (males, college, binge), so there are 4 coefficients
(4 model quantities + 12 per coefficient) instead of the 3 in the example used on 20 Oct. The adapter now reads the page's own parsed
inputs from its result object (header-mapped columns, vi from an SE column) and the new "centre predictors" option (centring is redone
in R); an ad-hoc desktop-R run of the same example with predictors centred also printed `LIVECHECK rve-meta 52/52` (not committed).
nma-inconsistency and multivariate-ma were not re-run here; their rows above are from 20 Oct.

Commands: `node scripts/xplat/dump-live.mjs` (writes `validation/live/<app>.json` from the app's built-in example) then
`Rscript validation/live/check_live.R validation/live/<app>.json` (prints `LIVECHECK <app> n/N`, exit 1 on any miss); planted copies
`<app>.planted.json` must fail.

## component-nma (19) — added Fri 30 Oct 2026

Adapter: `component-nma/alm-live.js` (window.AlmLiveAdapters['component-nma']; same contract). It reads the page's displayed
result (`_almLastCnma`) and the input it was fitted on; it never fits. The R recipe is `netmeta::discomb(inactive = "control")`
(additive CNMA, generalized DerSimonian-Laird), the model of `component-nma/tests/fixtures/cnma-oracle.R`. Tolerance is the one in
`hub/shared/tests/component-nma-parity.spec.mjs`: 1e-9 relative to max(1, |R|) for tau2, Q, component and intervention
estimates/SEs/95% limits; residual df equal (relative tolerance 0). The Verify-in-R panel (`alm-features.js` verify.adapter) now resolves to this adapter.

Results (baseimage, Windows):

| dataset | webR (R 4.5.1, webR 0.5.5, netmeta 3.4-0) | desktop R (R 4.6.0, netmeta 3.7.0) | desktop MAX_ABS_DIFF | planted copy |
|---|---|---|---|---|
| built-in example (8 contrasts, 3 components) | 39/39 | 39/39 | 2.2e-16 | 38/39 (miss `components_0_est`) |
| oracle `heterogeneous` (tau2 = 7.16) | 23/23 | 23/23 | 1.1e-13 (Q = 633.8; relative 4.4e-16) | 22/23 |
| oracle `disconnected-identifiable` | 23/23 | 23/23 | 2.8e-16 | 22/23 |

The webR runs also reproduce the archived R references in `cnma-validation-oracle.json` at 1e-9
(`hub/shared/tests/features-live-component-nma.spec.mjs`). Exports: `validation/live/component-nma.json` and `.planted.json`
(`node scripts/xplat/dump-live.mjs`, then `Rscript validation/live/check_live.R validation/live/component-nma.json`).
