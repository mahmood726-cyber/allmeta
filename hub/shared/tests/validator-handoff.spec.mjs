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
    const rows = await checkAppHandoff(context, baseURL + '/', app, { stale: true, refuse: true });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.opened, `${r.control} opened ${r.url || ''}`).toBe(false);
  });
}
