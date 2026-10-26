import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Keep the app regression setup beside its browser tests so both follow
// the current shared confirmation workflow without changing shared fixtures.
const reviewRegressions = (() => {
  const require = createRequire(import.meta.url);
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const AlmText = require(path.join(root, 'shared/alm-text.js'));
  const AlmEntry = require(path.join(root, 'shared/alm-entry.js'));

  function fixture() {
    const modules = {};
    function node(tag = 'div') {
      const handlers = {};
      return { tagName: tag.toUpperCase(), _text: '', children: [], value: '', checked: false,
        get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
        set textContent(value) { this._text = value; this.children = []; },
        get ownerDocument() { return context.document; },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...children) { this.children = children; this.textContent = ''; },
        setAttribute() {}, addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
        async fire(type) { for (const fn of handlers[type] || []) await fn({ target: this }); },
        dispatchEvent() {}, click() {} };
    }
    const elements = Object.fromEntries(['src', 'measure', 'btn-run', 'fragility-note', 'alm-axis-mount'].map(id => [id, node()]));
    elements.src.value = 'Original, 3, 500, 8, 500'; elements.measure.value = 'OR';
    const axes = { min: node(), max: node(), log: node() };
    const last = { k: 5, measure: 'OR', mh_est: .299, mh_lo: .147, mh_hi: .609,
      mh_z: -3.33, mh_p: .00087544, peto_est: .339, peto_lo: .186, peto_hi: .619,
      peto_z: -3.53, peto_p: .00042212, fragility_index: null };
    const context = { AlmText, AlmEntry, AlmFeaturesState: { entryLog: [] }, Event: class {},
      AlmFeatures: { register() {}, registerModule(key, mod) { modules[key] = mod; }, verifiedCurrent() { return false; } },
      AlmEntryUI: { mount() { return {}; } }, _almLastMhPeto: () => last,
      document: { getElementById: id => elements[id], createElement: node,
        querySelector: selector => axes[/data-edge="(.*?)"/.exec(selector)[1]],
        querySelectorAll: selector => selector === '#per-body tr' ? Array(last.k).fill({}) : [] }
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'mh-peto/alm-features.js'), 'utf8'), context);
    const spec = context.AlmMhPetoFeatures;
    function render() {
      const r = spec.text.results(), ctx = { app: 'mh-peto', entryLog: [], verify: null };
      const out = AlmText.render(spec.text.templates, r, ctx);
      return { out, audit: AlmText.audit(out, r, { ctx, dom: spec.text.dom() }) };
    }
    return { context, spec, render, last, modules, node, elements };
  }

  async function confirmedWorkflow(plantDrift = false) {
    const f = fixture();
    let source = fs.readFileSync(path.join(root, 'shared/alm-entry-ui.js'), 'utf8');
    if (plantDrift) {
      assert.ok(source.includes('row.raw[v.field]=v.value'));
      source = source.replace('row.raw[v.field]=v.value', 'row.raw[v.field === "ai" ? "renamed_ai" : v.field]=v.value');
    }
    vm.runInNewContext(source, f.context);
    const panel = f.node();
    f.context.AlmEntryUI.mount(panel, f.spec.entry);
    const descendants = el => [el, ...el.children.flatMap(descendants)];
    const button = text => descendants(panel).find(e => e.tagName === 'BUTTON' && e.textContent === text);
    const field = (title, scope = panel) => descendants(scope).find(e => e.tagName === 'LABEL' && e.textContent.startsWith(title))
      ?.children.find(e => ['INPUT', 'SELECT'].includes(e.tagName));
    async function set(title, value, scope) {
      const el = field(title, scope); assert.ok(el, title); el.value = value;
      await el.fire(el.tagName === 'SELECT' ? 'change' : 'input');
    }
    await set('Your initials', 'EE');
    for (const [i, text] of ['12 of 150 vs 20 of 148', '7 of 100 vs 11 of 102'].entries()) {
      descendants(panel).find(e => e.tagName === 'TEXTAREA').value = text;
      await button('Extract candidates').fire('click'); await set('Choose the source result', '0');
      await button('Add chosen result').fire('click');
      const card = descendants(panel).filter(e => e.tagName === 'FIELDSET')[i];
      for (const [title, value] of [['Study label', ['Smith 2019', 'Jones 2020'][i]], ['Full reference', ['Synthetic Smith report', 'Synthetic Jones report'][i]],
        ['Source type', 'Table'], ['Location', '2'], ['Treatment arm', '0'], ['Control arm', '1'],
        ['Outcome measured', 'Events'], ['Timepoint', 'not stated'],
        [['Who is counted in 150 and 148?', 'Who is counted in 100 and 102?'][i], 'not stated']]) {
        await set(title, value, card);
      }
      assert.equal(field('I confirm', card).disabled, true);
      await set('What was randomised?', 'not stated', card);
      assert.equal(button('Use these rows').disabled, true);
      const confirm = field('I confirm', card); assert.equal(confirm.disabled, false);
      confirm.checked = true; await confirm.fire('change');
    }
    assert.equal(button('Use these rows').disabled, false);
    await button('Use these rows').fire('click');
    const status = descendants(panel).find(e => e.tagName === 'P' && e.textContent.startsWith('Applied '));
    assert.equal(status?.textContent, 'Applied 2 confirmed rows. Data were extracted from 2 reports. The unit of randomisation was not stated for 2 rows.');
    assert.equal(f.elements.src.value, 'Smith 2019, 12, 150, 20, 148\nJones 2020, 7, 100, 11, 102');
    assert.ok(f.context.AlmFeaturesState.provenance.every(r => r.confirmed));
    assert.ok(f.context.AlmFeaturesState.provenance.every(r => r.confirmedBy === 'EE' && r.confirmedVia === 'row' && r.confirmedAt));
  }

  // Execute the real page analysis and live adapter with only rendering widgets
  // stubbed. This checks the input/result association without requiring Chromium.
  function analysisFixture() {
    const html = fs.readFileSync(path.join(root, 'mh-peto/index.html'), 'utf8');
    const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
      id, value: '', checked: false, innerHTML: '', textContent: '', hidden: true,
      setAttribute() {}, removeAttribute() {}, addEventListener() {}, closest() { return null; }
    }]));
    elements.src.value = /<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1];
    elements.measure.value = 'OR';
    const context = { document: { readyState: 'loading', addEventListener() {},
      getElementById: id => elements[id], querySelector: () => null,
      querySelectorAll: sel => sel === '#src, #measure' ? [elements.src, elements.measure] : [] },
      matchMedia: () => ({ matches: false }),
      alm: { csvUpload() {}, plotExport() {}, axisControls() {}, resultsExport() {}, resetUndo() {}, tooltips() {},
        urlState: Object.assign(() => {}, { read: () => ({}), write() {} }) },
      AlmValidate: { mount() {} }, AlmText };
    context.window = context;
    vm.createContext(context);
    const load = name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
    load('hub/shared/analysis-lifecycle.js');
    for (const name of ['shared/ma-core.js', 'shared/fragility.js', 'shared/diagnostic-plots.js']) load(name);
    const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).find(s => s.includes('var Z975 ='));
    vm.runInContext(main, context);
    load('mh-peto/validate/adapter.js');
    context.AlmLiveAdapters = { 'mh-peto': context.AlmMhPetoValidationAdapter };
    load('shared/alm-features.js'); load('mh-peto/alm-features.js');
    return { context, elements };
  }

  const cases = {
    'real analysis state stays paired through edits, refusals and result restoration': () => {
      const { context: c, elements: e } = analysisFixture();
      const hook = c.__mhValidation, spec = c.AlmMhPetoFeatures;
      const original = e.src.value, first = c._almLastMhPeto();
      assert.equal(hook.isCurrent(), true);
      const native = c.AlmMhPetoValidationAdapter.live, feature = spec.verify.adapter().live;
      for (const measure of ['OR', 'RR', 'RD']) {
        e.measure.value = measure; hook.run();
        const state = feature.currentState(), expected = native.currentState();
        assert.deepEqual(state.rows, expected.rows); assert.deepEqual(state.result, expected.result);
        assert.equal(feature.buildScript(state), native.buildScript(expected));
        assert.deepEqual(feature.appValues(state), native.appValues(expected));
      }
      e.measure.value = 'OR'; hook.run(); c.__mhPetoLoo.run();
      const loo = c.__mhPetoLoo.last(), result = c._almLastMhPeto(), forest = e.forest.innerHTML;
      assert.equal(loo.rows.length, 5);
      const revision = c.AlmFeatures.revision('mh-peto');
      assert.equal(typeof revision, 'string');
      assert.equal(c.__mhPetoLoo.last(), loo);
      e.src.value = 'Software A, 10, 100, 20, 100\nSoftware B, 4, 50, 9, 50';
      assert.equal(spec.text.stale(), true);
      assert.equal(c.AlmFeatures.revision('mh-peto'), null);
      assert.equal(c._almLastMhPeto(), result); assert.equal(e.forest.innerHTML, forest);
      assert.equal(c.__mhPetoLoo.last(), loo);
      hook.run(); assert.equal(hook.isCurrent(), true); assert.equal(c._almLastMhPeto().k, 2);
      assert.equal(c.__mhPetoLoo.last(), null);
      assert.notEqual(c.AlmFeatures.revision('mh-peto'), revision);
      // Replays restore the original result object after temporarily running other inputs.
      hook.restoreResult(first); assert.equal(hook.isCurrent(), false);
      e.src.value = original; assert.equal(hook.isCurrent(), true);
      for (const src of ['', 'Software A,1,10,2,10', 'Software A,1.5,10,2,10\nSoftware B,2,10,3,10']) {
        e.src.value = src; hook.run();
        assert.equal(hook.isCurrent(), false); assert.equal(c._almLastMhPeto(), null);
        assert.throws(() => feature.currentState(), /Run analysis/);
        assert.equal(e['analysis-status'].hidden, true);
      }
    },
    'feature state reads never run the analysis; stale inputs refuse without mutation': () => {
      const f = fixture();
      let runs = 0, current = true;
      const rows = [{ label: 'Software fixture', e1: 3, n1: 500, e2: 8, n2: 500 }];
      const live = { packages: ['metafor'], compare: { tolerance: { default: 1e-9 } },
        currentState() { runs++; return { rows, measure: 'OR', result: f.last }; },
        buildScript() {}, appValues() {} };
      f.context.AlmLiveAdapters = { 'mh-peto': { live } };
      f.context.__mhValidation = { isCurrent: () => current, parse: () => rows };
      const adapted = f.spec.verify.adapter().live;
      assert.equal(adapted.buildScript, live.buildScript);
      assert.equal(adapted.appValues, live.appValues);
      assert.equal(adapted.compare, live.compare);
      assert.equal(adapted.currentState().result, f.last);
      assert.equal(adapted.currentState().rows, rows);
      assert.equal(runs, 0, 'reading feature state must not call the rendering validator');
      assert.equal(f.spec.text.stale(), false);
      current = false;
      assert.equal(f.spec.text.stale(), true);
      assert.throws(() => adapted.currentState(), /Run analysis/);
      assert.equal(runs, 0);
      // Control: the original live validator still owns its explicit run path.
      live.currentState(); assert.equal(runs, 1);
    },
    'autosave excludes feature controls while retaining legacy selectors': () => {
      const html = fs.readFileSync(path.join(root, 'mh-peto/index.html'), 'utf8');
      const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map(m => m[1]).find(s => s.includes('AlmAutosave.install'));
      assert.ok(script);
      let installed;
      const context = { document: { readyState: 'complete' },
        AlmAutosave: { install(opts) { installed = opts; } } };
      context.window = context;
      vm.runInNewContext(script, context);
      assert.equal(installed.appKey, 'mh-peto');
      const types = ['textarea', 'select', 'input[type=text]', 'input[type=number]',
        'input[type=checkbox]', 'input[type=radio]', 'input[type=range]'];
      assert.deepEqual(Array.from(installed.selectors), types.map(s =>
        s + ':not(#loo-only-flagged):not(#alm-features *)'));
    },
    'p values use threshold notation': () => {
      const { render } = fixture(), { out, audit } = render();
      assert.equal((out.results.text.match(/p < 0\.001/g) || []).length, 2);
      assert.doesNotMatch(out.results.text, /p = 0\.000/); assert.equal(audit.ok, true);
    },
    'study-count PLANTED defect fails independent DOM audit': () => {
      const f = fixture(); assert.equal(f.render().audit.ok, true);
      f.context.__almTextPerturb = { key: 'k', delta: 1 };
      const { audit } = f.render();
      assert.equal(audit.ok, false); assert.ok(audit.failures.some(x => x.check === 'dom:k'));
    },
    'common-effect limitation appears in plain text and notes at every k': () => {
      const f = fixture();
      for (const k of [2, 5, 12]) {
        f.last.k = k; const { out, audit } = f.render();
        for (const text of [out.plain.text, out.flags.map(x => x.text).join(' ')]) {
          assert.match(text, /single common effect across studies/);
          assert.match(text, /does not estimate between-study variation or a prediction interval/);
        }
        assert.equal(audit.ok, true);
      }
    },
    'share log rejects fabrication, inherited codes, nested bypass and size overflow atomically': () => {
      const { spec } = fixture(), before = JSON.stringify(spec.share.get());
      const claim = 'individual patient data for all 5 trials were obtained and re-analysed';
      const code = { study: 'Smith 2019', code: 'EVENTS_FROM_PERCENT' };
      for (const entryLog of [
        [{ study: 'Smith 2019', method: claim, citation: 'Cochrane Handbook v6.5' }],
        [{ row: 0, study: 'Smith 2019', text: claim, method: claim, citation: 'Cochrane Handbook v6.5', inputs: {}, flags: [] }],
        [{ ...code, conversions: [{ method: claim }] }], [{ ...code, code: 'toString', method: claim }],
        [{ ...code, study: 'x'.repeat(2049) }], Array(1001).fill(code), [null], ['made up']
      ]) {
        assert.throws(() => spec.share.set({ ...spec.share.get(), src: 'Changed', measure: 'RR', entryLog }));
        assert.equal(JSON.stringify(spec.share.get()), before);
      }
    },
    'conversion log renders separate list items': () => {
      const f = fixture(), panel = f.node();
      const lines = ['Smith 2019: events = pct/100·n', 'Jones 2020: events = pct/100·n'];
      f.context.AlmFeaturesState.entryLog = lines.map(text => ({ text }));
      const ui = f.modules.entry.render(panel, { block: f.spec.entry });
      const list = panel.children.find(x => x.tagName === 'UL'); assert.ok(list);
      assert.deepEqual(list.children.map(x => x.textContent), lines);
      assert.ok(list.children.every(x => x.tagName === 'LI'));
      f.context.AlmFeaturesState.entryLog = []; ui.onShow();
      assert.equal(list.children.length, 0);
    },
    'share log preserves known codes, real converter steps and existing transcription': () => {
      const f = fixture();
      const table = AlmEntry.parseTable('Study\tai\tn1i\tci\tn2i\nSmith 2019\t8%\t150\t20\t148');
      const converted = AlmEntry.convert(table, AlmEntry.detect(table, 'binary2x2'), 'binary2x2', {});
      assert.equal(converted.steps.length, 1);
      for (const entryLog of [[], [{ code: 'EVENTS_FROM_PERCENT', study: 'Smith 2019' }], converted.steps,
        [{ text: 'Counts transcribed without conversion', method: 'transcription' }]]) {
        f.spec.share.set({ ...f.spec.share.get(), entryLog });
        assert.equal(JSON.stringify(f.spec.share.get().entryLog), JSON.stringify(entryLog));
      }
      const step = converted.steps[0];
      for (const field of ['method', 'text', 'citation']) {
        assert.throws(() => f.spec.share.set({ ...f.spec.share.get(), entryLog: [{ ...step, [field]: 'fabricated claim' }] }));
      }
    },
    'confirmed provenance UI passes exact counts through the real adapter': async () => {
      await confirmedWorkflow(process.argv.includes('--plant-row-drift'));
      await assert.rejects(() => confirmedWorkflow(true), /Applied 2 confirmed rows/);
    }
  };

  return { cases };
})();

