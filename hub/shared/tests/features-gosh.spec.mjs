import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, decodePng, readTiff } from './zip-reader.mjs';

const PAGE = '/gosh/index.html';
const SNAP = new URL('./__snapshots__/text-gosh.json', import.meta.url);
const SAMPLED_INPUT = Array.from({ length: 16 }, (_, i) => `${i / 10}, 0.1, Synthetic ${i + 1}`).join('\n');
async function open(page) {
  await page.goto(PAGE);
  await expect(page.locator('#m-n')).toHaveText('511');
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
}
async function tab(page, key) { await page.evaluate(k => AlmFeatures.open('gosh', k), key); }
async function report(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('gosh').text, r = spec.results();
    const ctx = { app: 'gosh', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { audit, r, snapshot: { app: 'gosh', source: 'Built-in nine-study example; fixed effect; all nonempty subsets.',
      plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
      flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) } };
  });
}

test('ENTRY: built-in example through Excel, paper CI and extraction-export formats', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('gosh'), original = structuredClone(_almLastGosh());
    const rows = original.studies, z = 1.959963984540054;
    // Synthetic equivalent representations of the app's own example, not claimed clinical exports.
    const inputs = [
      'Study\tEffect\tSE\n' + rows.map(r => [r.label, r.te, r.se].join('\t')).join('\n'),
      'Study  Effect\n' + rows.map(r => r.label + '  ' + r.te + ' (' + (r.te - z * r.se) + '–' + (r.te + z * r.se) + ')').join('\n'),
      'Study;Effect;Standard error\n' + rows.map(r => [r.label, r.te, r.se].join(';')).join('\n')
    ];
    const runs = inputs.map((input, index) => {
      const table = AlmEntry.parseTable(input), detection = AlmEntry.detect(table, 'generic');
      const converted = AlmEntry.convert(table, detection, 'generic', {});
      if (converted.flags.some(f => f.blocking)) throw Error(JSON.stringify(converted));
      // Use the documented legacy text-log shape. Shared conversion steps also
      // have flags[], which AlmText otherwise treats as full source records.
      AlmFeaturesState.entryLog = converted.steps.map(s => ({ study: s.study, method: s.method, citation: s.citation }));
      const applied = spec.entry.apply(converted.records);
      const rendered = AlmText.render(spec.text.templates, spec.text.results(), AlmText.context('gosh', spec.text));
      return { index, applied, converted, original, actual: structuredClone(_almLastGosh()), methods: rendered.methods.text };
    });
    AlmFeaturesState.entryLog = runs[1].converted.steps.map(s => ({ study: s.study, method: s.method, citation: s.citation }));
    return runs;
  });
  for (const row of out) {
    expect(row.applied).toEqual({ ok: true, n: 9 });
    expect(row.converted.questions).toEqual([]);
    expect(row.actual.n_subsets).toBe(row.original.n_subsets);
    for (const key of ['median_est', 'median_i2', 'min_est', 'max_est', 'q25_est', 'q75_est']) {
      expect(Math.abs(row.actual[key] - row.original[key])).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(row.original[key]), 1e-12));
    }
  }
  expect(out[1].converted.steps).toHaveLength(9);
  expect(out[1].converted.steps.every(s => /SE estimated from CI/.test(s.text))).toBe(true);
  expect(out[1].methods).toContain('SE from CI');
  await tab(page, 'text');
  await expect(page.locator('#alm-f-panel-text [data-para=methods]')).toContainText('SE from CI');
  console.log('ENTRYRT 3/3; conversion log 9/9');
});

test('ENTRY planted reversed CI blocks conversion; unsafe records cannot change app input', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const input = 'Study\tEffect\nBad\t0.22 (0.4–0.1)\nB\t0.3 (0.1–0.5)\nC\t0.2 (0.1–0.3)';
    const t = AlmEntry.parseTable(input), c = AlmEntry.convert(t, AlmEntry.detect(t, 'generic'), 'generic', {});
    const before = document.getElementById('src').value;
    const records = _almLastGosh().studies.map(r => ({ study: r.label, yi: r.te, sei: r.se }));
    records[0].sei = -1;
    let error; try { AlmFeatures.get('gosh').entry.apply(records); } catch (e) { error = e.message; }
    // Exercise the shared table API directly, without depending on clicks in
    // the evolving provenance workflow. Prove enabled -> blocked, not merely
    // the initial disabled state before any rows have been supplied.
    const host = document.createElement('div'); host.id = 'gosh-entry-gate'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, { schema: 'generic', apply: AlmFeatures.get('gosh').entry.apply });
    const paste = host.querySelector('textarea');
    const use = [...host.querySelectorAll('button')].find(b => b.textContent === 'Use these rows');
    paste.value = input.replace('0.4–0.1', '0.1–0.4'); ui.parse();
    const validEnabled = !use.disabled;
    paste.value = input; ui.parse();
    return { flags: c.flags, before, after: document.getElementById('src').value, error,
      validEnabled, badDisabled: use.disabled, log: host.textContent };
  });
  expect(out.flags.some(f => f.blocking)).toBe(true);
  expect(out.error).toContain('SE positive'); expect(out.after).toBe(out.before);
  expect(out.validEnabled).toBe(true); expect(out.badDisabled).toBe(true);
  expect(out.log).toContain('SE estimated from CI');
  await expect(page.locator('#gosh-entry-gate').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  console.log('ENTRY planted: blocking CI and invalid SE refused; no mutation');
});

