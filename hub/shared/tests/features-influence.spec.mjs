import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// App-scoped regression harness. The archived helper assumed an array-returning
// parseFloat parser; current core exposes a strict { rows, errors } parser.
const adapter = new URL('../../../influence/alm-features.js', import.meta.url);
function reviewedSnapshot() {
  const expected = JSON.parse(fs.readFileSync(new URL('./__snapshots__/text-influence.json', import.meta.url), 'utf8'));
  // Keep every archived numerical expectation; migrate only obsolete prose.
  const oldMethod = 'No pooled significance test, I² or prediction interval is computed by this app.';
  assert.ok(expected.methods.includes(oldMethod));
  expected.methods = expected.methods.replace(oldMethod,
    'Pooled significance tests and I² are shown in the model summary; no prediction interval is computed by this app.');
  assert.deepEqual(expected.flags, ['I² and a prediction interval are omitted because the app does not compute them. Influence flags require investigation of study methods and data.']);
  expected.flags = ['This report describes the full-sample fit. Additional diagnostics and exclusion refits are available in the diagnostics panel; no prediction interval is computed. Influence flags require investigation of study methods and data.'];
  return expected;
}
function setup() {
  const source = { value: '0.1, 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', dispatchEvent() {} };
  const baseline = source.value, snapshots = [], modules = {}, notes = [];
  const axes = { min: { value: '', dispatchEvent() {} }, max: { value: '', dispatchEvent() {} }, log: { checked: false, dispatchEvent() {} } };
  let studies, runs = 0, testMode = false;
  // Read the engine's actual parser: this test must detect future parser divergence.
  const html = fs.readFileSync(new URL('../../../influence/index.html', import.meta.url), 'utf8');
  const parserSource = html.slice(html.indexOf('const NUM ='), html.indexOf('// Cycle 7.13:'));
  const parse = vm.runInNewContext(parserSource + '\nparse', { window: {} });
  const run = { click() { const parsed = parse(source.value); studies = parsed.errors.length ? [] : parsed.rows; runs++; } };
  const context = {
    document: {
      getElementById: id => id === 'src' ? source : run,
      querySelector: selector => axes[/data-edge="(\w+)"/.exec(selector)?.[1]],
      documentElement: { hasAttribute: name => name === 'data-alm-test' && testMode },
      createElement: () => ({ textContent: '', className: '' })
    },
    __almInfluenceParse: parse,
    Event: class {},
    alm: { resetUndo: { snapshot() { snapshots.push(source.value); } } },
    _almStudies: () => studies,
    _almLastInfluence: () => ({ mu: .2, seMu: .05, tau2: .01, Q: 2, df: studies.length - 1 }),
    _almLastDiag: () => studies.map(s => ({ te: s.te, influential: false })),
    AlmFeatures: { register() {}, verifiedCurrent: () => false, registerModule: (key, value) => { modules[key] = value; } },
    AlmTextUI: { mount: () => ({ root: { appendChild: n => notes.push(n.textContent) }, regenerate() {} }) }
  };
  run.click(); vm.runInNewContext(fs.readFileSync(adapter, 'utf8'), context);
  return { context, spec: context.AlmInfluenceFeatures, source, baseline, snapshots, modules, notes,
    run, runs: () => runs, enableTestMode: () => { testMode = true; } };
}
const records = [{ study: 'Smith 2019', yi: .25, sei: .08 }, { study: 'Jones 2020', yi: .18, sei: .1 }, { study: 'Lee 2021', yi: .3, sei: .09 }];

