import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const PAGE = '/nma/index.html';
const SNAP = new URL('./__snapshots__/text-nma.json', import.meta.url);
const EXAMPLE = [
  ['TRIAL1', 'Placebo', 'DrugA', -.22, .12], ['TRIAL2', 'Placebo', 'DrugA', -.31, .14],
  ['TRIAL3', 'Placebo', 'DrugB', -.15, .11], ['TRIAL4', 'Placebo', 'DrugB', -.19, .10],
  ['TRIAL5', 'Placebo', 'DrugC', -.05, .13], ['TRIAL6', 'DrugA', 'DrugB', .08, .13],
  ['TRIAL7', 'DrugA', 'DrugC', .18, .15], ['TRIAL8', 'DrugB', 'DrugC', .10, .14],
  ['TRIAL9', 'DrugA', 'DrugD', -.06, .16], ['TRIAL10', 'Placebo', 'DrugD', -.28, .13],
];
const Z = 1.959963984540054;
const FORMATS = [
  { name: 'Excel TSV', text: ['study\tt1\tt2\testimate\tSE', ...EXAMPLE.map(r => r.join('\t'))].join('\n') },
  { name: 'paper estimate (lo–hi)', text: ['study  t1  t2  estimate', ...EXAMPLE.map(([s,a,b,y,se]) =>
    `${s}  ${a}  ${b}  ${y} (${(y-Z*se).toPrecision(17)} to ${(y+Z*se).toPrecision(17)})`)].join('\n') },
  // Generic inverse-variance export, with explicit treatment-column choices.
  // Raw arm-count RevMan/Covidence exports are not contrast inputs and are deliberately not invented.
  { name: 'RevMan-style inverse-variance export', text: ['Study or Subgroup\tTreatment 1\tTreatment 2\tlog OR\tSE\tWeight',
    ...EXAMPLE.map(r => [...r, '10%'].join('\t'))].join('\n'), answers: { 'column:1': 't1', 'column:2': 't2' } },
];
async function open(page) {
  await page.goto(PAGE);
  await expect(page.locator('#ref-host tbody tr')).toHaveCount(4);
  await page.waitForFunction(() => window.AlmNmaFeatures?.text.results());
}
async function tab(page, key) {
  await page.evaluate(key => AlmFeatures.open('nma', key), key);
  await expect(page.locator('#alm-f-panel-' + key)).toBeVisible();
}
async function values(page) {
  return page.evaluate(() => {
    const a = AlmNmaFeatures.verify.adapter().live, s = a.currentState();
    return { rows: s.rows, values: a.appValues(s), display: document.querySelector('#ref-host').innerText };
  });
}
async function audit(page) {
  return page.evaluate(() => {
    const spec = AlmNmaFeatures.text, r = spec.results();
    const ctx = { app: 'nma', build: AlmBuildInfo, entryLog: [], verify: null };
    const out = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return {
      audit: AlmText.audit(out, r, { ctx, dom: spec.dom() }),
      text: { plain: out.plain.text, methods: out.methods.text, results: out.results.text },
      snapshot: { app: 'nma', source: 'Built-in generic example; common effect; normal CI; analysis scale; DrugA reference',
        plain: norm(out.plain), methods: norm(out.methods), results: norm(out.results),
        flags: out.flags.map(norm), references: out.cites.map(c => c.full) }
    };
  });
}