const APP = 'mh-peto', PAGE = '/mh-peto/index.html';
const SNAP = new URL('./__snapshots__/text-mh-peto.json', import.meta.url);
const rows = [
  ['StudyA', 3, 500, 8, 500], ['StudyB', 1, 200, 5, 200], ['StudyC', 0, 150, 4, 150],
  ['StudyD', 2, 400, 6, 400], ['StudyE', 4, 600, 10, 600]
];
const formats = [
  'Study\tai\tn1i\tci\tn2i\n' + rows.map(r => r.join('\t')).join('\n'),
  'Study  Treatment events  Control events\n' + rows.map(r => `${r[0]}  ${r[1]}/${r[2]}  ${r[3]}/${r[4]}`).join('\n'),
  'Study or Subgroup\tExperimental Events\tExperimental Total\tControl Events\tControl Total\n' +
    rows.map(r => r.join('\t')).join('\n')
];
async function open(page, tab = 'Data entry') {
  await page.goto(PAGE);
  await expect(page.locator('#pooled-body tr')).toHaveCount(2);
  await page.locator('#alm-features .alm-f-toggle').click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function render(page) {
  return page.evaluate(() => {
    const spec = AlmTextSpecs['mh-peto'], r = spec.results();
    const ctx = { app: 'mh-peto', build: AlmBuildInfo, entryLog: [], verify: null };
    const rendered = AlmText.render(spec.templates, r, ctx);
    const audit = AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
    const norm = p => p.segments.map(s =>
      s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
    return { audit, results: rendered.results.text, snapshot: {
      app: 'mh-peto', source: 'Built-in five-study example, OR; unmodified counts',
      plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
      flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full)
    } };
  });
}
async function axe(page, name) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
  const out = await new AxeBuilder({ page }).include('#alm-features')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = out.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log(`AXE ${name} serious/critical=${bad.length} passes=${out.passes.length}`);
  expect(bad).toEqual([]);
}