// Exercise the real page engine and live adapter together. Only DOM plumbing and
// SVG drawing are stubbed here; the browser regression below covers those too.
function liveSetup() {
  const html = fs.readFileSync(new URL('../../../influence/index.html', import.meta.url), 'utf8');
  const source = { value: /<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1] };
  const body = { innerHTML: '' }, plot = { children: [] };
  const context = { structuredClone, showError() {}, clearResults() {}, pageLocked: () => false,
    drawLOO() {}, drawInfluence() {}, updateExclusion() {} };
  context.window = context;
  vm.createContext(context);
  for (const file of ['shared/ma-core.js', 'shared/diagnostic-plots.js', 'influence/influence-extra.js',
    'shared/alm-features.js', 'shared/alm-text.js']) {
    vm.runInContext(fs.readFileSync(new URL('../../../' + file, import.meta.url), 'utf8'), context);
  }
  context.document = {
    readyState: 'loading', addEventListener() {},
    documentElement: { hasAttribute: () => false },
    getElementById: id => id === 'src' ? source : id === 'body' ? body : plot,
    querySelectorAll: () => [...body.innerHTML.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].map(row => ({
      classList: { contains: name => name === 'flag' && /class="flag"/.test(row[1]) }
    }))
  };
  context.drawBaujat = rows => { context.__almBaujat = context.AlmDiagPlots.baujat(rows.map(r => r.te), rows.map(r => r.se * r.se), 'REML'); };
  context.drawRadial = rows => { context.__almRadial = context.AlmDiagPlots.radial(rows.map(r => r.te), rows.map(r => r.se * r.se)); };
  vm.runInContext('var Z975 = AlmInfluenceExtra.Z975, X = AlmInfluenceExtra; var _lastStudies, _lastFull, _lastDiag, _excluded;\n' +
    html.slice(html.indexOf('const NUM ='), html.indexOf('// Exposed for results-export')) +
    html.slice(html.indexOf('function run() {'), html.indexOf('// ---- E1:')) + '\nrun();', context);
  context._almStudies = () => context._lastStudies;
  context._almLastInfluence = () => context._lastFull;
  context._almLastDiag = () => context._lastDiag;
  let restores = 0;
  context.__almRestore = ({ data }) => { restores++; source.value = data; context.run(); };
  context.AlmValidate = { adapters: {}, mount(_host, adapter) { this.adapters.influence = adapter; } };
  vm.runInContext(fs.readFileSync(new URL('../../../influence/validate/adapter.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(adapter, 'utf8'), context);
  return { context, source, body, live: context.AlmInfluenceValidationAdapter.live, restores: () => restores };
}

export const regressions = [
  ['PLANTED live revision reads preserve selected exclusions and current analysis; no-exclusion control', () => {
    const h = liveSetup(), { context: c } = h;
    const baseline = h.live.currentState(), full = c._almLastInfluence(), diag = c._almLastDiag();
    const revision = c.AlmFeatures.revision('influence'), before = h.restores();
    assert.equal(baseline.values.length, 177);
    assert.deepEqual(h.live.currentState(), baseline);
    assert.equal(c._excluded.size, 0); // Control: the ordinary full-sample read is unchanged.
    c._excluded.add(5);
    assert.equal(c.AlmFeatures.revision('influence'), revision);
    c.AlmText.context('influence', c.AlmInfluenceFeatures.text); // Same path as report currency checks.
    assert.deepEqual(Array.from(c._excluded), [5], 'A state read must not reset the user selection');
    assert.equal(h.restores(), before, 'Unchanged inputs must not rerun the native page');
    assert.equal(c._almLastInfluence(), full); assert.equal(c._almLastDiag(), diag);
    assert.deepEqual(h.live.currentState(), baseline);
  }],
  ['LIVE controls: edited inputs reanalyse once; invalid inputs and missing evidence fail closed', () => {
    const h = liveSetup(), { context: c } = h;
    const baseline = h.live.currentState(), before = h.restores();
    h.source.value = '0,0.1,A\n0.2,0.12,B\n0.4,0.15,C\n0.1,0.09,D';
    const changed = h.live.currentState();
    assert.equal(h.restores(), before + 1);
    assert.equal(changed.values.length, 75);
    assert.notEqual(changed.values[0].value, baseline.values[0].value);
    assert.deepEqual(Array.from(changed.yi), [0, .2, .4, .1]);
    const analysed = h.source.value, rendered = h.body.innerHTML;
    h.source.value = analysed.replace('0,0.1,A', '+0.0, 1e-1, A');
    c._excluded.add(1);
    assert.deepEqual(h.live.currentState(), changed); // Equivalent native numeric notation.
    assert.equal(h.restores(), before + 1); assert.deepEqual(Array.from(c._excluded), [1]);
    for (const literal of ['0x10', '0.25suffix', 'NaN', 'Infinity', '', '1e309']) {
      h.source.value = literal + ',0.1,A\n0.2,0.12,B\n0.4,0.15,C';
      assert.throws(() => h.live.currentState(), /valid effect rows/);
      assert.equal(h.restores(), before + 1); assert.equal(h.body.innerHTML, rendered);
    }
    h.source.value = analysed;
    const full = c._almLastInfluence;
    c._almLastInfluence = () => ({ ...full(), mu: undefined });
    assert.throws(() => h.live.currentState(), /Invalid app quantity/);
  }],
  ['PLANTED invalid live inputs are refused before any native restore; valid input control', () => {
    const h = liveSetup(), { context: c } = h;
    const baseline = h.live.currentState(), input = h.source.value, rendered = h.body.innerHTML;
    const before = h.restores();
    c._excluded.add(5);
    for (const literal of ['0x10', '0.25suffix', 'NaN', 'Infinity', '', '1e309']) {
      h.source.value = literal + ',0.1,A\n0.2,0.12,B\n0.4,0.15,C';
      assert.throws(() => h.live.currentState(), /valid effect rows/);
      assert.equal(h.restores(), before, 'Invalid native input must be rejected before changing the analysis');
      assert.equal(h.body.innerHTML, rendered); assert.deepEqual(Array.from(c._excluded), [5]);
    }
    h.source.value = input;
    assert.deepEqual(h.live.currentState(), baseline);
  }],
  ['REVIEW undo snapshots the previous input only after batch validation', () => {
    const h = setup();
    assert.throws(() => h.spec.entry.apply(records.map((r, i) => i === 1 ? { ...r, sei: 0 } : r)));
    assert.equal(h.snapshots.length, 0); assert.equal(h.source.value, h.baseline);
    h.spec.entry.apply(records);
    assert.deepEqual(h.snapshots, [h.baseline]); assert.equal(h.runs(), 2);
  }],
  ['REVIEW extra label fields retain report text for the analysis the engine ran', () => {
    const h = setup(); h.source.value = '0.25, 0.08, Smith, 2019\n0.18, 0.1, Jones\n0.3, 0.09, Lee'; h.run.click();
    assert.equal(h.context._almStudies()[0].label, 'Smith, 2019');
    assert.ok(h.spec.text.results(), 'An analysed comma-containing label must not hide the report');
    h.source.value = h.source.value.replace('0.25', '0.35');
    assert.equal(h.spec.text.results(), null); // Pending numeric edits still fail closed.
  }],
  ['REVIEW share validation and report guard use the strict native parser', () => {
    const h = setup();
    for (const literal of ['0.25', '+.25', '2e-1']) {
      h.spec.share.set({ src: literal + ', 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', axis: { min: '', max: '', log: false } });
      assert.equal(h.context._almStudies()[0].te, Number(literal));
      assert.ok(h.spec.text.results(), literal + ' must agree with the actual engine parser');
    }
    const before = h.source.value, runs = h.runs();
    for (const literal of ['0x10', '0.25suffix', 'NaN', 'Infinity', '', '1e309']) {
      assert.throws(() => h.spec.share.set({ src: literal + ', 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', axis: { min: '', max: '', log: false } }));
      assert.equal(h.source.value, before); assert.equal(h.runs(), runs);
      h.source.value = literal + ', 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C';
      assert.equal(h.spec.text.results(), null);
      h.source.value = before;
    }
  }],
  ['REVIEW perturbations require explicit test mode', () => {
    const h = setup(), original = h.spec.text.results();
    for (const key of ['mu', 'tau2', 'Q', 'df', 'k', 'flagged', 'ciLevel']) {
      h.context.__almTextPerturb = { key, delta: 1 };
      assert.equal(h.spec.text.results()[key], original[key], key + ' was changed outside test mode');
    }
    h.enableTestMode(); h.context.__almTextPerturb = { key: 'mu', delta: .1 };
    assert.equal(h.spec.text.results().mu, original.mu + .1);
  }],
  ['REVIEW text panel explains which values can be checked against the page', () => {
    const h = setup(); h.modules.text.render({}, { app: 'influence', block: h.spec.text });
    assert.match(h.notes.join(' '), /Only values displayed in the diagnostics table are cross-checked against the page/);
  }],
  ['REVIEW bad labels identify the offending study and row without changing data', () => {
    const h = setup();
    for (const study of ['Smith, 2019', '', 'Smith\n2019']) {
      assert.throws(() => h.spec.entry.apply(records.map((r, i) => i === 1 ? { ...r, study } : r)), error =>
        error.message.includes('Row 2') && error.message.includes(JSON.stringify(study)));
      assert.equal(h.source.value, h.baseline); assert.equal(h.snapshots.length, 0); assert.equal(h.runs(), 1);
    }
  }],
  ['REVIEW unavailable native parser and unsupported log axis fail before mutation', () => {
    const h = setup();
    assert.throws(() => h.spec.share.set({ src: h.baseline, axis: { min: '', max: '', log: true } }), /Invalid axis/);
    delete h.context.__almInfluenceParse;
    assert.throws(() => h.spec.entry.apply(records), /parser is unavailable/);
    assert.equal(h.source.value, h.baseline); assert.equal(h.snapshots.length, 0); assert.equal(h.runs(), 1);
    assert.equal(h.spec.text.results(), null);
  }],
  ['REVIEW current table columns retain the complete report audit and fail closed on missing cells', () => {
    const h = setup();
    const fields = [['te', 2, 3], ['resid', 4, 2], ['hat', 5, 3], ['cooksD', 6, 3], ['dffits', 7, 3], ['covRatio', 9, 3]];
    const diagnostics = h.context._almStudies().map((s, i) => ({ ...s, resid: -.25 - i, hat: .1 + i / 10,
      cooksD: .02 + i / 10, dffits: -.2 - i / 10, covRatio: 1.1 + i / 10, loo_mu: .21 + i / 10, loo_seMu: .06 + i / 10 }));
    h.context._almLastDiag = () => diagnostics;
    // Independent mock display follows the native table's headers, which are pinned below.
    const html = fs.readFileSync(new URL('../../../influence/index.html', import.meta.url), 'utf8');
    const head = html.slice(html.indexOf('<table id="diag-table"'), html.indexOf('<tbody id="body"'));
    const headers = [...head.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(m => m[1].replace(/<[^>]*>/g, ''));
    assert.equal(headers.length, 18);
    assert.deepEqual([2, 4, 5, 6, 7, 9, 10].map(i => headers[i]), ['Effect', 'zi', 'Hat', "Cook's D", 'DFFITS', 'Cov-ratio', 'LOO pooled (SE)']);
    const rows = diagnostics.map(d => {
      const cells = Array.from({ length: 18 }, () => ({ textContent: 'unreported' }));
      for (const [key, column, digits] of fields) cells[column].textContent = d[key].toFixed(digits);
      cells[10].textContent = d.loo_mu.toFixed(3) + ' (' + d.loo_seMu.toFixed(3) + ')';
      return { cells };
    });
    rows.push({ cells: Array.from({ length: 18 }, (_, i) => ({ textContent: i === 10 ? '0.200 (0.050)' : '' })) });
    h.context.document.querySelectorAll = () => rows;
    vm.runInNewContext(fs.readFileSync(new URL('../../../shared/alm-text.js', import.meta.url), 'utf8'), h.context);
    const r = h.spec.text.results(), rendered = h.context.AlmText.render(h.spec.text.templates, r, { app: 'influence', build: {}, entryLog: [] });
    const audit = () => h.context.AlmText.audit(rendered, r, { dom: h.spec.text.dom(), domMin: h.spec.text.domMin });
    assert.equal(audit().domChecked, 26); assert.equal(audit().ok, true);
    rows[0].cells[6].textContent = '9.999';
    assert.ok(audit().failures.some(f => f.check === 'dom:study0_cooksD'));
    rows[0].cells[10].textContent = '';
    assert.throws(() => h.spec.text.dom(), /missing a pooled estimate/);
    rows[0].cells.pop();
    assert.throws(() => h.spec.text.dom(), /does not match/);
    rows.pop();
    assert.throws(() => h.spec.text.dom(), /does not match/);
  }],
  ['REVIEW native engine and rendered table reproduce the archived numerical report', () => {
    const html = fs.readFileSync(new URL('../../../influence/index.html', import.meta.url), 'utf8');
    const source = { value: /<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1] };
    const body = { innerHTML: '' };
    const context = { document: { getElementById: id => id === 'src' ? source : body,
      documentElement: { hasAttribute: () => false },
      querySelectorAll: () => [...body.innerHTML.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row => ({
        cells: [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => ({ textContent: cell[1].replace(/<[^>]*>/g, '') }))
      })) },
      AlmFeatures: { register() {}, verifiedCurrent: () => false },
      showError() {}, clearResults() {}, pageLocked: () => false,
      drawLOO() {}, drawInfluence() {}, drawBaujat() {}, drawRadial() {}, updateExclusion() {} };
    context.window = context;
    vm.createContext(context);
    for (const file of ['shared/ma-core.js', 'influence/influence-extra.js', 'shared/alm-text.js', 'shared/build-info.js']) {
      vm.runInContext(fs.readFileSync(new URL('../../../' + file, import.meta.url), 'utf8'), context);
    }
    // Execute the page's parser, pooling, diagnostics, formatting and table renderer
    // unchanged. SVG drawing and event wiring are left to the browser gate.
    vm.runInContext('var Z975 = AlmInfluenceExtra.Z975, X = AlmInfluenceExtra; var _lastStudies, _lastFull, _lastDiag, _excluded;\n' +
      html.slice(html.indexOf('const NUM ='), html.indexOf('// Exposed for results-export')) +
      html.slice(html.indexOf('function run() {'), html.indexOf('// ---- E1:')) + '\nrun();', context);
    context._almStudies = () => context._lastStudies;
    context._almLastInfluence = () => context._lastFull;
    context._almLastDiag = () => context._lastDiag;
    vm.runInContext(fs.readFileSync(adapter, 'utf8'), context);
    const spec = context.AlmInfluenceFeatures.text, r = spec.results();
    assert.equal(r.k, 10);
    const ctx = { app: 'influence', build: context.AlmBuildInfo, entryLog: [], verify: null };
    const rendered = context.AlmText.render(spec.templates, r, ctx);
    const audit = context.AlmText.audit(rendered, r, { ctx, dom: spec.dom(), domMin: spec.domMin });
    assert.equal(audit.domChecked, 82); assert.equal(audit.ok, true, JSON.stringify(audit.failures));
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    const expected = reviewedSnapshot();
    for (const key of ['plain', 'methods', 'results']) assert.equal(norm(rendered[key]), expected[key]);
    assert.deepEqual(Array.from(rendered.flags, norm), expected.flags);
    assert.deepEqual(Array.from(rendered.cites, c => c.full), expected.references);
  }]
];


for (const [name, check] of regressions) test(name, check);

const APP = 'influence', PAGE = '/influence/index.html';
const EXAMPLE = [
  ['Smith', .25, .08], ['Jones', .18, .10], ['Khan', .40, .15], ['Lee', .30, .09], ['Park', .12, .07],
  ['Outlier', .85, .09], ['Chen', .22, .08], ['Garcia', .32, .12], ['Ahmed', .45, .17], ['Brown', .28, .10]
];
const Z = 1.959963984540054;
const paper = 'Study  Mean difference\n' + EXAMPLE.map(([s, y, se]) => `${s}  ${y} (${y - Z * se}–${y + Z * se})`).join('\n');
const formats = [
  ['Excel TSV', 'Study\tEffect\tSE\n' + EXAMPLE.map(r => r.join('\t')).join('\n')],
  ['paper estimate (CI)', paper],
  ['RevMan generic inverse-variance style', 'Study or Subgroup\tMean Difference\tStandard Error\tWeight\n' + EXAMPLE.map(r => r.join('\t') + '\t10%').join('\n')]
];

async function open(page, tab = 'entry') {
  await page.goto(PAGE);
  await expect(page.locator('#body tr')).toHaveCount(11);
  await page.evaluate(key => AlmFeatures.open('influence', key), tab);
  await expect(page.locator('#alm-f-panel-' + tab)).toBeVisible();
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmFeatures.get('influence').text, r = spec.results();
    const ctx = { app: 'influence', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
    return {
      audit: AlmText.audit(rendered, r, { ctx, dom: spec.dom() }),
      snapshot: { app: 'influence', source: 'Built-in ten-study example; intercept-only REML; supplied effect scale',
        plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
        flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) }
    };
  });
}
async function axe(page, label) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const r = await new AxeBuilder({ page }).include('#alm-features').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${label}: ${bad.length} serious/critical; ${r.passes.length} rules passed`);
  expect(bad.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

async function fillSourceDetails(panel, card, label) {
  await panel.getByLabel('Your initials (recorded with each confirmation)', { exact: true }).fill('QA');
  await card.getByLabel('Study label (author and year, e.g. Smith 2019)', { exact: true }).fill(label);
  await card.getByLabel('Full reference', { exact: true }).fill(label + ', synthetic regression fixture');
  await card.getByLabel('Source type', { exact: true }).selectOption('Text');
  await card.getByLabel('Location: number or page (e.g. 2, p. 5 or Results paragraph)', { exact: true }).fill('Results paragraph');
  await card.getByLabel('Outcome measured', { exact: true }).fill('Example outcome');
  await card.getByLabel('Timepoint', { exact: true }).selectOption('not stated');
  await card.getByLabel('What was randomised?', { exact: true }).selectOption('not stated');
  for (const name of ['Analysis population (not found in the text)', 'Adjusted for other factors? (not found in the text)', 'Type of value (not found in the text)']) {
    await card.getByRole('combobox', { name, exact: true }).selectOption('not stated');
  }
}

test('PLANTED report currency checks preserve exclusions, refits and retained-study reruns', async ({ page }) => {
  await open(page, 'text');
  const panel = page.locator('#alm-f-panel-text');
  const original = await page.locator('#src').inputValue();
  const full = await page.evaluate(() => _almLastInfluence());
  const excluded = page.locator('#body input.excl').nth(5);
  await excluded.check();
  // Regeneration calls the same revision read as the deferred click/change listener.
  await panel.locator('.alm-text-regenerate').click();
  await expect(excluded).toBeChecked();
  const { ex, d } = await page.evaluate(() => ({ ex: _almLastExclusion(), d: _almLastDiag()[5] }));
  expect(ex.excluded).toEqual([5]); expect(ex.kept.k).toBe(full.k - 1);
  expect(ex.kept.mu).toBe(d.loo_mu); expect(ex.kept.seMu).toBe(d.loo_seMu);
  expect(ex.kept.tau2).toBe(d.loo_tau2);
  await expect(page.locator('#excl-sentence')).toContainText(ex.kept.mu.toFixed(4));
  for (const id of ['loo-plot', 'influence-plot', 'baujat-plot', 'radial-plot']) {
    await expect(page.locator(`#${id} g[data-i="5"]`)).toHaveAttribute('opacity', '0.22');
    await expect(page.locator(`#${id} g[data-i="0"]`)).toHaveAttribute('opacity', '1');
  }
  expect(await page.evaluate(() => _almLastInfluence())).toEqual(full);
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  await page.locator('#btn-excl-clear').click();
  await panel.locator('.alm-text-regenerate').click();
  expect((await page.evaluate(() => _almLastExclusion())).excluded).toEqual([]);
  await expect(page.locator('#src')).toHaveValue(original);
  await expect(page.locator('#model-summary thead th.excl-col').first()).toBeHidden();
  await excluded.check();
  await panel.locator('.alm-text-regenerate').click();
  await page.locator('#btn-excl-apply').click();
  await expect(page.locator('#body tr')).toHaveCount(10);
  await expect(page.locator('#src')).not.toHaveValue(original);
  expect((await page.evaluate(() => _almStudies())).map(r => r.label)).not.toContain('Outlier');
});

