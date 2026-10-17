import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Variances are sums of independent arm variances. Effects are treatment2 - treatment1.
function independentRows(v = [.01, .02, .03, .04], study = 'Four-arm') {
  const rows = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    rows.push({ study, t1: String.fromCharCode(65 + i), t2: String.fromCharCode(65 + j),
      est: .3 * (j - i), se: Math.sqrt(v[i] + v[j]) });
  }
  return rows;
}
function incompatibleRows() {
  const rows = independentRows([.02, .02, .02, .02]);
  rows[5].se = Math.sqrt(.10); // CD differs; recovered nonnegative arms cannot reproduce the input.
  return rows;
}
const textOf = rows => rows.map(r => [r.study, r.t1, r.t2, r.est, r.se].join(',')).join('\n');
async function open(page) {
  await page.goto('/nma/index.html');
  await page.waitForFunction(() => Boolean(window.AlmNmaMultiarm && window.__almNmaCompute));
  await page.locator('#f-model').selectOption('fe');
  await page.locator('#f-scale').selectOption('log');
}
async function assertRefusal(page) {
  await expect(page.locator('#warn-banner')).toContainText('independent-arm covariance model');
  for (const id of ['league-host', 'ref-host', 'sucra-host', 'het-host']) {
    await expect(page.locator('#' + id)).toBeEmpty();
  }
}

test('unsupported four-arm variance input clears old fitted tables, not the submitted data', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill(textOf(independentRows()));
  await expect(page.locator('#league-host table')).toBeVisible();
  await page.locator('#f-data').fill(textOf(incompatibleRows()));
  await assertRefusal(page);
  await expect(page.locator('#f-data')).toHaveValue(textOf(incompatibleRows()));
});

test('refused covariance cannot be exported as a fitted league table', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill(textOf(incompatibleRows()));
  await assertRefusal(page);
  const downloads = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  const dialogPromise = page.waitForEvent('dialog');
  const clickPromise = page.locator('#btn-league').click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('independent-arm covariance model');
  await dialog.accept();
  await clickPromise;
  expect(downloads).toEqual([]);
});

test('valid data recovers after refusal, preserves contrast SE and exports the fitted league', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill(textOf(incompatibleRows()));
  await assertRefusal(page);
  const rows = independentRows();
  await page.locator('#f-data').fill(textOf(rows));
  await expect(page.locator('#league-host table')).toBeVisible();
  const fit = await page.evaluate(rows => window.AlmNmaMultiarm.analyse(rows), rows);
  expect(fit.ok).toBe(true);
  for (const r of rows) {
    expect(fit.common.seTE[fit.treatments.indexOf(r.t1)][fit.treatments.indexOf(r.t2)]).toBeCloseTo(r.se, 11);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-league').click();
  const csv = readFileSync(await (await downloadPromise).path(), 'utf8');
  expect(csv.split('\n')).toHaveLength(5);
  expect(csv).toContain('0.3000 [-0.0395, 0.6395]');
  expect(csv).not.toMatch(/NaN|Infinity|undefined/);
});

test('JSON file import cannot bypass the covariance check', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill(textOf(independentRows()));
  await page.locator('#file-import').setInputFiles({ name: 'four-arm.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ _schema: 'nma-v1', data: textOf(incompatibleRows()),
      ref: 'A', model: 'fe', ci: 'classic', dir: 'desirable', scale: 'log', title: 'Unsupported covariance' })) });
  await expect(page.locator('#f-data')).toHaveValue(textOf(incompatibleRows()));
  await assertRefusal(page);
});

test('changing FE/RE or random-CI controls cannot bypass refusal', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill(textOf(incompatibleRows()));
  for (const model of ['fe', 're']) for (const ci of ['classic', 't-dist']) {
    await page.locator('#f-model').selectOption(model);
    await page.locator('#f-ci').selectOption(ci);
    await assertRefusal(page);
  }
});

test('refusal is invariant to row order, contrast orientation, reference and scaling', async ({ page }) => {
  await open(page);
  const got = await page.evaluate(rows => {
    const E = window.AlmNmaMultiarm, original = JSON.stringify(rows);
    const variants = [rows, [...rows].reverse(), rows.map(r => ({ ...r, t1: r.t2, t2: r.t1, est: -r.est })),
      ...[.001, 100].map(s => rows.map(r => ({ ...r, est: r.est * s, se: r.se * s })))];
    return { refused: variants.map(r => E.analyse(r).ok === false), unchanged: original === JSON.stringify(rows),
      refs: ['A','B','C','D'].map(ref => E.fit(rows, { ref, model: 'fe' }).ok === false),
      mixed: E.analyse(rows.concat([{ study: 'Other', t1: 'A', t2: 'B', est: .1, se: .3 }])).ok };
  }, incompatibleRows());
  expect(got.refused.every(Boolean)).toBe(true);
  expect(got.refs.every(Boolean)).toBe(true);
  expect(got.unchanged).toBe(true);
  expect(got.mixed).toBe(false);
});

test('250 seeded valid 4-8-arm trials preserve all 4000 supplied contrast SEs', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const E = window.AlmNmaMultiarm;
    let seed = 314159, count = 0, trials = 0, maxDifference = 0;
    function rand() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
    for (let k = 4; k <= 8; k++) for (let rep = 0; rep < 50; rep++) {
      const v = Array.from({ length: k }, () => .003 + rand() * .2);
      const theta = Array.from({ length: k }, () => rand() * 2 - 1), rows = [];
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) rows.push({ study: 'Trial',
        t1: String.fromCharCode(65 + i), t2: String.fromCharCode(65 + j), est: theta[j] - theta[i], se: Math.sqrt(v[i] + v[j]) });
      const a = E.analyse(rows);
      if (!a.ok) throw new Error(a.error);
      for (const r of rows) {
        maxDifference = Math.max(maxDifference, Math.abs(a.common.seTE[a.treatments.indexOf(r.t1)][a.treatments.indexOf(r.t2)] - r.se));
        count++;
      }
      trials++;
    }
    return { trials, count, maxDifference };
  });
  expect(out.trials).toBe(250);
  expect(out.count).toBe(4000);
  expect(out.maxDifference).toBeLessThan(1e-10);
});

test('small numerical reconstruction noise is tolerated, substantive inconsistency is refused', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(rows => {
    const small = rows.map(r => ({ ...r })), large = rows.map(r => ({ ...r }));
    small[5].se = Math.sqrt(small[5].se ** 2 + 1e-12);
    large[5].se = Math.sqrt(large[5].se ** 2 + 1e-6);
    return { small: window.AlmNmaMultiarm.checkStudies(small), large: window.AlmNmaMultiarm.checkStudies(large) };
  }, independentRows());
  expect(result.small).toEqual([]);
  expect(result.large).toHaveLength(1);
});

test('existing archived netmeta corpus retains all 410 checks at unchanged tolerances', async ({ page }) => {
  test.setTimeout(60000);
  await open(page);
  const out = await page.evaluate(async () => {
    const adapter = window.AlmNmaValidateAdapter;
    if (!adapter) throw new Error('Existing NMA validation adapter unavailable');
    const files = {};
    for (const f of adapter.corpus.files) {
      const response = await fetch(f.path);
      if (!response.ok) throw new Error('Missing corpus ' + f.path);
      files[f.path] = await response.json();
    }
    return adapter.corpus.run(files);
  });
  expect(out.checks).toBe(410);
  expect(out.passed).toBe(410);
  expect(out.failed).toEqual([]);
  expect(out.analyses).toBe(26);
  expect(out.fitted).toBe(24);
  expect(out.refusals.matched).toBe(2);
});
