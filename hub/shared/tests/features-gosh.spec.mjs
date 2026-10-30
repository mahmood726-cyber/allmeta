import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, decodePng, readTiff } from './zip-reader.mjs';

const PAGE = '/gosh/index.html';
const SNAP = new URL('./__snapshots__/text-gosh.json', import.meta.url);
const INVALID_INPUTS = JSON.parse(fs.readFileSync(new URL('../../../gosh/tests/fixtures/input-validation.json', import.meta.url), 'utf8'));
const SAMPLED_INPUT = Array.from({ length: 16 }, (_, i) => `${i / 10}, 0.1, Synthetic ${i + 1}`).join('\n');

for (const locale of ['de-DE', 'fr-FR', 'ru-RU', 'ar-EG']) {
  test(`REVIEW locale ${locale}: grouped subset count passes audit; wrong count fails`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto(`http://localhost:${process.env.ALM_FEATURES_PORT || 8089}${PAGE}`);
    await page.locator('#src').fill(Array.from({ length: 11 }, (_, i) => `${i / 10}, .1, Study ${i + 1}`).join('\n'));
    await page.locator('#btn-run').click();
    const displayed = await page.evaluate(() => (2047).toLocaleString());
    await expect(page.locator('#m-n')).toHaveText(displayed);
    expect((await report(page)).audit.failures).toEqual([]);
    await tab(page, 'text');
    await expect(page.locator('.alm-text-body')).toBeVisible();
    await page.evaluate(() => { document.getElementById('m-n').textContent = (2048).toLocaleString(); });
    const planted = await report(page);
    expect(planted.audit.ok).toBe(false);
    expect(planted.audit.failures.map(f => f.check)).toContain('dom:n_subsets');
    await context.close();
  });
}

for (const variant of ['header', 'blank line', 'empty label', 'decimal and exponent', 'CRLF']) {
  test(`REVIEW SHARE accepts app input: ${variant}`, async ({ page, browser }) => {
    await open(page);
    const src = await page.locator('#src').inputValue();
    const modified = src.replace('0.22, 0.08', '0.42, 0.08');
    const input = {
      header: 'effect, SE, label\n' + modified,
      'blank line': modified.replace('\n', '\n\n'),
      'empty label': modified.replace('0.42, 0.08, Study A', '0.42, 0.08, '),
      'decimal and exponent': modified.replace('0.42, 0.08', '+.42e0, 8.e-2'),
      CRLF: '\r\n' + modified.replaceAll('\n', '\r\n') + '\r\n'
    }[variant];
    await page.locator('#src').fill(input);
    await page.locator('#btn-run').click();
    const expected = await page.evaluate(() => ({ state: AlmFeatures.get('gosh').share.get(), result: _almLastGosh() }));
    expect(expected.result.k).toBe(9);
    expect(expected.state.src).toBe(input.replace(/\r\n/g, '\n'));
    await tab(page, 'share');
    await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
    await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
    const link = await page.getByLabel('Share link', { exact: true }).inputValue();
    const context = await browser.newContext(), fresh = await context.newPage();
    await fresh.goto(link);
    await expect(fresh.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await fresh.evaluate(() => ({ state: AlmFeatures.get('gosh').share.get(), result: _almLastGosh() }))).toEqual(expected);
    await context.close();
  });
}

