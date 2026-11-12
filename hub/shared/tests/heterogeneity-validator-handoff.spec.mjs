// heterogeneity/ -> webr-validator/ hand-off (user-path regression, 2026-11-12).
// Every control that opens the validator must give it the studies and the tau^2
// estimator the page currently shows, also when an earlier session left other studies
// on the shared bus. See _het_validator_handoff.mjs for the live failure this pins.
import { test, expect } from '@playwright/test';
import { checkHandoff } from './_het_validator_handoff.mjs';

for (const tau2 of ['reml', 'pm', 'sj']) {
  test(`validator receives the page's studies and ${tau2} model from every control`, async ({ context, baseURL }) => {
    const rows = await checkHandoff(context, baseURL + '/', { tau2, stale: true });
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.dialogs, r.control).toEqual([]);
      expect(r.opened, r.control).toBe(true);
      expect(r.sameStudies, r.control + ' studies').toBe(true);
      expect(r.sameModel, r.control + ` model ${r.method}/${r.test} vs ${r.appEstimator}/z`).toBe(true);
      expect(r.sameTau2, r.control + ` tau2 ${r.tau2} vs ${r.appTau2}`).toBe(true);
    }
  });
}
