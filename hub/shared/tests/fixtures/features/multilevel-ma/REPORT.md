# PR #194 review fixes

Base reviewed and modified: `27dabe29dcf1a72b7137c3d248b6a4943ad90e00`.
Read `TASK.md`, all of `DESIGN.md`, and all of `REVIEW.md`. No P0 findings were listed.
Only the app feature adapter and new app-specific test/evidence files were changed,
including this report in the permitted fixture directory. No engine, shared module, existing test,
tolerance, reference, snapshot, other app, or validation adapter was changed.

## Verification and failing-first evidence

`hub/shared/tests/fixtures/features/multilevel-ma/review-regressions.cjs` runs the
actual entry core and adapter in isolated VM contexts with a minimal DOM. Before
the implementation changes, all 15 initial regression tests failed on their
intended assertions (wrong field, accepted corrupt output, retained old provenance,
missing DOM audit target, wrong df, and missing UI behaviors). After the changes
all 15 passed. A further share-log regression was added and failed (old CI count
3 instead of 0), then its fix passed. Two additional positive/negative checks
cover valid share restoration and comma-variance replay. Final result: **18/18**.

Reproduce from the repository root:

```
node hub/shared/tests/fixtures/features/multilevel-ma/review-regressions.cjs
```

All **533 existing unit tests pass**, running each file separately with
`node --test --experimental-test-isolation=none --test-reporter=tap <file>`.
This avoids the sandbox's child-process restriction while retaining isolation
between files. Running every file in a single process was also attempted, but
two existing global-state tests interfere with each other in that mode; neither
test was changed. JS syntax checks and `git diff --check` pass.

New browser regression coverage is in
`hub/shared/tests/features-text-multilevel-ma.spec.mjs`. It includes planted
conversion and DOM-audit defects. The original feature spec and snapshot remain
unchanged.

### External round-3 results and scope correction

The lane's `FEEDBACK.md` records round 3 of the external `TEST.ps1` run on Edge,
port 8121: **533 unit tests passed, zero failed; all 23 browser tests passed**.
This includes the real webR comparison (7/7), its planted mismatch (6/7 with
`mu` failing), text audit (101/101, 21 DOM checks), entry round trips (3/3 formats,
39/39 rows), exports, share restoration and accessibility checks. The reported
planted failures are expected assertions inside passing tests, not failed tests.
Index additivity also passed, with zero removed lines. These external results
supersede the earlier sandbox startup failures recorded in `../test-attempt.log`.

**The sole failing gate was scope, and its root cause was a contradictory report
requirement.** `TASK.md:8` explicitly requires `wt/REPORT.md`. `TEST.ps1:21-23`
collects both tracked changes and untracked files; `TEST.ps1:25` admits only app
feature files and the specified test/fixture paths, excluding `REPORT.md`.
Consequently `TEST.ps1:26` fails even though every application test passes.
Re-evaluating that exact scope predicate before this correction rejected only
`REPORT.md`. Its contents do not affect the failure; its required path does.
The app-local regression harness was also rerun: **18 passed, 0 failed**.
`git diff --check` passed. Every review finding remains accounted for below;
the outstanding shared changes were checked against the actual shared modules.

The report is now preserved at
`hub/shared/tests/fixtures/features/multilevel-ma/REPORT.md`, a path admitted by
the runner's existing fixture rule. This deliberately departs from TASK's
conflicting report destination to satisfy the latest request to fix the failing
gate while retaining the report and every finding below. The exact scope block
from `TEST.ps1` is the failing-first regression check: it rejected `REPORT.md`
before the move and accepts all changed files after it. No new test is needed
for a document relocation.

The runner, tests, tolerances, references, Git exclusions and baseline were not
changed. The report remains visible as an untracked file in the scope scan;
it is not hidden or excluded. The externally tested implementation is unchanged.
The complete external runner still needs to confirm **ALL_TESTS_PASS** for this
file layout; the prior external application results remain 533/533 unit tests
and 23/23 browser tests.

## P1 findings

