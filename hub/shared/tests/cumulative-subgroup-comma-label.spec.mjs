/**
 * cumulative-subgroup: an UNQUOTED comma inside a study label (lane cumsub, after lane rcpt / PR #551).
 *
 * Root cause: parseStudies splits each row on every unquoted comma and reads the fields by position
 * (label, est, se, [year], [group]). An unquoted "Smith, 2020, 0.22, 0.11" therefore became
 * label "Smith", est 2020, se 0.22, year 0.11 (a 4th numeric field of >= 4 characters is taken as the
 * year) and was pooled with no note. "Smith, J, 0.22, 0.11" on one of the first lines was dropped as if
 * it were a header row, also with no note.
 *
 * Rule (same as PR #542/#549): a row the page cannot read as written is refused with its line number,
 * "Input refused, nothing was computed. Line N: ...", and nothing is pooled. Quoted labels still work.
 */
import { test, expect } from '@playwright/test';

const APP = '/cumulative-subgroup/index.html';

async function ready(page) {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almReceiptStudies === 'function'
    && document.querySelector('#svg-host svg'), undefined, { timeout: 10_000 });
}
async function run(page, text) {
  await page.fill('#f-data', text);
  await page.dispatchEvent('#f-data', 'input');
  return page.evaluate(() => ({
    studies: window.__almReceiptStudies().map(s => [s.label, s.est, s.se, s.year, s.group]),
    k: document.querySelector('#stats-wrap .stat .v').textContent,
    banner: document.getElementById('warn-banner').textContent.trim(),
    results: window._almLastCumSub(),
  }));
}
const REST = '\nJones B, -0.31, 0.14\nTrial C, 0.04, 0.19';

test.describe('cumulative-subgroup unquoted comma label', () => {
  test('a comma-split label shifting est/se/year is refused with its line number', async ({ page }) => {
    await ready(page);
    const r = await run(page, 'Smith, 2020, 0.22, 0.11' + REST);
    expect(r.banner).toContain('Input refused, nothing was computed.');
    expect(r.banner).toContain('Line 1:');
    expect(r.banner).toContain('"Smith, 2020"');
    expect(r.studies).toEqual([]);
    expect(r.k).toBe('0');
    expect(r.results).toBeNull();
  });

  test('the same shift with a year and a group column is refused, line number counts comments and blank lines', async ({ page }) => {
    await ready(page);
    const r = await run(page, '# label, est, se, year, group\nA, -0.2, 0.1, 2015, G1\n\nSmith, 2020, 0.22, 0.11, 2019, G2\nB, -0.1, 0.12, 2016, G2\nC, -0.3, 0.2, 2017, G1');
    expect(r.banner).toContain('Input refused, nothing was computed.');
    expect(r.banner).toContain('Line 4:');
    expect(r.studies).toEqual([]);
  });

  test('a comma-split label with a text second part is not dropped silently as a header', async ({ page }) => {
    await ready(page);
    const r = await run(page, 'Smith, J, 0.22, 0.11' + REST);
    expect(r.banner).toContain('Line 1:');
    expect(r.studies.map(s => s[0])).not.toContain('Smith');
    expect(r.studies).toEqual([]);
  });

  test('a quoted comma label is still read correctly', async ({ page }) => {
    await ready(page);
    const r = await run(page, '"Smith, 2020", 0.22, 0.11' + REST);
    expect(r.banner).toBe('');
    expect(r.studies[0]).toEqual(['Smith, 2020', 0.22, 0.11, null, null]);
    expect(r.k).toBe('3');
  });

  test('ordinary inputs are unchanged: the example, a real header row, a trailing comma, numeric group codes', async ({ page }) => {
    await ready(page);
    await page.click('#btn-example');
    const ex = await page.evaluate(() => ({ n: window.__almReceiptStudies().length, banner: document.getElementById('warn-banner').textContent.trim() }));
    expect(ex).toEqual({ n: 9, banner: '' });
    const h = await run(page, 'label, logOR, SE, year, group\nA,0.1,0.1,2001,G1,\nB,0.2,0.2,2002,G2,\nC,0.3,0.15,2003,1\nD,0.4,0.3,2004,2');
    expect(h.banner).toBe('');
    expect(h.studies).toEqual([['A', 0.1, 0.1, 2001, 'G1'], ['B', 0.2, 0.2, 2002, 'G2'], ['C', 0.3, 0.15, 2003, '1'], ['D', 0.4, 0.3, 2004, '2']]);
    const g = await run(page, 'A, 0.1, 0.1, 1\nB, 0.2, 0.2, 2\nC, 0.3, 0.15, 2015');
    expect(g.banner).toBe('');
    expect(g.studies).toEqual([['A', 0.1, 0.1, null, '1'], ['B', 0.2, 0.2, null, '2'], ['C', 0.3, 0.15, 2015, null]]);
  });

  // Review of PR #590: year and group are optional, so a row that omits them does not make the
  // rows that have them "split labels".
  test('optional year/group columns may be absent on some rows', async ({ page }) => {
    await ready(page);
    const g = await run(page, 'A, 0.1, 0.1, 1\nB, 0.2, 0.2, 2\nC, 0.3, 0.15');
    expect(g.banner).toBe('');
    expect(g.studies).toEqual([['A', 0.1, 0.1, null, '1'], ['B', 0.2, 0.2, null, '2'], ['C', 0.3, 0.15, null, null]]);
    const y = await run(page, 'A, 0.1, 0.1, 1992.5, G1\nB, 0.2, 0.2, 2010.1,\nC, 0.3, 0.15, 2012, G2');
    expect(y.banner).toBe('');
    expect(y.studies).toEqual([['A', 0.1, 0.1, 1992.5, 'G1'], ['B', 0.2, 0.2, 2010.1, null], ['C', 0.3, 0.15, 2012, 'G2']]);
    const h = await run(page, 'label, est, se, group\nA, 0.1, 0.1, 1\nC, 0.3, 0.15');
    expect(h.banner).toBe('');
    expect(h.studies).toEqual([['A', 0.1, 0.1, null, '1'], ['C', 0.3, 0.15, null, null]]);
  });
});
