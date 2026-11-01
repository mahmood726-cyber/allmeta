import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, decodePng, readTiff } from './zip-reader.mjs';

const APP = 'multilevel-ma', PAGE = '/' + APP + '/index.html';
const SNAP = new URL('./__snapshots__/text-multilevel-ma.json', import.meta.url);
async function open(page, tab, testMode = false) {
  await page.goto(PAGE + (testMode ? '?almtest=1' : ''));
  await page.waitForFunction(() => window.AlmMultilevelFeatures && window.__almReml());
  if (tab) await page.evaluate(tab => AlmFeatures.open('multilevel-ma', tab), tab);
}
async function rendered(page) {
  return page.evaluate(() => {
    const spec = AlmMultilevelFeatures.text, r = spec.results();
    const ctx = { app: 'multilevel-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    const text = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { audit: AlmText.audit(text, r, { ctx, dom: spec.dom() }),
      snapshot: { app: 'multilevel-ma', source: 'built-in example; MoM and REML, default axes',
        plain: norm(text.plain), methods: norm(text.methods), results: norm(text.results),
        flags: text.flags.map(norm), references: text.cites.map(c => c.full) } };
  });
}

test('ENTRY: three table formats preserve all example rows and both pooled results', async ({ page }) => {
  await open(page, 'entry');
  const outcome = await page.evaluate(() => {
    const entry = AlmMultilevelFeatures.entry;
    const example = __almMlmaParse(document.getElementById('src').value);
    const original = { mom: _almLastMlma().mu, reml: __almReml().mu };
    const formats = [
      'study\tes_id\tyi\tvi\n' + example.map(r => [r.study, r.label, r.te, r.se * r.se].join('\t')).join('\n'),
      // Full-precision Wald bounds avoid testing losses due to rounding in a paper.
      'study  es_id  estimate\n' + example.map(r =>
        [r.study, r.label, `${r.te} (${r.te - AlmEntry.qnorm(.975) * r.se} to ${r.te + AlmEntry.qnorm(.975) * r.se})`].join('  ')).join('\n'),
      // Covidence-style extraction columns, retaining cluster and outcome IDs.
      'Study ID;Outcome;Effect size;Standard error\n' +
        example.map(r => [r.study, r.label, r.te, r.se].join(';')).join('\n')
    ];
    const trials = formats.map(source => {
      const table = AlmEntry.parseTable(source), detection = AlmEntry.detect(table, 'generic');
      const out = entry.convertTable(table, detection, { decimal: 'point' });
      if (out.flags.some(f => f.blocking)) return { flags: out.flags };
      const sources = entry.sourceRecords(source, out);
      const anchors = sources.every(s => s.values.length >= 2 && s.values.every(v =>
        s.pastedText.slice(...v.span) === v.text && Number(AlmEntry.normalize(v.text).text) === v.value));
      const applied = entry.apply(out.records);
      return { applied, rows: __almMlmaParse(document.getElementById('src').value),
        mom: _almLastMlma().mu, reml: __almReml().mu, steps: out.steps, anchors };
    });
    return { original, example, formats, trials };
  });
  for (const trial of outcome.trials) {
    expect(trial.flags).toBeUndefined();
    expect(trial.anchors).toBe(true);
    expect(trial.applied).toEqual({ ok: true, n: outcome.example.length });
    expect(trial.rows.length).toBe(outcome.example.length);
    for (let i = 0; i < trial.rows.length; i++) {
      expect(trial.rows[i].study).toBe(outcome.example[i].study);
      expect(trial.rows[i].label).toBe(outcome.example[i].label);
      expect(Math.abs(trial.rows[i].te - outcome.example[i].te)).toBeLessThanOrEqual(1e-9 * Math.abs(outcome.example[i].te));
      expect(Math.abs(trial.rows[i].se - outcome.example[i].se)).toBeLessThanOrEqual(1e-9 * outcome.example[i].se);
    }
    for (const key of ['mom', 'reml']) expect(Math.abs(trial[key] - outcome.original[key])).toBeLessThanOrEqual(1e-9 * Math.abs(outcome.original[key]));
    expect(trial.steps.length).toBeGreaterThan(0);
  }
  console.log('ENTRYRT 3/3 formats; 39/39 effect rows');
  // Entry application above uses APIs as requested by lane notes. UI smoke only
  // checks the conversion log and fail-closed button, independently of layout.
  await page.locator('#ml-entry-paste').fill(outcome.formats[1]);
  await page.getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
  await expect(page.locator('[aria-labelledby=ml-entry-log]')).toContainText('SE estimated from CI');
  await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
});

