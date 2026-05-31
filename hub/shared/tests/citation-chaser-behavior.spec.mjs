/**
 * citation-chaser-behavior.spec.mjs — deterministic seed parsing +
 * OpenAlex work normalization. (The forward/backward chasing itself is
 * a network call to OpenAlex — not tested here.) Constructed oracle:
 * a silent bug in parseSeedInput drops/mangles the seeds the whole
 * chase is built from; normalize() feeds the results table + CSV.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/citation-chaser/';

test.describe('citation-chaser', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => window.__almChase && typeof window.__almChase.parseSeedInput === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('parseSeedInput + normalize + shortId', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almChase, { timeout: 10_000 });
    const P = (t) => page.evaluate((x) => window.__almChase.parseSeedInput(x), t);
    const N = (w) => page.evaluate((x) => window.__almChase.normalize(x), w);
    const S = (u) => page.evaluate((x) => window.__almChase.shortId(x), u);

    // Each seed form, plus garbage/blank lines dropped, multi-line.
    expect(await P([
      'https://openalex.org/W2741809807',
      'w314159',                       // bare, lower-case → upper-cased
      '10.1001/jama.2021.1234',        // bare DOI
      'https://doi.org/10.5555/AbCd',  // DOI APP_URL → prefix stripped (case kept)
      '   ',                           // blank → filtered
      'not a citation at all',         // unrecognised → dropped
    ].join('\n'))).toEqual([
      { type: 'openalex', id: 'W2741809807' },
      { type: 'openalex', id: 'W314159' },
      { type: 'doi', id: '10.1001/jama.2021.1234' },
      { type: 'doi', id: '10.5555/AbCd' },
    ]);

    // Empty / all-garbage input → empty list (no throw).
    expect(await P('')).toEqual([]);
    expect(await P('foo\nbar')).toEqual([]);

    // shortId = last path segment.
    expect(await S('https://openalex.org/W42')).toBe('W42');

    // normalize: full work.
    expect(await N({
      id: 'https://openalex.org/W99',
      title: 'Statins and CV outcomes',
      publication_year: 2020,
      doi: 'https://doi.org/10.1/abc',
      cited_by_count: 137,
      authorships: [
        { author: { display_name: 'Smith J' } },
        { author: { display_name: 'Doe A' } },
        { author: { display_name: 'Roe B' } },
        { author: { display_name: 'Fourth X' } },   // dropped (>3)
      ],
    })).toEqual({
      id: 'W99', title: 'Statins and CV outcomes', year: 2020,
      doi: '10.1/abc', cited_by_count: 137,
      authors: 'Smith J; Doe A; Roe B',
    });

    // normalize: missing fields → documented fallbacks.
    expect(await N({ id: 'https://openalex.org/W1' })).toEqual({
      id: 'W1', title: '(no title)', year: undefined, doi: '',
      cited_by_count: 0, authors: '',
    });
  });
});
