import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const APP = 'limit-ma', PAGE = '/limit-ma/index.html';
const SNAP = new URL('./__snapshots__/text-limit-ma.json', import.meta.url);
async function open(page, query = '') {
  await page.goto(PAGE + query);
  await expect(page.locator('#body tr')).toHaveCount(3);
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
  await page.locator('#alm-features .alm-f-toggle').click();
}
async function tab(page, name) { await page.getByRole('tab', { name, exact: true }).click(); }
async function report(page) {
  return page.evaluate(() => {
    const s = AlmFeatures.get('limit-ma').text, r = s.results();
    const ctx = { app: 'limit-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(s.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { audit: AlmText.audit(rendered, r, { ctx, dom: s.dom() }),
      snapshot: { app: 'limit-ma', source: 'Built-in effect/SE example; DL variance and beta0 adjustment.',
        plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
        flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) } };
  });
}

test('LAYOUT: the feature host does not shift the existing results or sensitivity plots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  async function capture() {
    await page.goto(PAGE);
    await page.evaluate(async () => {
      await AlmLimitPlusReady;
      AlmLimitPlusUI.run();
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
    });
    return page.evaluate(() => Object.fromEntries(['src', 'btn-run', 'plot', 'loo-plot', 'plus-forest', 'plus-funnel'].map(id => {
      const n = document.getElementById(id), r = n.getBoundingClientRect();
      return [id, { x: r.x, y: r.y, width: r.width, height: r.height, svg: n.tagName.toLowerCase() === 'svg' ? n.innerHTML : null }];
    })));
  }
  const mounted = await capture();
  await expect(page.locator('#alm-features .alm-f-toggle')).toBeVisible();
  await page.route('**/limit-ma/index.html', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('<div id="alm-features"></div>', '') });
  });
  const withoutFeatureHost = await capture();
  await expect(page.locator('#alm-features')).toHaveCount(0);
  expect(mounted).toEqual(withoutFeatureHost);
});

test('LIFECYCLE: report checks preserve pending input and completed leave-one-out', async ({ page }) => {
  await open(page); await tab(page, 'Report text');
  await expect(page.locator('.alm-text-body')).toBeVisible();
  const before = await page.evaluate(() => ({ result: structuredClone(_almLastLimit()), plot: document.getElementById('plot').innerHTML }));
  const original = await page.locator('#src').inputValue();
  await page.locator('#src').fill(original.replace('0.55', '0.56'));
  // This status proves the deferred report check ran, rather than racing its timer.
  await expect(page.locator('.alm-text-status')).toContainText('press Run analysis');
  await expect(page.locator('#analysis-stale')).toBeVisible();
  expect(await page.evaluate(() => ({ result: structuredClone(_almLastLimit()), plot: document.getElementById('plot').innerHTML }))).toEqual(before);
  await page.locator('#btn-run').click();
  await expect(page.locator('#analysis-stale')).toBeHidden();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await page.locator('#loo-run').click();
  await expect(page.locator('#loo-body tr')).toHaveCount(10);
  const completed = await page.evaluate(() => structuredClone(_almLastLimit()));
  await page.locator('.alm-text-regenerate').click();
  expect(await page.evaluate(() => structuredClone(_almLastLimit()))).toEqual(completed);
  expect(await page.evaluate(() => AlmFeatures.liveAdapter(AlmFeatures.get('limit-ma')).currentState().values.length)).toBe(32);
  await page.locator('#src').fill(original);
  await expect(page.locator('#loo-body tr')).toHaveCount(0);
  await expect(page.locator('#loo-csv')).toBeDisabled();
});

