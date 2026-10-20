import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, decodePng, readTiff } from './zip-reader.mjs';

const APP = 'dose-response-ma';
const PAGE = '/dose-response-ma/index.html';
const SNAP = new URL('./__snapshots__/text-dose-response-ma.json', import.meta.url);
async function open(page, tab = 'Data entry') {
  await page.goto(PAGE);
  await expect(page.locator('#coef-body tr')).toHaveCount(1);
  await page.locator('#alm-features .alm-f-toggle').click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function report(page) {
  return page.evaluate(() => {
    const spec = AlmDoseFeatures.text, r = spec.results();
    const ctx = { app: 'dose-response-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return { audit, snapshot: {
      app: 'dose-response-ma', source: 'built-in alcohol_cvd example; linear, two-stage, REML, Greenland–Longnecker',
      plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
      flags: rendered.flags.map(norm)
    } };
  });
}
async function scan(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const out = await new AxeBuilder({ page }).include('#alm-features')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = out.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${name} ${out.passes.length} passed; ${bad.length} serious/critical`);
  expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('ENTRY: three explicit formats preserve the built-in example and log conversions', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const initial = structuredClone(_almLastDoseResponse());
    const rows = document.getElementById('f-data').value.split('\n').filter(l => !l.startsWith('#'))
      .map(l => l.split(',').map(c => c.trim()));
    // The shared converter requires all schema fields. SE=0 is an explicitly
    // documented reference marker; apply writes the app's original blank SE.
    const formats = [
      ['study\tdose\tcases\tn\tlog RR\tSE\ttype', ...rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5] || '0', r[6]].join('\t'))].join('\n'),
      ['study  dose  cases  log RR  SE  type', ...rows.map(r => [r[0], r[1], r[2] + '/' + r[3], r[4], r[5] || '0', r[6]].join('  '))].join('\n'),
      ['Study ID;Dose;Cases;Total;log RR;Standard error;type', ...rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5] || '0', r[6]].join(';'))].join('\n')
    ];
    const runs = formats.map(text => {
      const table = AlmEntry.parseTable(text);
      const detection = AlmEntry.detect(table, 'dose');
      // An explicit passthrough mapping, as used by the shared UI for extras.
      const typeColumn = table.header.indexOf('type');
      detection.mapping[typeColumn] = 'type';
      detection.questions = detection.questions.filter(q => q.id !== 'column:' + typeColumn);
      const converted = AlmEntry.convert(table, detection, 'dose');
      if (converted.flags.some(f => f.blocking)) return { flags: converted.flags };
      const applied = AlmDoseFeatures.entry.apply(converted.records);
      AlmFeaturesState.entryLog = converted.steps;
      return { applied, result: structuredClone(_almLastDoseResponse()), records: converted.records,
        log: converted.steps, expectedCounts: rows.map(r => [+r[2], +r[3]]) };
    });
    return { initial, runs, paper: formats[1] };
  });
  for (const run of out.runs) {
    expect(run.flags).toBeUndefined();
    expect(run.applied).toEqual({ ok: true, n: 25 });
    expect(run.records.map(r => [r.cases, r.n])).toEqual(run.expectedCounts);
    expect(run.records.map(r => r.type)).toEqual(expect.arrayContaining(['cc', 'ci']));
    expect(run.result.k).toBe(out.initial.k);
    expect(Math.abs(run.result.slope - out.initial.slope) / Math.abs(out.initial.slope)).toBeLessThanOrEqual(1e-9);
    expect(run.result.predictions).toEqual(out.initial.predictions);
    expect(run.log.length).toBeGreaterThan(0);
  }
  console.log(`ENTRYRT ${out.runs.length}/${out.runs.length} counts exact; slope relative tolerance 1e-9`);
  // Only the sanity UI gate is exercised through controls; round trips above
  // deliberately use the APIs, independent of the parallel entry UI upgrade.
  const panel = page.locator('#alm-f-panel-entry');
  await panel.locator('textarea').fill(out.paper.replace('126/414', '415/414'));
  await panel.getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
  await expect(panel).toContainText('cases must be between 0 and n');
  await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  const bad = await page.evaluate(() => {
    const before = AlmDoseFeatures.share.get();
    try { AlmDoseFeatures.entry.apply([{ study: 'bad', dose: 1, cases: 3, n: 2, yi: 0, sei: 0, type: 'cc' }]); }
    catch (e) { return { error: e.message, unchanged: JSON.stringify(before) === JSON.stringify(AlmDoseFeatures.share.get()) }; }
  });
  expect(bad.unchanged).toBe(true);
  console.log('ENTRY planted bounds gate FAIL; inputs unchanged');
});

test('TEXT: number audit, page digits, snapshot and downloads', async ({ page }, info) => {
  await open(page, 'Report text');
  const out = await report(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);
  const actual = JSON.stringify(out.snapshot, null, 2) + '\n';
  fs.writeFileSync(info.outputPath('text-dose-response-ma.json'), actual);
  await info.attach('text-dose-response-ma.json', { path: info.outputPath('text-dose-response-ma.json'), contentType: 'application/json' });
  const shown = await page.locator('#coef-body tr td').allTextContents();
  const text = out.snapshot.results.replace(/−/g, '-');
  for (const cell of shown) expect(text).toContain(cell);
  console.log(`TEXTDOM ${shown.length}/${shown.length}`);
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  const panel = page.locator('#alm-f-panel-text');
  await expect(panel.locator('.alm-text-audit')).toContainText('checks passed');
  for (const [selector, ext] of [['.alm-text-md', 'md'], ['.alm-text-docx', 'docx']]) {
    const [download] = await Promise.all([page.waitForEvent('download'), panel.locator(selector).click()]);
    expect(download.suggestedFilename()).toBe(`${APP}-report-text.${ext}`);
    const bytes = fs.readFileSync(await download.path());
    if (ext === 'md') expect(bytes.toString('utf8')).toContain(out.snapshot.results);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  }
});

test('TEXT PLANTED: a displayed coefficient defect withholds report text', async ({ page }) => {
  await open(page, 'Report text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'coef_0_1_0', delta: 0.1 }; });
  const out = await report(page);
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}`);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.some(f => f.check === 'dom:coef_0_1_0')).toBe(true);
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
});

