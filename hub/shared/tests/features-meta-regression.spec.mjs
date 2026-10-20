import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'meta-regression', PAGE = `/${APP}/index.html`;
const SNAP = fileURLToPath(new URL('./__snapshots__/text-meta-regression.json', import.meta.url));
async function open(page, tab = 'text') {
  await page.goto(PAGE);
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
  await page.evaluate(({ app, tab }) => AlmFeatures.open(app, tab), { app: APP, tab });
}
async function rendered(page) {
  return page.evaluate(app => {
    const s = AlmFeatures.get(app).text, r = s.results();
    const ctx = { app, build: AlmBuildInfo, entryLog: [], verify: null };
    const text = AlmText.render(s.templates, r, ctx);
    const norm = p => p.segments.map(v => v.type === 'ctx' && v.key.startsWith('build.') ? `<${v.key}>` : v.text).join('');
    return { audit: AlmText.audit(text, r, { ctx, dom: s.dom() }), r, dom: s.dom(),
      snapshot: { app, source: 'Built-in eight-study example; PM, floored Knapp–Hartung; location-scale off.',
        plain: norm(text.plain), methods: norm(text.methods), results: norm(text.results),
        flags: text.flags.map(norm), references: text.cites.map(c => c.full) } };
  }, APP);
}

test('ENTRY: three source formats reproduce the example through the shared conversion APIs', async ({ page }) => {
  await open(page, 'entry');
  const result = await page.evaluate(app => {
    const entry = AlmFeatures.get(app).entry;
    const baseline = __almResults(), original = _almLastStudies();
    const z = 1.959963984540054;
    const formats = [
      ['Excel TSV', ['Study\tEstimate\tSE\tmoderator', ...original.map(s => [s.label, s.est, s.se, s.x].join('\t'))].join('\n')],
      ['Paper table', ['Study  Estimate  moderator', ...original.map(s =>
        `${s.label}  ${s.est} (${s.est-z*s.se}–${s.est+z*s.se})  ${s.x}`)].join('\n')],
      ['RevMan generic inverse-variance TSV with moderator column',
        ['Study or Subgroup\tlog OR\tStandard Error\tmoderator', ...original.map(s => [s.label, s.est, s.se, s.x].join('\t'))].join('\n')]
    ];
    const outcomes = formats.map(([name, source]) => {
      const table = AlmEntry.parseTable(source), detection = AlmEntry.detect(table, entry.schema);
      // Same explicit extra-column mapping as AlmEntryUI, independent of its changing confirmation UI.
      table.header.forEach((h, i) => {
        if (entry.extras.includes(h)) {
          detection.mapping[i] = h;
          detection.questions = detection.questions.filter(q => q.id !== `column:${i}`);
        }
      });
      const converted = AlmEntry.convert(table, detection, entry.schema, { decimal: 'point' });
      const blocked = converted.flags.filter(f => f.blocking);
      if (blocked.length) return { name, blocked, converted };
      const applied = entry.apply(converted.records);
      AlmFeaturesState.entryLog = converted.steps;
      return { name, blocked, applied, baseline, actual: __almResults(), steps: converted.steps,
        rows: _almLastStudies(), original };
    });
    // Exercise the public UI parse API to prove that the actual conversion log is populated,
    // without clicking evolving source-confirmation controls.
    const host = document.createElement('div'); host.id = 'entry-log-probe'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, entry);
    ui.element.querySelector('textarea').value = formats[1][1]; ui.parse();
    return outcomes;
  }, APP);
  for (const f of result) {
    expect(f.blocked, JSON.stringify(f)).toEqual([]);
    expect(f.applied).toEqual({ ok: true, n: 8 });
    expect(f.actual.k).toBe(f.baseline.k);
    for (const key of ['intercept', 'slope', 'slope_se', 'tau2_pm', 'QE', 'R2_tau2']) {
      expect(Math.abs(f.actual[key] - f.baseline[key]) / Math.max(1, Math.abs(f.baseline[key])), `${f.name}: ${key}`).toBeLessThanOrEqual(1e-9);
    }
    expect(f.rows.map(r => r.x)).toEqual(f.original.map(r => r.x));
  }
  expect(result[1].steps).toHaveLength(8);
  expect(result[1].steps.every(s => /SE estimated from CI/.test(s.text))).toBe(true);
  await expect(page.locator('#entry-log-probe')).toContainText('SE estimated from CI');
  console.log(`ENTRYRT ${result.length}/${result.length} formats; 8/8 paper CI conversions`);
});