// Current GOSH deliberately rejects these inputs (see gosh-input-validation.spec.mjs
// and the unchanged input-validation.json fixture). Share must enforce that same
// contract before touching any controls or replacing the last successful result.
for (const variant of ['extra columns', 'comment', 'numeric prefix and empty label']) {
  test(`REVIEW SHARE rejects malformed app input atomically: ${variant}`, async ({ page }) => {
    await open(page);
    const out = await page.evaluate(variant => {
      const spec = AlmFeatures.get('gosh'), before = spec.share.get();
      const result = structuredClone(_almLastGosh()), plot = document.getElementById('plot').innerHTML;
      const src = {
        'extra columns': before.src.split('\n').map(line => line + ', 2019').join('\n'),
        comment: before.src + '\n# End of extraction',
        'numeric prefix and empty label': before.src.replace('0.22, 0.08, Study A', '0.42 units, 0.08 units, ')
      }[variant];
      let error;
      try { spec.share.set({ ...before, src, model: 'DL', draws: '37', axes: ['-1', '2', false, '0', '90', false], entryLog: [] }); }
      catch (e) { error = e.message; }
      return { error, unchanged: JSON.stringify(before) === JSON.stringify(spec.share.get()),
        resultUnchanged: JSON.stringify(result) === JSON.stringify(_almLastGosh()),
        plotUnchanged: plot === document.getElementById('plot').innerHTML };
    }, variant);
    const reason = variant === 'numeric prefix and empty label' ? 'Line 1: effect must be a complete number'
      : `Line ${variant === 'comment' ? 10 : 1}: expected effect, SE[, label] separated by commas`;
    expect(out.error).toContain(reason);
    expect(out.unchanged).toBe(true); expect(out.resultUnchanged).toBe(true); expect(out.plotUnchanged).toBe(true);
    await expect(page.locator('#m-n')).toHaveText('511');
    await expect(page.locator('#input-error')).toHaveText('');
  });
}

test('REVIEW SHARE invalid surviving rows leave all state unchanged', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('gosh'), before = spec.share.get(), result = _almLastGosh();
    let error;
    try { spec.share.set({ ...before, src: 'header, SE\n.1, .2, A\n.2, .3, B\ninvalid' }); } catch (e) { error = e.message; }
    return { error, unchanged: JSON.stringify(before) === JSON.stringify(spec.share.get()), resultUnchanged: JSON.stringify(result) === JSON.stringify(_almLastGosh()) };
  });
  expect(out).toEqual({ error: 'Line 1: effect must be a complete number; Line 4: expected effect, SE[, label] separated by commas.', unchanged: true, resultUnchanged: true });
  // Reuse all the app's source fixtures, including a bad line alongside enough
  // valid rows: silently dropping that line must never produce a successful load.
  const refused = await page.evaluate(cases => {
    const spec = AlmFeatures.get('gosh'), before = spec.share.get(), result = structuredClone(_almLastGosh());
    return cases.map(c => {
      let error;
      try { spec.share.set({ ...before, src: before.src + '\n\n' + c.line }); } catch (e) { error = e.message; }
      return { error, unchanged: JSON.stringify(before) === JSON.stringify(spec.share.get()),
        resultUnchanged: JSON.stringify(result) === JSON.stringify(_almLastGosh()) };
    });
  }, INVALID_INPUTS);
  for (const [i, r] of refused.entries()) {
    expect(r.error, INVALID_INPUTS[i].name).toContain('Line 11:');
    expect(r.error, INVALID_INPUTS[i].name).toContain(INVALID_INPUTS[i].reason);
    expect(r.unchanged).toBe(true); expect(r.resultUnchanged).toBe(true);
  }
  const tooFew = await page.evaluate(() => {
    const spec = AlmFeatures.get('gosh'), before = spec.share.get(), result = structuredClone(_almLastGosh());
    let error;
    try { spec.share.set({ ...before, src: '.1, .2, A\n.2, .3, B' }); } catch (e) { error = e.message; }
    return { error, unchanged: JSON.stringify(before) === JSON.stringify(spec.share.get()), resultUnchanged: JSON.stringify(result) === JSON.stringify(_almLastGosh()) };
  });
  expect(tooFew).toEqual({ error: 'Provide three through one hundred studies.', unchanged: true, resultUnchanged: true });
});

test('REVIEW TEXT perturbation cannot change keys without DOM checks', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'k', delta: 3 }; });
  const out = await report(page);
  expect(out.r.k).toBe(9);
  expect(out.audit.ok).toBe(true);
  expect(out.snapshot.results).toContain('Across 9 studies');
});

test('REVIEW VERIFY documents objects used by the sampled plot', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(() => {
    const spec = AlmFeatures.get('gosh').verify;
    return { objects: spec.rObjects, plot: spec.plots[0].r, script: spec.adapter().live.buildScript(spec.adapter().live.currentState()) };
  });
  for (const name of ['mus', 'i2s']) {
    expect(out.objects).toMatch(new RegExp(`\\b${name}\\b`));
    expect(out.plot).toContain(name);
    expect(out.script).toContain(name);
  }
});

