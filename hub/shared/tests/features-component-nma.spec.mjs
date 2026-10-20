// App 19: feature contract. Entry uses the core APIs + spec.entry.apply, so the
// separately maintained provenance UI can evolve without changing the round trips.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'component-nma', PAGE = '/component-nma/index.html';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/features/component-nma/entry.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(new URL('./__snapshots__/text-component-nma.json', import.meta.url), 'utf8'));
const normal = s => s.replace(/−/g, '-');
const near = (a, b, key) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b)), key).toBeLessThanOrEqual(1e-9);
function sameResult(a, b) {
  expect(a.comps).toEqual(b.comps);
  expect(a.df).toBe(b.df);
  for (const key of ['Q', 'tau2']) b[key] === null ? expect(a[key]).toBeNull() : near(a[key], b[key], key);
  for (const group of ['components', 'combinations']) {
    expect(Object.keys(a[group])).toEqual(Object.keys(b[group]));
    for (const name of Object.keys(b[group])) for (const q of ['est', 'se']) near(a[group][name][q], b[group][name][q], `${group}/${name}/${q}`);
  }
}
async function open(page, tab) {
  await page.goto(PAGE);
  await expect(page.locator('#comp-body tr')).toHaveCount(3);
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
  if (tab) await page.evaluate(key => AlmFeatures.open('component-nma', key), tab);
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('component-nma').text, r = spec.results();
    const ctx = { app: 'component-nma', build: AlmBuildInfo, entryLog: [], verify: null };
    const text = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { audit: AlmText.audit(text, r, { ctx, dom: spec.dom() }), text: text.results.text,
      snapshot: { app: 'component-nma', source: 'Built-in example; additive generalized DerSimonian–Laird random effects; normal confidence intervals.',
        plain: norm(text.plain), methods: norm(text.methods), results: norm(text.results), flags: text.flags.map(norm), references: text.cites.map(c => c.full) } };
  });
}

test('ENTRY: three formats reproduce every estimate, SE, Q and variance from the built-in example', async ({ page }) => {
  await open(page, 'entry');
  const expected = await page.evaluate(() => _almLastCnma());
  let passed = 0;
  for (const item of fixture) {
    const out = await page.evaluate(({ text, answers }) => {
      const entry = AlmFeatures.get('component-nma').entry;
      const table = AlmEntry.parseTable(text), detected = AlmEntry.detect(table, entry.schema);
      const converted = AlmEntry.convert(table, detected, entry.schema, answers);
      if (converted.flags.some(f => f.blocking)) return { converted };
      AlmFeaturesState.entryLog = converted.steps;
      return { converted, applied: entry.apply(converted.records), result: _almLastCnma(), src: document.getElementById('src').value };
    }, item);
    expect(out.converted.flags.filter(f => f.blocking), item.name).toEqual([]);
    expect(out.applied).toEqual({ ok: true, n: 8 });
    sameResult(out.result, expected);
    expect(out.src.trim().split('\n')).toHaveLength(8);
    if (item.name.startsWith('paper')) {
      expect(out.converted.steps).toHaveLength(8);
      expect(out.converted.steps.every(s => /SE estimated from CI/.test(s.text))).toBe(true);
      await page.evaluate(() => AlmFeatures.open('component-nma', 'text'));
      await expect(page.locator('.alm-text-body')).toContainText('SEs were derived from confidence intervals for 8 contrasts');
      await page.evaluate(() => AlmFeatures.open('component-nma', 'entry'));
    }
    passed++;
  }
  console.log(`ENTRYRT ${passed}/${fixture.length}`);
});