test('ENTRY: three table formats preserve every count and the example result through the shared APIs', async ({ page }) => {
  await open(page);
  const baseline = await page.evaluate(() => _almLastMhPeto());
  for (const [i, input] of formats.entries()) {
    const out = await page.evaluate(input => {
      const table = AlmEntry.parseTable(input), detection = AlmEntry.detect(table, 'binary2x2');
      const converted = AlmEntry.convert(table, detection, 'binary2x2', {});
      if (converted.flags.some(f => f.blocking) || converted.questions.length) throw new Error(JSON.stringify(converted));
      const applied = AlmFeatures.get('mh-peto').entry.apply(converted.records);
      AlmFeaturesState.entryLog = converted.steps;
      return { converted, applied, parsed: __mhValidation.parse(document.getElementById('src').value), result: _almLastMhPeto() };
    }, input);
    expect(out.applied).toEqual({ ok: true, n: 5 });
    expect(out.parsed).toEqual(rows.map(([label, e1, n1, e2, n2]) => ({ label, e1, n1, e2, n2 })));
    for (const [key, value] of Object.entries(baseline)) {
      if (typeof value === 'number') expect(Math.abs(out.result[key] - value)).toBeLessThanOrEqual(Math.abs(value) * 1e-9);
      else expect(out.result[key]).toEqual(value);
    }
    console.log(`ENTRYRT ${i + 1}/3 format=${['Excel', 'paper n/N', 'RevMan/Covidence'][i]} counts=20/20`);
  }
  await expect(page.getByRole('heading', { name: 'Conversion log', exact: true })).toBeVisible();
  await expect(page.locator('#alm-f-panel-entry')).toContainText('No numerical conversions recorded');
  // The integrated source-confirmation workflow starts with the apply gate closed.
  await expect(page.locator('#alm-f-panel-entry').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
});

test('ENTRY PLANTED: impossible event count blocks the shared UI and the app adapter atomically', async ({ page }) => {
  await open(page);
  const before = await page.locator('#src').inputValue();
  const bad = formats[0].replace('StudyA\t3\t500', 'StudyA\t501\t500');
  // Exercise the stable table API; use a separate shared table mount for its blocking-button contract.
  await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'table-gate'; document.body.appendChild(host);
    const spec = AlmFeatures.get('mh-peto').entry;
    window.entryGate = AlmEntryUI.mount(host, { schema: spec.schema, apply: spec.apply });
  });
  await page.locator('#table-gate textarea').fill(bad);
  await page.locator('#table-gate').getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(page.locator('#table-gate').getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await expect(page.locator('#table-gate .alm-entry-block').first()).toBeVisible();
  const result = await page.evaluate(() => {
    const c = entryGate.getResult();
    let rejected = false;
    try { AlmFeatures.get('mh-peto').entry.apply(c.records); } catch { rejected = true; }
    return { blocked: c.flags.some(f => f.blocking), rejected };
  });
  expect(result).toEqual({ blocked: true, rejected: true });
  expect(await page.locator('#src').inputValue()).toBe(before);
  console.log('ENTRY PLANTED blocking=1/1 adapter-refusal=1/1 unchanged=1/1');
});