test('ENTRY: three formats reproduce the built-in example through parser APIs and the native input', async ({ page }) => {
  await open(page);
  const original = await page.evaluate(() => ({ full: _almLastInfluence(), studies: _almStudies() }));
  expect(original.studies.map(r => [r.label, r.te, r.se])).toEqual(EXAMPLE);
  let passed = 0;
  for (const [name, input] of formats) {
    const out = await page.evaluate(input => {
      const spec = AlmFeatures.get('influence'), table = AlmEntry.parseTable(input);
      const detected = AlmEntry.detect(table, spec.entry.schema);
      // Explicit user choice for these MD fixtures: the word "or" in RevMan's
      // "Study or Subgroup" header otherwise triggers the shared ratio question.
      const converted = AlmEntry.convert(table, detected, { name: spec.entry.schema, ratio: false }, {});
      if (converted.flags.some(f => f.blocking)) return { converted, detected };
      const response = spec.entry.apply(converted.records);
      return { converted, detected, response, full: _almLastInfluence(), studies: _almStudies(), src: document.getElementById('src').value };
    }, input);
    expect(out.converted.flags.filter(f => f.blocking), name).toEqual([]);
    expect(out.detected.questions, name).toEqual([]);
    expect(out.response).toEqual({ ok: true, n: 10 });
    expect(out.studies.map(s => s.label)).toEqual(original.studies.map(s => s.label));
    expect(Math.abs(out.full.mu - original.full.mu) / Math.abs(original.full.mu), name).toBeLessThanOrEqual(1e-9);
    for (let i = 0; i < EXAMPLE.length; i++) {
      expect(out.studies[i].te).toBe(EXAMPLE[i][1]);
      expect(Math.abs(out.studies[i].se - EXAMPLE[i][2]) / EXAMPLE[i][2]).toBeLessThanOrEqual(1e-9);
    }
    if (name.startsWith('paper')) expect(out.converted.steps.filter(s => s.method === 'SE from CI')).toHaveLength(10);
    passed++;
  }
  console.log(`ENTRYAPI ${passed}/${formats.length} (table API only; shared provenance table path is unavailable)`);
});

