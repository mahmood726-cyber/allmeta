# User-path check (real Chrome)

Drives an app the way a user does: loads its default example, runs it, presses every
R-related control ("Verify in R", "Validate (R)", "Validate this analysis in R",
"Download/Export R script"), follows new tabs into the WebR validator, ticks its consent
box, runs WebR to completion, and saves the displayed text, the R output, downloaded
.R scripts, the console and failed requests.

Added 2026-11-11 after a user saw "wr.captureR is not a function" in the WebR validator
and R results that differed from the app. The Node/linkedom harness never exercised
these paths.

    npm install playwright-core            # drives the system Chrome; no browser download
    node tools/userpath/serve.cjs . 8765    # optional: serve a worktree (r-shiny/ proxied from the live site)
    node tools/userpath/userpath.cjs <app> <outdir> [--base http://127.0.0.1:8765/] [--pasted data.txt]

Run downloaded scripts with `Rscript --vanilla` and compare with `<outdir>/default-displayed.txt`.
Release rule: every app whose paper is with co-authors or a journal is re-run before release.
Static guards that run in CI: webr-validator/tests/test_user_path.py.

Pasted data (added 2026-11-12, lane up2): `--steps runs.json` replays each run on a fresh load,
then presses every R control again. Each run is `{"tag", "expectRows", "steps": [...]}` with steps
`{"select": "#id", "value": v}`, `{"fill": "#id", "file": path}`, `{"click": "#id"}`, `{"wait": ms}`.
`expectRows` is the number of studies the page holds; a validator tab that opens with a different
number (stale shared-bus data) is a FAIL even when it reports MATCH. Every run writes
`verdict.json`; the exit code is 2 if any R control FAILs (alert instead of a tab, validator
without MATCH, failed or refused in-page quantity). UNKNOWN verdicts must be read by hand.

`--textarea <css>` (2026-11-12, lane up3) names the data box for `--pasted` when it is not
`#src`/`#f-data`/`#data`/`#f-input`. `bus-handoff.cjs ... expect-method=DL expect-test=z`
(lane integ) also fails a control whose validator opens with a different estimator/test.