test('ENTRY: three table formats reproduce the built-in example through the shared APIs', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('limit-ma'), expected = structuredClone(_almLastLimit());
    const rows = document.getElementById('src').value.split('\n').map(l => {
      const [yi, sei, study] = l.split(',').map(s => s.trim()); return { study, yi: +yi, sei: +sei };
    });
    const z = 1.959963984540054;
    const formats = [
      'Study\tyi\tsei\n' + rows.map(r => `${r.study}\t${r.yi}\t${r.sei}`).join('\n'),
      'Study  Mean difference\n' + rows.map(r => `${r.study}  ${r.yi} (${r.yi-z*r.sei}–${r.yi+z*r.sei})`).join('\n'),
      // An unqualified "Effect" header needs measure confirmation in v2-core.
      // This no-question round trip declares the same difference scale as the CI table.
      'Study ID;Mean difference;Standard error\n' + rows.map(r => `${r.study};${r.yi};${r.sei}`).join('\n'),
    ];
    return { expected, outputs: formats.map(src => {
      const t = AlmEntry.parseTable(src), d = AlmEntry.detect(t, spec.entry.schema);
      const c = AlmEntry.convert(t, d, spec.entry.schema);
      if (c.flags.some(f => f.blocking)) return { flags: c.flags };
      const applied = spec.entry.apply(c.records);
      // This mirrors the shared UI's post-apply log persistence; no entry UI controls are clicked.
      if (c.steps.length) AlmFeaturesState.entryLog = c.steps;
      return { applied, flags: c.flags, questions: c.questions, steps: c.steps, result: structuredClone(_almLastLimit()),
        source: document.getElementById('src').value };
    }) };
  });
  for (const o of out.outputs) {
    expect(o.flags.filter(f => f.blocking)).toEqual([]);
    expect(o.questions).toEqual([]);
    expect(o.applied).toEqual({ ok: true, n: out.expected.k });
    expect(o.result.k).toBe(out.expected.k);
    for (const key of ['fe_est', 're_est', 'limit_est', 'limit_se']) {
      expect(Math.abs(o.result[key] - out.expected[key]) / Math.abs(out.expected[key]), key).toBeLessThanOrEqual(1e-9);
    }
    expect(o.source.split('\n')).toHaveLength(10);
  }
  expect(out.outputs[1].steps).toHaveLength(10);
  expect(out.outputs[2].steps).toHaveLength(0);
  await tab(page, 'Report text');
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).toContainText('Data-entry conversions');
  console.log('ENTRYRT 3/3 rows=10 conversionSteps=10');
});

test('ENTRY: an ambiguous effect requires measure confirmation before use', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => ({ source: document.getElementById('src').value, result: structuredClone(_almLastLimit()) }));
  const pending = await page.evaluate(() => {
    const spec = AlmFeatures.get('limit-ma');
    const rows = document.getElementById('src').value.split('\n').map(line => {
      const [yi, sei, study] = line.split(',').map(s => s.trim());
      return `${study};${yi};${sei}`;
    });
    const src = 'Study ID;Effect;Standard error\n' + rows.join('\n');
    const table = AlmEntry.parseTable(src), converted = AlmEntry.convert(table, AlmEntry.detect(table, spec.entry.schema), spec.entry.schema);
    const host = document.createElement('div'); host.id = 'entry-confirm-probe'; document.body.append(host);
    const ui = AlmEntryUI.mount(host, { schema: spec.entry.schema, apply: spec.entry.apply });
    host.querySelector('textarea').value = src; ui.parse();
    return { flags: converted.flags, questions: converted.questions };
  });
  expect(pending.flags.filter(f => f.blocking)).toEqual([
    expect.objectContaining({ code: 'unanswered-question', questionId: 'measure:type', blocking: true }),
  ]);
  expect(pending.questions).toEqual([
    expect.objectContaining({ id: 'measure:type', choices: ['ratio', 'difference'] }),
  ]);
  const host = page.locator('#entry-confirm-probe'), use = host.getByRole('button', { name: 'Use these rows', exact: true });
  await expect(use).toBeDisabled();
  expect(await page.evaluate(() => ({ source: document.getElementById('src').value, result: structuredClone(_almLastLimit()) }))).toEqual(before);
  await host.getByRole('radio', { name: 'difference', exact: true }).check();
  await expect(use).toBeEnabled();
  await use.click();
  const after = await page.evaluate(() => ({ result: structuredClone(_almLastLimit()), log: AlmFeaturesState.entryLog }));
  expect(after.result).toEqual(before.result);
  expect(after.log).toEqual([
    expect.objectContaining({ method: 'measure confirmed', inputs: { measure: 'difference' }, citation: 'User confirmation' }),
  ]);
});

