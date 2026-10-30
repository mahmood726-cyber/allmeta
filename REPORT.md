# A1 lifecycle implementation report

Branch: `feat/addons-lifecycle`, created from `feat/addons-wave0` at
`c59c6c284a35be5b8155a6c0f648e576bb37f362`. No commit or push performed.

## Files
- `hub/shared/analysis-lifecycle.js`: additive completion subscription and opt-in live helper.
- `hub/shared/tests/analysis-lifecycle.test.mjs`: existing lifecycle tests plus completion and argument validation.
- `hub/shared/tests/r1fix-lifecycle.spec.mjs`: attribute-driven typing expectations and isolated live-mode browser tests.

Scratch configuration, runner, logs and mutation checks remain in the lane folder outside the repository.

## API
`wrapped.onComplete(callback)` receives the original result after a successful synchronous run and after the completion notice is updated. It returns an idempotent unsubscribe function. Refusals and thrown runs do not notify; observer errors are reported to the console and do not alter the original return value. Existing receiver, arguments, return value, exception and refresh behaviour are preserved.

`alm.analysisLifecycle.live(wrapped, {inputs, debounceMs:400, ready, toggleId, defaultOn:false})` requires a lifecycle wrapper, CSS selector and unused stable toggle ID. `ready` defaults to a function returning true. It creates the labelled checkbox after `#btn-run`, updates that button's `data-alm-live="on|off"`, and returns `{toggle, dispose()}`. Only trusted matching input/change events schedule runs. Readiness and an available `AlmValidate.isRunning()` are checked both before scheduling and before execution. Pending work is cancelled by another edit, a toggle change, a manual run or disposal. Disposal removes the helper's listeners/control and restores the prior attribute. Turning the toggle on does not itself run analysis. Callers remain responsible for supplying app-specific readiness. This preserves the existing synchronous lifecycle contract; it does not await promises.

No app is wired in A1. The default is off, suitable for the future GOSH caller. Existing app tests use the attribute when present and a documented legacy app list when absent; no page attributes are fabricated.

## Verification
- Unit command: `node --test allmeta/hub/shared/tests/analysis-lifecycle.test.mjs` ? 6 passed, 0 failed.
- Browser command: `python run-browser.py` ? 17 passed, 0 failed; Chromium on 127.0.0.1:8131; normal exit 0, owned server terminated.
- Mutation command: `node mutation-check.mjs` ? 8 baseline checks passed and all 8 deliberate mutations detected (trust, readiness, validation, debounce, completion, manual cancellation, toggle off, disposal).
- `python allmeta/scripts/check_frozen_paths.py --base c59c6c284a35be5b8155a6c0f648e576bb37f362 --lane A1` ? PASS.
- `git -C allmeta diff --check` ? PASS.

Initial browser setup used a missing health URL; corrected to an existing page. A new fixture initially omitted the readiness callback; corrected after its negative case failed. Playwright-managed server teardown hung on Windows; the scratch Python runner explicitly owns and terminates only its own server on 127.0.0.1:8131. Port 8088 was not used.

## Disclosure and limits
| Item | Static vs dynamic |
| --- | --- |
| 400 ms debounce | Static UI contract from PLAN.md |
| Fixture strings and expected run counts | Static software test expectations, not research data |
| Browser/unit pass counts and fault detection | Dynamic executions |
| Numerical engines and source identifiers | Unchanged; no new scientific claims |

R validation is not applicable: no estimator, statistical output or research number was introduced. Full corpus replays, live R, future app wiring, cross-browser behaviour and Overmind certification were not run. This is an uncommitted implementation handoff, not a release or submission-state change; the project index and rewrite workbook are unchanged.
