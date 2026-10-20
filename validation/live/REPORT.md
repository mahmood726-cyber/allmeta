# Live adapters (apps 16, 18, 15) — verification report

Adapters: `nma-inconsistency/alm-live.js`, `multivariate-ma/alm-live.js`, `rve-meta/alm-live.js` (window.AlmLiveAdapters; same contract as the
13 existing validate adapters: currentState / buildScript emitting one ALMJSON line / appValues / compare). No engine files are changed by this PR.

Results (baseimage, Windows, R 4.6.0; webR 0.5.5 in Edge), run Tue 20 Oct 2026:

| app | webR (in-browser R) | desktop R | planted copy |
|---|---|---|---|
| nma-inconsistency (16) | 52/52 (netmeta 3.4-0) | 52/52 (netmeta 3.7.0) | 51/52 (detected) |
| multivariate-ma (18) | 10/10 (mvmeta 1.0.3) | 10/10 (mvmeta 1.0.3) | 9/10 (detected) |
| rve-meta (15) | unavailable: robumeta/clubSandwich are not in the pinned webR repo (honest message, tested) | **38/40** (robumeta 2.1, clubSandwich 0.7.0) | 37/40 (detected) |

rve-meta 38/40: the two misses are the page p-values `coef.1.p` and `club.1.p`. Root cause: `shared/stats-qt.js` stops its incomplete-beta
continued fraction at `EPS = 3e-7`, so `AlmStats.pt` is not accurate enough for the strict tolerance. PR #146 (paper 15 lane) changes exactly
that (`MAXIT = 1000, EPS = 4e-15`); this PR deliberately does not touch the shared engine. Expected after #146: 40/40 (to be re-run, not assumed).

Commands: `node scripts/xplat/dump-live.mjs` (writes `validation/live/<app>.json` from the app's built-in example) then
`Rscript validation/live/check_live.R validation/live/<app>.json` (prints `LIVECHECK <app> n/N`, exit 1 on any miss); planted copies
`<app>.planted.json` must fail.