test('ENTRY: three formats use the app controls and reproduce the built-in result', async ({ page }) => {
  await open(page);
  const baseline = await values(page);
  let passed = 0;
  for (const f of FORMATS) {
    const converted = await page.evaluate(f => {
      const E = AlmEntry, spec = AlmNmaFeatures.entry, table = E.parseTable(f.text);
      const detection = E.detect(table, spec.schema);
      const output = E.convert(table, detection, spec.schema, f.answers || {});
      if (output.flags.some(f => f.blocking)) return { output };
      const applied = spec.apply(output.records);
      return { output, applied, source: document.getElementById('f-data').value };
    }, f);
    expect(converted.output.flags.filter(f => f.blocking), f.name).toEqual([]);
    expect(converted.output.questions.filter(q => !(f.answers && q.choices.includes(f.answers[q.id]))), f.name).toEqual([]);
    expect(converted.applied).toEqual({ ok: true, n: EXAMPLE.length });
    const actual = await values(page);
    expect(actual.rows).toHaveLength(baseline.rows.length);
    actual.rows.forEach((r, i) => {
      expect([r.study, r.t1, r.t2]).toEqual(EXAMPLE[i].slice(0, 3));
      expect(Math.abs(r.est - baseline.rows[i].est)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(baseline.rows[i].est)));
      expect(Math.abs(r.se - baseline.rows[i].se)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(baseline.rows[i].se)));
    });
    actual.values.forEach((r, i) => {
      expect(r.key).toBe(baseline.values[i].key);
      expect(Math.abs(r.value - baseline.values[i].value), r.key).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(baseline.values[i].value)));
    });
    expect(actual.display).toBe(baseline.display);
    if (f.name.startsWith('paper')) expect(converted.output.steps.filter(s => /SE estimated from CI/.test(s.text))).toHaveLength(10);
    passed++;
  }
  console.log(`ENTRYRT ${passed}/${FORMATS.length}`);
});

test('ENTRY: conversion log and planted reversed CI block Use these rows; adapter rejects invalid SE atomically', async ({ page }) => {
  await open(page);
  const before = await values(page);
  // Drive the stable shared table API, rather than depending on the provenance lane's changing controls.
  const result = await page.evaluate(paper => {
    const spec = AlmNmaFeatures.entry, box = document.createElement('div'); box.id = 'entry-contract'; document.body.append(box);
    const ui = AlmEntryUI.mount(box, spec), paste = box.querySelector('textarea');
    paste.value = paper;
    ui.parse();
    const good = ui.getResult();
    paste.value = 'study\tt1\tt2\testimate\nBad\tDrugA\tPlacebo\t0.1 (0.3 to -0.2)';
    ui.parse();
    const bad = ui.getResult();
    const previous = document.getElementById('f-data').value;
    let refused = false;
    try { spec.apply([{ study: 'Bad', t1: 'DrugA', t2: 'Placebo', yi: .1, sei: -1 }]); } catch { refused = true; }
    return { goodSteps: good.steps.length, badFlags: bad.flags, refused, unchanged: previous === document.getElementById('f-data').value };
  }, FORMATS[1].text);
  expect(result.goodSteps).toBe(10);
  expect(result.badFlags.some(f => f.blocking && f.code === 'ci-order')).toBe(true);
  await expect(page.locator('#entry-contract').getByRole('heading', { name: 'Conversion log' })).toBeVisible();
  await expect(page.locator('#entry-contract').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  expect(result.refused && result.unchanged).toBe(true);
  expect(await values(page)).toEqual(before);
  console.log('ENTRYBLOCK 3/3 (reversed CI, disabled apply, invalid SE refused)');
});

test('TEXT: audit, all displayed quantities, snapshot and report downloads', async ({ page }, info) => {
  await open(page);
  const out = await audit(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} dom=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);
  const cells = await page.locator('#ref-host tbody tr').first().locator('td').allTextContents();
  const [estimate, lo, hi] = cells[1].match(/-?\d+(?:\.\d+)?/g);
  const prose = out.text.results.replace(/−/g, '-');
  expect(prose).toContain(`${estimate} (95% CI ${lo} to ${hi})`);
  console.log('TEXTDOM 3/3');
  const actual = info.outputPath('text-nma.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('text-nma', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await tab(page, 'text');
  await expect(page.locator('.alm-text-body')).toBeVisible();
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.text.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('.alm-text-docx').click()]);
  expect(readZip(fs.readFileSync(await docx.path())).map(e => e.name))
    .toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
});