test('ENTRY planted invalid interval blocks use; invalid moderator/SE are rejected atomically', async ({ page }) => {
  await open(page, 'entry');
  const out = await page.evaluate(app => {
    const source = 'Study\tEstimate\tmoderator\nBad\t0.2 (0.5–0.1)\t32\nB\t0.3 (0.1–0.5)\t35\nC\t0.4 (0.2–0.6)\t38';
    const table = AlmEntry.parseTable(source), detection = AlmEntry.detect(table, 'generic');
    detection.mapping[2] = 'moderator'; detection.questions = detection.questions.filter(q => q.id !== 'column:2');
    const converted = AlmEntry.convert(table, detection, 'generic', { decimal: 'point' });
    const host = document.createElement('div'); host.id = 'entry-block-probe'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, AlmFeatures.get(app).entry);
    ui.element.querySelector('textarea').value = source; ui.parse();
    const before = document.getElementById('f-data').value;
    const good = _almLastStudies().map(s => ({ study: s.label, yi: s.est, sei: s.se, moderator: s.x }));
    const refused = [];
    for (const bad of [{ sei: 0 }, { moderator: '' }, { moderator: 'unknown' }]) {
      try { AlmFeatures.get(app).entry.apply(good.map((r, i) => i ? r : { ...r, ...bad })); refused.push(false); }
      catch { refused.push(true); }
    }
    return { blocked: converted.flags.some(f => f.blocking), refused, unchanged: before === document.getElementById('f-data').value };
  }, APP);
  expect(out).toEqual({ blocked: true, refused: [true, true, true], unchanged: true });
  await expect(page.locator('#entry-block-probe')).toContainText('Lower CI exceeds upper CI');
  await expect(page.locator('#entry-block-probe').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  console.log('ENTRY planted: blocking sanity check PASS; atomic refusals 3/3');
});

test('TEXT: audit, independent displayed values, snapshot, and report downloads', async ({ page }, info) => {
  await open(page);
  const out = await rendered(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);
  const shown = await page.locator('#stats-wrap .stat').evaluateAll(cs => Object.fromEntries(cs.map(c =>
    [c.querySelector('.k').textContent, c.querySelector('.v').textContent])));
  expect(out.snapshot.results).toContain(`Residual τ² = ${shown['τ² (PM)']}`);
  expect(out.snapshot.results).toContain(`R² = ${shown['R² (τ² explained)']}`);
  expect(out.snapshot.results).toContain(`HKSJ q = ${shown['HKSJ q']}`);
  expect(out.snapshot.results).toContain(`The permutation p-value was ${Object.entries(shown).find(([k]) => k.startsWith('β₁ permutation'))[1]}`);
  const slope = shown['β₁ (slope)'].match(/([-.\d]+) \[([-.\d]+), ([-.\d]+)\]/);
  expect(out.snapshot.results.replaceAll('−', '-')).toContain(`slope was ${slope[1]} (95% CI ${slope[2]} to ${slope[3]})`);
  console.log('TEXTDOM 5/5');
  fs.writeFileSync(info.outputPath('text-meta-regression.actual.json'), JSON.stringify(out.snapshot, null, 2) + '\n');
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  const panel = page.locator('#alm-f-panel-text');
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  for (const [selector, suffix] of [['.alm-text-md', '.md'], ['.alm-text-docx', '.docx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), panel.locator(selector).click()]);
    expect(dl.suggestedFilename()).toBe(APP + '-report-text' + suffix);
    const bytes = fs.readFileSync(await dl.path());
    if (suffix === '.md') expect(bytes.toString()).toContain(out.snapshot.results);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  }
});

test('TEXT planted DOM-cross-checked slope defect fails and withholds text; scale model is refused', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'slope', delta: 0.1 }; });
  const out = await rendered(page);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:slope');
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}`);
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await page.locator('#f-scale').check();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Paule–Mandel model only');
  await expect(page.locator('.alm-text-body')).toBeHidden();
});

test('VERIFY: real browser R, all comparisons, bubble plots, ZIP, stale claim and planted defect', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const button = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await button.click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const text = await summary.textContent();
  if (text.includes('unavailable')) {
    expect(text).toBe('Not checked in the browser: R package metafor is unavailable.');
    expect(await page.evaluate(() => AlmFeaturesState.verify.passed)).toBe(false);
    const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'R script (.R)', exact: true }).click()]);
    expect(fs.readFileSync(await dl.path(), 'utf8')).toContain('metafor::rma');
    console.log('VERIFY unavailable: metafor; no PASS claimed; R download present');
    return;
  }
  expect(text).toMatch(/^\d+ of \d+ quantities match R — PASS$/);
  const state = await page.evaluate(() => AlmFeaturesState.verify);
  console.log(`VERIFY ${state.nPassed}/${state.n}`);
  expect(state.n).toBeGreaterThanOrEqual(5);
  expect(state.rows.every(r => r.pass)).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [zip] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const files = Object.fromEntries(readZip(fs.readFileSync(await zip.path())).map(e => [e.name, e.bytes]));
  for (const name of [`${APP}-verify.R`, `${APP}-verify-comparison.csv`, 'sessionInfo.txt', 'console.txt',
    `${APP}-bubble-R-300dpi.png`, `${APP}-bubble-R.pdf`, `${APP}-bubble-R-300dpi.tiff`, 'truthcert.json']) expect(files[name], name).toBeDefined();
  expect(Object.keys(files).filter(n => /-bubble-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const dec = b => new TextDecoder().decode(b);
  const script = dec(files[`${APP}-verify.R`]);
  expect(script).toContain('mods=~x'); expect(script).toContain('test="adhoc"'); expect(script).toContain('QM=f$QM');
  expect(script).toContain('metafor::regplot'); expect(script).toContain('print(sessionInfo())');
  const png = decodePng(files[`${APP}-bubble-R-300dpi.png`]);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  expect(readTiff(files[`${APP}-bubble-R-300dpi.tiff`]).tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(dec(files['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(files).length} entries; PNG/TIFF 300dpi`);
  await page.evaluate(app => AlmFeatures.open(app, 'text'), APP);
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replace('-0.28', '-0.27'));
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  expect(await page.evaluate(app => AlmFeatures.verifiedCurrent(app), APP)).toBe(false);
  await page.locator('#btn-example').click();
  await page.evaluate(app => { window.__almVerifyPerturb = { key: 'slope', delta: 0.01 }; AlmFeatures.open(app, 'verify'); }, APP);
  await button.click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const failed = await page.evaluate(() => AlmFeaturesState.verify.rows.filter(r => !r.pass).map(r => r.key));
  expect(failed).toEqual(['slope']);
  console.log(`VERIFY planted ${state.n - 1}/${state.n}; slope FAIL`);
  expect(errors).toEqual([]);
});