test('TEXT: audited values equal all three displayed cards and reviewed snapshot', async ({ page }, testInfo) => {
  await open(page);
  const out = await report(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} dom=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]); expect(out.audit.ok).toBe(true); expect(out.audit.domChecked).toBe(3);
  const cards = await page.locator('.metrics .v').allTextContents();
  for (const value of cards) expect(out.snapshot.results).toContain(value);
  console.log('TEXTDOM 3/3');
  const actual = testInfo.outputPath('text-gosh.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await testInfo.attach('text-gosh.json', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await tab(page, 'text');
  await expect(page.locator('#alm-f-panel-text [data-para=results]')).toHaveText(out.snapshot.results);
  for (const [selector, suffix] of [['.alm-text-md', '.md'], ['.alm-text-docx', '.docx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text ' + selector).click()]);
    expect(dl.suggestedFilename()).toBe('gosh-report-text' + suffix);
    const bytes = fs.readFileSync(await dl.path());
    const content = suffix === '.md' ? bytes.toString('utf8') : new TextDecoder().decode(readZip(bytes).find(e => e.name === 'word/document.xml').bytes);
    expect(content).toContain(out.snapshot.results);
  }
});

test('TEXT planted DOM mismatch fails audit and withholds text', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'median_est', delta: 0.1 }; });
  const out = await report(page);
  expect(out.audit.ok).toBe(false); expect(out.audit.failures.map(f => f.check)).toContain('dom:median_est');
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks} FAIL dom:median_est`);
  await tab(page, 'text');
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
});

test('SHARE: full data/options round trip; damaged and invalid states are atomic', async ({ page, browser }) => {
  await open(page);
  const original = await page.locator('#src').inputValue();
  // The draw control appears only after running more than fifteen studies.
  // Set it through the real UI, then retain it as a dormant option when
  // returning to the modified nine-study example used by this round trip.
  await expect(page.locator('#n-sample')).toBeHidden();
  await page.locator('#src').fill(SAMPLED_INPUT);
  await page.locator('#btn-run').click();
  await expect(page.locator('#n-sample')).toBeVisible();
  await page.locator('#model').selectOption('DL');
  await page.locator('#n-sample').fill('37');
  await page.locator('#src').fill(original.replace('0.22, 0.08', '0.42, 0.08'));
  const xmin = page.locator('#alm-axis-mount [data-axis=x][data-edge=min]');
  await xmin.fill('-0.5'); await xmin.dispatchEvent('change');
  await page.locator('#btn-run').click();
  await expect(page.locator('#n-sample')).toBeHidden();
  await expect(page.locator('#n-sample')).toHaveValue('37');
  await expect(page.locator('#m-n')).toHaveText('511');
  const expected = await page.evaluate(() => ({ state: AlmFeatures.get('gosh').share.get(), result: _almLastGosh(), svg: document.getElementById('plot').innerHTML }));
  await tab(page, 'share');
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  expect(link).toContain('#s=');
  const ctx = await browser.newContext(), fresh = await ctx.newPage();
  await fresh.goto(link);
  await expect(fresh.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await fresh.evaluate(() => ({ state: AlmFeatures.get('gosh').share.get(), result: _almLastGosh(), svg: document.getElementById('plot').innerHTML }))).toEqual(expected);
  // Share restoration runs on document load; a hash-only navigation would
  // keep the previous document and never exercise the corrupted-link guard.
  await fresh.goto('about:blank');
  await fresh.goto(link.slice(0, -10));
  await expect(fresh.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
  expect(await fresh.locator('#src').inputValue()).toBe(original);
  const atomic = await page.evaluate(() => {
    const spec = AlmFeatures.get('gosh'), before = spec.share.get();
    try { spec.share.set({ ...before, src: '0.1, 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', axes: ['2', '1', false, '0', '100', false] }); } catch (e) { return { error: e.message, unchanged: JSON.stringify(before) === JSON.stringify(spec.share.get()) }; }
  });
  expect(atomic).toEqual({ error: 'Invalid axis range.', unchanged: true });
  console.log('SHARE 3/3 round trip, corrupted link, atomic invalid options');
  await ctx.close();
});

test('VERIFY: real webR example passes, plot/ZIP downloads, planted mismatch fails and edits are stale', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page); await tab(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const run = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await run.click();
  await expect(summary).toHaveText(/^\d+ of \d+ quantities match R — PASS$/, { timeout: 600_000 });
  const verified = await page.evaluate(() => AlmFeaturesState.verify);
  console.log(`VERIFY ${verified.nPassed}/${verified.n}`);
  expect(verified.n).toBeGreaterThanOrEqual(5); expect(verified.nPassed).toBe(verified.n);
  expect(verified.rows.every(r => r.pass)).toBe(true);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('gosh'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1); await expect(panel.locator('figure svg')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = Object.fromEntries(readZip(fs.readFileSync(await dl.path())).map(e => [e.name, e.bytes]));
  for (const name of ['gosh-verify.R', 'gosh-verify-comparison.csv', 'sessionInfo.txt', 'console.txt', 'gosh-gosh-R-300dpi.png', 'gosh-gosh-R-300dpi.tiff', 'gosh-gosh-R.pdf', 'truthcert.json']) expect(entries[name], name).toBeDefined();
  expect(Object.keys(entries).filter(n => /^gosh-gosh-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const png = decodePng(entries['gosh-gosh-R-300dpi.png']); expect([png.width, png.height]).toEqual([2400, 1800]);
  const tif = readTiff(entries['gosh-gosh-R-300dpi.tiff']); expect(tif.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(new TextDecoder().decode(entries['truthcert.json']));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log('ZIP ' + Object.keys(entries).join(', '));
  await tab(page, 'text');
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  const src = await page.locator('#src').inputValue();
  await page.locator('#src').fill(src.replace('0.22, 0.08', '0.23, 0.08'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('gosh'))).toBe(false);
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  await tab(page, 'verify'); await expect(panel.locator('[data-testid=verify-stale]')).toBeVisible();
  await page.locator('#src').fill(src);
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'median_est', delta: 0.01 }; });
  await run.click();
  await expect(summary).toContainText('FAIL', { timeout: 600_000 });
  const planted = await page.evaluate(() => AlmFeaturesState.verify);
  expect(planted.rows.filter(r => !r.pass).map(r => r.key)).toEqual(['median_est']);
  console.log(`VERIFY planted ${planted.nPassed}/${planted.n} FAIL median_est`);
  expect(errors).toEqual([]);
});

test('AXE: all feature tabs have no serious or critical violations', async ({ page }) => {
  await open(page);
  for (const key of ['entry', 'text', 'verify', 'share']) {
    await tab(page, key);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const out = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = out.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    console.log(`AXE ${key} ${out.passes.length} passed; ${bad.length} serious/critical`);
    expect(bad).toEqual([]);
  }
});

test('TEXT: DL and sampled methods describe the actual result; no result refuses text', async ({ page }) => {
  await open(page);
  await page.locator('#model').selectOption('DL');
  await page.locator('#src').fill(SAMPLED_INPUT);
  // Editing data only marks results stale; Run updates sampling visibility.
  await expect(page.locator('#n-sample')).toBeHidden();
  await page.locator('#btn-run').click();
  await expect(page.locator('#n-sample')).toBeVisible();
  await page.locator('#n-sample').fill('37'); await page.locator('#btn-run').click();
  await expect(page.locator('#m-n')).toHaveText('37');
  const out = await report(page);
  expect(out.r).toMatchObject({ k: 16, model: 'DL', sampled: true, n_subsets: 37 });
  expect(out.audit.ok).toBe(true); expect(out.snapshot.methods).toContain('DerSimonian–Laird');
  expect(out.snapshot.methods).toContain('drew 37 subsets'); expect(out.snapshot.methods).toContain('differs from the default');
  await page.locator('#src').fill(''); await page.locator('#btn-run').click(); await tab(page, 'text');
  await expect(page.locator('.alm-text-status')).toHaveText('Run the analysis first.');
  console.log('TEXT variants 2/2 (sampled DL and no results)');
});