test('TEXT: supported model variants retain a passing audit and accurate method wording', async ({ page }) => {
  await open(page, 'Report text');
  const before = await page.evaluate(() => AlmDoseFeatures.share.get());
  let passed = 0;
  for (const [shape, approach, method, covariance] of [
    ['linear', '2stage', 'REML', 'gl'], ['quadratic', '2stage', 'ML', 'h'],
    ['spline3', '2stage', 'MM', 'indep'], ['spline4', '2stage', 'FE', 'gl'],
    ['linear', '1stage', 'REML', 'gl'], ['linear', '2stage', 'PM', 'gl'],
    ['linear', '2stage', 'DL', 'gl']
  ]) {
    await page.evaluate(s => AlmDoseFeatures.share.set(s), {
      ...before, 'f-shape': shape, 'f-proc': approach, 'f-method': method, 'f-cov': covariance
    });
    const out = await report(page);
    expect(out.audit.failures, `${shape}/${approach}/${method}`).toEqual([]);
    expect(out.snapshot.methods).toContain('No Hartung–Knapp adjustment or prediction interval was computed');
    if (approach === '1stage') expect(out.snapshot.methods).toContain('Q and I² are not defined');
    if (['PM', 'DL'].includes(method)) expect(out.snapshot.methods).toContain('initial fixed-effect fit');
    passed++;
  }
  console.log(`TEXTVARIANTS ${passed}/7`);
});

