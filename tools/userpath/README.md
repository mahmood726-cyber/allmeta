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
An in-page pass count counts only if it appeared after that control was pressed and covers more
than 0 quantities; a panel still busy when the wait runs out is a FAIL; a control that could not
be pressed is a FAIL; exit 3 means no R control was exercised. bus-handoff.cjs fails a hand-over
with a stale study in any row, and fails with 0 runs.

Lane uptool (2026-11-19): `--entry <file>` opens `<base><app>/<file>` instead of the folder
index; a built-in map opens `IPD-Meta-Pro/ipd-meta-pro.html` (its `index.html` is a landing
page with no R control, so the folder run ended with exit 3). A "Verify in R" that runs R in the
page (no validator tab) is scored by the MATCH/MISMATCH line it newly printed: MATCH n/n with
n > 0 is PASS, MISMATCH is FAIL, no new line (or still busy) is FAIL ("did not complete"),
MATCH 0/0 or NOT CHECKED is UNKNOWN; `verdict.json` carries `match`/`total`. After every page
load, known onboarding overlays (HTA tutorial and welcome) are closed by their own close
controls, never by removing DOM; any overlay left up is written to `overlays.json` and to
`verdict.json` (`overlay: true`; a known one is a FAIL). Offline tests:
`PLAYWRIGHT_CORE=<path> node --test tools/userpath/tests/userpath.test.cjs`.

PR #637 review (2026-11-20): an in-page run ends only when the page is idle and stable (a new
"Stage 1: MATCH 3/3" while R still runs is not a finish); any new line containing MISMATCH is a
FAIL whatever else printed (IPD "MISMATCH (k of n compared quantities ...)", benefit-risk
"MISMATCH k of n checks differ"); "MATCH a/b of N" is partial; "NOT CHECKED: no quantity ..." is
UNKNOWN. Each control's result is read from its own output region (nearest ancestor, up to 4
levels, holding a status/live/output/pre element) when one exists; before every press the harness
waits for the live regions to go idle, and without a region a result after a busy page is not
attributed. `--entry` is resolved with `new URL()` and must stay inside the app folder (encoded
dots/slashes refused). Generic close buttons are pressed only in dialog-like elements (role=dialog,
aria-modal, modal/overlay/... classes); a fixed full-screen app shell is recorded in
`overlays.json` (`coveringNonDialog`) and never pressed. Tests:
`node --test tools/userpath/tests/userpath.test.cjs tools/userpath/tests/planted-rev637.test.cjs`
(Node 24 does not take a bare directory; browser tests skip without PLAYWRIGHT_CORE).

PR #637 round 3 (2026-11-20, lane uptool2): the in-page "Verify in R" score is FAIL-CLOSED instead
of a list of patched cases. PASS needs ALL of: (1) the control's new output (lines added since the
click, from its own region when it has one) has MATCH n/n, n > 0, as its LAST verdict line; (2) that
output has no MISMATCH(ES), no NOT CHECKED verdict (a NOT CHECKED row only when the final MATCH line
declares "k more NOT CHECKED"), and no error/refusal line (`Error in`, `Error:`, `ERROR`, `FAIL`,
`Fehler`, failed, refused, unavailable, "is not a function"); (3) no busy text is new or changed since
the click anywhere on the page or its status/live regions (busy text that was there before the click
and is unchanged is ignored: HTA's static "Loading..."); (4) the page was unchanged for 10 s
(`STABLE_MS`); (5) every earlier control was idle before the click (no busy text new since the
baseline read before the first control). A wrong or unfinished result is FAIL; an unattributable
one (earlier run still busy, pre-click busy text that changed during the run, unstable page) or one
that checked nothing is UNKNOWN. Exit 4 = no FAIL but at least one UNKNOWN. Tests:
`node --test tools/userpath/tests/userpath.test.cjs tools/userpath/tests/planted-rev637.test.cjs
tools/userpath/tests/rev637b.test.cjs tools/userpath/tests/rev637b-overlay.test.cjs
tools/userpath/tests/failclosed-round3.test.cjs` (rev637b* written by the round-2 reviewer).
