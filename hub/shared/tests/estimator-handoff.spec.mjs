// Review of PR #537 (lane estho2): for every app whose WebR-validator banner names the
// on-page row R should equal, the validator must fit the row the page SHOWS when
// "Verify in R" is pressed -- after the input is edited without re-running, and (copas)
// while a debounced refit for another tau^2 estimator is pending. Same checks in real
// Chrome without @playwright/test: tools/userpath/estimator-handoff.cjs.
import { test, expect } from '@playwright/test';
import { SHOWN, checkEditedInput, checkCopasModelFollowsDisplay } from './_validator_handoff.mjs';

for (const app of Object.keys(SHOWN)) {
  test(`${app}: validator fits the displayed row after the input is edited`, async ({ context, baseURL }) => {
    test.setTimeout(90_000);
    const r = await checkEditedInput(context, baseURL + '/', app);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
}
test('copas: validator fits the tau^2 estimator of the displayed row (DL -> DL, REML -> REML)', async ({ context, baseURL }) => {
  test.setTimeout(240_000);
  const rows = await checkCopasModelFollowsDisplay(context, baseURL + '/');
  expect(rows.length).toBe(4);
  for (const r of rows) expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(rows.filter((r) => r.settled).map((r) => r.method)).toEqual(['DL', 'REML']);
});