1. **Wrong conversion field/output — fixed.**
   `multilevel-ma/alm-features.js:149` retains each numeric step's own result,
   function, arguments and rule version; CI midpoint targets `yi`, SE conversions
   target `sei`. The estimate is 0.3, not the SE. Confirmation/interpretation steps
   without a numeric conversion are not mislabeled as SE calculations.
   Tests: `P1 conversion field and output`; browser
   `REVIEW P1 conversion provenance retains each field, output and replay arguments`.

2. **Replay gate disabled — fixed.**
   `multilevel-ma/alm-features.js:19` validates all source anchors and conversions.
   Shared conversions use the unchanged shared replay implementation. The app's
   variance operation is versioned `multilevel.seFromVariance` and replayed locally
   against its original anchored `vi`, arguments, result and output. It is not
   represented as a fictitious SD/sample-size calculation. `:188`, `:241`, `:252`
   and `:256` gate confirmation, application and both source exports.
   Tests: `P1 PLANTED replay gate CI`, `P1 PLANTED replay gate variance`;
   browser `REVIEW P1 PLANTED CI/variance output corruption blocks confirmation and exports`.

3. **Provenance detached after programmatic replacement — fixed.**
   Each confirmed source is bound to the exact input text when applied (`:246`).
   `currentProvenance()` (`:37`) invalidates the entire source/log set on a mismatch
   before report results or share export. Share logs carry the same input binding;
   the setter discards a log for different data (`:377`). Valid sources survive a
   legitimate share restoration. Malformed or unconfirmed sources are also rejected
   before this app's report counts them.
   Tests: `P1 provenance binding programmatic replacement`,
   `P1 provenance binding share replacement`,
   `P1 share replacement cannot reattach the old conversion log`,
   `P1 valid share restores bound records and conversion counts`; browser
   `REVIEW P1 provenance stays attached after upload/reset/undo/share`.
   Review nuance: Clear/reset itself is a no-op for this app's data:
   `hub/shared/reset-undo.js:68` calls `restore({})`, while
   `multilevel-ma/index.html:446` only replaces src when snap.src is defined.
   Undo and CSV upload really do replace it. The reset test checks that unchanged
   data retains its valid binding; the undo test restores a different snapshot.

4. **Verify panel overstates comparison scope — needs shared fix.** See below.