test('SHARE: data and every option round trip; corrupt and invalid links leave defaults unchanged', async ({ page, browser }) => {
  await open(page, 'share');
  await page.locator('#f-data').fill('Alpha, -0.4, 0.15, 24\nBeta, -0.2, 0.12, 30\nGamma, 0.1, 0.2, 40\nDelta, 0.3, 0.1, 52');
  await page.locator('#f-title').fill('Shared example');
  await page.locator('#f-modlabel').fill('Age');
  await page.locator('#f-effectlabel').fill('Mean difference');
  await page.locator('#f-scale').check();
  await page.locator('[data-axis=x][data-edge=min]').fill('10');
  await page.locator('[data-axis=x][data-edge=min]').dispatchEvent('change');
  await page.locator('[data-axis=y][data-edge=log]').check();
  await page.locator('#btn-run').click();
  const before = await page.evaluate(app => ({ state: AlmFeatures.get(app).share.get(), result: __almResults() }), APP);
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const ctx = await browser.newContext(), restored = await ctx.newPage();
  try {
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(app => ({ state: AlmFeatures.get(app).share.get(), result: __almResults() }), APP)).toEqual(before);
    const bad = await browser.newContext(), badPage = await bad.newPage();
    try {
      await badPage.goto(link.split('#')[0] + '#s=corrupt!');
      await expect(badPage.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      expect(await badPage.locator('#f-title').inputValue()).toBe('Example meta-regression');
      expect(await badPage.locator('#f-scale').isChecked()).toBe(false);
      const atomic = await badPage.evaluate(app => {
        const s = AlmFeatures.get(app).share, before = s.get();
        try { s.set({ ...before, data: 'changed', axes: ['bad'] }); } catch {}
        return JSON.stringify(before) === JSON.stringify(s.get());
      }, APP);
      expect(atomic).toBe(true);
    } finally { await bad.close(); }
  } finally { await ctx.close(); }
  console.log('SHARE roundtrip and planted corrupt/invalid state 3/3');
});

test('AXE: every feature tab has no serious or critical accessibility violations', async ({ page }) => {
  await open(page, 'entry');
  for (const tab of ['entry', 'text', 'verify', 'share']) {
    await page.evaluate(({ app, tab }) => AlmFeatures.open(app, tab), { app: APP, tab });
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => null))));
    const scan = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = scan.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    console.log(`AXE ${tab}: ${scan.passes.length} rules passed; ${bad.length} serious/critical`);
  }
});
