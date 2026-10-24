# PR 193 independent review follow-up

Status after round 3 external feedback: **533/533 unit tests and 11/11 browser tests passed**, including live generic/binary R comparisons, planted failures, receipt binding, exports and accessibility. This round relocates the report into the allowed app fixture directory to fix the sole failing scope gate. This deliberately departs from TASK.md's requested root report location to satisfy its allowed-file restriction and the unchanged runner. The next external TEST.ps1 run must confirm ALL_TESTS_PASS; no full passing run is claimed yet. No commit or push was made. The engine, index.html, shared files, other apps, tolerances, and frozen references are unchanged.

## Round 4 verification of round 3 feedback

- Reproduced the sole failure by executing section 2 directly from the unchanged TEST.ps1 source: **scope FAIL solely for REPORT.md**, additive-index PASS.
- Relocated the report into this allowed fixture directory and updated the prepared PR body. No production or test code changed this round.
- Executed the same section again: **scope PASS; index-additive PASS (zero removed lines)**. Git lists this report normally among untracked files; no exclusion hides it.
- Focused review regression suite: **12/12 passed**, including planted audit and settings-drift rejection tests. `git diff --check` passed.
- Rechecked the review against the adapter and browser gates. All locally actionable review fixes remain covered. Shared multi-package formatting and PR integration/metadata actions remain documented below.
- Full runtime evidence remains external round 3: **533/533 unit and 11/11 browser tests passed**. A fresh external TEST.ps1 run is still needed to observe **ALL_TESTS_PASS** with the corrected report location.

## Feedback failure: root cause and reproduction

FEEDBACK.md contains exactly one failing gate: `GATE FAIL scope files outside the app's allowed set: REPORT.md`. TEST.ps1 collects both `git diff HEAD --name-only` and `git ls-files --others --exclude-standard`; its allowlist accepts the app's fixture directory but no root report. The explicitly required report is untracked, so the scope gate rejects it independently of all test results. Running section 2 verbatim during this round reproduced that exact failure; the additive-index check passed with zero removed lines.

There is no application failure to repair in this feedback. The fix is to relocate this report to `hub/shared/tests/fixtures/features/pubbias-tests/REPORT.md`, an already allowed path, keeping the findings and previous verification evidence below. The root report is removed. The harness, Git exclusions, index, assertions, tolerances and references are unchanged. Before relocation, executing section 2 directly from TEST.ps1 reproduced the exact failure above. No additional test is needed for this documentation move: the existing scope gate is the failing-first regression check.

## Failing-first evidence

Before production edits, `node --test --test-isolation=none --test-reporter=tap hub/shared/tests/fixtures/features/pubbias-tests/review-regressions.cjs` ran 10 tests: 9 failed and the existing planted Egger mismatch passed. The failed tests were Thompson-Sharp interpretation, binary summary/caveat, unavailable-package VERIFY bypass, tiny p-values, orphan comparison scope, selection boundaries, singular study, rejected entry, and independent DOM-count documentation. After the fixes all 10 passed. A subsequently added browser-coverage guard failed before the binary/stale-result browser test was added. Final focused suite: 12/12 pass, including settings-drift and planted-audit checks. Source-level coverage checks do not substitute for executing the browser tests.

## Findings and disposition

1. **P1 Thompson-Sharp interpretation — fixed.** Verified against `pubbias-tests/index.html:557` and `:570`: the engine tests the effect-on-SE intercept, with the extra dispersion adjustment. The engine remains frozen. Methods and Results explicitly identify an effect extrapolated to SE zero, not an asymmetry test (`pubbias-tests/alm-features.js:107`, `:123`). Retained the number with an explicit label so the existing every-displayed-result test remains strict. Test: `P1 Thompson-Sharp is explicitly an extrapolated effect, not asymmetry`.

2. **P1 binary plain-language summary — fixed.** The engine warns against ordinary Egger for log odds ratios at `pubbias-tests/index.html:627`. Plain text now reports Peters and Harbord, and both copyable Plain and Results paragraphs carry the Egger caveat (`pubbias-tests/alm-features.js:88`, `:121`). Test: `P1 binary copyable paragraphs prefer Peters and Harbord and caveat Egger inline`.

