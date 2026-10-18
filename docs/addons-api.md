# Add-on descriptor contract (wave 0)

Load `shared/alm-validate.js`, then `hub/shared/addons-host.js`, then an opt-in
`<app>/addons.js` after the page has a body-level `main`. Wave 0 does not wire any
app or implement analysis modules. Call `alm.addons.register(descriptor)` once per
app; malformed descriptors and duplicate registration throw.

| Field | Contract |
| --- | --- |
| `app` | Stable lowercase slug, matching the app directory. |
| `lifecycle` | The page's wrapped analysis function. Registering does not call it. Future lifecycle completion hooks belong to A1. |
| `describe()` | Read current model/measure/options on demand. No state changes or invented defaults. |
| `displayed()` | Read numbers already displayed, including labels and provenance. Do not refit or invent results. |
| `sensitivity` | `null` when unsupported; otherwise manifest-backed configuration for the future sensitivity panel. |
| `rExport.live` | Existing adapter `live` contract (`currentState`, `buildScript`, `appValues`, `compare`, `packages`), or `null` for an app without live R support. |
| `rExport.readable?` | Future optional readable R renderer. |
| `rExport.transform?` | Future explicit state transform, validated against the live script. |

The host returns `panel(id, title, render)`, `run(callback)`, and `suspended()`.
`panel` creates a closed native `details` control; its synchronous `render(content,
descriptor)` runs only on first opening. The returned `{element, open}` can be
opened programmatically; `open()` returns false during validation. A failed render
does not mark the panel ready. Callbacks must use textContent for external text,
stable app-prefixed input IDs, and keep all UI inside the supplied content node.

The single `aside#alm-addons[data-alm-addon]` is a direct body child immediately
after `main`. Never put panels inside main or repin adapter PAGE_TEXT. Existing
host-ID collisions are refused. This placement preserves the GOSH and cumulative
subgroup template landmarks.

`AlmValidate.isRunning()` covers both corpus and live runs, including asynchronous
work, across all mounted widgets. It resets on success and refusal. Add-on control
events are blocked during validation; `run(callback)` and panel opening also check
the state synchronously. Missing validation support suspends work (fail closed).
No timers or descriptor reads are installed by the host. Future asynchronous
panels must re-check suspension before every stateful step; this skeleton does not
cancel already-started external jobs or auto-refresh panels.

Validation ignores marked add-on inputs in its fingerprint and edit/action event
handlers. Analysis controls still invalidate a live result. Add-ons may not mutate
analysis controls during replay; exclusion is not permission to change page data.

## Frozen paths and lane ownership

`python scripts/check_frozen_paths.py --base <commit> --lane W0` checks committed,
staged, unstaged, and untracked changes. Renames inspect both source and destination.
Frozen engines and every top-level `*/validate/**` have no exceptions. Unknown
lanes or missing bases fail closed. W0, A1-A6 and the seven B app lanes have explicit
allowlists in the script; C/D require a separately reviewed scope addition. Omitting
`--lane` applies the frozen invariant only. CI enforces W0 scope on its named PR
branch and the frozen invariant on other branches. Later lane owners must invoke
their explicit lane option; file ownership changes require review.

## Baseline format

`scripts/replay_baseline.mjs` launches headless Playwright and serves the requested
checkout on `127.0.0.1:8000`. It calls the existing widget's `prepare()` followed by
`runCorpus()` with the context offline, using the same adapters and corpus as the
validation specs. It records all 13 apps and refuses count drift, unexpected named
exceptions, and heterogeneity display-audit failures. It does not run live R.

`audit/replay-baseline.json` contains schema version, source commit and each app's
checks, passed, maxima, failure identities and failed-ID SHA-256. The digest is
SHA-256 of UTF-8 `JSON.stringify(sortedIds)`, sorted with JavaScript's default
code-unit order; duplicates are preserved. Failure quantities/methods are stored
separately to detect movement between checks sharing an ID. Nonfinite maxima are
strings (`Infinity`, `-Infinity`, `NaN`), never silently converted to null. Object
keys are sorted; time, elapsed time and machine paths are excluded. `--compare`
requires exact app summaries, including maxima, before writing a candidate output.

| Item | Static vs dynamic |
| --- | --- |
| App list, expected counts | Static contracts from PLAN.md and existing specs; not measured outputs. |
| Known failures | Source manifest/spec identities; still recorded as FAIL. |
| Checks, passed, failed-ID hashes, maxima | Dynamic browser replay; no baseline fabricated in wave 0. |
| Node fixture results | Explicit software test doubles only; not research evidence. |