test('TEXT PLANTED: DOM mismatch withholds prose; random t CI, exponentiation and numeric labels audit', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTest = true; window.__almTextPerturb = { key: 'ref_0_est', delta: .01 }; });
  const bad = await audit(page);
  expect(bad.audit.ok).toBe(false);
  expect(bad.audit.failures.map(f => f.check)).toContain('dom:ref_0_est');
  console.log(`TEXTAUDIT planted ${bad.audit.passed}/${bad.audit.checks}`);
  await tab(page, 'text');
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  await page.selectOption('#f-model', 're');
  await page.selectOption('#f-ci', 't-dist');
  await page.selectOption('#f-scale', 'exp');
  await page.selectOption('#f-dir', 'undesirable');
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replaceAll('Placebo', 'Placebo1'));
  await page.locator('#btn-run').click();
  const good = await audit(page);
  expect(good.audit.failures).toEqual([]);
  expect(good.text.methods).toContain('t distribution with the degrees of freedom of Q');
  expect(good.text.methods).toContain('exponentiated');
  expect(good.text.results).toContain('Prediction interval:');
  expect(good.text.results).toContain('Placebo1');
  console.log(`TEXTAUDIT ${good.audit.passed}/${good.audit.checks} random-t-exp`);
  await page.locator('#f-data').fill((await page.locator('#f-data').inputValue()).replaceAll('Placebo1', 'Placebo01'));
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('cannot preserve this numeric treatment label');
  await expect(page.locator('.alm-text-body')).toBeHidden();
});