test('ENTRY PLANTED: reversed CI and nonpositive variance block application without changing the app', async ({ page }) => {
  await open(page, 'entry');
  const before = await page.locator('#src').inputValue();
  const result = await page.evaluate(() => {
    const e = AlmMultilevelFeatures.entry;
    const ci = e.convert('study\tes_id\testimate\nA\ta\t0.3 (0.5 to 0.1)\nA\tb\t0.2 (0.1 to 0.3)\nB\ta\t0.4 (0.2 to 0.6)');
    let refusal;
    try { e.apply([{ study: 'A', es_id: 'a', yi: .3, vi: -.1 }, { study: 'A', es_id: 'b', yi: .2, vi: .1 }, { study: 'B', es_id: 'a', yi: .4, vi: .1 }]); }
    catch (e) { refusal = e.message; }
    return { flags: ci.flags, refusal };
  });
  expect(result.flags.some(f => f.blocking && f.code === 'ci-order')).toBe(true);
  expect(result.refusal).toContain('positive');
  await page.locator('#ml-entry-paste').fill('study\tes_id\tyi\tvi\nA\ta\t0.3\t-0.1\nA\tb\t0.2\t0.1\nB\ta\t0.4\t0.1');
  await page.getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(page.locator('[aria-labelledby=ml-entry-log]')).toContainText('Sampling variance must be a positive');
  await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  expect(await page.locator('#src').inputValue()).toBe(before);
  console.log('ENTRY PLANTED 2/2 blocked');
});

