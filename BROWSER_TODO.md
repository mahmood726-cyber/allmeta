# Host browser verification — required before accepting wave 0

No browser was run in the agent environment, as TASK.md requires. No measured
baseline JSON is supplied. Do not mark numerical invariance proved until every
step below passes. Commands are PowerShell, starting in this `allmeta` repository.
Use the same installed Google Chrome for both captures (Screen's existing spec
explicitly selects Chrome). Node and Python must be on PATH. Port 8000 must be free.

## 1. Capture clean main, twice

The observed main base is `7966530de875d22253f0557c7b447ed9d917685d`, not the older
`0154531` mentioned in the design heading. Capture the observed base, never the
modified tree as the baseline. The script lives in this lane and serves `--root`.

```powershell
node --test scripts/tests/wave0.test.mjs
npm ci --prefix hub/shared/tests
git worktree add --detach ../wave0-main 7966530de875d22253f0557c7b447ed9d917685d
git -C ../wave0-main status --short
node scripts/replay_baseline.mjs --root ../wave0-main --channel chrome --out audit/replay-baseline.json
node scripts/replay_baseline.mjs --root ../wave0-main --channel chrome --compare audit/replay-baseline.json --out ../replay-main-repeat.json
```

Require empty worktree status and successful exits. Each script starts and closes
its own server on `http://127.0.0.1:8000`. The second command must reproduce the
first summary exactly. Keep `audit/replay-baseline.json` as the real evidence;
return it to the lane if browser work happens elsewhere. Do not replace failures
or missing maxima with expected values. Screen full replay can take 30 minutes.

## 2. Compare candidate

```powershell
node scripts/replay_baseline.mjs --channel chrome --compare audit/replay-baseline.json --out ../replay-candidate.json
python scripts/check_frozen_paths.py --base 7966530de875d22253f0557c7b447ed9d917685d --lane W0
```

The comparison includes all per-app counts, sorted failed-ID digests, failure
quantities/methods, maxima and the separate heterogeneity display audit. Source
commit metadata is excluded from comparison. The baseline is not overwritten.

## 3. Run all 13 app specs, including live checks and mutation tests

These are the expected *primary replay* counts, not numbers of Playwright tests.
Other tests intentionally corrupt evidence and assert refusals/failures. Expected
counts are contracts from PLAN.md, refined by the checked-in specs where necessary.

| Spec suffix (`validate-*.spec.mjs`) | Checks | Passed |
| --- | ---: | ---: |
| screen | 29 | 29 |
| dose-response-ma | 724 | 724 |
| dta-sroc | 855 | 855 |
| nma | 410 | 410 |
| heterogeneity | 131781 | 131781 |
| pubbias-tests | 2113 | 2107 |
| multilevel-ma | 528 | 528 |
| proportion-ma | 298116 | 298116 |
| mh-peto | 68461 | 68461 |
| influence | 164802 | 164802 |
| limit-ma | 55525 | 55524 |
| gosh | 876760 | 876760 |
| cumulative-subgroup | 609398 | 609398 |

Heterogeneity additionally requires 121424 displayed-number checks and zero display
failures. Pubbias keeps its six manifest-named exceptions as FAIL. Limit keeps
`dat.hartmannboyce2018::001`, quantity `status`, as FAIL (confirmed in its spec).

```powershell
$env:PW_CHANNEL = 'chrome'
Push-Location hub/shared/tests
npx playwright test --config playwright.wave0.config.mjs validate-screen.spec.mjs validate-dose-response-ma.spec.mjs validate-dta-sroc.spec.mjs validate-nma.spec.mjs validate-heterogeneity.spec.mjs validate-pubbias-tests.spec.mjs validate-multilevel-ma.spec.mjs validate-proportion-ma.spec.mjs validate-mh-peto.spec.mjs validate-influence.spec.mjs validate-limit-ma.spec.mjs validate-gosh.spec.mjs validate-cumulative-subgroup.spec.mjs
npx playwright test --config playwright.wave0.config.mjs addons-wave0.spec.mjs validate-revision.spec.mjs validate-integration.spec.mjs
Pop-Location
```

Do not use `--grep-invert @slow`: that would omit Screen's full replay and live R
coverage. The wave-0 config serves the repo on 127.0.0.1:8000. Three legacy specs
now derive their origin from the configured base URL; no assertions were relaxed.
The new add-on spec reads the baseline and fails if it is absent. It replays every
app with an add-on present after body-level main and exercises
live-result staleness with a clearly marked software R-response fixture.

Record command exits and browser version in REPORT.md. Retain request-audit output
from the existing fixture. Any difference is a blocker; do not loosen tolerances.
No commit, push, release, portfolio-status promotion or Overmind certification is
authorized by this lane task.