test('ENTRY PLANTED: reversed CI blocks application; conversion log and atomic native-input refusal', async ({ page }) => {
  await open(page);
  // Isolated table-API coverage. The shipped provenance UI is covered separately below.
  const out = await page.evaluate(input => {
    const spec = AlmFeatures.get('influence'), host = document.createElement('div');
    host.id = 'entry-api-check'; document.body.appendChild(host);
    const ui = AlmEntryUI.mount(host, { schema: spec.entry.schema, apply: spec.entry.apply });
    host.querySelector('textarea').value = input; ui.parse();
    const good = ui.getResult();
    const log = host.textContent;
    host.querySelector('textarea').value = 'Study\tMean difference\nBad\t0.2 (0.4–0.1)'; ui.parse();
    const bad = ui.getResult();
    const disabled = [...host.querySelectorAll('button')].find(b => b.textContent === 'Use these rows').disabled;
    const before = document.getElementById('src').value, errors = [];
    for (const records of [good.records.map((r, i) => i ? r : { ...r, sei: 0 }),
      good.records.map((r, i) => i ? r : { ...r, study: 'lost,label' }), good.records.slice(0, 2)]) {
      try { spec.entry.apply(records); errors.push('UNSAFE PASS'); } catch (e) { errors.push(e.message); }
    }
    return { good: good.steps.length, log, flags: bad.flags, disabled, errors, unchanged: before === document.getElementById('src').value };
  }, paper);
  expect(out.good).toBe(10);
  expect(out.log).toContain('Conversion log'); expect(out.log).toContain('SE estimated from CI');
  expect(out.flags.some(f => f.blocking)).toBe(true); expect(out.disabled).toBe(true);
  expect(out.errors).toHaveLength(3); expect(out.errors).not.toContain('UNSAFE PASS'); expect(out.unchanged).toBe(true);
  console.log('ENTRY PLANTED blocked; native-input refusals 3/3; conversion log 10/10');
});

