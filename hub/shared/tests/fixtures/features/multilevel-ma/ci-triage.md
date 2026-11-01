# PR #194 CI triage
Read-only GitHub job log retrieval for run 39473047899, job 118801807749.
URL: https://github.com/mahmood726-cyber/allmeta/actions/runs/39473047899/job/118801807749

2026-10-20T18:22:55.7407780Z   ✓  204 [chromium] › every-app-plots.spec.ts:232:3 › plot: /multilevel-ma/ (1.0s)
2026-10-20T18:24:08.9874526Z   ✓  261 [chromium] › grade-pooled-bus.spec.mjs:371:3 › ma-pooled bus: multilevel-ma (via GradePush helper) → GRADE (582ms)
2026-10-20T18:40:24.8535884Z   ✓  758 [chromium] › verify-touched-apps.spec.ts:223:3 › bus participant: /multilevel-ma/ (821ms)
2026-10-20T18:41:02.7133634Z   ✓  798 [chromium] › catalog-svg-plots.spec.mjs:78:7 › Catalogue SVG at 1280px › multilevel-ma/index.html (776ms)
2026-10-20T18:41:44.5430447Z   ✓  862 [chromium] › catalog-svg-plots.spec.mjs:78:7 › Catalogue SVG at 390px › multilevel-ma/index.html (667ms)

2026-10-20T18:42:15.0289733Z   1) [chromium] › pages-crawl.spec.ts:85:3 › Mean Single-Group Meta-Analysis (R/Shinylive) ─────────
2026-10-20T18:42:15.0290438Z 
2026-10-20T18:42:15.0293328Z     Error: Missing deployed asset(s): net::ERR_BLOCKED_BY_RESPONSE https://mahmood726-cyber.github.io/allmeta/r-shiny/shinylive/webr/webr-worker.js
2026-10-20T18:42:15.0294253Z 
2026-10-20T18:42:15.0294937Z       139 |         duration_ms: Date.now() - started, console_errors: filterBenign(consoleErrors), missing_assets: missingAssets,
2026-10-20T18:42:15.0296037Z       140 |         notes: "asset(s) returned 4xx/failed on the deployed site" });
2026-10-20T18:42:15.0297069Z     > 141 |       throw new Error(`Missing deployed asset(s): ${missingAssets.slice(0, 3).join(" | ")}`);
2026-10-20T18:42:15.0298035Z           |             ^
2026-10-20T18:42:15.0298462Z       142 |     }
2026-10-20T18:42:15.0298823Z       143 |
2026-10-20T18:42:15.0299350Z       144 |     const realErrors = filterBenign(consoleErrors);
2026-10-20T18:42:15.0300289Z         at /home/runner/work/allmeta/allmeta/tests/playwright/pages-crawl.spec.ts:141:13
2026-10-20T18:42:15.0300831Z 
2026-10-20T18:42:15.0301627Z     attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
2026-10-20T18:42:15.0302835Z     test-results/pages-crawl-Mean-Single-Group-Meta-Analysis-R-Shinylive--chromium/test-failed-1.png
2026-10-20T18:42:15.0304135Z     ────────────────────────────────────────────────────────────────────────────────────────────────
2026-10-20T18:42:15.0304589Z 
2026-10-20T18:42:15.0305321Z     Error Context: test-results/pages-crawl-Mean-Single-Group-Meta-Analysis-R-Shinylive--chromium/error-context.md
2026-10-20T18:42:15.0306078Z 
2026-10-20T18:42:15.0306702Z     attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
2026-10-20T18:42:15.0307986Z     test-results/pages-crawl-Mean-Single-Group-Meta-Analysis-R-Shinylive--chromium/trace.zip
2026-10-20T18:42:15.0308495Z     Usage:
2026-10-20T18:42:15.0308605Z 
2026-10-20T18:42:15.0309061Z         npx playwright show-trace test-results/pages-crawl-Mean-Single-Group-Meta-Analysis-R-Shinylive--chromium/trace.zip
2026-10-20T18:42:15.0309538Z 
2026-10-20T18:42:15.0309899Z     ────────────────────────────────────────────────────────────────────────────────────────────────
2026-10-20T18:42:15.0310511Z 
2026-10-20T18:42:15.0310620Z   1 failed
2026-10-20T18:42:15.0311131Z     [chromium] › pages-crawl.spec.ts:85:3 › Mean Single-Group Meta-Analysis (R/Shinylive) ──────────
2026-10-20T18:42:15.0311572Z   26 skipped
2026-10-20T18:42:15.0311896Z   882 passed (21.1m)

The failed crawl targets the deployed GitHub Pages site, not this worktree.
No app engine, other app, shared file, CI gate, tolerance or reference was changed.