test('ENTRY PLANTED: an estimate outside its CI blocks use; invalid app rows leave results intact', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('limit-ma'), before = __almLimitValidationSnapshot();
    const src = 'Study\tMean difference\nBad\t0.55 (0.80–0.90)';
    const t = AlmEntry.parseTable(src), c = AlmEntry.convert(t, AlmEntry.detect(t, 'generic'), 'generic');
    // Exercise the stable shared mount/parse API, not the evolving entry control click sequence.
    const host = document.createElement('div'); host.id = 'entry-api-probe'; document.body.append(host);
    const ui = AlmEntryUI.mount(host, { schema: 'generic', apply: spec.entry.apply });
    host.querySelector('textarea').value = src; ui.parse();
    const disabled = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Use these rows').disabled;
    const errors = [];
    for (const records of [
      [{ study: 'A', yi: .1, sei: -.1 }, { study: 'B', yi: .2, sei: .2 }, { study: 'C', yi: .3, sei: .3 }],
      [{ study: 'A,wrong', yi: .1, sei: .1 }, { study: 'B', yi: .2, sei: .2 }, { study: 'C', yi: .3, sei: .3 }],
    ]) { try { spec.entry.apply(records); errors.push('UNSAFE PASS'); } catch (e) { errors.push(e.message); } }
    return { flags: c.flags, disabled, errors, unchanged: JSON.stringify(before) === JSON.stringify(__almLimitValidationSnapshot()) };
  });
  expect(out.flags).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'estimate-outside', blocking: true })]));
  expect(out.disabled).toBe(true);
  expect(out.errors).toHaveLength(2); expect(out.errors).not.toContain('UNSAFE PASS'); expect(out.unchanged).toBe(true);
  await expect(page.locator('#entry-api-probe')).toContainText('Conversion log');
  await expect(page.locator('#entry-api-probe')).toContainText('SE estimated from CI');
  console.log('ENTRY BLOCK 3/3 (CI gate, negative SE, unrepresentable label)');
});