3. **P1 VERIFY bypass — fixed.** The generic live gate now unconditionally requires 11/11 PASS (`hub/shared/tests/features-pubbias-tests.spec.mjs:186`) before exports and the existing 10/11 planted failure. No missing-package escape remains. Separate `VERIFY UNAVAILABLE` tests stub `runRPlots` for each package and check failure, no valid receipt, and script download (`:281`). Test: `P1 VERIFY spec cannot accept unavailable packages instead of a comparison`. External FEEDBACK.md confirms the live gate, planted failure and both unavailable-package browser tests passed.

4. **P1 integration scope — needs coordinator/PR metadata action.** Confirmed locally: app commit 24d4670 has integration merge a2389ad as its parent; its ancestors include entry, live, panel and base merges. The current PR body fetched from GitHub calls the work additive without acknowledging that dependency. No dedicated integration PR was found by repository search. Prepared `hub/shared/tests/fixtures/features/pubbias-tests/PR-BODY.md`: explicitly prohibit merging into main until the integration stack is separately reviewed/merged, then rebase and recheck the app-only diff. Attempting to update PR #193 was blocked by the connector: "MCP tool call requires approval, but approval policy is never". No remote metadata was changed. Retargeting without confirming an existing integration branch/PR would be unsafe; no branch/history rewrite was attempted.

5. **P2 p = 0.000 — fixed.** Every report p-value uses `T.p`, including DOM-derived rounded zeros (`pubbias-tests/alm-features.js:86`, `:120`–`:133`). The existing shared threshold handles zero and 0.0005 without altering result values. Tests cover all six p-value keys and the exact 0.001 boundary: `P2 tiny exact and rounded DOM p-values use a threshold, never zero`. Snapshot changes are the intended wording/formatting changes, not relaxed numerical references.

6. **P2 fixed settings — no present numerical defect; drift guard added.** `pubbias-tests/index.html:253` really adds 0.5 to each cell (one to each arm total), and `:635` really supplies steps [0.025]. These match `pubbias-tests/alm-features.js:39`–`:40`; no production change was warranted. Test `P2 fixed settings match the actual engine; planted source drift fails` checks both source settings and the actual zero-cell parser output, and rejects planted 0.05-cutpoint/0.1-correction source copies. The genuine source passes without loosening a reference. This guard is test-only and its positive case was already passing; the planted drift cases demonstrate rejection.

7. **P2 verification packages and orphan scope — partially fixed; needs shared fix below.** The scope now requires both current results and a non-null `T.verify()` (`pubbias-tests/alm-features.js:114`). Binary text names meta and points to the actual recorded version in Verify in R. Test: `P2 comparison scope requires a complete verification sentence` checks a receipt without webR metadata is silent, then a complete receipt emits the scope. Embedding both package versions in the audited report remains a shared formatter limitation.

8. **P2 selection boundary — fixed.** `shared/selmodel.js:124` bounds the weight between zero and 100. `selectionBoundary` compares at the displayed precision (`pubbias-tests/alm-features.js:76`); both exact and rounded bounds add "the selection weight reached its boundary; the model is not informative." Test: `P2 selection boundary fits are qualified at both displayed bounds`, including an interior negative control. No model computation was changed.

9. **P2 singular study — fixed.** Uses `T.plural` (`pubbias-tests/alm-features.js:129`). Test: `P2 trim-and-fill uses singular study only for one imputation` checks zero, one and two.

10. **P2 independent DOM count — fixed in reporting without weakening checks.** The existing 12 generic/16 binary display checks remain intact. The browser spec separately asserts the exact nine engine-sourced keys and reports that independent count (`hub/shared/tests/features-pubbias-tests.spec.mjs:119`–`:125`). Test: `P2 DOM audit identifies its nine independent engine quantities`. The other seven possible checks are explicitly identified as display consistency, not independent numerical validation.

11. **P2 binary R and receipt-binding coverage — fixed and externally verified.** `VERIFY BINARY: meta rows, planted failure and verified inputs with unrun results` (`hub/shared/tests/features-pubbias-tests.spec.mjs:230`) requires 15/15 real comparisons, all four Peters/Harbord keys, actual package versions, and a planted Peters 14/15 failure. It then verifies edited inputs without rerunning the app, asserts that the receipt is current while the displayed results remain old, and withholds both verification prose and scope. The existing offline binding behavior was already correct; this was a coverage gap. The source coverage guard was shown to fail before adding the browser test. External FEEDBACK.md now confirms this browser test passed, with VERIFY 15/15 and planted 14/15 FAIL.

12. **P2 entry overwrites inputs — fixed.** `apply()` now restores source/format in `finally` on rejection or exception and validates each accepted effect/SE, rather than accepting stale results with the same study count (`pubbias-tests/alm-features.js:177`). Test: `P2 rejected entry restores inputs and does not accept stale same-size results` checks no-op and throwing runs. Existing three-format round trips still pass.