test('VERIFY: real R comparison, curve exports, ZIP and planted defect', async ({ page }) => {
  test.setTimeout(900000);
  await open(page, 'Verify in R');
  const panel = page.locator('#alm-f-panel-verify');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  const summary = panel.getByTestId('verify-summary');
  await expect(summary).not.toBeEmpty({ timeout: 600000 });
  const message = await summary.textContent();
  if (message.includes('is unavailable')) {
    // Only an actual absence from the pinned repository may take this branch.
    const manifest = await (await page.request.get('/r-shiny/shinylive/webr/repo/manifest.json')).json();
    const missing = ['dosresmeta', 'mixmeta'].filter(p => !manifest.packages.some(row => row.package === p));
    expect(missing.length).toBeGreaterThan(0);
    expect(message).toContain(missing[0]);
    expect(message).not.toContain('PASS');
    await expect(panel.getByRole('button', { name: 'R script (.R)', exact: true })).toBeVisible();
    expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('dose-response-ma'))).toBe(false);
    console.log(`VERIFY unavailable: ${missing.join(',')}; no pass claimed`);
    return;
  }
  const match = /^(\d+) of (\d+) quantities match R — PASS$/.exec(message);
  expect(match, message).not.toBeNull();
  const n = +match[2];
  expect(n).toBeGreaterThanOrEqual(5);
  expect(+match[1]).toBe(n);
  console.log(`VERIFY ${match[1]}/${match[2]}`);
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(n).fill('PASS'));
  expect(await page.evaluate(() => AlmDoseFeatures.verify.adapter() === AlmDoseValidate)).toBe(true);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('dose-response-ma'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = Object.fromEntries(readZip(fs.readFileSync(await download.path())).map(e => [e.name, e.bytes]));
  for (const name of [`${APP}-verify.R`, `${APP}-verify-comparison.csv`, 'sessionInfo.txt', 'console.txt',
    `${APP}-curve-R-300dpi.png`, `${APP}-curve-R.pdf`, `${APP}-curve-R-300dpi.tiff`, 'truthcert.json']) expect(entries[name], name).toBeDefined();
  const png = decodePng(entries[`${APP}-curve-R-300dpi.png`]);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tif = readTiff(entries[`${APP}-curve-R-300dpi.tiff`]);
  expect(tif.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(new TextDecoder().decode(entries['truthcert.json']));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(entries).length} entries; PNG/TIFF and receipt checked`);
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'coef_0', delta: 0.1 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300000 });
  expect(await panel.locator('tr[data-key=coef_0] td[data-result]').textContent()).toBe('FAIL');
  console.log(`VERIFY planted ${n - 1}/${n}`);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('dose-response-ma'))).toBe(false);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('independently verified');
});

test('SHARE: all options and data round trip; corrupted and invalid states change nothing', async ({ page, context }) => {
  await open(page, 'Share');
  const initial = await page.evaluate(() => AlmDoseFeatures.share.get());
  const state = { ...initial, 'f-shape': 'splinec', 'f-knots': '0,10,30', 'f-cov': 'h', 'f-method': 'ML',
    'f-mod': true, 'f-modval': '3', 'f-xref': '5', 'f-pdoses': '0,20,40',
    'f-data': initial['f-data'].split('\n').map(l => l.startsWith('#') ? l : l + ', ' + l.split(',')[0]).join('\n'),
    entryLog: [{ study: 'example', method: 'explicit reference marker', text: 'Reference SE marker restored to blank', citation: 'App input convention' }] };
  await page.evaluate(s => AlmDoseFeatures.share.set(s), state);
  const expected = await page.evaluate(() => _almLastDoseResponse());
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.getByTestId('share-status')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const restored = await context.newPage();
  await restored.goto(link);
  await expect(restored.getByTestId('share-status')).toHaveText('Analysis restored from the share link.');
  expect(await restored.evaluate(() => AlmDoseFeatures.share.get())).toEqual(state);
  expect(await restored.evaluate(() => _almLastDoseResponse())).toEqual(expected);
  const broken = await context.newPage();
  await broken.goto(link.slice(0, -12));
  await expect(broken.getByTestId('share-status')).toContainText('Nothing was changed.');
  expect(await broken.evaluate(() => AlmDoseFeatures.share.get())).toEqual(initial);
  const invalid = await page.evaluate(async s => AlmShare.encode('dose-response-ma', { ...s, 'f-method': 'invented' }, []), state);
  await broken.goto(link.split('#')[0] + '#s=' + invalid);
  await expect(broken.getByTestId('share-status')).toContainText('Nothing was changed.');
  expect(await broken.evaluate(() => AlmDoseFeatures.share.get())).toEqual(initial);
  console.log('SHARE 3/3 round trip, corrupt payload, invalid option');
});

test('AXE: all four feature tabs have no serious or critical violations', async ({ page }) => {
  await open(page);
  for (const name of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await scan(page, name);
  }
});