test('VERIFY: live netmeta, both R plots, ZIP, current-state wording and planted mismatch', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  const origin = new URL(page.url()).origin;
  page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) external.push(req.url()); });
  await tab(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const button = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await button.click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const status = await summary.innerText();
  if (/package netmeta is unavailable/.test(status)) {
    expect(status).toBe('Not checked in the browser: R package netmeta is unavailable.');
    expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('nma'))).toBe(false);
    await expect(panel.locator('td[data-result=pass]')).toHaveCount(0);
    const [r] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'R script (.R)', exact: true }).click()]);
    expect(fs.readFileSync(await r.path(), 'utf8')).toContain('library(netmeta)');
    console.log('VERIFY unavailable: netmeta; R download present; no pass claimed');
    expect(status, 'The pinned netmeta package must be available for the VERIFY gate').not.toMatch(/package netmeta is unavailable/);
    return;
  }
  const match = /^(\d+) of (\d+) quantities match R — PASS$/.exec(status);
  expect(match, status).not.toBeNull();
  const n = +match[2]; expect(n).toBeGreaterThanOrEqual(5); expect(+match[1]).toBe(n);
  console.log(`VERIFY ${match[1]}/${n}`);
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(n).fill('PASS'));
  await expect(panel.locator('figure img')).toHaveCount(2);
  expect(await panel.locator('figure img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  const [zip] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = Object.fromEntries(readZip(fs.readFileSync(await zip.path())).map(e => [e.name, e.bytes]));
  for (const name of ['nma-verify.R', 'nma-verify-comparison.csv', 'sessionInfo.txt', 'console.txt', 'truthcert.json',
    ...['forest', 'network'].flatMap(id => [`nma-${id}-R-300dpi.png`, `nma-${id}-R.pdf`, `nma-${id}-R-300dpi.tiff`])]) expect(entries[name], name).toBeDefined();
  const dec = b => new TextDecoder().decode(b);
  expect(dec(entries['nma-verify.R'])).toContain('forest(plotfit, reference.group="DrugA"');
  expect(dec(entries['nma-verify.R'])).toContain('netgraph(fit)');
  for (const id of ['forest', 'network']) {
    const png = decodePng(entries[`nma-${id}-R-300dpi.png`]), tiff = readTiff(entries[`nma-${id}-R-300dpi.tiff`]);
    expect([png.width, png.height]).toEqual([2400, 1800]);
    expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
    expect(tiff.tags[282].value).toEqual([300, 1]);
    expect(dec(entries[`nma-${id}-R.pdf`].slice(0, 5))).toBe('%PDF-');
  }
  const receipt = JSON.parse(dec(entries['truthcert.json']));
  expect(receipt.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(receipt.extra.results.passed).toBe(true);
  for (const f of receipt.extra.results.files) expect(f.sha256).toBe(createHash('sha256').update(entries[f.name]).digest('hex'));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${Object.keys(entries).length} entries; two PNG/PDF/TIFF plots`);
  await tab(page, 'text');
  await expect(page.locator('.alm-text-body')).toContainText('independently verified in R');
  await page.locator('#f-title').fill('Changed after verification');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).not.toContainText('independently verified in R');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('nma'))).toBe(false);
  await tab(page, 'verify');
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'tau2', delta: .001 }; });
  await button.click();
  await expect(summary).toContainText('FAIL', { timeout: 600_000 });
  expect(await summary.innerText()).toBe(`${n - 1} of ${n} quantities match R — FAIL: 1 outside tolerance or unavailable`);
  expect(await panel.locator('tbody tr').evaluateAll(rows => rows.filter(r => r.querySelector('td[data-result]')?.textContent === 'FAIL').map(r => r.dataset.key))).toEqual(['tau2']);
  console.log(`VERIFY planted ${n - 1}/${n} tau2 FAIL`);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('SHARE: all options, data, conversion log and result round trip; corrupt and invalid payloads are atomic', async ({ page, browser }) => {
  await open(page);
  const original = await page.locator('#f-data').inputValue();
  await page.selectOption('#f-example', 'Senn2013');
  await page.selectOption('#f-model', 're');
  await page.selectOption('#f-ci', 't-dist');
  await page.selectOption('#f-dir', 'undesirable');
  await page.selectOption('#f-scale', 'exp');
  await page.selectOption('#f-ref', 'Placebo');
  await page.locator('#f-title').fill('Shared NMA');
  await page.evaluate(() => { AlmFeaturesState.entryLog = [{ text: 'SE estimated from CI', method: 'SE estimated from CI', citation: 'Cochrane Handbook' }]; });
  await tab(page, 'share');
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('#alm-f-share-link')).toHaveValue(/#s=/);
  const link = await page.locator('#alm-f-share-link').inputValue();
  const state = await page.evaluate(() => AlmNmaFeatures.share.get()), expected = await values(page);
  const ctx = await browser.newContext(), restored = await ctx.newPage();
  try {
    await restored.goto(link);
    await expect(restored.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(() => AlmNmaFeatures.share.get())).toEqual(state);
    expect(await values(restored)).toEqual(expected);
  } finally { await ctx.close(); }
  const badContext = await browser.newContext(), bad = await badContext.newPage();
  try {
    await bad.goto(link.slice(0, -12));
    await expect(bad.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
    expect(await bad.locator('#f-data').inputValue()).toBe(original);
  } finally { await badContext.close(); }
  const invalid = await page.evaluate(() => {
    const before = AlmNmaFeatures.share.get();
    try { AlmNmaFeatures.share.set({ ...before, data: 'S,A,B,0.1,0.2', ref: 'Missing' }); } catch {}
    return JSON.stringify(before) === JSON.stringify(AlmNmaFeatures.share.get());
  });
  expect(invalid).toBe(true);
  console.log('SHARE 3/3 (round trip, corrupt link, invalid reference)');
});

test('AXE: no serious or critical violations in any feature tab after animations finish', async ({ page }) => {
  await open(page);
  for (const key of ['entry', 'text', 'verify', 'share']) {
    await tab(page, key);
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));
    const result = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = result.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    console.log(`AXE ${key}: ${bad.length} serious/critical; ${result.passes.length} rules passed`);
    expect(bad).toEqual([]);
  }
});
