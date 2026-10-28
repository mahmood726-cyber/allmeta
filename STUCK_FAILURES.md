# v182-ci-263 CI blocker

## CI-1 - deployed annualised-plot webR worker

Status: unresolved at pass 4; no successful browser rerun observed.

Evidence: GitHub Actions run 40377400173, job 121764106918, failed
`[chromium] pages-crawl.spec.ts:85:3 > Annualised Outcome Plot (R/Shinylive)`
with `net::ERR_BLOCKED_BY_RESPONSE` for
`https://mahmood726-cyber.github.io/allmeta/r-shiny/shinylive/webr/webr-worker.js`.
The full log was retrieved in pass 2; REPORT.md records the source links and
its limits. This is historical execution evidence, not a current-health claim.

The check loads the public deployment (`tests/playwright/pages-crawl.spec.ts:28`),
records the failed request at lines 101-105, and rejects it at lines 137-141.
This proves the request failed; it does not establish the underlying response
policy/network cause, transience, or failure on main. The five-file correlation
PR does not change the R/Shinylive app. The job copy contains neither that app's
source nor a base comparison tree, and this lane cannot run Playwright.

The requirement that deployed assets load is valid and remains unchanged.
No skip, worker exception, assertion relaxation, or CI exclusion was applied.
The added Node regression uses controlled request events and passed all four
cases after one test-harness correction; it cannot certify the deployment.

Next action in the owning scope: inspect the failed worker's browser trace and
response/headers, repair the verified cause, and rerun the annualised-plot
browser case followed by the full PR check. Final local unit verification is
requested separately in RUN.txt; it does not resolve this blocker.

| Evidence | Kind | Limit |
| --- | --- | --- |
| Failed worker URL/error | Observed historical CI output | Browser/response-policy cause remains unknown |
| Crawl source and absent app/base trees | Static inspection | Cannot reproduce the remote request |
| Four passing Node cases | Observed wrapper execution with test doubles | Covers rejection/control behavior, not deployment health |