test('ENTRY PLANTED: reversed CI blocks use; conversion log is visible; invalid apply is atomic', async ({ page }) => {
  await open(page, 'entry');
  // Exercise the shared mount's public parse API, not its evolving button flow.
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'entry-check'; document.body.appendChild(host);
    window.entryCheck = AlmEntryUI.mount(host, AlmFeatures.get('component-nma').entry);
  });
  await page.locator('#entry-check textarea').fill(fixture[1].text);
  await page.evaluate(() => entryCheck.parse());
  await expect(page.locator('#entry-check')).toContainText('SE estimated from CI');
  await expect(page.locator('#entry-check').getByRole('button', { name: 'Use these rows', exact: true })).toBeEnabled();
  const bad = 'study\tt1\tt2\tMD\nBad\tdrug\tcontrol\t-0.3 (0.1–-0.7)\nGood\texercise\tcontrol\t-0.2 (-0.4–0.0)';
  await page.locator('#entry-check textarea').fill(bad);
  await page.evaluate(() => entryCheck.parse());
  const flags = await page.evaluate(() => entryCheck.getResult().flags);
  expect(flags.some(f => f.blocking && f.code === 'ci-order')).toBe(true);
  await expect(page.locator('#entry-check').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  const unchanged = await page.evaluate(() => {
    const spec = AlmFeatures.get('component-nma'), before = JSON.stringify([spec.share.get(), _almLastCnma()]);
    const attempts = [
      [{ study: 'A', t1: 'drug', t2: 'control', yi: -.3, sei: 0 }, { study: 'B', t1: 'exercise', t2: 'control', yi: -.2, sei: .1 }],
      [{ study: 'A', t1: 'drug', t2: 'control', yi: -.3, sei: .1 }, { study: 'A', t1: 'exercise', t2: 'control', yi: -.2, sei: .1 }],
      [{ study: 'A', t1: 'drug|control', t2: 'control', yi: -.3, sei: .1 }, { study: 'B', t1: 'exercise', t2: 'control', yi: -.2, sei: .1 }]
    ];
    return attempts.map(records => {
      try { spec.entry.apply(records); return false; } catch { return before === JSON.stringify([spec.share.get(), _almLastCnma()]); }
    });
  });
  expect(unchanged).toEqual([true, true, true]);
  console.log('ENTRYBLOCK 4/4 (reversed CI, zero SE, repeated study, delimiter injection)');
});