test('TEXT: number audit, all displayed table values, reviewed snapshot and exports', async ({ page }, info) => {
  await open(page);
  const out = await report(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]); expect(out.audit.ok).toBe(true); expect(out.audit.domChecked).toBe(12);
  const shown = await page.locator('#body tr').evaluateAll(rows => rows.flatMap(row => [row.cells[1].textContent, row.cells[2].textContent,
    ...row.cells[3].textContent.slice(1, -1).split(',').map(x => x.trim())]));
  for (const value of shown) expect(out.snapshot.results).toContain(value);
  console.log(`TEXTDOM ${shown.length}/${shown.length}`);
  const actual = info.outputPath('text-limit-ma.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('text-limit-ma', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await tab(page, 'Report text');
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.snapshot.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-docx').click()]);
  const zip = readZip(fs.readFileSync(await docx.path()));
  expect(zip.map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  expect(new TextDecoder().decode(zip.find(e => e.name === 'word/document.xml').bytes)).toContain('Limit (Rücker)');
  console.log('TEXTEXPORT 2/2');
});

test('TEXT PLANTED: DOM discrepancy fails audit and withholds prose', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'limit_est', delta: .1 }; });
  const out = await report(page);
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}`);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:limit_est');
  await tab(page, 'Report text');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
});

test('VERIFY: live browser R, funnel artifacts, current-state text gate and planted defect', async ({ page }) => {
  test.setTimeout(900000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // v2-core only honours planted verification defects on an explicitly opted-in page.
  await open(page, '?almtest=1'); await tab(page, 'Verify in R');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const run = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await run.click();
  await expect(summary).not.toBeEmpty({ timeout: 600000 });
  const message = await summary.textContent();
  // Missing pinned packages are a documented honest outcome, never a fabricated PASS.
  if (message.startsWith('Not checked')) {
    expect(message).toMatch(/R package (meta|metasens) is unavailable/);
    const [script] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'R script (.R)', exact: true }).click()]);
    expect(fs.readFileSync(await script.path(), 'utf8')).toContain('metasens::limitmeta');
    expect(await page.evaluate(() => AlmFeaturesState.verify.passed)).toBe(false);
    await expect(panel.locator('td[data-result=pass]')).toHaveCount(0);
    console.log('VERIFY unavailable: ' + message); return;
  }
  expect(message).toBe('32 of 32 computed quantities match R; 0 not computed — PASS');
  const state = await page.evaluate(() => AlmFeaturesState.verify);
  expect(state).toMatchObject({ n: 32, nPassed: 32, nNotComputed: 0, nOptional: 0, nNotApplicable: 0, passed: true, testHook: false });
  expect(state.rows).toHaveLength(32); expect(state.rows.every(r => r.pass)).toBe(true);
  expect(state.versions).toMatchObject({ meta: '8.3-0', metasens: '1.5-3' });
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('limit-ma'))).toBe(true);
  console.log(`VERIFY ${state.nPassed}/${state.n} versions=${JSON.stringify(state.versions)}`);
  await expect(panel.locator('figure img')).toHaveCount(1); await expect(panel.locator('figure svg')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = readZip(fs.readFileSync(await dl.path())), files = Object.fromEntries(entries.map(e => [e.name, e.bytes]));
  const required = ['limit-ma-verify.R', 'limit-ma-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'limit-ma-funnel-R-300dpi.png', 'limit-ma-funnel-R.pdf', 'limit-ma-funnel-R-300dpi.tiff', 'truthcert.json'];
  for (const name of required) expect(files[name], name).toBeDefined();
  expect(Object.keys(files).filter(n => /^limit-ma-funnel-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const dec = b => new TextDecoder().decode(b);
  expect(dec(files['limit-ma-verify.R'])).toContain('meta::funnel(l)');
  expect(dec(files['limit-ma-verify.R'])).toContain('print(sessionInfo())');
  expect(dec(files['limit-ma-verify-comparison.csv']).trim().split('\n')).toHaveLength(33);
  expect(dec(files['limit-ma-funnel-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(files['limit-ma-funnel-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
  const tif = readTiff(files['limit-ma-funnel-R-300dpi.tiff']);
  expect(tif.tags[282].value).toEqual([300, 1]); expect(tif.tags[283].value).toEqual([300, 1]);
  const receipt = JSON.parse(dec(files['truthcert.json']));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${required.length + 1}/${required.length + 1} artifacts, PNG/TIFF 300dpi`);
  await tab(page, 'Report text'); await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).toContainText('independently verified in R');
  const original = await page.locator('#src').inputValue();
  await page.locator('#src').fill(original.replace('0.55', '0.56'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('limit-ma'))).toBe(false);
  // Generate from the new analysis, and ensure the earlier verification cannot be claimed.
  await page.locator('#btn-run').click(); await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('independently verified in R');
  await page.locator('#src').fill(original); await page.locator('#btn-run').click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'limit_est', delta: .01 }; });
  await tab(page, 'Verify in R'); await run.click();
  await expect(summary).toHaveText('TEST MODE (test hook active; not a verification) — 31 of 32 computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active', { timeout: 300000 });
  await expect(summary).toHaveAttribute('data-test-mode', 'true');
  expect(await page.evaluate(() => AlmFeaturesState.verify)).toMatchObject({
    n: 32, nPassed: 31, nNotComputed: 0, passed: false, testHook: true,
    perturbed: { key: 'limit_est', delta: .01 },
  });
  expect(await page.evaluate(() => AlmFeaturesState.verify.rows.filter(r => !r.pass).map(r => r.key))).toEqual(['limit_est']);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('limit-ma'))).toBe(false);
  // Keep quantity diagnostics distinct from TEST.ps1's "N failed" test-summary parser.
  console.log('VERIFY planted 31/32; expected failing quantity=limit_est');
  expect(errors).toEqual([]);
});