test('REVIEW SHARE restores without navigation timing entries', async ({ page, browser }) => {
  await open(page);
  const link = await page.evaluate(async () => {
    const state = AlmFeatures.get('gosh').share.get();
    state.src = '.7, .1, A\n.8, .2, B\n.9, .3, C';
    return AlmShare.makeLink(location.href, await AlmShare.encode('gosh', state, []));
  });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = performance.getEntriesByType.bind(performance);
    performance.getEntriesByType = type => type === 'navigation' ? [] : original(type);
  });
  const fresh = await context.newPage();
  await fresh.goto(link);
  await expect(fresh.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await fresh.evaluate(() => _almLastGosh().k)).toBe(3);
  await expect(fresh.locator('#src')).toHaveValue('.7, .1, A\n.8, .2, B\n.9, .3, C');
  await context.close();
});

async function addSource(panel, year) {
  await panel.getByLabel('Your initials (recorded with each confirmation)').fill('QA');
  await panel.getByLabel('Paste the exact paper text or table').fill('MD 0.2 (95% CI 0.1-0.3)');
  await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  const chooser = panel.getByLabel('Choose the source result to add');
  await expect(chooser).toHaveValue('');
  await expect(panel.getByRole('button', { name: 'Add chosen result', exact: true })).toBeDisabled();
  await chooser.selectOption('0');
  await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
  const card = panel.locator('fieldset').last();
  await card.getByLabel('Study label', { exact: false }).fill(`Smith ${year}`);
  await card.getByLabel('Full reference', { exact: true }).fill('Synthetic report');
  await card.getByLabel('Source type', { exact: true }).selectOption('Table');
  await card.getByLabel('Location', { exact: false }).fill('1');
  await card.getByLabel('Outcome measured', { exact: true }).fill('Synthetic outcome');
  // This synthetic excerpt supplies none of these details. Answer explicitly
  // through the current provenance UI instead of inventing source metadata.
  await card.getByLabel('Timepoint', { exact: true }).selectOption('not stated');
  await card.getByLabel('What was randomised?', { exact: true }).selectOption('not stated');
  for (const label of ['Analysis population', 'Adjusted for other factors?', 'Type of value']) {
    await card.getByLabel(label, { exact: false }).selectOption('not stated');
  }
  return card;
}

test('REVIEW ENTRY real gosh block requires confirmation and applies provenance', async ({ page }) => {
  await open(page);
  await tab(page, 'entry');
  const panel = page.locator('#alm-f-panel-entry');
  await expect(panel.locator('.alm-entry-provenance')).toHaveCount(1);
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  const before = await page.locator('#src').inputValue();
  for (const year of [2020, 2021, 2022]) {
    const card = await addSource(panel, year);
    await expect(use).toBeDisabled();
    await expect(page.locator('#src')).toHaveValue(before);
    await expect(card.getByLabel('I confirm this row')).toBeEnabled();
    await card.getByLabel('I confirm this row').check();
  }
  await expect(use).toBeEnabled();
  await use.click();
  await expect(panel.getByRole('status')).toContainText('Applied 3 confirmed rows.');
  const out = await page.evaluate(() => ({ result: _almLastGosh(), provenance: AlmFeaturesState.provenance, usedAs: AlmFeatures.get('gosh').entry.usedAs }));
  expect(out.result.k).toBe(3);
  expect(out.provenance).toHaveLength(3);
  expect(out.provenance.every(r => r.confirmed && r.usedAs === out.usedAs)).toBe(true);
  for (const row of out.provenance) {
    expect(row).toMatchObject({ confirmedBy: 'QA', confirmedVia: 'row',
      source: { type: 'Table', detail: '1' },
      choice: { timepoint: 'not stated', randomisation: 'not stated',
        facets: { timepoint: 'not stated', analysisSet: 'not stated', adjustment: 'not stated', phase: 'not stated' } } });
  }
  expect(out.result.studies.map(r => r.label)).toEqual(['Smith 2020', 'Smith 2021', 'Smith 2022']);
  await panel.locator('fieldset').first().getByLabel('Outcome measured', { exact: true }).fill('Edited outcome');
  await expect(use).toBeDisabled();
});

