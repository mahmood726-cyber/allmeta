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