test('REVIEW shared blocker: shipped provenance UI refuses table fixtures without replacing input', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry');
  await expect(panel.locator('.alm-entry-provenance')).toBeVisible();
  const before = await page.locator('#src').inputValue();
  for (const [name, input] of formats) {
    await panel.getByLabel('Paste the exact paper text or table', { exact: true }).fill(input);
    await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
    await expect(panel.getByRole('status'), name).toContainText('No supported result found');
    await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
    await expect(page.locator('#src')).toHaveValue(before);
  }
  console.log('ENTRY TABLE BLOCKER 3/3 reproduced in shipped UI; needs shared fix (see REPORT.md)');
});

test('ENTRY shipped provenance workflow: three confirmed sources round trip and Undo restores prior data', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry'), use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  const before = await page.locator('#src').inputValue();
  const inputs = [
    ['Smith 2019', 'Mean difference 0.25 (95% CI 0.09 to 0.41)', .25, .09, .41],
    ['Jones 2020', 'Mean difference 0.18 (95% CI 0.02 to 0.34)', .18, .02, .34],
    ['Lee 2021', 'Mean difference 0.30 (95% CI 0.10 to 0.50)', .30, .10, .50]
  ];
  for (const [label, text] of inputs) {
    await panel.getByLabel('Paste the exact paper text or table', { exact: true }).fill(text);
    await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
    // The shared label wraps the select, so getByLabel includes option text.
    // Match the control's exact accessible name (which excludes its options).
    const chooser = panel.getByRole('combobox', { name: 'Choose the source result to add', exact: true });
    await chooser.selectOption('0');
    await expect(chooser).toHaveValue('0');
    await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
    const card = panel.locator('fieldset').last();
    await expect(card.getByLabel('I confirm this row', { exact: true })).toBeDisabled();
    await fillSourceDetails(panel, card, label);
    await expect(use).toBeDisabled();
    await card.getByLabel('I confirm this row', { exact: true }).check();
  }
  await use.click();
  await expect(panel.getByRole('status')).toHaveText('Applied 3 confirmed rows. Data were extracted from 3 reports. The unit of randomisation was not stated for 3 rows.');
  const out = await page.evaluate(() => ({ studies: _almStudies(), provenance: AlmFeaturesState.provenance, log: AlmFeaturesState.entryLog }));
  expect(out.studies).toHaveLength(3); expect(out.provenance).toHaveLength(3);
  expect(out.log).toHaveLength(18); // One CI conversion plus five explicit missing-source statements per study.
  expect(out.log.filter(e => e.formula === 'SE = (U - L) / (2 × z)')).toHaveLength(3);
  for (let i = 0; i < inputs.length; i++) {
    const [label, text, yi, lo, hi] = inputs[i], p = out.provenance[i];
    expect(out.studies[i].label).toBe(label); expect(out.studies[i].te).toBe(yi);
    expect(Math.abs(out.studies[i].se - (hi - lo) / (2 * Z)) / ((hi - lo) / (2 * Z))).toBeLessThanOrEqual(1e-9);
    expect(p.pastedText).toBe(text); expect(p.confirmed).toBe(true); expect(p.confirmedAt).toBeTruthy();
    expect(p.confirmedBy).toBe('QA'); expect(p.source).toEqual({ type: 'Text', detail: 'Results paragraph' });
    expect(p.flags.filter(f => f.code.startsWith('NOT_STATED_')).map(f => f.code).sort()).toEqual(
      ['NOT_STATED_ADJUSTMENT', 'NOT_STATED_ANALYSISSET', 'NOT_STATED_PHASE', 'NOT_STATED_RANDOMISATION', 'NOT_STATED_TIMEPOINT']);
    expect(p.values.length).toBeGreaterThanOrEqual(3);
    for (const v of p.values) expect(text.slice(...v.span)).toBe(v.text);
  }
  console.log('ENTRYRT 3/3 (confirmed prose sources through shipped UI; tables blocked upstream)');
  await page.locator('#alm-undo-mount').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#src')).toHaveValue(before);
  expect(await page.evaluate(() => _almStudies().map(s => [s.label, s.te, s.se]))).toEqual(EXAMPLE);
});