test('REVIEW ENTRY planted missing usedAs blocks the real provenance workflow', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'gosh-provenance-mutant'; document.body.appendChild(host);
    const block = { ...AlmFeatures.get('gosh').entry };
    delete block.usedAs;
    AlmEntryUI.mount(host, block);
  });
  const panel = page.locator('#gosh-provenance-mutant');
  const before = await page.locator('#src').inputValue();
  const card = await addSource(panel, 2020);
  await expect(card.getByLabel('I confirm this row')).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(panel).toContainText('The app adapter must supply entry.usedAs');
  await expect(page.locator('#src')).toHaveValue(before);
});
async function open(page, query = '') {
  await page.goto(PAGE + query);
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
      const unanswered = AlmEntry.convert(table, detection, 'generic', {});
      // These synthetic CIs were constructed as effect +/- z * SE on the
      // supplied scale. Explicitly confirm difference-scale conversion.
      const answers = { 'measure:type': 'difference' };
      const converted = AlmEntry.convert(table, detection, 'generic', answers);
      if (converted.flags.some(f => f.blocking)) throw Error(JSON.stringify(converted));
      // Use the documented legacy text-log shape. Shared conversion steps also
      // have flags[], which AlmText otherwise treats as full source records.
      AlmFeaturesState.entryLog = converted.steps.map(s => ({ study: s.study, method: s.method, citation: s.citation }));
      const applied = spec.entry.apply(converted.records);
      const rendered = AlmText.render(spec.text.templates, spec.text.results(), AlmText.context('gosh', spec.text));
      return { index, applied, converted, unanswered, unresolved: converted.questions.filter(q => !q.choices.includes(answers[q.id])),
        original, actual: structuredClone(_almLastGosh()), methods: rendered.methods.text };
    });
    AlmFeaturesState.entryLog = runs[1].converted.steps.map(s => ({ study: s.study, method: s.method, citation: s.citation }));
    return runs;
  });
  for (const row of out) {
    expect(row.applied).toEqual({ ok: true, n: 9 });
    expect(row.unanswered.flags).toContainEqual(expect.objectContaining({ code: 'unanswered-question', questionId: 'measure:type', blocking: true }));
    expect(row.unresolved).toEqual([]);
    expect(row.converted.steps).toContainEqual(expect.objectContaining({ method: 'measure confirmed', inputs: { measure: 'difference' } }));
    expect(row.actual.n_subsets).toBe(row.original.n_subsets);
    for (const key of ['median_est', 'median_i2', 'min_est', 'max_est', 'q25_est', 'q75_est']) {
      expect(Math.abs(row.actual[key] - row.original[key])).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(row.original[key]), 1e-12));
    }
  }
  const conversions = out[1].converted.steps.filter(s => s.method !== 'measure confirmed');
  expect(conversions).toHaveLength(9);
  expect(conversions.every(s => /SE estimated from CI/.test(s.text))).toBe(true);
  expect(out[1].methods).toContain('SE from CI');
  await tab(page, 'text');
  await expect(page.locator('#alm-f-panel-text [data-para=methods]')).toContainText('SE from CI');
  console.log('ENTRYRT 3/3; conversion log 9/9');
});

