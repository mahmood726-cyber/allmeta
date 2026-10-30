# P09 numerical-range review replay

The application fix is already present. This follow-up makes the missing
old-code evidence reproducible without git, source reconstruction, altered
assertions, or replacement numerical references.

From the tree root:

```powershell
node hub/shared/tests/p09-proportion-replay.mjs
```

The runner uses `hub/shared/tests/fixtures/p09-proportion-before.txt`, an unchanged
copy of the original page saved by the earlier P09 fixing job. Its SHA-256 is
`05e579f07d9e1939e3ed7dd70773c4387807171bf4b70f5bf02ca290b41bbb66`, matching that
job's `REPORT.md` and `REPLAY.md`. The source capture was recovered from
`%TEMP%/rev-P09-f5-original-index.html`; its attribution was checked against
`C:/Users/User/burn/j/rev-P09-f5/REPLAY.md`. The fixture is retained here so a
later review does not depend on either machine-local path.

Two optional positional arguments select another copy of those same baseline
bytes and an output directory. The hash check rejects any other baseline. The
harness's `P09_PROPORTION_PAGE` setting selects only the page; shared dependencies,
test assertions, R fixture, adapter, corpus and tolerances remain in this tree.
The runner hashes these inputs and verifies that replay does not change them.

On this restricted Windows host, Node's child-process IPC fails with `EPERM`.
Node 24's supported test isolation option lets these Node tests run in-process:

```powershell
$env:P09_TEST_ISOLATION = 'none'
node hub/shared/tests/p09-proportion-replay.mjs
```

Both modes run the same test files and assertions. The runner requires exactly
24 old-code failures and 21 passing controls, followed by all 45 current-code
passes, without skips or cancellations. The old test process must exit 1.
Full TAP output, both immutable-corpus results, all maximum differences and their
changes are retained under `hub/shared/tests/artifacts/p09-review/`. An exit 0
from the replay runner means this before/after contract was met, not that the old
application passed its regressions.

The current-page corpus invocation also runs every `*.test.mjs` under
`hub/shared/tests/unit/` together. Its file inventory and complete pass/fail/skip
summary are recorded in `replay.json`, and its raw output is
`after-corpus.stdout.txt`. `P09_TEST_ISOLATION=none` requires Node 24 on this host;
it does not alter any test assertion or numerical tolerance.

## Native R regeneration

The existing generator requires both **metafor** and **jsonlite**. The captured
reference uses R 4.6.0, metafor 5.2.1 and jsonlite 2.0.0. Use an R installation
whose library contains those packages, or set `R_LIBS_USER` to an existing
library. This host has them in `C:/Users/User/R/R-4.6.0/library`:

```powershell
$env:R_LIBS_USER = 'C:/Users/User/R/R-4.6.0/library'
& 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe' --vanilla hub/shared/tests/rchecks/p09-proportion-range.R
```

The fresh stdout and stderr are retained as `native-r.stdout.json` and
`native-r.stderr.txt` in the evidence directory, with the invocation and result
in `native-r-result.json`. Parsed stdout exactly equals the entire original
fixture, including versions. The fixture and its tests were not regenerated or
edited. Package build-version and Windows locale warnings were captured; R
exited 0. Ordinary cases use metafor; extreme cases use the generator's explicit
corrected-count formulae and do not establish extreme-count Clopper-Pearson
accuracy.

## Scope still requiring an owner or another runner

`check-plus.mjs` contains a fixed historical whole-page identity assertion that
conflicts with intentionally editing the original numerical engine. It remains
unchanged and was not invoked because it invokes git. The owner must decide the
intended scope of that historical guard; this replay does not replace or waive it.

The supplied publication metadata contains a reproducibility repository and a
null DOI, but no manuscript or title. The derived-number notice records observed
corpus changes, without claiming manuscript-level numerical invariance.

Existing Playwright app tests must run in their normal runner. Node DOM-shim
tests do not execute module initialization, browser layout or accessibility.
This host's Playwright worker launch failed with `spawn EPERM` after collecting
32 tests; no browser test result is claimed. The exact command and raw failure
are retained with the other evidence.