13. **P2 metadata BOM/local paths — prepared, not published.** Confirmed U+FEFF in `git log -1`'s commit subject and in the fetched PR body, plus local paths in the PR body. The replacement `PR-BODY.md` has neither BOM nor local paths and preserves clearly labelled historical validation. The connector blocked publication as described in item 4. The existing commit subject requires coordinator handling at squash/merge; this lane must not rewrite or commit history.

## Needs shared fix

- **Audited multi-package verification versions.** `shared/alm-text.js:233` selects exactly one package; `:290`–`:295` exposes only one `verify.pkg`/`verify.pkgVersion`; `:403` builds `T.verify()` from those tokens. There is no app-supplied context extension for a second package. Add shared typed package-list context tokens and audit support, then render both receipt-derived metafor and meta versions. Do not hardcode the paper's meta version or smuggle an unaudited version string into the report. Shared files were not edited.

## Coordinator action

- **Report location.** The report now lives in the allowed fixture directory instead of the contradictory root location in TASK.md. TEST.ps1 is unchanged; rerun it externally for the final full-suite result.
- **PR integration dependency and metadata.** Publish the prepared `hub/shared/tests/fixtures/features/pubbias-tests/PR-BODY.md`, resolve the integration dependency before merge, and remove the commit-subject BOM at squash/merge. The previous connector call was blocked by the approval policy; no remote change or history rewrite is claimed.

## Previous-round verification (historical)

- Existing unit suite: **533/533 passed**, invoking each of the 12 files in its own Node process with `--test-isolation=none`. Running all files in one process causes unrelated shared-global contamination; that is not the prescribed isolated test setup.
- Focused review regressions: **12/12 passed**.
- Unchanged-engine offline smoke: **TEXTAUDIT 59/59**, planted **58/59 FAIL** at `dom:egger_t`; binary **85/85**; **ENTRYRT 3/3**; entry rejection, receipt binding and share gates all pass. These are DOM-double checks, not browser/R results.
- JavaScript syntax checks and `git diff --check` pass. The text-template digit-literal lint passes. Existing tolerances, frozen corpus/reference data, numerical tests, and engine files were not modified.
- In the previous sandbox run, `TEST.ps1 -Wt <lane>/wt` could not create Node worker/browser processes (`spawn EPERM`). That limitation is superseded for application validation by the external round 1 run in FEEDBACK.md: **533/533 unit tests; 11/11 browser tests; ENTRYRT 3/3; TEXTAUDIT 59/59, planted 58/59 FAIL, binary 85/85; VERIFY 11/11 generic, planted 10/11 FAIL; VERIFY 15/15 binary, planted 14/15 FAIL; VERIFYZIP 9/9; all four tabs have zero serious/critical accessibility violations**. Browser tests also passed both unavailable-package cases, stale-result receipt binding, downloads and share rejection checks.
- This round reran the focused regression suite: **12/12 passed**. `git diff --check` passed. The exact scope/index section reproduced **scope FAIL solely for REPORT.md; index-additive PASS**.
- This round changes documentation only to incorporate the external evidence and identify the failure's root cause. No new behavior or test weakening was introduced. **ALL_TESTS_PASS has not been observed**: the remaining scope conflict needs the report-path clarification above, followed by the unchanged external TEST.ps1 run.

## Round 3 verification of round 2 feedback

- Read TASK.md, DESIGN.md, REVIEW.md and the complete round 2 FEEDBACK.md. Round 2 has no failing unit or browser tests; the sole failure is the same root report path.
- Executed TEST.ps1 section 2 directly from its source without modifying the predicates: **scope FAIL solely for REPORT.md; index-additive PASS (zero removed lines)**.
- Reran `node --test --test-isolation=none --test-reporter=tap hub/shared/tests/fixtures/features/pubbias-tests/review-regressions.cjs`: **12/12 passed**, including the planted audit failure.
- Rechecked the adapter and regression coverage against the review. The remaining shared limitation is confirmed at `shared/alm-text.js:267`, `:292` and `:409`: the verification context and formatter carry only one package/version. The app correctly withholds comparison prose when verification facts are incomplete. No shared implementation was edited.
- `git diff --check` passed. The external 533/533 unit and 11/11 browser results remain the evidence for the full runtime suite; no new full external run or ALL_TESTS_PASS is claimed.