test('TEXT: audited numbers match both displayed fits and the committed snapshot; exports', async ({ page }, testInfo) => {
  await open(page, 'text');
  const out = await rendered(page);
  const actual = testInfo.outputPath('text-multilevel-ma.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await testInfo.attach('text-multilevel-ma', { path: actual, contentType: 'application/json' });
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(20);
  const shown = await page.locator('#summary table').evaluateAll(t => [
    t[0].rows[0].cells[1].textContent, t[0].rows[0].cells[2].textContent.replace('SE = ', ''),
    t[1].rows[0].cells[1].textContent, t[1].rows[2].cells[1].textContent,
    t[1].rows[3].cells[1].textContent, t[1].rows[4].cells[1].textContent
  ]);
  for (const value of shown) expect(out.snapshot.results.replaceAll('−', '-')).toContain(value.trim());
  console.log(`TEXTDOM ${shown.length}/${shown.length}`);
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.snapshot.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-docx').click()]);
  expect(readZip(fs.readFileSync(await docx.path())).map(e => e.name)).toEqual(expect.arrayContaining(['word/document.xml', '_rels/.rels', '[Content_Types].xml']));
  console.log('TEXTEXPORT 2/2');
});

test('TEXT PLANTED: DOM discrepancy fails the audit and withholds prose', async ({ page }) => {
  await open(page, 'text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'remlMu', delta: .1 }; });
  const out = await rendered(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:remlMu');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks} FAIL`);
});

test('VERIFY: real webR REML comparison, forest exports, planted defect and current-state text', async ({ page }) => {
  test.setTimeout(900_000);
  // Current core accepts the planted-defect hook only with this explicit opt-in.
  await open(page, 'verify', true);
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const run = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await run.click();
  await expect(summary).toHaveText('7 of 7 computed quantities match R; 0 not computed — PASS', { timeout: 600_000 });
  const states = await panel.locator('td[data-result]').allTextContents();
  expect(states).toEqual(Array(7).fill('PASS'));
  console.log('VERIFY 7/7');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('multilevel-ma'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [zip] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const files = Object.fromEntries(readZip(fs.readFileSync(await zip.path())).map(e => [e.name, e.bytes]));
  const expected = ['multilevel-ma-verify.R', 'multilevel-ma-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'multilevel-ma-forest-R-300dpi.png', 'multilevel-ma-forest-R.pdf', 'multilevel-ma-forest-R-300dpi.tiff', 'truthcert.json'];
  for (const key of expected) expect(files[key], key).toBeDefined();
  expect(Object.keys(files).filter(n => /forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const png = decodePng(files['multilevel-ma-forest-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tiff = readTiff(files['multilevel-ma-forest-R-300dpi.tiff']);
  expect(tiff.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(new TextDecoder().decode(files['truthcert.json']));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${Object.keys(files).length}/${Object.keys(files).length} entries`);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await expect(page.locator('[data-para=methods]')).toContainText('Only the REML quantities were checked.');
  const src = await page.locator('#src').inputValue();
  await page.locator('#src').fill(src.replace('0.35', '0.36'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('multilevel-ma'))).toBe(false);
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.locator('#src').fill(src); await page.locator('#btn-run').click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'mu', delta: .1 }; });
  expect(await page.evaluate(() => AlmVerifyR.testHookActive())).toBe(true);
  await run.click();
  await expect(summary).toHaveText('TEST MODE (test hook active; not a verification) — 6 of 7 computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active', { timeout: 300_000 });
  const failing = await panel.locator('tbody tr').evaluateAll(rows =>
    rows.filter(r => r.querySelector('[data-result]').textContent !== 'PASS').map(r => r.dataset.key));
  expect(failing).toEqual(['mu']);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('multilevel-ma'))).toBe(false);
  console.log('VERIFY planted 6/7; mu FAIL');
});

test('SHARE: data, all axis options and log round trip; corruption and invalid options are atomic', async ({ page, context }) => {
  await open(page, 'share');
  const original = await page.locator('#src').inputValue();
  await page.locator('#src').fill(original.replace('0.35', '0.37'));
  await page.locator('#alm-axis-mount [data-edge=min]').fill('-1');
  await page.locator('#alm-axis-mount [data-edge=max]').fill('2');
  await page.locator('#alm-axis-mount [data-edge=log]').check();
  await page.locator('#btn-run').click();
  await page.evaluate(() => { AlmFeaturesState.entryLog = [{ text: 'Confirmed source table', method: 'source', citation: 'User confirmation' }]; });
  const state = await page.evaluate(() => ({ share: AlmMultilevelFeatures.share.get(), mu: __almReml().mu, mom: _almLastMlma().mu }));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const p2 = await context.newPage(); await p2.goto(link);
  await expect(p2.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await p2.evaluate(() => ({ share: AlmMultilevelFeatures.share.get(), mu: __almReml().mu, mom: _almLastMlma().mu }))).toEqual(state);
  const p3 = await context.newPage(); await p3.goto(link.slice(0, -10));
  await expect(p3.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
  expect(await p3.locator('#src').inputValue()).toBe(original);
  const atomic = await page.evaluate(() => {
    const before = AlmMultilevelFeatures.share.get(); let error;
    try { AlmMultilevelFeatures.share.set({ ...before, src: 'bad', axis: { min: '3', max: '1', log: false } }); }
    catch (e) { error = e.message; }
    return { before, after: AlmMultilevelFeatures.share.get(), error };
  });
  expect(atomic.after).toEqual(atomic.before); expect(atomic.error).toContain('axis');
  console.log('SHARE 3/3 (round trip, corruption, invalid state)');
});

test('AXE: each feature tab has no serious or critical accessibility violations', async ({ page }) => {
  await open(page, 'entry');
  for (const tab of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const audit = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = audit.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    console.log(`AXE ${tab}: ${bad.length} serious/critical; ${audit.passes.length} rules passed`);
    expect(bad).toEqual([]);
  }
});

test('EXPORT: after a refused run every results export downloads an empty result without a page error', async ({ page }) => {
  // Data the app refuses (one malformed row, below the minimum study count) leaves it holding no result. Every export
  // button must still answer (empty result / "No results yet"), never throw an uncaught TypeError on the null result,
  // never export a stale one.
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.stack || e)));
  await page.goto('/multilevel-ma/index.html');
  await page.waitForFunction(() => typeof window._almLastMlma === 'function' && window._almLastMlma() !== null);
  await page.locator('#src').fill('abc, xyz');
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window._almLastMlma())).toBeNull();
  const expected = {
    json: t => expect(JSON.parse(t)).toEqual({}),
    csv: t => expect(t).toBe('key,value'),
    md: t => expect(t.split('\n').length).toBe(2),
    'report-md': t => expect(t).toContain('No results yet'),
    'report-txt': t => expect(t).toContain('No results yet')
  };
  for (const [action, check] of Object.entries(expected)) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#alm-export-mount [data-action="' + action + '"]').click()
    ]);
    check(fs.readFileSync(await download.path(), 'utf8'));
  }
  expect(errors).toEqual([]);
});