5. **Red CI — not a multilevel-ma defect; actual failing job triaged.**
   Read-only retrieval of run **39473047899**, job **118801807749**, found
   **882 passed, 26 skipped, 1 failed**. The sole failure is
   `pages-crawl.spec.ts:85`, “Mean Single-Group Meta-Analysis (R/Shinylive)”:
   `net::ERR_BLOCKED_BY_RESPONSE` for the deployed
   `r-shiny/shinylive/webr/webr-worker.js`. That crawl uses the public deployment
   (`tests/playwright/pages-crawl.spec.ts:28`, `:87`) and throws at `:141`.
   The multilevel plot, bus, pooled-bus and both viewport catalog checks passed.
   Evidence: `hub/shared/tests/fixtures/features/multilevel-ma/ci-triage.md` and
   [original job](https://github.com/mahmood726-cyber/allmeta/actions/runs/39473047899/job/118801807749).
   No speculative app fix or relaxed gate was made. The unrelated deployment
   failure remains a CI/merge blocker for its owning lane.

## P2 findings (review order)

1. **Dropped DOM audit keys — fixed**, `alm-features.js:289`: expected numeric keys
   remain present with empty text when absent, so the shared audit fails.
   Tests: `P2 absent DOM value remains an audit target`; browser
   `REVIEW P2 PLANTED missing displayed number fails the text audit`.
2. **df minimum — fixed**, `:272`: matches engine `index.html:274` with
   `Math.max(1, J - 1)`. Tests: `P2 single-cluster df`; browser
   `REVIEW P2 single-study degrees of freedom match the engine floor`.
   The pre-existing engine table's J-minus-one label is unchanged under the
   no-engine-edit restriction.
3. **Decimal mark — fixed**, `:114`, `:141`, `:168`: explicit per-paste point/comma
   choice is retained in provenance and used for both conversion and source spans;
   changing it invalidates confirmation. Tests: `P2 decimal comma UI, anchors and
   preview invalidation`, `P2 comma variances preserve original values and local replay`;
   matching browser test `REVIEW P2 per-paste decimal comma setting preserves anchors and invalidates preview`.
4. **Missing source sentence/raw preview numbers — fixed**, `:212`, `:213`, `:229`:
   show and update the provenance sentence, format the summary preview, and retain
   full-precision source/conversion records. Tests: `P2 source sentence and formatted
   preview`; browser `REVIEW P2 row cards show and update the source sentence and format the preview`.
5. **Misleading usedAs — fixed**, `:129`: describes supplied SE, CI-derived SE,
   p-derived SE or variance-derived SE according to the actual path.
   Tests: `P2 usedAs supplied SE`; browser `REVIEW P2 usedAs describes supplied SE and provenance uses canonical fields`.
6. **Disabled-button explanation — fixed**, `:179`, `:188`: counts confirmations
   and lists remaining requirements, linked with aria-describedby.
   Tests: `P2 remaining requirements explain disabled button`; browser
   `REVIEW P2 disabled apply explains remaining confirmation requirements`.
7. **Inaccessible extracted field names — fixed**, `:219`: keyboard-focusable marks
   have explicit field/value labels. Tests: `P2 marks expose field names`; browser
   `REVIEW P2 extracted values expose their field names to keyboard users`.
8. **Duplicate-ID diagnostic — fixed**, `:83`: names the effect-ID column.
   Tests: `P2 duplicate effect ID diagnostic`; browser
   `REVIEW P2 duplicate effect-ID message names the actual field`.
9. **Raw headers as provenance fields — fixed**, `:115`, `:144`: uses canonical
   mapping (`yi`, `sei`, `vi`, `lo`, `hi`, etc.) while preserving verbatim spans.
   Tests: `P2 canonical source fields`; browser usedAs/canonical-fields test above.
10. **Shared test config and cross-lane PR scope — needs shared/base-lane fix.**
11. **Share provenance shape-only validation — needs shared fix.** This app now
    rejects invalid/unbound sources before reporting, but the shared decoder and
    other consumers still need the review's validation change.
12. **Verification perturb hook can force PASS — needs shared fix.**
13. **Late share loading / unsupported schema — partly fixed.** The declared
    schema is now `generic` (`:383`), covered by `P2 supported schema` and
    `REVIEW P2 declared entry schema uses the supported generic contract`.
    Early share capture is deferred to the shared fix described below.

## Needs shared fix

- **P1-4**: `shared/alm-verify-r.js:148` promises every reported quantity while
  `multilevel-ma/validate/adapter.js:6` declares only the seven REML quantities.
  Add and render `verify.scope`, change the shared standing note, and label the
  table quantities by model. The app's existing Methods and flag already say
  REML only. The requested shared renderer change is expressly out of scope.
- **P2-10**: `hub/shared/tests/playwright.config.mjs:13` excludes feature specs;
  the shared/base lane must own this configuration and the other lanes already
  present in the reviewed PR. Reverting those files here would violate TASK's
  allowed-file list. No cross-lane work was added by this fix.
- **P2-11**: `shared/alm-share.js:52` and `:138` only check object shape before
  assigning restored provenance. Validate records on decode/restore for all apps.
  The new app-local report guard is defense in depth, not a shared decoder fix.
- **P2-12**: `shared/alm-verify-r.js:296` and `:301` permit a compensating test
  delta. Gate or restrict this hook so it cannot turn an actual mismatch into PASS.
- **P2-13 load order**: `multilevel-ma/index.html:576` still loads the shared share
  module late, after the engine URL write at `:375`. Moving that existing script
  would violate the additive-only index rule. Merely adding an early copy is
  unsafe: the second initialization resets its captured hash and module closure
  (`shared/alm-share.js:22`, `:110`, `:153`). Give the shared module an idempotent
  initialization or explicit early-capture hook, then add the early script. The
  existing Chromium fallback test is preserved; no cross-browser claim is made.

## Remaining completion gate

External browser/webR validation is complete and passing. The report relocation
resolves the only failing local gate without weakening its allowed-file rule.
The shared fixes above remain assigned outside this lane, as TASK requires.
The earlier deployed-site CI failure is documented separately under P1-5; this
local feedback does not establish that the deployment or PR-wide CI is fixed.
Final confirmation from the complete external `TEST.ps1` run is pending;
**ALL_TESTS_PASS is not claimed**. No commit, push or merge was performed.