test('TEXT: audit, every displayed value and reviewed snapshot; Markdown and DOCX downloads', async ({ page }, testInfo) => {
  await open(page, 'text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]); expect(out.audit.ok).toBe(true); expect(out.audit.domChecked).toBe(30);
  const displayed = await page.evaluate(() => Array.from(document.querySelectorAll('#comp-body tr, #int-body tr'), tr =>
    Array.from(tr.cells).slice(1).flatMap(c => c.textContent.match(/-?\d+\.\d+/g) || [])).flat());
  for (const value of displayed) expect(normal(out.text)).toContain(value);
  console.log(`TEXTDOM ${displayed.length}/${displayed.length}`);
  await testInfo.attach('text-component-nma.json', { body: JSON.stringify(out.snapshot, null, 2), contentType: 'application/json' });
  expect(out.snapshot).toEqual(snapshot);
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await expect(page.locator('.alm-text-audit')).toContainText('Number audit:');
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.text);
  const [dx] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-docx').click()]);
  const entries = readZip(fs.readFileSync(await dx.path()));
  expect(entries.map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  const xml = new TextDecoder().decode(entries.find(e => e.name === 'word/document.xml').bytes);
  expect(xml).toContain(out.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  console.log('TEXTEXPORT 2/2');
});

test('TEXT PLANTED: perturbed table value fails audit and withholds prose; no fit withholds text', async ({ page }) => {
  await open(page, 'text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'c0_est', delta: .01 }; });
  const bad = await render(page);
  expect(bad.audit.ok).toBe(false);
  expect(bad.audit.failures.map(f => f.check)).toContain('dom:c0_est');
  console.log(`TEXTAUDIT planted ${bad.audit.passed}/${bad.audit.checks}`);
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await page.locator('#src').fill('invalid'); await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toHaveText('Run the analysis first.');
  await expect(page.locator('.alm-text-body')).toBeHidden();
});

test('VERIFY: live netmeta example, plots and ZIP; planted defect FAILS; stale check suppresses verification prose', async ({ page }) => {
  test.setTimeout(900_000);
  await open(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const run = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await run.click();
  await expect(summary).toHaveText(/^21 of 21 quantities match R — PASS$/, { timeout: 600_000 });
  const verified = await page.evaluate(() => AlmFeaturesState.verify);
  expect(verified.rows.every(r => r.pass)).toBe(true);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('component-nma'))).toBe(true);
  console.log(`VERIFY ${verified.nPassed}/${verified.n} ${JSON.stringify(verified.versions)}`);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const files = Object.fromEntries(readZip(fs.readFileSync(await dl.path())).map(e => [e.name, e.bytes]));
  const required = [`${APP}-verify.R`, `${APP}-verify-comparison.csv`, 'sessionInfo.txt', 'console.txt', 'truthcert.json',
    `${APP}-forest-R-300dpi.png`, `${APP}-forest-R.pdf`, `${APP}-forest-R-300dpi.tiff`];
  for (const name of required) expect(files[name], name).toBeDefined();
  expect(Object.keys(files).filter(n => /forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const decode = b => new TextDecoder().decode(b);
  expect(decode(files[`${APP}-verify.R`])).toContain('netmeta::discomb');
  expect(decode(files[`${APP}-verify.R`])).toContain('forest(dc, pooled = "random"');
  expect(decode(files[`${APP}-verify-comparison.csv`]).trim().split('\n')).toHaveLength(22);
  expect(decode(files[`${APP}-forest-R.pdf`]).slice(0, 5)).toBe('%PDF-');
  const png = decodePng(files[`${APP}-forest-R-300dpi.png`]);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tiff = readTiff(files[`${APP}-forest-R-300dpi.tiff`]);
  expect(tiff.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(files['truthcert.json']));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${Object.keys(files).length} entries; PNG/PDF/TIFF/SVG and receipt checked`);
  await page.evaluate(() => AlmFeatures.open('component-nma', 'text'));
  await expect(page.locator('.alm-text-body')).toContainText('Results were independently verified in R');
  const original = await page.locator('#src').inputValue();
  await page.locator('#src').fill(original.replace('-0.45', '-0.46'));
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  // context() may rerun the app; verifiedCurrent must still reject the changed input hash.
  await expect(page.locator('.alm-text-body')).not.toContainText('Results were independently verified in R');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('component-nma'))).toBe(false);
  await page.locator('#src').fill(original); await page.locator('#btn-run').click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'components_0_est', delta: .01 }; AlmFeatures.open('component-nma', 'verify'); });
  await run.click();
  await expect(summary).toContainText('20 of 21 quantities match R — FAIL', { timeout: 300_000 });
  const planted = await page.evaluate(() => AlmFeaturesState.verify);
  expect(planted.rows.filter(r => !r.pass).map(r => r.key)).toEqual(['components_0_est']);
  console.log(`VERIFY planted ${planted.nPassed}/${planted.n}`);
});

test('SHARE: complete state round trip and corrupted/invalid links leave the example untouched', async ({ page, browser }) => {
  await open(page, 'share');
  const defaultSrc = await page.locator('#src').inputValue();
  const defaultResult = await page.evaluate(() => _almLastCnma());
  const changed = defaultSrc.replace('-0.45', '-0.65');
  await page.locator('#src').fill(changed); await page.locator('#btn-run').click();
  const result = await page.evaluate(() => _almLastCnma());
  const saved = await page.evaluate(() => {
    AlmFeaturesState.entryLog = [{ study: 'Example row', method: 'scale confirmed', citation: 'User confirmation', inputs: { scale: 'analysis' } }];
    AlmFeaturesState.provenance = [{ id: 'example', label: 'Built-in example', reference: 'Synthetic test data', location: 'Input row one',
      pastedText: document.getElementById('src').value.split('\n')[0], values: [], conversions: [], flags: [], confirmed: true }];
    return { log: AlmFeaturesState.entryLog, provenance: AlmFeaturesState.provenance };
  });
  const options = await page.locator('main select, main input').count();
  expect(options, 'this app has no estimator/scale option controls').toBe(0);
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.getByLabel('Share link', { exact: true })).toHaveValue(/#s=/);
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const ctx = await browser.newContext();
  try {
    const p2 = await ctx.newPage(); await p2.goto(link);
    await expect(p2.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await p2.locator('#src').inputValue()).toBe(changed);
    sameResult(await p2.evaluate(() => _almLastCnma()), result);
    expect(await p2.evaluate(() => AlmFeaturesState.entryLog)).toEqual(saved.log);
    expect(await p2.evaluate(() => AlmFeaturesState.provenance)).toEqual(saved.provenance);
    // Fresh contexts prevent autosave from masking a failed restore.
  } finally { await ctx.close(); }
  const invalid = await page.evaluate(() => AlmShare.encode('component-nma', { src: 'broken data' }, []));
  for (const suffix of [link.split('#s=')[1].slice(0, -10), invalid]) {
    const fresh = await browser.newContext();
    try {
      const p = await fresh.newPage(); await p.goto(link.split('#')[0] + '#s=' + suffix);
      await expect(p.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      expect(await p.locator('#src').inputValue()).toBe(defaultSrc);
      sameResult(await p.evaluate(() => _almLastCnma()), defaultResult);
      expect(await p.evaluate(() => AlmFeaturesState.provenance)).toEqual([]);
    } finally { await fresh.close(); }
  }
  console.log('SHARE 3/3 (round trip, truncated link, invalid app state)');
});

test('AXE: all four feature tabs have no serious/critical findings after animations finish', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, 'entry');
  await expect(page.locator('#alm-features [role=tab]')).toHaveCount(4);
  for (const key of ['entry', 'text', 'verify', 'share']) {
    await page.evaluate(tab => AlmFeatures.open('component-nma', tab), key);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const out = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = out.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    console.log(`AXE ${key}: ${out.passes.length} rules passed; ${bad.length} serious/critical`);
    expect(bad).toEqual([]);
  }
  expect(errors).toEqual([]);
});
