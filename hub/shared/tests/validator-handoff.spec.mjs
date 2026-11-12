// App -> webr-validator/ hand-off (user-path regression, lane rc5, 2026-11-12).
// Every control that opens the validator must give it the studies the page currently
// shows and either the page's model (inverse-variance headline) or the validator's
// "NOT <app>'s own model" banner, for a fresh profile and for a returning user with
// other studies left on the shared bus. See _validator_handoff.mjs for the live failure.
import { test, expect } from '@playwright/test';
import { APPS, checkAppHandoff } from './_validator_handoff.mjs';

for (const app of Object.keys(APPS)) {
  for (const stale of [false, true]) {
    test(`${app}: validator receives the page's analysis (${stale ? 'stale bus' : 'fresh profile'})`, async ({ context, baseURL }) => {
      const rows = await checkAppHandoff(context, baseURL + '/', app, { stale });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.dialogs, r.control).toEqual([]);
        expect(r.opened, r.control).toBe(true);
        expect(r.sameStudies, `${r.control} studies (${r.nRows} rows)`).toBe(true);
        expect(r.sameModel, `${r.control} model ${r.method}/${r.test} vs ${r.expected}`).toBe(true);
        expect(r.ok, r.control).toBe(true);
      }
    });
  }
  test(`${app}: input the page refuses opens no validator (stale bus)`, async ({ context, baseURL }) => {
    // A refusal is proven by waiting out the full 10 s popup window for EVERY control
    // (_validator_handoff.mjs: context.waitForEvent('page', { timeout: 10000 })), so this
    // test runs ~3 s + ~10.5 s per control: ~35 s for the three-control apps (forest-plot,
    // funnel-plot, cumulative-subgroup), past the 30 s config default, which killed them
    // mid-wait in CI run 43218020407 ("Target page, context or browser has been closed").
    // Budget the time the check needs instead of shortening the window it watches.
    test.setTimeout(90_000);
    const rows = await checkAppHandoff(context, baseURL + '/', app, { stale: true, refuse: true });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.opened, `${r.control} opened ${r.url || ''}`).toBe(false);
  });
}