test('TEXT: audited example matches displayed digits, exports and committed snapshot', async ({ page }, info) => {
  await open(page, 'Report text');
  const out = await render(page);
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(12);
  const shown = await page.locator('#pooled-body tr').evaluateAll(trs => trs.flatMap(tr => [
    tr.cells[1].textContent, ...tr.cells[2].textContent.replace(/[[\]]/g, '').split(',').map(s => s.trim()),
    tr.cells[3].textContent, tr.cells[4].textContent
  ]));
  const values = await page.evaluate(() => _almLastMhPeto());
  for (const [i, value] of shown.entries()) {
    if (i % 5 === 4) {
      const p = values[i < 5 ? 'mh_p' : 'peto_p'];
      expect(value).toBe(p.toFixed(3));
      expect(out.results).toContain(p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
    } else expect(out.results.replace(/−/g, '-')).toContain(value);
  }
  console.log(`TEXTDOM ${shown.length}/${shown.length}`);
  const actual = info.outputPath('text-mh-peto.json');
  fs.writeFileSync(actual, JSON.stringify(out.snapshot, null, 2) + '\n');
  await info.attach('text-mh-peto.json', { path: actual, contentType: 'application/json' });
  expect(out.snapshot).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  await expect(page.locator('#alm-f-panel-text .alm-text-audit')).toContainText('checks passed');
  const [md] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text .alm-text-md').click()]);
  expect(fs.readFileSync(await md.path(), 'utf8')).toContain(out.results);
  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-f-panel-text .alm-text-docx').click()]);
  expect(readZip(fs.readFileSync(await docx.path())).map(e => e.name)).toEqual(
    expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  console.log('TEXTEXPORT 2/2');
});

test('TEXT PLANTED: changed MH estimate fails DOM audit and withholds prose; RR/RD remain honest', async ({ page }) => {
  await open(page, 'Report text');
  await page.evaluate(() => { window.__almTextPerturb = { key: 'mh_est', delta: 0.1 }; });
  const out = await render(page);
  console.log(`TEXTAUDIT planted ${out.audit.passed}/${out.audit.checks}`);
  expect(out.audit.ok).toBe(false);
  expect(out.audit.failures.map(f => f.check)).toContain('dom:mh_est');
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('#alm-f-panel-text .alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('#alm-f-panel-text .alm-text-body')).toBeHidden();
  await page.evaluate(() => { delete window.__almTextPerturb; });
  for (const measure of ['RR', 'RD']) {
    await page.locator('#measure').selectOption(measure);
    const changed = await render(page);
    expect(changed.audit.ok, JSON.stringify(changed.audit.failures)).toBe(true);
    expect(changed.results).toContain(`MH ${measure}`);
    expect(changed.results).not.toContain('Peto OR');
    console.log(`TEXTAUDIT ${measure} ${changed.audit.passed}/${changed.audit.checks}`);
  }
});

test('VERIFY: live R, forest exports, ZIP integrity, planted failure and stale verification prose', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, 'Verify in R');
  const panel = page.locator('#alm-f-panel-verify'), summary = panel.getByTestId('verify-summary');
  // The OR adapter compares eight quantities for each estimator. Pin every key
  // so a dropped or uncomputed quantity cannot make a smaller comparison pass.
  const expectedKeys = ['mh', 'peto'].flatMap(prefix =>
    ['est', 'lo', 'hi', 'z', 'p', 'beta', 'se', 'p_tail'].map(key => `${prefix}_${key}`));
  const n = expectedKeys.length;
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText(`${n} of ${n} computed quantities match R; 0 not computed — PASS`, { timeout: 600_000 });
  await expect(summary).toHaveAttribute('data-result', 'pass');
  expect(await panel.locator('tbody tr').evaluateAll(trs => trs.map(tr => tr.dataset.key))).toEqual(expectedKeys);
  console.log(`VERIFY ${n}/${n}`);
  expect(await panel.locator('td[data-result]').allTextContents()).toEqual(Array(n).fill('PASS'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('mh-peto'))).toBe(true);
  await expect(panel.locator('figure img')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  await axe(page, 'verify after R');
  const [zip] = await Promise.all([page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const entries = readZip(fs.readFileSync(await zip.path()));
  const files = Object.fromEntries(entries.map(e => [e.name, e.bytes]));
  for (const name of ['mh-peto-verify.R', 'mh-peto-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'mh-peto-forest-R-300dpi.png', 'mh-peto-forest-R.pdf', 'mh-peto-forest-R-300dpi.tiff', 'truthcert.json']) {
    expect(files[name], name).toBeDefined();
  }
  expect(Object.keys(files).filter(n => /^mh-peto-forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  const decode = b => new TextDecoder().decode(b);
  expect(decode(files['mh-peto-verify.R'])).toContain('metafor::rma.mh');
  expect(decode(files['mh-peto-verify.R'])).toContain('metafor::rma.peto');
  expect(decode(files['mh-peto-verify.R'])).toContain('metafor::forest(mh');
  expect(decode(files['mh-peto-forest-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(files['mh-peto-forest-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  const tiff = readTiff(files['mh-peto-forest-R-300dpi.tiff']);
  expect(tiff.tags[282].value).toEqual([300, 1]);
  expect(tiff.tags[283].value).toEqual([300, 1]);
  const receipt = JSON.parse(decode(files['truthcert.json']));
  expect(receipt.extra.results.passed).toBe(true);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  console.log(`VERIFYZIP ${entries.length}/${entries.length} entries; PNG/PDF/TIFF/SVG checked`);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await expect(page.locator('[data-para=methods]')).toContainText('Results were independently verified in R');
  await page.locator('#src').fill((await page.locator('#src').inputValue()).replace('3, 500', '4, 500'));
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('mh-peto'))).toBe(false);
  await page.locator('#btn-run').click();
  await page.locator('#alm-f-panel-text .alm-text-regenerate').click();
  await expect(page.locator('[data-para=methods]')).not.toContainText('Results were independently verified in R');
  await page.locator('#src').fill(rows.map(r => r.join(', ')).join('\n'));
  await page.locator('#btn-run').click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await page.evaluate(() => {
    // The core ignores perturbations on ordinary URLs. Opt in only for the
    // planted-failure phase, after the real R result and exports were checked.
    const url = new URL(location.href); url.searchParams.set('almtest', '1');
    history.replaceState(null, '', url);
    window.__almVerifyPerturb = { key: 'mh_est', delta: 0.1 };
  });
  expect(await page.evaluate(() => AlmVerifyR.testHookActive())).toBe(true);
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText(`TEST MODE (test hook active; not a verification) — ${n - 1} of ${n} computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active`, { timeout: 300_000 });
  await expect(summary).toHaveAttribute('data-result', 'fail');
  await expect(summary).toHaveAttribute('data-test-mode', 'true');
  const failing = await panel.locator('tbody tr').evaluateAll(trs =>
    trs.filter(tr => tr.querySelector('[data-result]').textContent !== 'PASS').map(tr => tr.dataset.key));
  expect(failing).toEqual(['mh_est']);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('mh-peto'))).toBe(false);
  console.log(`VERIFY planted ${n - 1}/${n} failing=mh_est`);
  expect(errors).toEqual([]);
});

test('SHARE: data, measure, axis options, provenance and log survive; corrupt links change nothing', async ({ browser, baseURL }) => {
  const contexts = [];
  async function fresh(url) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); await page.goto(url); return page;
  }
  try {
    const page = await fresh(new URL(PAGE, baseURL).href);
    const initial = await page.locator('#src').inputValue();
    await page.locator('#src').fill('Alpha, 2, 60, 8, 60\nBeta, 1, 80, 6, 80\nGamma, 3, 90, 9, 90');
    await page.locator('#measure').selectOption('RR');
    await page.getByLabel('X axis minimum').fill('0.01');
    await page.getByLabel('X axis minimum').dispatchEvent('change');
    await page.getByLabel('X axis maximum').fill('10');
    await page.getByLabel('X axis maximum').dispatchEvent('change');
    await page.locator('#alm-axis-mount [data-edge=log]').check();
    await page.evaluate(() => {
      AlmFeaturesState.entryLog = [{ text: 'Counts transcribed without conversion', method: 'transcription' }];
      AlmFeaturesState.provenance = [{ label: 'Alpha', reference: 'Example fixture', location: 'Table', confirmed: true }];
    });
    const state = await page.evaluate(() => ({ input: AlmMhPetoFeatures.share.get(), result: _almLastMhPeto(),
      forest: document.getElementById('forest').innerHTML, provenance: AlmFeaturesState.provenance }));
    await page.locator('#alm-features .alm-f-toggle').click();
    await page.getByRole('tab', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
    await expect(page.getByTestId('share-status')).toContainText('Share link');
    const link = await page.getByLabel('Share link', { exact: true }).inputValue();
    const restored = await fresh(link);
    await expect(restored.getByTestId('share-status')).toHaveText('Analysis restored from the share link.');
    expect(await restored.evaluate(() => ({ input: AlmMhPetoFeatures.share.get(), result: _almLastMhPeto(),
      forest: document.getElementById('forest').innerHTML, provenance: AlmFeaturesState.provenance }))).toEqual(state);
    const corrupt = await fresh(link.slice(0, -12));
    await expect(corrupt.getByTestId('share-status')).toContainText('Nothing was changed.');
    expect(await corrupt.locator('#src').inputValue()).toBe(initial);
    expect(await corrupt.locator('#measure').inputValue()).toBe('OR');
    // A structurally valid envelope with invalid options also refuses atomically.
    const bad = await page.evaluate(async () => AlmShare.encode('mh-peto',
      { ...AlmMhPetoFeatures.share.get(), measure: 'invalid' }, []));
    const invalid = await fresh(new URL(PAGE, baseURL).href + '#s=' + bad);
    await expect(invalid.getByTestId('share-status')).toContainText('Nothing was changed.');
    expect(await invalid.locator('#src').inputValue()).toBe(initial);
    console.log('SHARE roundtrip=1/1 corrupted=1/1 invalid-options=1/1');
  } finally { for (const context of contexts) await context.close(); }
});

test('ACCESSIBILITY: all feature tabs have no serious or critical axe violations', async ({ page }) => {
  await open(page);
  for (const name of ['Data entry', 'Report text', 'Verify in R', 'Share']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await axe(page, name);
  }
});

test('REVIEW p values: Results uses threshold notation and audits the original p cells', async ({ page }) => {
  await open(page, 'Report text');
  const out = await render(page);
  expect(out.results.match(/p < 0\.001/g)).toHaveLength(2);
  expect(out.results).not.toMatch(/p = 0\.000/);
  expect(out.audit.ok).toBe(true);
  for (const key of ['mh_p', 'peto_p']) {
    await page.evaluate(key => { window.__almTextPerturb = { key, delta: 0.01 }; }, key);
    const bad = await render(page);
    expect(bad.audit.failures.map(f => f.check)).toContain(`dom:${key}`);
  }
});

test('REVIEW study count PLANTED: independent row count rejects changed k and hides text', async ({ page }) => {
  await open(page, 'Report text');
  expect((await render(page)).audit.ok).toBe(true);
  await page.evaluate(() => { window.__almTextPerturb = { key: 'k', delta: 1 }; });
  const bad = await render(page);
  expect(bad.audit.ok).toBe(false);
  expect(bad.audit.failures.map(f => f.check)).toContain('dom:k');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(page.locator('.alm-text-body')).toBeHidden();
});

test('REVIEW common effect: plain text and notes disclose limitations for every study count', async ({ page }) => {
  await open(page, 'Report text');
  for (const k of [2, 5, 12]) {
    await page.locator('#src').fill(Array.from({ length: k }, (_, i) => `Study${i}, 3, 500, 8, 500`).join('\n'));
    await page.locator('#btn-run').click();
    const out = await render(page);
    for (const text of [out.snapshot.plain, out.snapshot.flags.join(' ')]) {
      expect(text).toContain('single common effect across studies');
      expect(text).toContain('does not estimate between-study variation or a prediction interval');
    }
    expect(out.audit.ok).toBe(true);
  }
});

test('REVIEW share log: reject fabricated or oversized entries before any mutation', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const share = AlmMhPetoFeatures.share;
    const before = JSON.stringify({ state: share.get(), result: _almLastMhPeto(), forest: document.getElementById('forest').innerHTML });
    const claim = 'individual patient data for all 5 trials were obtained and re-analysed';
    const code = { study: 'Smith 2019', code: 'EVENTS_FROM_PERCENT' };
    const invalid = [
      [{ study: 'Smith 2019', method: claim, citation: 'Cochrane Handbook v6.5' }],
      [{ row: 0, study: 'Smith 2019', method: claim, text: claim, citation: 'Cochrane Handbook v6.5', inputs: {}, flags: [] }],
      [{ ...code, conversions: [{ method: claim }] }],
      [{ ...code, method: claim, code: 'toString' }],
      [{ ...code, study: 'x'.repeat(2049) }], Array(1001).fill(code), [null], ['made up']
    ];
    return invalid.map(entryLog => {
      let rejected = false;
      try { share.set({ ...share.get(), src: 'Changed, 2, 50, 5, 50\nOther, 3, 50, 6, 50', measure: 'RR', entryLog }); }
      catch { rejected = true; }
      return { rejected, unchanged: before === JSON.stringify({ state: share.get(), result: _almLastMhPeto(), forest: document.getElementById('forest').innerHTML }) };
    });
  });
  expect(result).toEqual(Array(8).fill({ rejected: true, unchanged: true }));
});

test('REVIEW conversion log: each study has a separate visible list item', async ({ page }) => {
  await open(page);
  const lines = ['Smith 2019: events = pct/100·n', 'Jones 2020: events = pct/100·n', 'Lee 2021: events = pct/100·n'];
  await page.evaluate(lines => { AlmFeaturesState.entryLog = lines.map(text => ({ text })); }, lines);
  await page.getByRole('tab', { name: 'Report text', exact: true }).click();
  await page.getByRole('tab', { name: 'Data entry', exact: true }).click();
  const items = page.locator('#alm-f-panel-entry h3 + ul > li');
  await expect(items).toHaveText(lines);
  const boxes = await items.evaluateAll(items => items.map(e => e.getBoundingClientRect().toJSON()));
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);
  expect(boxes[2].top).toBeGreaterThanOrEqual(boxes[1].bottom);
});

test('REVIEW provenance UI: two confirmed sources apply exact counts; PLANTED field drift is rejected', async ({ page }) => {
  await open(page);
  const panel = page.locator('#alm-f-panel-entry');
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  await panel.getByLabel('Your initials (recorded with each confirmation)', { exact: true }).fill('EE');
  for (const [i, text] of ['12 of 150 vs 20 of 148', '7 of 100 vs 11 of 102'].entries()) {
    await panel.getByLabel('Paste the exact paper text or table').fill(text);
    await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
    await panel.getByLabel('Choose the source result to add').selectOption('0');
    await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
    const card = panel.getByRole('group', { name: `Study source ${i + 1}`, exact: true });
    await card.getByLabel('Study label', { exact: false }).fill(['Smith 2019', 'Jones 2020'][i]);
    await card.getByLabel('Full reference', { exact: true }).fill(['Synthetic Smith report', 'Synthetic Jones report'][i]);
    await card.getByRole('combobox', { name: 'Source type', exact: true }).selectOption('Table');
    await card.getByLabel('Location', { exact: false }).fill('2');
    // These labels wrap their selects: getByLabel's text includes every option.
    // Match the exact accessible name, which excludes the embedded select.
    await card.getByRole('combobox', { name: 'Treatment arm', exact: true }).selectOption('0');
    await card.getByRole('combobox', { name: 'Control arm', exact: true }).selectOption('1');
    await card.getByLabel('Outcome measured', { exact: true }).fill('Events');
    await card.getByRole('combobox', { name: 'Timepoint', exact: true }).selectOption('not stated');
    // Once the arms are chosen, the caption names their actual source totals.
    await card.getByRole('combobox', { name: ['Who is counted in 150 and 148?', 'Who is counted in 100 and 102?'][i], exact: true }).selectOption('not stated');
    await expect(card.getByLabel('I confirm this row', { exact: true })).toBeDisabled();
    await card.getByRole('combobox', { name: 'What was randomised?', exact: true }).selectOption('not stated');
    await expect(use).toBeDisabled();
    await expect(card.getByLabel('I confirm this row', { exact: true })).toBeEnabled();
    await card.getByLabel('I confirm this row', { exact: true }).check();
  }
  await use.click();
  await expect(panel.getByRole('status')).toHaveText('Applied 2 confirmed rows. Data were extracted from 2 reports. The unit of randomisation was not stated for 2 rows.');
  await expect(page.locator('#src')).toHaveValue('Smith 2019, 12, 150, 20, 148\nJones 2020, 7, 100, 11, 102');
  expect(await page.evaluate(() => _almLastMhPeto().k)).toBe(2);
  expect(await page.evaluate(() => AlmFeaturesState.provenance.map(r => r.confirmed))).toEqual([true, true]);
  expect(await page.evaluate(() => AlmFeaturesState.provenance.map(r => ({ by: r.confirmedBy, via: r.confirmedVia,
    at: !!r.confirmedAt, source: r.source, denominator: r.choice.denominator, randomisation: r.choice.randomisation }))))
    .toEqual(Array(2).fill({ by: 'EE', via: 'row', at: true, source: { type: 'Table', detail: '2' },
      denominator: 'not stated', randomisation: 'not stated' }));
  // Deliberately lose the ai field from the confirmed values to prove the
  // adapter rejects the naming drift described in the review, atomically.
  const before = await page.locator('#src').inputValue();
  const planted = await page.evaluate(() => {
    const records = AlmFeaturesState.provenance.map(r => ({ study: r.label,
      ...Object.fromEntries(r.values.map(v => [v.field === 'ai' ? 'wrong_ai' : v.field, v.value])) }));
    try { AlmMhPetoFeatures.entry.apply(records); return false; } catch { return true; }
  });
  expect(planted).toBe(true);
  await expect(page.locator('#src')).toHaveValue(before);
});

test('LIFECYCLE: feature freshness preserves leave-one-out and pending edits until explicit Run', async ({ page }) => {
  await open(page, 'Report text');
  await page.locator('#btn-loo').click();
  await expect(page.locator('#loo-body tr')).toHaveCount(6);
  const before = await page.evaluate(() => ({ result: _almLastMhPeto(),
    loo: __mhPetoLoo.last(), forest: document.getElementById('forest').innerHTML }));
  const read = () => page.evaluate(() => {
    const spec = AlmTextSpecs['mh-peto'];
    const ctx = AlmText.context('mh-peto', spec);
    return { revision: ctx.revision, stale: spec.stale(), current: __mhValidation.isCurrent() };
  });
  expect(await read()).toMatchObject({ stale: false, current: true });
  expect(await page.evaluate(() => __mhPetoLoo.last())).toEqual(before.loo);
  await page.locator('#src').fill('Software A, 10, 100, 20, 100\nSoftware B, 4, 50, 9, 50');
  expect(await read()).toMatchObject({ revision: null, stale: true, current: false });
  await expect(page.locator('#analysis-stale')).toBeVisible();
  await expect(page.locator('#analysis-status')).toBeHidden();
  await page.locator('#alm-f-panel-text .alm-text-copy').first().click();
  await expect(page.locator('#alm-f-panel-text .alm-text-status')).toContainText('press Run analysis');
  expect(await page.evaluate(() => ({ result: _almLastMhPeto(),
    loo: __mhPetoLoo.last(), forest: document.getElementById('forest').innerHTML }))).toEqual(before);
  await page.locator('#btn-run').click();
  expect(await read()).toMatchObject({ stale: false, current: true });
  await expect(page.locator('#analysis-status')).toBeVisible();
  await expect(page.locator('#analysis-stale')).toBeHidden();
  await expect(page.locator('#loo-body tr')).toHaveCount(0);
  expect(await page.evaluate(() => _almLastMhPeto().k)).toBe(2);
  expect(await page.locator('#forest').innerHTML()).not.toBe(before.forest);
  await page.locator('#src').fill(''); await page.locator('#btn-run').click();
  expect(await read()).toMatchObject({ revision: null, stale: true, current: false });
  await expect(page.locator('#analysis-status')).toBeHidden();
  expect(await page.evaluate(() => _almLastMhPeto())).toBeNull();
});

test('AUTOSAVE: feature-panel edits do not change legacy draft keys or plot indices', async ({ page }) => {
  await open(page);
  const keys = () => page.evaluate(() => Object.keys(JSON.parse(
    localStorage.getItem('alm-autosave:mh-peto') || '{"values":{}}').values).sort());
  await page.evaluate(() => {
    localStorage.clear(); document.getElementById('src').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(keys).toEqual(['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution',
    'idx:1', 'idx:10', 'idx:6', 'idx:7', 'idx:8', 'idx:9', 'measure', 'src']);
  expect(await page.locator('#alm-plot-mount input[type=checkbox]').evaluateAll(els =>
    els.map(e => e.dataset.autosaveIndex))).toEqual(['9', '10']);
  await page.evaluate(() => localStorage.clear());
  await page.locator('#alm-f-panel-entry').getByLabel('Your initials (recorded with each confirmation)', { exact: true }).fill('QA');
  // Wait past the autosave debounce to prove this edit alone did not schedule a draft.
  await page.waitForTimeout(1000);
  expect(await keys()).toEqual([]);
});

for (const [name, check] of Object.entries(reviewRegressions.cases)) {
  test(`REVIEW adapter regression: ${name}`, check);
}
