# Wave 0 implementation report

Base: `7966530de875d22253f0557c7b447ed9d917685d` (clean main on entry).
Branch: `feat/addons-wave0`. No commit or push requested or performed.

Implemented deterministic offline replay capture and exact comparison, a frozen
path guard with explicit lane allowlists and CI integration, the descriptor API,
an opt-in lazy add-on host, and validation running-state/input isolation. App
engines, adapter files and analysis lifecycle are unchanged. No app is opted in.

The validation edit adds an aggregate active-run counter (safe across concurrent
mounts) and excludes marked add-ons from both fingerprint polling and edit/action
events. Excluding only the fingerprint would leave forced edit events able to
stale live results. The host creates its aside immediately after body-level main,
defers rendering, and refuses work during validation or if validation support is
missing. Later asynchronous panels must guard their own stateful continuations.

Three existing browser specs have origin literals replaced with the configured
base URL, solely to use the required 127.0.0.1:8000 server. Frozen adapters and
PAGE_TEXT remain untouched. The new host is a skeleton, not the later-wave panels.

## Verification state

Final full Node suite: 5 passed, 0 failed. A previous temporary-Git subprocess timeout was resolved on rerun.

Frozen-path guard against `7966530de875d22253f0557c7b447ed9d917685d` with `--lane W0`: PASS. Node/Python syntax, required-file existence, UTF-8/no-BOM and `git diff --check`: PASS. No frozen adapter or numerical engine changed.

Browser replay, real baseline JSON, full app specs and E2E add-on checks: pending
host execution under TASK.md's explicit no-browser constraint. See BROWSER_TODO.md
for exact commands and expected counts. Numerical invariance is not yet proved.
No release or submission status changed; portfolio index/workbook are untouched.

## Static versus dynamic disclosure

| Item | Source and status |
| --- | --- |
| Expected replay counts | Static PLAN.md contracts checked against existing specs; limit-ma expects one failure. |
| Exception identities | Pubbias manifest and limit-ma spec; validated during capture, never relabeled PASS. |
| Baseline values and maxima | Dynamic real browser output; deliberately absent until the host runs capture. |
| Node DOM/R fixtures | Explicit software doubles for lifecycle tests, not numerical or research evidence. |
| Frozen paths / lane allowlists | Static reviewed policy encoded in the guard; no exceptions to frozen files. |
| Source revision | Read from Git; observed base differs from the plan heading's historical version. |

No identifiers, dates or research estimates were introduced into application
output. The one named limit failure was read directly from its adapter and spec.
