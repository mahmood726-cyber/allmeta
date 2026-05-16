/**
 * rct-extractor-behavior.spec.mjs — extraction → ma-studies-v1
 * serialization contract (feeds MA Workbench / Forest Plot / bayesian-ma).
 *
 * Deterministic: ratio measures (HR/OR/RR/IRR) → te=ln(point),
 * se = given SE else (ln(ci.hi)-ln(ci.lo))/(2·z.975), pool_scale="log";
 * linear (MD/SMD/RD) → te=point, se=given SE else (hi-lo)/(2·z.975),
 * pool_scale="identity"; unknown scale or non-positive ratio → dropped;
 * payload is the {_schema:"ma-studies-v1", studies:[{label,est,se}]}
 * envelope; mixed scale families / mixed ratio scales (Cochrane §10.4)
 * are flagged. Constructed oracle.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/rct-extractor/';
const Z = 1.959963984540054;
const TOL = 1e-6;
const ln = Math.log;

test.describe('rct-extractor', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(URL);
    await page.waitForFunction(() => typeof window.__almRctBus === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('ma-studies-v1 serialization + Cochrane §10.4 mixed-scale guard',
    async ({ page }) => {
      await page.goto(URL);
      await page.waitForFunction(() => typeof window.__almRctBus === 'function',
        { timeout: 10_000 });
      const bus = (ex) => page.evaluate((x) => window.__almRctBus(x), ex);
      const near = (g, e, n) =>
        expect(Math.abs(g - e), `${n}: js=${g} exp=${e}`).toBeLessThan(TOL);

      // Ratio, SE provided → te=ln(point), se=given, log scale.
      let r = (await bus([{ effect_type: 'HR', point_estimate: 0.82,
        ci: { lower: 0.71, upper: 0.95 }, standard_error: 0.074,
        p_value: 0.008, confidence: 0.91 }])).rows[0];
      near(r.te, ln(0.82), 'HR te');
      near(r.se, 0.074, 'HR se (given)');
      expect(r.scale).toBe('HR');
      expect(r.scale_family).toBe('ratio');
      expect(r.pool_scale).toBe('log');
      expect(r.p).toBe(0.008);

      // Ratio, SE absent → se derived from the CI on the log scale.
      r = (await bus([{ effect_type: 'OR', point_estimate: 0.74,
        ci: { lower: 0.58, upper: 0.94 } }])).rows[0];
      near(r.te, ln(0.74), 'OR te');
      near(r.se, (ln(0.94) - ln(0.58)) / (2 * Z), 'OR se (from CI, log)');

      // Linear, SE absent → identity scale, se from raw CI width.
      r = (await bus([{ effect_type: 'MD', point_estimate: 2.5,
        ci: { lower: 1.0, upper: 4.0 } }])).rows[0];
      near(r.te, 2.5, 'MD te');
      near(r.se, 3.0 / (2 * Z), 'MD se (from CI, identity)');
      expect(r.scale_family).toBe('linear');
      expect(r.pool_scale).toBe('identity');

      // Unknown effect type → dropped (null row).
      expect((await bus([{ effect_type: 'FOO', point_estimate: 1 }])).rows[0])
        .toBeNull();
      // Non-positive ratio estimate → dropped (log undefined).
      expect((await bus([{ effect_type: 'HR', point_estimate: 0,
        ci: { lower: 0, upper: 0 } }])).rows[0]).toBeNull();

      // Payload envelope: schema + only finite rows become studies.
      const out = await bus([
        { effect_type: 'HR', point_estimate: 0.8, ci: { lower: 0.7, upper: 0.92 } },
        { effect_type: 'FOO', point_estimate: 1 },                // dropped
        { effect_type: 'RR', point_estimate: 0.9, ci: { lower: 0.8, upper: 1.01 } },
      ]);
      expect(out.payload._schema).toBe('ma-studies-v1');
      expect(out.payload.studies.length, 'only 2 finite rows').toBe(2);
      near(out.payload.studies[0].est, ln(0.8), 'payload est = te');

      // Cochrane §10.4 guard.
      expect((await bus([
        { effect_type: 'HR', point_estimate: 0.8, ci: { lower: 0.7, upper: 0.9 } },
        { effect_type: 'HR', point_estimate: 0.85, ci: { lower: 0.75, upper: 0.96 } },
      ])).mixedOk, 'all HR → ok').toBe(true);
      expect((await bus([
        { effect_type: 'HR', point_estimate: 0.8, ci: { lower: 0.7, upper: 0.9 } },
        { effect_type: 'OR', point_estimate: 0.7, ci: { lower: 0.6, upper: 0.82 } },
      ])).mixedOk, 'mixed ratio scales (HR+OR) → blocked').toBe(false);
      expect((await bus([
        { effect_type: 'HR', point_estimate: 0.8, ci: { lower: 0.7, upper: 0.9 } },
        { effect_type: 'MD', point_estimate: 2, ci: { lower: 1, upper: 3 } },
      ])).mixedOk, 'mixed families (ratio+linear) → blocked').toBe(false);
    });
});
