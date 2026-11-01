// Decimal-separator setting (Mahmood 2026-10-31: "Comma decimals: add an explicit decimal-separator setting,
// defaulting to '.'; warn when input looks ambiguous."). One shared rule, hub/shared/decimal-sep.js. Per affected app:
//   1. '.' default: the built-in example gives IDENTICAL numbers to the same page with the helper never loaded, and no
//      decimal-comma warning;
//   2. an ambiguous comma-decimal row (e.g. "Eta, 0,1, 0.1") under '.' -> a visible, non-blocking warning naming the row,
//      and exactly the numbers the page gives without the helper (warning only, never reinterpreted);
//   3. ',' with semicolon- or tab-separated comma-decimal data -> the same numbers as the '.' version of the data; ','
//      with comma-delimited rows -> each such row refused with the delimiter reason, visibly;
//   4. apps with share links: ',' is kept in the link and in autosave; a link WITHOUT the field (every link made
//      before this setting) restores '.' and the same numbers as before, even when ',' was autosaved.
// Run: npx playwright test -c playwright.features.config.mjs features-decimal-sep
import { test, expect } from '@playwright/test';

const AMBIG = 'Possible decimal comma';
const CONFLICT = 'fields must be separated by tabs or semicolons';

// Analysis numbers only: the separator fields (present only for ',') and timestamps are not analysis numbers.
function strip(o) {
  return JSON.parse(JSON.stringify(o, (k, v) => (/^decimal_separator/.test(k) || k === '_savedAt' || k === 'generatedAt') ? undefined : v));
}
const isNum = f => /^[+-]?(\d+\.?\d*|\.\d+)$/.test(f);
const q = f => /[",]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f;
// One table of fields, written three ways: '.' with comma delimiters, ',' with semicolons, ',' with tabs.
function forms(rows, quote) {
  return {
    dot: rows.map(r => r.map(f => quote ? q(f) : f).join(', ')).join('\n'),
    semi: rows.map((r, i) => r.map(f => isNum(f) ? f.replace('.', ',') : f).join(i % 2 ? ';' : '; ')).join('\n'),
    tab: rows.map(r => r.map(f => isNum(f) ? f.replace('.', ',') : f).join('\t')).join('\n'),
  };
}
const fillRun = (sel, btn) => async (page, text) => { await page.locator(sel).fill(text); if (btn) await page.locator(btn).click(); };

const CASES = [
  {
    app: 'heterogeneity', ready: '#stats-wrap .stats', warning: '#warn-banner', refusal: '#warn-banner',
    enter: fillRun('#f-data', '#btn-run'), numbers: () => window.__almResults(),
    ...forms([['Trial A', '-0.20', '0.10'], ['Smith, 2001', '-0.35', '0.12'], ['Trial C', '0.05', '0.18'], ['Trial D', '-0.50', '0.15'], ['Trial E', '0.12', '0.11']]),
    ambiguous: 'Trial A, -0.20, 0.10\nEta, 0,1, 0.1\nTrial C, 0.05, 0.18\nTrial D, -0.50, 0.15', line: 2, token: '0,1',
    conflictRow: 'Line 1 (Trial A, -0.20, 0.10)', share: { writes: true },
  },
  {
    app: 'influence', ready: '#body tr', warning: '#decsep-note', refusal: '#input-error',
    enter: fillRun('#src', '#btn-run'), numbers: () => window.__almResults(),
    ...forms([['0.25', '0.08', 'Smith'], ['0.18', '0.10', 'Jones, J'], ['0.40', '0.15', 'Khan'], ['0.30', '0.09', 'Lee'], ['0.12', '0.07', 'Park']]),
    ambiguous: '0.25, 0.08, Smith\n0,1, 0.05, Eta\n0.40, 0.15, Khan\n0.30, 0.09, Lee', line: 2, token: '0,1',
    conflictRow: 'line 1: the decimal separator is set to ","', share: { writes: false, oldState: d => ({ data: d }) },
  },
  {
    app: 'meta-regression', ready: '#stats-wrap .stats', warning: '#warn-banner', refusal: '#warn-banner',
    enter: fillRun('#f-data', '#btn-run'), numbers: () => window.__almResults(),
    ...forms([['Trial A', '-0.28', '0.12', '32'], ['Smith, 2001', '-0.22', '0.09', '35.5'], ['Trial C', '-0.15', '0.11', '42'],
      ['Trial D', '-0.10', '0.13', '48.25'], ['Trial E', '0.04', '0.15', '55'], ['Trial F', '-0.05', '0.14', '51']]),
    ambiguous: 'Trial A, -0.28, 0.12, 32\nEta, 0,1, 0.1, 40\nTrial C, -0.15, 0.11, 42\nTrial D, -0.10, 0.13, 48\nTrial E, 0.04, 0.15, 55', line: 2, token: '0,1',
    conflictRow: 'Line 1 (Trial A, -0.28, 0.12, 32)', share: { writes: true },
  },
  {
    app: 'dta-sroc', ready: '#stats-wrap .stats', warning: '#warn-banner', refusal: '#warn-banner',
    // Counts are integers; the decimal covariate (last column) is where the separator matters.
    enter: async (page, text) => { await page.locator('#f-cov').selectOption('last'); await page.locator('#f-data').fill(text); await page.locator('#btn-run').click(); },
    numbers: () => window.__almResults(),
    ...forms([['Study A', '85', '10', '15', '140', '0.5'], ['Smith, J', '62', '12', '18', '108', '1.25'], ['Study C', '110', '25', '40', '200', '0.75'],
      ['Study D', '55', '6', '8', '90', '2.5'], ['Study E', '130', '40', '30', '300', '1.5'], ['Study F', '92', '18', '25', '185', '0.25']]),
    ambiguous: 'Study A, 85, 10, 15, 140, 0.5\nSmith, 62, 12, 18, 108, 1,25\nStudy C, 110, 25, 40, 200, 0.75\nStudy D, 55, 6, 8, 90, 2.5\nStudy E, 130, 40, 30, 300, 1.5',
    line: 2, token: '1,25', conflictRow: 'Line 1 (Study A, 85, 10, 15, 140, 0.5)', share: { writes: true },
  },
  {
    app: 'cumulative-subgroup', ready: '#stats-wrap .stats', warning: '#warn-banner', refusal: '#warn-banner',
    // The page re-renders on input (no Run button).
    enter: fillRun('#f-data'), numbers: () => window._almLastCumSub(),
    ...forms([['Trial A', '-0.22', '0.14', '2015', 'Low-risk'], ['Smith, J', '-0.30', '0.12', '2016', 'Low-risk'], ['Trial C', '-0.18', '0.10', '2018', 'High-risk'],
      ['Trial D', '-0.42', '0.15', '2019', 'High-risk'], ['Trial E', '-0.38', '0.11', '2020', 'Low-risk']], true),
    ambiguous: 'Trial A, -0.22, 0.14, 2015, Low\nEta, 0,1, 0.1, 2016, Low\nTrial C, -0.18, 0.10, 2018, High\nTrial D, -0.42, 0.15, 2019, High', line: 2, token: '0,1',
    conflictRow: 'Line 1 (Trial A, -0.22, 0.14, 2015, Low)', share: { writes: true },
  },
  {
    app: 'pubbias-tests', ready: '#body tr', warning: '#decsep-note', refusal: '#body',
    enter: fillRun('#src', '#btn-run'), numbers: () => window._almLastPubbias(),
    ...forms([['A', '0.25', '0.08'], ['B', '0.18', '0.10'], ['C', '0.40', '0.15'], ['D', '0.30', '0.09'], ['E', '0.12', '0.07'],
      ['F', '0.55', '0.20'], ['G', '0.22', '0.08'], ['H', '0.32', '0.12'], ['I', '0.45', '0.17'], ['J', '0.28', '0.10']]),
    // "Eta, 0,12" is read as effect 0, SE 12 under '.': the silent case.
    ambiguous: 'A, 0.25, 0.08\nB, 0.18, 0.10\nC, 0.40, 0.15\nD, 0.30, 0.09\nE, 0.12, 0.07\nF, 0.55, 0.20\nEta, 0,12', line: 7, token: '0,12',
    // Draft restore is not exercised here: on this page the draft's own restore re-fires the format selector's change
    // handler, which replaces the data with the built-in example (pre-existing, reported separately).
    conflictRow: 'line 1: the decimal separator is set to ","', share: { writes: true, draftRestore: false },
  },
  {
    app: 'multivariate-ma', ready: '#stats .stat', warning: '#decsep-note', refusal: '#omitted',
    enter: async (page, text) => { await page.locator('#f-data').fill(text); await page.evaluate(() => window.AlmMvPage.run()); },
    numbers: () => window._almLastMultivariate(),
    ...forms([['Trial 1', '0.47', '0.0075', '-0.32', '0.0077', '0.0030'], ['Smith, J', '0.20', '0.0057', '-0.60', '0.0008', '0.0009'],
      ['Trial 3', '0.40', '0.0021', '-0.12', '0.0014', '0.0007'], ['Trial 4', '0.26', '0.0029', '-0.31', '0.0015', '0.0009'],
      ['Trial 5', '0.56', '0.0148', '-0.39', '0.0304', '0.0072']]),
    ambiguous: 'Trial 1, 0.47, 0.0075, -0.32, 0.0077, 0.0030\nEta, 0,2, 0.0057, -0.60, 0.0008, 0.0009\nTrial 3, 0.40, 0.0021, -0.12, 0.0014, 0.0007\nTrial 4, 0.26, 0.0029, -0.31, 0.0015, 0.0009',
    line: 2, token: '0,2', conflictRow: 'line 1 (the decimal separator is set to ","',
  },
  {
    app: 'nma-inconsistency', ready: '#ns-body tr', warning: '#inco-input-msg', refusal: '#inco-input-msg',
    enter: fillRun('#src', '#btn-run'), numbers: () => window._almLastInco(),
    ...forms([['A', 'B', '-0.30', '0.10'], ['A', 'B', '-0.32', '0.08'], ['A', 'C', '-0.20', '0.12'], ['A', 'C', '-0.22', '0.10'], ['B', 'C', '0.10', '0.11'],
      ['A', 'D', '-0.50', '0.15'], ['B', 'D', '-0.25', '0.18'], ['C', 'D', '-0.35', '0.14'], ['Drug, low', 'D', '-0.40', '0.16'], ['A', 'Drug, low', '0.05', '0.20']], true),
    // "-0,32" is read as effect -0 and SE 32, with "0.08" taken as the study ID: the silent case.
    ambiguous: 'A, B, -0.30, 0.10\nA, B, -0,32, 0.08\nA, C, -0.20, 0.12\nB, C, 0.10, 0.11\nA, D, -0.50, 0.15\nB, D, -0.25, 0.18\nC, D, -0.35, 0.14',
    line: 2, token: '-0,32', conflictRow: 'Line 1 (A, B, -0.30, 0.10)',
  },
];

function watchErrors(page) { const errors = []; page.on('pageerror', e => errors.push(e.message)); return errors; }
const url = c => `/${c.app}/index.html`;
async function fresh(page, c, hash) {
  await page.goto(url(c));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage may be unavailable */ } });
  await page.goto('about:blank');
  await page.goto(url(c) + (hash || ''));
  await expect(page.locator(c.ready).first()).toBeVisible({ timeout: 30_000 });
}
const decode = h => JSON.parse(decodeURIComponent(escape(Buffer.from(h.replace(/^#/, ''), 'base64').toString('binary'))));
const encode = s => '#' + Buffer.from(unescape(encodeURIComponent(JSON.stringify(Object.assign({ v: 1 }, s)))), 'binary').toString('base64');

for (const c of CASES) {
  test(`${c.app}: "." default leaves the example's numbers identical and shows no warning`, async ({ page }) => {
    const errors = watchErrors(page);
    await fresh(page, c);
    await expect(page.locator('#f-decsep')).toHaveValue('.');
    await expect(page.locator(c.warning)).not.toContainText(AMBIG);
    const withHelper = strip(await page.evaluate(c.numbers));
    expect(withHelper).toBeTruthy();
    // The same page with the helper never loaded: the behaviour before the setting existed.
    await page.route('**/hub/shared/decimal-sep.js', r => r.abort());
    await page.goto('about:blank');
    await page.goto(url(c));
    await expect(page.locator(c.ready).first()).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => typeof window.AlmDecimalSep)).toBe('undefined');
    expect(strip(await page.evaluate(c.numbers))).toEqual(withHelper);
    expect(errors.filter(e => !/decimal-sep/.test(e))).toEqual([]);
  });

  test(`${c.app}: an ambiguous comma-decimal row warns visibly under "." and changes no number`, async ({ page }) => {
    const errors = watchErrors(page);
    await fresh(page, c);
    await c.enter(page, c.ambiguous);
    const warn = page.locator(c.warning);
    await expect(warn).toBeVisible();
    await expect(warn).toContainText(AMBIG);
    await expect(warn).toContainText(`line ${c.line} ("${c.token}")`);
    await expect(warn).toContainText('set Decimal separator to ","');
    const warned = strip(await page.evaluate(c.numbers));
    console.log(`DECSEP ${c.app} ambiguous: "${(await warn.innerText()).replace(/\s+/g, ' ').slice(0, 220)}"`);
    // The same input with the helper switched off: identical numbers, no such warning.
    await page.evaluate(() => { window.__ds = window.AlmDecimalSep; window.AlmDecimalSep = undefined; });
    await c.enter(page, c.ambiguous);
    await expect(page.locator(c.warning)).not.toContainText(AMBIG);
    expect(strip(await page.evaluate(c.numbers))).toEqual(warned);
    await page.evaluate(() => { window.AlmDecimalSep = window.__ds; });
    expect(errors).toEqual([]);
  });

  test(`${c.app}: "," with semicolon or tab data gives the "." numbers; comma-delimited rows are refused with the reason`, async ({ page }) => {
    const errors = watchErrors(page);
    await fresh(page, c);
    await c.enter(page, c.dot);
    await expect(page.locator(c.ready).first()).toBeVisible();
    const dot = strip(await page.evaluate(c.numbers));
    expect(dot).toBeTruthy();
    await page.locator('#f-decsep').selectOption(',');
    for (const text of [c.semi, c.tab]) {
      await c.enter(page, text);
      await expect(page.locator(c.ready).first()).toBeVisible();
      await expect(page.locator(c.refusal)).not.toContainText(CONFLICT);
      expect(strip(await page.evaluate(c.numbers))).toEqual(dot);
    }
    const comma = await page.evaluate(c.numbers);
    expect(comma.decimal_separator).toBe(',');
    expect(comma.decimal_separator_note).toMatch(/decimal comma/);
    await c.enter(page, c.ambiguous);
    await expect(page.locator(c.refusal)).toContainText(CONFLICT);
    await expect(page.locator(c.refusal)).toContainText(c.conflictRow);
    expect(errors).toEqual([]);
  });

  if (c.share) test(`${c.app}: "," persists in the share link and autosave; a link without the field restores "."`, async ({ page }) => {
    const errors = watchErrors(page);
    await fresh(page, c);
    await c.enter(page, c.dot);
    await expect(page.locator(c.ready).first()).toBeVisible();
    const dot = strip(await page.evaluate(c.numbers));
    let oldHash, commaHash;
    if (c.share.writes) {
      oldHash = await page.evaluate(() => window.location.hash);
      expect(Object.keys(decode(oldHash))).not.toContain('decsep');   // '.' links are exactly the old format
    } else {
      oldHash = encode(c.share.oldState(c.dot));
    }
    await page.locator('#f-decsep').selectOption(',');
    await c.enter(page, c.semi);
    await expect(page.locator(c.ready).first()).toBeVisible();
    if (c.share.writes) {
      commaHash = await page.evaluate(() => window.location.hash);
      expect(decode(commaHash).decsep).toBe(',');
    } else {
      const snap = await page.evaluate(() => window.__almSnapshot());
      expect(snap.decsep).toBe(',');
      commaHash = encode(snap);
    }
    // Autosave: ',' is stored beside the shared draft (whose pinned key set is unchanged), and the draft's Restore puts it
    // back with the data it was saved with.
    await page.waitForFunction(app => localStorage.getItem('alm-decsep:' + app) === ',', c.app);
    await page.waitForFunction(([app, row]) => (localStorage.getItem('alm-autosave:' + app) || '').includes(JSON.stringify(row).slice(1, -1)), [c.app, c.semi.split('\n')[1]]);
    expect(await page.evaluate(app => localStorage.getItem('alm-autosave:' + app), c.app)).not.toContain('f-decsep');
    if (c.share.draftRestore !== false) {
      await page.goto('about:blank');
      await page.goto(url(c));
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(page.locator('#f-decsep')).toHaveValue(',');
      await c.enter(page, c.semi);
      await expect(page.locator(c.ready).first()).toBeVisible();
      expect(strip(await page.evaluate(c.numbers))).toEqual(dot);
    }
    // An OLD link (no decsep field) restores '.' and the '.' numbers, although ',' is in the autosave.
    await page.goto('about:blank');
    await page.goto(url(c) + oldHash);
    await expect(page.locator(c.ready).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#f-decsep')).toHaveValue('.');
    expect(strip(await page.evaluate(c.numbers))).toEqual(dot);
    // The ',' link restores ',' and the same numbers.
    await page.goto('about:blank');
    await page.goto(url(c) + commaHash);
    await expect(page.locator(c.ready).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#f-decsep')).toHaveValue(',');
    expect(strip(await page.evaluate(c.numbers))).toEqual(dot);
    expect(errors).toEqual([]);
  });
}