test('ENTRY PLANTED shipped provenance workflow blocks a reversed confidence interval', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry'), before = await page.locator('#src').inputValue();
  await panel.getByLabel('Paste the exact paper text or table', { exact: true }).fill('Mean difference 0.25 (95% CI 0.41 to 0.09)');
  await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  const chooser = panel.getByRole('combobox', { name: 'Choose the source result to add', exact: true });
  await chooser.selectOption('0');
  await expect(chooser).toHaveValue('0');
  await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
  const card = panel.locator('fieldset').last();
  await fillSourceDetails(panel, card, 'Smith 2019');
  await expect(card).toContainText('Found 0.41 to 0.09 — the lower limit is above the upper limit; check the paper');
  await expect(card.getByLabel('I confirm this row', { exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(page.locator('#src')).toHaveValue(before);
});

test('REVIEW browser report and share agree with native parsing; ordinary pages ignore the test hook', async ({ page }) => {
  await open(page, 'text');
  const panel = page.locator('#alm-f-panel-text');
  await expect(panel.locator('.alm-influence-audit-scope')).toContainText('Only values displayed in the diagnostics table are cross-checked against the page');
  for (const literal of ['0.25', '+.25', '2e-1']) {
    await page.evaluate(literal => {
      const spec = AlmFeatures.get('influence');
      spec.share.set({ ...spec.share.get(), src: literal + ', 0.1, Smith, 2019\n0.2, 0.1, Jones\n0.3, 0.1, Lee' });
    }, literal);
    await panel.locator('.alm-text-regenerate').click();
    await expect(panel.locator('.alm-text-body')).toBeVisible();
    expect(await page.evaluate(() => _almStudies()[0])).toEqual({ te: Number(literal), se: .1, label: 'Smith, 2019' });
    const before = await page.evaluate(() => AlmFeatures.get('influence').text.results());
    for (const key of ['mu', 'tau2']) {
      await page.evaluate(key => { window.__almTextPerturb = { key, delta: 1 }; }, key);
      await panel.locator('.alm-text-regenerate').click();
      expect(await page.evaluate(() => AlmFeatures.get('influence').text.results())).toEqual(before);
      await expect(panel.locator('.alm-text-body')).toBeVisible();
    }
    await page.evaluate(() => { delete window.__almTextPerturb; });
  }
  for (const literal of ['0x10', '0.25suffix']) {
    const out = await page.evaluate(literal => {
      const spec = AlmFeatures.get('influence'), before = spec.share.get();
      try { spec.share.set({ ...before, src: literal + ', 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C' }); }
      catch (error) { return { error: error.message, unchanged: JSON.stringify(before) === JSON.stringify(spec.share.get()) }; }
      return { error: null, unchanged: false };
    }, literal);
    expect(out.error).toContain('Input refused'); expect(out.unchanged).toBe(true);
  }
});

test('TEXT: number audit, all original reported diagnostics and reviewed snapshot', async ({ page }, testInfo) => {
  await open(page, 'text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]); expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBe(82);
  const text = out.snapshot.results.replace(/−/g, '-');
  const values = await page.locator('#body tr').evaluateAll(rows => rows.flatMap((r, i) =>
    i === rows.length - 1 ? r.cells[10].textContent.match(/-?\d+\.\d+/g) :
      [2, 4, 5, 6, 7, 9, 10].flatMap(j => r.cells[j].textContent.match(/-?\d+\.\d+/g) || [])));
  for (const value of values) expect(text).toContain(value);
  expect(values).toHaveLength(82); console.log(`TEXTDOM ${values.length}/${values.length}`);
  await testInfo.attach('text-influence.json', { body: JSON.stringify(out.snapshot, null, 2) + '\n', contentType: 'application/json' });
  expect(out.snapshot).toEqual(reviewedSnapshot());
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeVisible();
});

test('TEXT exports; planted displayed-value defect withholds text; pending edits do not rerun the app', async ({ page }) => {
  await open(page, 'text');
  const panel = page.locator('#alm-f-panel-text');
  const result = await panel.locator('[data-para=results]').textContent();
  for (const [selector, ext] of [['.alm-text-md', 'md'], ['.alm-text-docx', 'docx']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), panel.locator(selector).click()]);
    expect(dl.suggestedFilename()).toBe(`influence-report-text.${ext}`);
    const bytes = fs.readFileSync(await dl.path());
    if (ext === 'md') expect(bytes.toString('utf8')).toContain(result);
    else expect(readZip(bytes).map(e => e.name)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  }
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-alm-test', '');
    window.__almTextPerturb = { key: 'mu', delta: .1 };
  });
  await panel.locator('.alm-text-regenerate').click();
  const audit = await page.evaluate(() => document.getElementById('alm-f-panel-text').almText.state.audit);
  expect(audit.ok).toBe(false); expect(audit.failures.map(f => f.check)).toContain('dom:mu');
  console.log(`TEXTAUDIT planted ${audit.passed}/${audit.checks} dom:mu FAIL`);
  await expect(panel.locator('.alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; document.documentElement.removeAttribute('data-alm-test'); });
  await panel.locator('.alm-text-regenerate').click();
  await expect(panel.locator('.alm-text-body')).toBeVisible();
  const before = await page.evaluate(() => _almLastInfluence());
  await page.locator('#src').fill('0.1, 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C');
  await panel.locator('.alm-text-regenerate').click();
  await expect(panel.locator('.alm-text-body')).toBeHidden();
  expect(await page.evaluate(() => _almLastInfluence())).toEqual(before);
});

test('VERIFY: real webR example, plots and ZIP; current-state wording; planted defect fails', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, 'verify');
  expect(await page.evaluate(() => AlmFeatures.get('influence').verify.adapter() === AlmValidate.adapters.influence)).toBe(true);
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  expect(await summary.textContent()).toBe('177 of 177 computed quantities match R; 0 not computed — PASS');
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(177).fill('PASS'));
  console.log('VERIFY 177/177');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('influence'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('plot(influence(res)');
  await axe(page, 'verify after R');
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  expect(dl.suggestedFilename()).toBe('influence-verify-in-r.zip');
  const entries = Object.fromEntries(readZip(fs.readFileSync(await dl.path())).map(e => [e.name, e.bytes]));
  for (const name of ['influence-verify.R', 'influence-verify-comparison.csv', 'sessionInfo.txt', 'console.txt', 'truthcert.json',
    'influence-influence-R-300dpi.png', 'influence-influence-R.pdf', 'influence-influence-R-300dpi.tiff']) expect(entries[name], name).toBeDefined();
  expect(Object.keys(entries).filter(n => /^influence-influence-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const decode = b => new TextDecoder().decode(b);
  expect(decode(entries['influence-verify.R'])).toContain('print(sessionInfo())');
  expect(decode(entries['influence-verify-comparison.csv']).trim().split('\n')).toHaveLength(178);
  expect(decode(entries['sessionInfo.txt'])).toContain('metafor');
  expect(decode(entries['influence-influence-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(entries['influence-influence-R-300dpi.png']); expect([png.width, png.height]).toEqual([2400, 2400]);
  const tif = readTiff(entries['influence-influence-R-300dpi.tiff']); expect(tif.tags[282].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(entries['truthcert.json']));
  expect(receipt.extra.results.n).toBe(177); expect(receipt.extra.results.passed).toBe(true);
  for (const f of receipt.extra.results.files) expect(f.sha256).toBe(createHash('sha256').update(entries[f.name]).digest('hex'));
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFY ZIP ${Object.keys(entries).length} entries; receipt hashes PASS`);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  const src = await page.locator('#src').inputValue();
  await page.locator('#src').fill(src.replace('0.25', '0.26'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('influence'))).toBe(false);
  await page.locator('#btn-run').click();
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  await page.locator('#src').fill(src); await page.locator('#btn-run').click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await page.evaluate(() => {
    const url = new URL(location.href); url.searchParams.set('almtest', '1'); history.replaceState(null, '', url.href);
    window.__almVerifyPerturb = { key: 'full.mu', delta: .1 };
  });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText('TEST MODE (test hook active; not a verification) — 176 of 177 computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active', { timeout: 600_000 });
  const failing = await panel.locator('tbody tr').evaluateAll(rows => rows.filter(r => r.querySelector('[data-result]').textContent !== 'PASS').map(r => r.dataset.key));
  expect(failing).toEqual(['full.mu']); console.log('VERIFY planted 176/177 full.mu FAIL');
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('influence'))).toBe(false);
  expect(errors).toEqual([]);
});

test('SHARE: data, axis options and provenance round trip; corrupt and invalid states change nothing', async ({ page, browser, baseURL }) => {
  await open(page, 'share');
  const baseline = await page.evaluate(() => AlmFeatures.get('influence').share.get());
  await page.locator('#src').fill(baseline.src.replace('0.25', '0.27')); await page.locator('#btn-run').click();
  await page.locator('[data-edge=min]').fill('-1'); await page.locator('[data-edge=max]').fill('2');
  await expect(page.locator('[data-edge=log]')).toBeDisabled(); await expect(page.locator('[data-edge=log]')).not.toBeChecked();
  await page.evaluate(() => { AlmFeaturesState.provenance = [{ id: 'test-source', label: 'Smith', reference: 'Example fixture', location: 'row 1', confirmed: true }]; });
  const expected = await page.evaluate(() => ({ state: AlmFeatures.get('influence').share.get(), mu: _almLastInfluence().mu, provenance: AlmFeaturesState.provenance }));
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('#alm-f-share-link')).not.toHaveValue('');
  const link = await page.locator('#alm-f-share-link').inputValue();
  const context = await browser.newContext();
  try {
    const other = await context.newPage(); await other.goto(link);
    await expect(other.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
    expect(await other.evaluate(() => ({ state: AlmFeatures.get('influence').share.get(), mu: _almLastInfluence().mu, provenance: AlmFeaturesState.provenance }))).toEqual(expected);
  } finally { await context.close(); }
  const invalid = await page.evaluate(async state => AlmShare.encode('influence', { ...state, src: state.src.replace('0.25', '0.9'), axis: { min: '5', max: '1', log: false } }, []), baseline);
  const invalidLog = await page.evaluate(async state => AlmShare.encode('influence', { ...state, axis: { ...state.axis, log: true } }, []), baseline);
  for (const hash of ['not-valid-%%%gzip', invalid, invalidLog]) {
    const clean = await browser.newContext();
    try {
      const other = await clean.newPage(); await other.goto(new URL(PAGE, baseURL).href + '#s=' + hash);
      await expect(other.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
      expect(await other.evaluate(() => AlmFeatures.get('influence').share.get())).toEqual(baseline);
    } finally { await clean.close(); }
  }
  console.log('SHARE roundtrip 1/1; corrupt/invalid refusal 3/3');
});

test('AXE: every feature tab has no serious or critical violations', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  for (const tab of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name: tab, exact: true }).click(); await axe(page, tab);
  }
  expect(errors).toEqual([]);
});
