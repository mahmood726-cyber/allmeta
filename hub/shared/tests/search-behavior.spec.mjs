/**
 * search-behavior.spec.mjs — multi-source Search compute core (no network).
 *
 * Deterministic checks over window.__almSearch:
 *  - OpenAlex abstract reconstruction from its inverted index.
 *  - Cross-source dedup: DOI-exact + trigram-Jaccard title similarity,
 *    first-occurrence wins.
 *  - sr-records-v1 handoff envelope (schema + only-unique records).
 *  Live API fetches are CORS-verified out of band; here we only test the
 *  deterministic transforms.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/search/';

test.describe('search', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') && t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almSearch && typeof window.__almSearch.dedup === 'function', { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('OpenAlex inverted-index reconstruction', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almSearch, { timeout: 10_000 });
    const out = await page.evaluate(() => window.__almSearch.fromInverted({ Heart: [0], failure: [1], and: [2], dapagliflozin: [3] }));
    expect(out).toBe('Heart failure and dapagliflozin');
    const empty = await page.evaluate(() => window.__almSearch.fromInverted(null));
    expect(empty).toBe('');
  });

  test('cross-source dedup + sr-records-v1 envelope', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almSearch, { timeout: 10_000 });
    const res = await page.evaluate(() => {
      const recs = [
        { id: 'epmc_1', source: 'EuropePMC', title: 'Dapagliflozin in heart failure', doi: '10.1/x', authors: [], abstract: 'a' },
        { id: 'cr_1', source: 'Crossref', title: 'Dapagliflozin in heart failure', doi: '10.1/x', authors: [], abstract: 'b' },
        { id: 'oa_1', source: 'OpenAlex', title: 'Dapagliflozin in heart failure', doi: '', authors: [], abstract: 'c' },
        { id: 'nct_1', source: 'CT.gov', title: 'An unrelated aspirin study', doi: '', authors: [], abstract: 'd' },
      ];
      const env = window.__almSearch.srEnvelope(recs);
      return { unique: recs.filter(r => !r.dup).length, schema: env._schema, n: env.records.length };
    });
    expect(res.unique).toBe(2);
    expect(res.schema).toBe('sr-records-v1');
    expect(res.n).toBe(2);
  });
});