test('SHARE: full state round trip; corrupt payload and invalid options change nothing', async ({ page, browser }) => {
  await open(page);
  const defaultSrc = await page.locator('#src').inputValue();
  await page.locator('#src').fill(defaultSrc.replace('0.55', '0.56')); await page.locator('#btn-run').click();
  await page.locator('#plus-alpha').fill('0.15');
  await page.locator('#alm-plus details summary').click();
  await page.locator('#plus-binary-measure').selectOption('OR');
  await page.locator('#plus-binary-counts').fill('1, 10, 2, 10');
  await page.locator('#plus-fill-toggle').uncheck(); await page.locator('#plus-contour-toggle').check();
  await page.locator('[data-axis=x][data-edge=min]').fill('-1');
  await page.locator('[data-axis=x][data-edge=min]').dispatchEvent('change');
  await page.locator('[data-axis=y][data-edge=max]').fill('0.4');
  await page.locator('[data-axis=y][data-edge=max]').dispatchEvent('change');
  const before = await page.evaluate(() => ({ state: AlmFeatures.get('limit-ma').share.get(), result: _almLastLimit() }));
  await tab(page, 'Share'); await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('#alm-f-share-link')).toHaveValue(/#s=.+/);
  const link = await page.locator('#alm-f-share-link').inputValue();
  const context = await browser.newContext(), next = await context.newPage();
  try {
    await next.goto(link); await expect(next.locator('[data-testid=share-status]')).toContainText('Analysis restored');
    expect(await next.evaluate(() => ({ state: AlmFeatures.get('limit-ma').share.get(), result: _almLastLimit() }))).toEqual(before);
    const invalid = await page.evaluate(async () => {
      const s = AlmFeatures.get('limit-ma').share.get(); s.options['plus-alpha'] = 'bad';
      return AlmShare.encode('limit-ma', s, []);
    });
    for (const payload of ['corrupted-payload', invalid]) {
      const badContext = await browser.newContext(), bad = await badContext.newPage();
      try {
        await bad.goto(link.split('#')[0] + '#s=' + payload);
        await expect(bad.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
        expect(await bad.locator('#src').inputValue()).toBe(defaultSrc);
        await expect(bad.locator('#plus-alpha')).toHaveValue('0.10');
        expect(await bad.evaluate(() => _almLastLimit().limit_est)).not.toBe(before.result.limit_est);
      } finally { await badContext.close(); }
    }
  } finally { await context.close(); }
  console.log('SHARE 3/3 (round trip, corrupt link, invalid options)');
});

test('AXE: all four feature tabs have no serious or critical violations', async ({ page }) => {
  await open(page);
  for (const name of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await tab(page, name);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const out = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(out.violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  }
  console.log('AXE 4/4 tabs without serious/critical violations');
});

test('ENTRY TEXT: conversion steps retain methods and citations without mutating provenance', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('limit-ma');
    const rows = document.getElementById('src').value.split('\n').map(line => {
      const [yi, sei, study] = line.split(',').map(s => s.trim());
      return { yi: +yi, sei: +sei, study };
    });
    const z = 1.959963984540054;
    const table = AlmEntry.parseTable('Study\tMean difference\n' + rows.map(r =>
      `${r.study}\t${r.yi} (${r.yi-z*r.sei}–${r.yi+z*r.sei})`).join('\n'));
    const converted = AlmEntry.convert(table, AlmEntry.detect(table, 'generic'), 'generic');
    spec.entry.apply(converted.records);
    // A repeated step for the same study must not inflate the study count.
    AlmFeaturesState.entryLog = converted.steps.concat(converted.steps[0]);
    const stored = JSON.stringify(AlmFeaturesState.entryLog);
    const ctx = AlmText.context('limit-ma', spec.text), r = spec.text.results();
    const rendered = AlmText.render(spec.text.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.text.dom() });
    const foreign = AlmText.context('proportion-ma', spec.text);
    const legacy = {
      methods: rendered.methods.text, audit, summary: AlmText.entrySummary(ctx.entryLog),
      method: converted.steps[0].method, citation: converted.steps[0].citation,
      unchanged: JSON.stringify(AlmFeaturesState.entryLog) === stored,
      foreignUnchanged: JSON.stringify(foreign.entryLog) === stored,
      sharedStateUnchanged: JSON.stringify(spec.share.get().entryLog) === stored,
    };
    // Full per-study provenance still takes precedence over the legacy log.
    // Synthetic provenance for the built-in example: ten reports need ten identities.
    // Repeating a reference denotes multiple rows from one report in v2-core.
    const records = rows.map((row, i) => ({ id: row.study, label: row.study, reference: `Built-in fixture report ${row.study}`,
      location: 'Table 2', conversions: [converted.steps[i]], flags: [], method: 'source extraction' }));
    AlmFeaturesState.provenance = records;
    const provenanceCtx = AlmText.context('limit-ma', spec.text);
    const provenanceText = AlmText.render(spec.text.templates, r, provenanceCtx);
    const provenance = { methods: provenanceText.methods.text, summary: AlmText.entrySummary(provenanceCtx.entryLog),
      audit: AlmText.audit(provenanceText, r, { ctx: provenanceCtx, dom: spec.text.dom() }),
      unchanged: JSON.stringify(provenanceCtx.entryLog) === JSON.stringify(records) };
    // Preserve the original repeated-reference case as a regression against counting rows as reports.
    const repeated = records.map(record => ({ ...record, reference: 'Trial report' }));
    AlmFeaturesState.provenance = repeated;
    const repeatedStored = JSON.stringify(repeated), repeatedCtx = AlmText.context('limit-ma', spec.text);
    const repeatedText = AlmText.render(spec.text.templates, r, repeatedCtx);
    const sharedReport = { methods: repeatedText.methods.text, summary: AlmText.entrySummary(repeatedCtx.entryLog),
      audit: AlmText.audit(repeatedText, r, { ctx: repeatedCtx, dom: spec.text.dom() }),
      unchanged: JSON.stringify(repeatedCtx.entryLog) === repeatedStored && JSON.stringify(AlmFeaturesState.provenance) === repeatedStored };
    AlmFeaturesState.provenance = [];
    return { legacy, provenance, sharedReport };
  });
  expect(out.legacy.summary.reports).toBe(0);
  expect(out.legacy.summary.groups).toHaveLength(1);
  expect(out.legacy.summary.groups[0].count).toBe(10);
  expect(out.legacy.methods).toContain('Data-entry conversions');
  expect(out.legacy.methods).toContain(out.legacy.method);
  expect(out.legacy.methods).toContain(out.legacy.citation);
  expect(out.legacy.methods).toContain('for 10 studies');
  expect(out.legacy.methods).not.toContain('Data were extracted');
  for (const key of ['unchanged', 'foreignUnchanged', 'sharedStateUnchanged']) expect(out.legacy[key], key).toBe(true);
  expect(out.legacy.audit.failures).toEqual([]);
  expect(out.provenance.unchanged).toBe(true);
  expect(out.provenance.methods).toContain('Data were extracted from 10 reports (source location recorded for each study)');
  expect(out.provenance.methods).toContain(out.legacy.method);
  expect(out.provenance.audit.failures).toEqual([]);
  expect(out.provenance.summary).toMatchObject({ reports: 10, rows: 10, detail: null, allLocated: true });
  expect(out.sharedReport.summary).toMatchObject({ reports: 1, rows: 10, detail: 'rows', allLocated: true });
  expect(out.sharedReport.methods).toContain('Data were extracted from 1 report (10 rows; source location recorded for each)');
  expect(out.sharedReport.methods).toContain(out.legacy.method);
  expect(out.sharedReport.methods).toContain(out.legacy.citation);
  expect(out.sharedReport.methods).not.toContain('Data were extracted from 10 reports');
  expect(out.sharedReport.audit.failures).toEqual([]);
  expect(out.sharedReport.unchanged).toBe(true);
  await tab(page, 'Report text');
  await expect(page.locator('[data-para=methods]')).toHaveText(out.legacy.methods);
  await expect(page.locator('.alm-text-body')).toBeVisible();
  console.log(`ENTRYTEXT legacy=${out.legacy.audit.passed}/${out.legacy.audit.checks} provenance=${out.provenance.audit.passed}/${out.provenance.audit.checks}`);
});