test('ENTRY planted reversed CI blocks conversion; unsafe records cannot change app input', async ({ page }) => {
  await open(page);
  const input = 'Study\tEffect\nBad\t0.22 (0.4–0.1)\nB\t0.3 (0.1–0.5)\nC\t0.2 (0.1–0.3)';
  const out = await page.evaluate(input => {
    const t = AlmEntry.parseTable(input), c = AlmEntry.convert(t, AlmEntry.detect(t, 'generic'), 'generic', { 'measure:type': 'difference' });
    const before = document.getElementById('src').value;
    const records = _almLastGosh().studies.map(r => ({ study: r.label, yi: r.te, sei: r.se }));
    records[0].sei = -1;
    let error; try { AlmFeatures.get('gosh').entry.apply(records); } catch (e) { error = e.message; }
    const host = document.createElement('div'); host.id = 'gosh-entry-gate'; document.body.appendChild(host);
    AlmEntryUI.mount(host, { schema: 'generic', apply: AlmFeatures.get('gosh').entry.apply });
    return { flags: c.flags, before, after: document.getElementById('src').value, error };
  }, input);
  expect(out.flags.some(f => f.blocking)).toBe(true);
  expect(out.error).toContain('SE positive'); expect(out.after).toBe(out.before);
  const gate = page.locator('#gosh-entry-gate'), use = gate.getByRole('button', { name: 'Use these rows', exact: true });
  const preview = gate.getByRole('button', { name: 'Preview and convert', exact: true });
  await gate.locator('textarea').fill(input.replace('0.4–0.1', '0.1–0.4'));
  await preview.click();
  await expect(use).toBeDisabled(); // The measure question is still unanswered.
  await gate.getByRole('radio', { name: 'difference', exact: true }).check();
  await expect(use).toBeEnabled();
  await gate.locator('textarea').fill(input);
  await preview.click();
  await gate.getByRole('radio', { name: 'difference', exact: true }).check();
  await expect(use).toBeDisabled(); // Now the reversed CI itself blocks apply.
  await expect(gate).toContainText('SE estimated from CI');
  await expect(page.locator('#src')).toHaveValue(out.before);
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
  await open(page, '?almtest=1'); await tab(page, 'verify');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  const run = panel.getByRole('button', { name: 'Verify this analysis in R', exact: true });
  await run.click();
  await expect(summary).toHaveText(/^\d+ of \d+ computed quantities match R; 0 not computed — PASS$/, { timeout: 600_000 });
  const verified = await page.evaluate(() => AlmFeaturesState.verify);
  console.log(`VERIFY ${verified.nPassed}/${verified.n}`);
  expect(verified.n).toBeGreaterThanOrEqual(5); expect(verified.nPassed).toBe(verified.n);
  expect(verified).toMatchObject({ passed: true, testHook: false, nNotComputed: 0, nOptional: 0, nNotApplicable: 0 });
  expect(verified.rows).toHaveLength(verified.n);
  await expect(summary).toHaveText(`${verified.n} of ${verified.n} computed quantities match R; 0 not computed — PASS`);
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
  // Verification refuses inputs that were edited but not run (rev223 P1, 356f8517): run the restored data first.
  await page.locator('#btn-run').click();
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'median_est', delta: 0.01 }; });
  await run.click();
  await expect(summary).toHaveText(/^TEST MODE .* — FAIL: 1 not matching R; test hook active$/, { timeout: 600_000 });
  const planted = await page.evaluate(() => AlmFeaturesState.verify);
  expect(planted.rows.filter(r => !r.pass).map(r => r.key)).toEqual(['median_est']);
  expect(planted).toMatchObject({ passed: false, testHook: true, n: verified.n, nPassed: verified.n - 1, nNotComputed: 0 });
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
  // Mounting the feature shell must not eagerly generate a hidden report.
  await expect(page.locator('#alm-f-panel-text .alm-text-regenerate')).toHaveCount(0);
  await tab(page, 'text');
  await expect(page.locator('.alm-text-body')).toBeVisible();
  const before = await page.evaluate(() => structuredClone(_almLastGosh()));
  await page.locator('#model').selectOption('DL');
  await page.locator('#src').fill(SAMPLED_INPUT);
  // Exercise the mounted report's currency check as well: it must stop at the
  // app's stale signal, before context() invokes the live adapter and refits.
  await page.evaluate(() => document.getElementById('alm-f-panel-text').__almHandle.check());
  await expect(page.locator('.alm-text-status')).toContainText('press Run analysis');
  expect(await page.evaluate(() => _almLastGosh())).toEqual(before);
  // Editing data only marks results stale; Run updates sampling visibility.
  await expect(page.locator('#n-sample')).toBeHidden();
  await page.locator('#btn-run').click();
  await expect(page.locator('#n-sample')).toBeVisible();
  // This test is about the SAMPLED description. With the default 'auto' mode a fast machine finishes exact enumeration
  // (2^16 - 1 = 65,535 subsets) in the background and replaces the 37-draw preview, so the result depended on CPU speed.
  await page.locator('#enum-mode').selectOption('sample');
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
