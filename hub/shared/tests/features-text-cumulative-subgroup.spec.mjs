import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const APP = 'cumulative-subgroup';
async function open(page) {
  await page.goto('/' + APP + '/index.html');
  await page.locator('#btn-example').click();
}

// Preserve all twelve regression cases in this allowed spec; the legacy fixture
// predates the current entry contract and remains untouched.
registerReviewCases(test, new URL('../../../', import.meta.url));

test('ENTRY REVIEW: every source must be confirmed, edits revoke confirmation, and provenance reaches Methods', async ({ page }) => {
  await open(page);
  await page.evaluate(() => AlmFeatures.open('cumulative-subgroup', 'entry'));
  const panel = page.locator('#alm-f-panel-entry');
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true });
  const before = await page.locator('#f-data').inputValue();
  await panel.getByLabel('Your initials (recorded with each confirmation)', { exact: true }).fill('QA');
  await expect(use).toBeDisabled();
  for (let i = 0; i < 2; i++) {
    await panel.getByLabel('Paste the exact paper text or table', { exact: true }).fill('MD -0.20, 95% CI -0.40 to 0.00');
    await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
    // The wrapping label contains the option text; select by its accessible name.
    await panel.getByRole('combobox', { name: 'Choose the source result to add', exact: true }).selectOption('0');
    await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
    const card = panel.getByRole('group', { name: 'Study source ' + (i + 1), exact: true });
    await card.getByLabel('Study label (author and year, e.g. Smith 2019)', { exact: true }).fill('Smith ' + (2020 + i));
    await card.getByLabel('Full reference', { exact: true }).fill('Synthetic report ' + (i + 1));
    await card.getByLabel('Source type', { exact: true }).selectOption('Table');
    await card.getByLabel('Location: number or page (e.g. 2, p. 5 or Results paragraph)', { exact: true }).fill('2');
    await card.getByLabel('Outcome measured', { exact: true }).fill('Symptom score');
    await card.getByLabel('Timepoint', { exact: true }).selectOption('not stated');
    for (const name of ['What was randomised?', 'Analysis population (not found in the text)',
      'Adjusted for other factors? (not found in the text)', 'Type of value (not found in the text)']) {
      await expect(card.getByLabel('I confirm this row', { exact: true })).toBeDisabled();
      await card.getByLabel(name, { exact: true }).selectOption('not stated');
    }
    await expect(card.locator('mark').first()).toBeVisible();
    await expect(use).toBeDisabled();
    await expect(page.locator('#f-data')).toHaveValue(before);
    await card.getByLabel('I confirm this row', { exact: true }).check();
  }
  await expect(use).toBeEnabled();
  const first = panel.getByRole('group', { name: 'Study source 1', exact: true });
  await first.getByLabel('Full reference', { exact: true }).fill('Corrected synthetic reference');
  await expect(first.getByLabel('I confirm this row', { exact: true })).not.toBeChecked();
  await expect(use).toBeDisabled();
  await first.getByLabel('I confirm this row', { exact: true }).check();
  await use.click();
  await expect(panel.getByRole('status')).toHaveText('Applied 2 confirmed rows. Data were extracted from 2 reports. The unit of randomisation was not stated for 2 rows.');
  const state = await page.evaluate(() => ({ provenance: AlmFeaturesState.provenance, k: _almLastCumSub().k }));
  expect(state.k).toBe(2);
  expect(state.provenance).toHaveLength(2);
  for (const row of state.provenance) {
    expect(row.confirmed).toBe(true);
    expect(row.confirmedBy).toBe('QA');
    expect(row.source).toEqual({ type: 'Table', detail: '2' });
    expect(row.choice.randomisation).toBe('not stated');
    for (const key of ['analysisSet', 'adjustment', 'phase', 'timepoint']) expect(row.facets[key]).toBe('not stated');
    expect(row.confirmedAt).toBeTruthy();
    expect(row.location).toBe('Table 2');
    expect(row.pastedText).toBe('MD -0.20, 95% CI -0.40 to 0.00');
    for (const value of row.values) expect(row.pastedText.slice(...value.span)).toBe(value.text);
  }
  await page.evaluate(() => AlmFeatures.open('cumulative-subgroup', 'text'));
  await expect(page.locator('[data-para=methods]')).toContainText('Data were extracted from 2 reports (source location recorded for each study)');
  console.log('ENTRYRT confirmation=2/2 revoked-on-edit=PASS provenance=PASS');
});

test('ENTRY REVIEW PLANTED: silent row loss restores the previous input and pooled analysis', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const before = { data: document.getElementById('f-data').value, results: _almLastCumSub() };
    let message;
    try {
      AlmCumSubFeatures.entry.apply([
        { study: '#1 Smith 2019', yi: -0.3, sei: 0.1 },
        { study: 'Jones', yi: 0.1, sei: 0.2 },
        { study: 'Lee', yi: 0.2, sei: 0.2 }
      ]);
    } catch (e) { message = e.message; }
    return { before, after: { data: document.getElementById('f-data').value, results: _almLastCumSub() }, message };
  });
  expect(result.message).toMatch(/preserve.*round trip/);
  expect(result.after).toEqual(result.before);
});

test('TEXT REVIEW: small p-values and singleton subgroups retain the DOM number audit', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill('A, -2, 0.1, 2020, One\nB, -2, 0.1, 2021, One\nC, 2, 0.1, 2022, Two');
  await page.locator('#f-view').selectOption('subgroup');
  await page.evaluate(() => AlmFeatures.open('cumulative-subgroup', 'text'));
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await expect(page.locator('[data-para=results]')).toContainText('p < 0.001');
  await expect(page.locator('[data-para=results]')).toContainText('τ² is not estimable');
  await page.locator('#f-data').fill('A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, One');
  await page.locator('.alm-text-regenerate').click();
  await expect(page.locator('.alm-text-body')).toBeVisible();
  await expect(page.locator('[data-para=results]')).toContainText('No between-subgroup comparison is possible');
  await expect(page.locator('[data-para=plain]')).toContainText('not evidence of no effect');
});

// Pure app regression cases also runnable with node:test in restricted environments.
// No browser, accessibility or webR coverage is claimed by that supplemental run.
export function registerReviewCases(test, root) {
  const read = p => fs.readFileSync(new URL(p, root), 'utf8');
  function textLifecycle() {
    const ctx = vm.createContext({ console });
    ctx.window = ctx;
    vm.runInContext(read('shared/alm-features.js'), ctx);
    let mounts = 0, regenerations = 0;
    ctx.AlmTextUI = { mount(panel, options) {
      mounts++;
      assert.equal(options.app, 'cumulative-subgroup');
      assert.equal(options.text, ctx.AlmCumSubFeatures.text);
      return { regenerate() { regenerations++; } };
    } };
    vm.runInContext(read('cumulative-subgroup/alm-features.js'), ctx);
    const hooks = ctx.AlmFeatures.moduleFor('text').render({}, {
      app: 'cumulative-subgroup', block: ctx.AlmCumSubFeatures.text
    });
    return { hooks, counts: () => ({ mounts, regenerations }) };
  }

  test('LIFECYCLE PLANTED: hidden Report text never mounts analysis-reading listeners', () => {
    const { counts } = textLifecycle();
    // The former eager override mounted AlmTextUI during host creation. Its
    // document listeners re-rendered the app on edits and added validation runs
    // during corpus replay, even though Report text had never been opened.
    assert.deepEqual(counts(), { mounts: 0, regenerations: 0 });
  });

  test('LIFECYCLE control: opening Report text mounts it and reopening refreshes it', () => {
    const { hooks, counts } = textLifecycle();
    hooks.onShow();
    assert.equal(counts().mounts, 1);
    const before = counts().regenerations;
    hooks.onShow();
    assert.equal(counts().mounts, 1);
    assert.equal(counts().regenerations, before + 1);
  });

  function setup(data = 'A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, Two', view = 'subgroup') {
    const html = read('cumulative-subgroup/index.html');
    const input = { value: data, dispatchEvent() {} };
    const ctx = vm.createContext({ console, Event, TextEncoder, document: { getElementById: () => input } });
    ctx.window = ctx;
    vm.runInContext(read('shared/ma-core.js'), ctx);
    vm.runInContext('var Z975 = 1.959963984540054;\n' + html.slice(html.indexOf('    function parseStudies('), html.indexOf('    function escapeXml(')), ctx);
    vm.runInContext('function render() {}\n' + html.slice(html.indexOf('    window.__almLoad = function'), html.indexOf('    // Expose last results for export')), ctx);
    vm.runInContext(read('shared/alm-text.js'), ctx);
    ctx.alm = { urlState: { withoutWrites: fn => fn() } };
    const modules = {};
    ctx.AlmFeatures = { register() {}, registerModule: (key, mod) => { modules[key] = mod; }, verifiedCurrent: () => !!ctx.verified };
    ctx.__almCumSubValidationRun = () => {
      const parsed = ctx.parseStudies(input.value), rows = parsed.studies;
      return { parsed, summary: { view }, cum: ctx.cumulative(rows), sub: ctx.subgroup(rows) };
    };
    ctx._almLastCumSub = () => ({ view });
    vm.runInContext(read('cumulative-subgroup/alm-features.js'), ctx);
    const spec = ctx.AlmCumSubFeatures;
    function report(context = {}) {
      const r = spec.text.results();
      const rendered = ctx.AlmText.render(spec.text.templates, r, context);
      const audit = ctx.AlmText.audit(rendered, r, { ctx: context });
      assert.equal(audit.ok, true, JSON.stringify(audit.failures));
      return { r, rendered };
    }
    return { ctx, input, spec, report, modules };
  }
  const rows = [
    { study: '#1 Smith 2019', yi: -0.3, sei: 0.1 },
    { study: 'Jones', yi: 0.1, sei: 0.2 },
    { study: 'Lee', yi: 0.2, sei: 0.2 }
  ];

  test('P1 dropped comment-label row is rejected and the previous input is restored', () => {
    const { spec, input } = setup(), before = input.value;
    assert.throws(() => spec.entry.apply(rows), /preserv|round.trip|label/i);
    assert.equal(input.value, before);
  });

  test('P1 PLANTED loader corruption or parser warnings fail the import gate atomically', () => {
    for (const defect of ['label', 'est', 'se', 'year', 'group', 'warning']) {
      const { ctx, spec, input } = setup(), before = input.value;
      const observe = ctx.__almCumSubValidationRun;
      ctx.__almCumSubValidationRun = () => {
        const a = observe();
        if (defect === 'warning') a.parsed.warnings.push('planted warning');
        else a.parsed.studies[0][defect] = defect === 'label' || defect === 'group' ? 'changed' : 123;
        return a;
      };
      assert.throws(() => spec.entry.apply(rows.slice(1)), /preserv|round.trip|warning/i, defect);
      assert.equal(input.value, before, defect);
    }
  });

  test('P1 entry opts into source confirmation with an explicit analysis scale', () => {
    const { spec } = setup();
    assert.match(spec.entry.usedAs || '', /estimate and SE on the supplied analysis scale/);
  });

  test('ENTRY feedback: production confirmation panel logs blocked table conversions without applying rows', async () => {
    const descendants = e => [e, ...e.children.flatMap(descendants)];
    class Element {
      constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.handlers = {}; this.value = ''; this.attributes = {}; this._text = ''; }
      set textContent(v) { this._text = String(v); this.children = []; }
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
      appendChild(c) { this.children.push(c); c.parent = this; return c; }
      replaceChildren() { this.children = []; this._text = ''; }
      setAttribute(k, v) { this.attributes[k] = v; }
      querySelector(tag) { return descendants(this).slice(1).find(e => e.tagName === tag) || null; }
      addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
      removeEventListener(k, fn) { this.handlers[k] = (this.handlers[k] || []).filter(f => f !== fn); }
      async fire(type, target = this) {
        for (const fn of this.handlers[type] || []) await fn({ target });
        if (this.parent) await this.parent.fire(type, target);
      }
    }
    const { ctx, spec, input, modules } = setup(), before = input.value;
    vm.runInContext(read('shared/alm-entry.js'), ctx);
    vm.runInContext(read('shared/alm-entry-ui.js'), ctx);
    const doc = { createElement(tag) { return new Element(tag, this); } }, root = new Element('div', doc);
    const ui = modules.entry.render(root, { block: spec.entry });
    const paste = root.querySelector('textarea');
    const button = title => descendants(root).find(e => e.tagName === 'button' && e.textContent === title);
    paste.value = 'study\testimate\tyear\tsubgroup\nBad\t-0.2 (0.4 to -0.8)\t2020\tA';
    ui.parse();
    assert.ok(descendants(root).some(e => e.tagName === 'h3' && e.textContent === 'Conversion log'));
    assert.ok(descendants(root).some(e => e.className === 'alm-entry-block' && /lower|upper|revers/i.test(e.textContent)), 'actual reversed-CI diagnostic is visible');
    assert.equal(button('Use these rows').disabled, true);
    await button('Use these rows').fire('click');
    assert.equal(input.value, before);
    paste.value = 'study\tMD\tyear\tsubgroup\nGood\t-0.2 (-0.8 to 0.4)\t2020\tA';
    await paste.fire('input');
    assert.equal(descendants(root).some(e => e.className === 'alm-entry-block'), false, 'editing clears stale diagnostics');
    await button('Extract candidates').fire('click');
    assert.match(root.textContent, /SE estimated from CI/);
    assert.equal(descendants(root).some(e => e.className === 'alm-entry-block'), false);
    assert.equal(button('Use these rows').disabled, true, 'a valid conversion still requires source confirmation');
    assert.equal(input.value, before);
  });

  test('P1 confirmation UI gates every row, revokes edited confirmation and applies source provenance', async () => {
    // A DOM behavior double; browser layout and accessibility remain Playwright gates.
    class Element {
      constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.handlers = {}; this.value = ''; this.disabled = false; this._text = ''; }
      set textContent(v) { this._text = String(v); this.children = []; }
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
      appendChild(c) { this.children.push(c); c.parent = this; return c; }
      replaceChildren() { this.children = []; this._text = ''; }
      setAttribute() {}
      addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
      async fire(type) { for (const fn of this.handlers[type] || []) await fn({ target: this }); }
    }
    const descendants = e => [e, ...e.children.flatMap(descendants)];
    const { ctx, spec, input } = setup(), before = input.value;
    vm.runInContext(read('shared/alm-entry.js'), ctx);
    vm.runInContext(read('shared/alm-entry-ui.js'), ctx);
    const doc = { createElement(tag) { return new Element(tag, this); } }, root = new Element('div', doc);
    const panel = ctx.AlmEntryUI.mount(root, spec.entry);
    const button = title => descendants(root).find(e => e.tagName === 'button' && e.textContent === title);
    const field = (scope, title) => descendants(scope).find(e => e.tagName === 'label' && e.textContent.startsWith(title))?.children.find(e => ['input', 'select'].includes(e.tagName));
    async function set(scope, title, value) {
      const e = field(scope, title); assert.ok(e, title); e.value = value; await e.fire(e.tagName === 'select' ? 'change' : 'input');
    }
    const use = button('Use these rows'), cards = [];
    await set(root, 'Your initials', 'QA');
    for (let i = 0; i < 2; i++) {
      descendants(root).find(e => e.tagName === 'textarea').value = 'MD -0.20, 95% CI -0.40 to 0.00';
      assert.ok(button('Extract candidates'), 'source-confirmation workflow is mounted');
      await button('Extract candidates').fire('click');
      await set(root, 'Choose the source result', '0');
      await button('Add chosen result').fire('click');
      const card = descendants(root).filter(e => e.tagName === 'fieldset').at(-1); cards.push(card);
      for (const [title, value] of [['Study label', 'Smith ' + (2020 + i)], ['Full reference', 'Synthetic report'], ['Source type', 'Table'], ['Location', '2'], ['Outcome measured', 'Symptom score'], ['Timepoint', 'not stated']]) await set(card, title, value);
      assert.equal(use.disabled, true);
      await use.fire('click');
      assert.equal(input.value, before);
      assert.ok(descendants(card).some(e => e.tagName === 'mark'));
      const confirm = field(card, 'I confirm');
      for (const title of ['What was randomised?', 'Analysis population', 'Adjusted for other factors?', 'Type of value']) {
        assert.equal(confirm.disabled, true, title + ' must be answered explicitly');
        await set(card, title, 'not stated');
      }
      assert.equal(confirm.disabled, false);
      confirm.checked = true; await confirm.fire('change');
    }
    assert.equal(use.disabled, false);
    await set(cards[0], 'Location', '3');
    assert.equal(use.disabled, true);
    assert.equal(field(cards[0], 'I confirm').checked, false);
    field(cards[0], 'I confirm').checked = true; await field(cards[0], 'I confirm').fire('change');
    await use.fire('click');
    assert.match(root.textContent, /Applied 2 confirmed rows/);
    assert.equal(ctx.__almCumSubValidationRun().parsed.studies.length, 2);
    const provenance = ctx.AlmFeaturesState.provenance;
    assert.equal(provenance.length, 2);
    for (const row of provenance) {
      assert.equal(row.confirmed, true); assert.ok(row.confirmedAt);
      assert.equal(row.confirmedBy, 'QA');
      assert.equal(row.source.type, 'Table');
      assert.equal(row.choice.randomisation, 'not stated');
      for (const key of ['analysisSet', 'adjustment', 'phase', 'timepoint']) assert.equal(row.facets[key], 'not stated');
      for (const v of row.values) assert.equal(row.pastedText.slice(...v.span), v.text);
    }
    assert.equal(panel.getResult().provenance[0].location, 'Table 3');
  });

  test('P2 short or fractional years cannot silently become subgroups', () => {
    for (const year of [95, 96, 999, -2020, 2020.5]) {
      const { spec, input } = setup(), before = input.value;
      assert.throws(() => spec.entry.apply([{ ...rows[1], year }, rows[2]]), /year/i);
      assert.equal(input.value, before);
    }
    const { spec, ctx } = setup();
    spec.entry.apply([{ ...rows[1], year: 2020 }, { ...rows[2], year: 2021 }]);
    assert.deepEqual(Array.from(ctx.__almCumSubValidationRun().parsed.studies, r => [r.year, r.group]), [[2020, null], [2021, null]]);
  });

  test('P2 small between-subgroup p-values use a typed threshold', () => {
    const { report } = setup('A, -2, 0.1, 2020, One\nB, -2, 0.1, 2021, One\nC, 2, 0.1, 2022, Two\nD, 2, 0.1, 2023, Two');
    const { rendered } = report();
    assert.match(rendered.results.text, /p < 0\.001/);
    assert.doesNotMatch(rendered.results.text, /p = 0\.000/);
    assert.doesNotMatch(rendered.flags.map(f => f.text).join(' '), /rounded to zero/);
  });

  test('P2 a single subgroup has no between-subgroup test', () => {
    const { rendered } = setup('A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, One').report();
    assert.match(rendered.results.text, /1 subgroup\./);
    assert.match(rendered.results.text, /no between-subgroup comparison is possible/i);
    assert.doesNotMatch(rendered.results.text, /Between-subgroup Q|df =|p was unavailable|I² of differences/);
    assert.doesNotMatch(rendered.methods.text, /Between-subgroup Q used/);
  });

  test('P2 sparse subgroups warn even when overall k is large; singleton tau is not estimable', () => {
    const data = Array.from({ length: 10 }, (_, i) => `S${i}, 0.2, 0.1, ${2000 + i}, ${i ? 'Many' : 'Singleton'}`).join('\n');
    const { rendered } = setup(data).report();
    assert.match(rendered.flags.map(f => f.text).join(' '), /subgroup.*few studies.*heterogeneity estimates are imprecise/i);
    assert.match(rendered.results.text, /1 study; pooled effect .*τ² is not estimable/);
  });

  test('P2 prediction interval minimum is described accurately and constants are not results', () => {
    const { r, rendered } = setup().report();
    assert.match(rendered.methods.text, /whenever at least two studies were pooled/);
    for (const key of ['piMin', 'ciLevel', 'nullEffect']) assert.equal(Object.hasOwn(r, key), false, key);
    assert.ok(rendered.methods.segments.some(s => s.type === 'rule' && s.id === 'ciLevel'));
  });

  test('P2 null-crossing confidence intervals explain uncertainty without equating effects', () => {
    const { rendered } = setup().report();
    assert.match(rendered.plain.text, /no clear evidence of a difference/);
    assert.match(rendered.plain.text, /not evidence of no effect/);
    assert.match(rendered.plain.text, /imprecis.*effects in either direction/i);
    assert.doesNotMatch(rendered.plain.text, /effects are the same/);
    const other = setup('A, 2, 0.1, 2020, One\nB, 2, 0.1, 2021, Two').report();
    assert.doesNotMatch(other.rendered.plain.text, /imprecis/);
  });

  test('P2 verified Methods separate R comparisons from page checks and withhold stale claims', () => {
    const { ctx, report } = setup();
    const verify = { passed: true, revision: 'current', packages: ['metafor'], versions: { metafor: '4.8-0', webR: '0.5.0' },
      rows: ['overall.mu', 'group_coverage', 'group_order', 'export.k', 'display.plot', 'export.fields', 'series_rows'].map(key => ({ key, pass: true })) };
    ctx.verified = true;
    ctx.AlmFeaturesState = { verify };
    const context = { verify, revision: 'current', verifyPackage: 'metafor' };
    const { rendered } = report(context);
    assert.match(rendered.methods.text, /4 statistical quantities matched R; 3 page self-checks passed/);
    assert.doesNotMatch(rendered.methods.text, /all 7 compared quantities/);
    ctx.verified = false;
    assert.doesNotMatch(report(context).rendered.methods.text, /independently verified/);
    ctx.verified = true;
    assert.doesNotMatch(report({ ...context, revision: 'stale' }).rendered.methods.text, /independently verified/);
    verify.rows[0].pass = false;
    assert.doesNotMatch(report(context).rendered.methods.text, /independently verified/);
  });

  // Exercise the current verifier's missing-value policy with actual app pool values.
  // Mirrored values below test policy only; they are not an independent R reference.
  function verificationState(ctx, view) {
    const a = ctx.__almCumSubValidationRun(), values = [];
    const pools = view === 'cumulative'
      ? a.cum.series.map((p, i) => ['step.' + (i + 1), p])
      : a.sub.groups.map((p, i) => ['group.' + (i + 1), p]).concat([['overall', a.sub.overall]]);
    for (const [prefix, pool] of pools) {
      for (const field of ['k', 'mu', 'se', 'tau2', 'lo', 'hi', 'Q', 'piLo', 'piHi']) {
        values.push({ key: prefix + '.' + field, value: pool[field] });
      }
    }
    if (view === 'subgroup') {
      const pQ = Number.isFinite(a.sub.pQ) ? a.sub.pQ : null;
      values.push({ key: 'pQ', value: pQ }, { key: 'export.pQ', value: pQ });
    }
    return { view, groups: view === 'subgroup' ? a.sub.groups.map(g => g.name) : null, values };
  }

  function verifiedSetup(view = 'cumulative', data) {
    const env = setup(data, view), { ctx, spec } = env;
    vm.runInContext(read('shared/alm-validate.js'), ctx);
    vm.runInContext(read('shared/alm-verify-r.js'), ctx);
    const state = verificationState(ctx, view);
    // Mirrored synthetic values exercise the real verifier/text integration policy.
    // The unchanged browser spec supplies the independent webR/metafor reference.
    const reference = Object.fromEntries(state.values.map(v => [v.key, v.value]));
    const verify = ctx.AlmVerifyR.evaluate(state.values, reference, { tolerance: { default: 1e-9 } },
      { compare: ctx.AlmValidate.compare, notApplicable: spec.verify.optional(state) });
    Object.assign(verify, { app: 'cumulative-subgroup', revision: 'current', packages: ['metafor'],
      versions: { metafor: '4.8-0', webR: '0.5.5' } });
    // The production observation hook only runs the selected view; the other is null.
    const observe = ctx.__almCumSubValidationRun;
    ctx.__almCumSubValidationRun = () => {
      const a = observe();
      a[view === 'cumulative' ? 'sub' : 'cum'] = null;
      return a;
    };
    ctx.verified = true;
    ctx.AlmFeaturesState = { verify };
    return { ...env, verify, context: { verify, revision: 'current', verifiedCurrent: true, verifyPackage: 'metafor' } };
  }

  test('VERIFY feedback: Methods accepts declared two-sided N/A rows without counting or changing them', () => {
    for (const [view, data] of [
      ['cumulative', undefined],
      ['subgroup', undefined],
      ['subgroup', 'A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, One']
    ]) {
      const { ctx, verify, context, report } = verifiedSetup(view, data);
      assert.equal(verify.passed, true);
      assert.ok(verify.nNotApplicable > 0);
      const original = JSON.stringify(verify);
      verify.rows.forEach(Object.freeze); Object.freeze(verify.rows); Object.freeze(verify);
      const { r, rendered } = report(context);
      assert.match(rendered.methods.text, /independently verified in R \(metafor 4\.8-0; webR 0\.5\.5\)/);
      assert.ok(rendered.methods.text.includes(`${verify.nPassed} statistical quantities matched R; 0 page self-checks passed`));
      assert.equal(r.verifyStats, verify.nPassed);
      assert.equal(JSON.stringify(verify), original, 'comparison rows and receipt inputs stay untouched');
      assert.match(ctx.AlmText.toMarkdown(rendered), /independently verified in R/);
      assert.ok(rendered.methods.segments.some(s => s.type === 'num' && s.key === 'verifyStats'));
      const edited = JSON.parse(JSON.stringify(rendered));
      const count = edited.methods.segments.find(s => s.key === 'verifyStats');
      count.text = String(verify.nPassed + verify.nNotApplicable);
      edited.methods.text = edited.methods.segments.map(s => s.text).join('');
      assert.equal(ctx.AlmText.audit(edited, r, { ctx: context }).ok, false, 'N/A rows cannot inflate the audited count');
      const mislabeled = JSON.parse(JSON.stringify(rendered));
      const version = mislabeled.methods.segments.find(s => s.key === 'verifyPackageVersion');
      version.text = 'changed version';
      mislabeled.methods.text = mislabeled.methods.segments.map(s => s.text).join('');
      assert.equal(ctx.AlmText.audit(mislabeled, r, { ctx: context }).ok, false, 'software metadata remains audited');
    }
  });

  test('VERIFY feedback PLANTED: N/A support never admits failed, stale, missing or test-mode verification', () => {
    const defects = {
      'failed run': ({ verify }) => { verify.passed = false; },
      'failed row': ({ verify }) => { verify.rows.find(r => r.key === 'step.2.mu').pass = false; },
      'contradictory status': ({ verify }) => { verify.rows.find(r => r.key === 'step.2.mu').status = 'error'; },
      'missing pass': ({ verify }) => { delete verify.rows.find(r => r.key === 'step.2.mu').pass; },
      'nonboolean pass': ({ verify }) => { verify.rows.find(r => r.key === 'step.2.mu').pass = 'true'; },
      'undeclared N/A': ({ verify }) => { Object.assign(verify.rows.find(r => r.key === 'step.2.mu'), { status: 'notapplicable', pass: false, app: null, ref: null }); },
      'computed PI labeled N/A': ({ verify }) => { Object.assign(verify.rows.find(r => r.key === 'step.2.piLo'), { status: 'notapplicable', pass: false, app: null, ref: null }); },
      'app-only value': ({ verify }) => { verify.rows.find(r => r.key === 'step.1.piLo').app = 0; },
      'R-only value': ({ verify }) => { verify.rows.find(r => r.key === 'step.1.piLo').ref = 0; },
      'optional missing': ({ verify }) => { verify.rows.find(r => r.key === 'step.1.piLo').status = 'optional'; },
      'test hook': ({ verify }) => { verify.testHook = true; },
      'stale run': ({ verify }) => { verify.stale = true; },
      'stale revision': ({ context }) => { context.revision = 'edited'; },
      'missing revision': ({ context }) => { delete context.revision; },
      'host stale': ({ ctx }) => { ctx.verified = false; },
      'context stale': ({ context }) => { context.verifiedCurrent = false; },
      'missing package': ({ verify }) => { verify.packages = []; },
      'missing package version': ({ verify }) => { delete verify.versions.metafor; },
      'missing webR version': ({ verify }) => { delete verify.versions.webR; },
      'wrong app': ({ verify }) => { verify.app = 'another-app'; },
      'null row': ({ verify }) => { verify.rows[0] = null; },
      'missing rows': ({ verify }) => { delete verify.rows; },
      'empty rows': ({ verify }) => { verify.rows = []; },
      'nothing computed': ({ verify }) => { verify.rows = verify.rows.filter(r => r.status === 'notapplicable'); }
    };
    for (const [name, defect] of Object.entries(defects)) {
      const env = verifiedSetup();
      defect(env);
      assert.doesNotMatch(env.report(env.context).rendered.methods.text, /independently verified in R/, name);
    }
  });

  test('VERIFY REVIEW: only singleton PIs and one-group p-values are not applicable', () => {
    const { ctx, spec } = setup();
    const cumulative = verificationState(ctx, 'cumulative');
    assert.deepEqual(Array.from(spec.verify.optional(cumulative)), ['step.1.piLo', 'step.1.piHi']);
    assert.deepEqual(Array.from(spec.verify.optional(verificationState(ctx, 'subgroup'))),
      ['group.1.piLo', 'group.1.piHi', 'group.2.piLo', 'group.2.piHi']);
    const single = setup('A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, One');
    assert.deepEqual(Array.from(single.spec.verify.optional(verificationState(single.ctx, 'subgroup'))), ['pQ', 'export.pQ']);
    // A missing value at a computed prefix is a defect, never a reason to exclude it.
    cumulative.values.find(v => v.key === 'step.2.piLo').value = null;
    assert.deepEqual(Array.from(spec.verify.optional(cumulative)), ['step.1.piLo', 'step.1.piHi']);
  });

  test('VERIFY REVIEW PLANTED: one-sided missing values and changed estimates fail closed', () => {
    const { ctx, spec } = setup();
    vm.runInContext(read('shared/alm-validate.js'), ctx);
    vm.runInContext(read('shared/alm-verify-r.js'), ctx);
    const state = verificationState(ctx, 'cumulative');
    const ref = Object.fromEntries(state.values.map(v => [v.key, v.value]));
    const options = { compare: ctx.AlmValidate.compare, notApplicable: spec.verify.optional(state) };
    const comparison = { tolerance: { default: 1e-9 } };
    const check = (values = state.values, reference = ref) => ctx.AlmVerifyR.evaluate(values, reference, comparison, options);
    const matched = check();
    assert.equal(matched.passed, true);
    assert.equal(matched.nNotApplicable, 2);
    assert.equal(matched.nNotComputed, 0);
    assert.equal(matched.n, state.values.length - 2);
    for (const key of ['step.1.piLo', 'step.2.mu', 'step.2.piLo']) {
      const changedRef = { ...ref, [key]: ref[key] === null ? 0 : null };
      assert.equal(check(state.values, changedRef).passed, false, key + ': R-only missing/value');
      const changedApp = state.values.map(v => v.key === key ? { ...v, value: changedRef[key] } : v);
      assert.equal(check(changedApp).passed, false, key + ': app-only missing/value');
    }
    assert.equal(check(state.values, { ...ref, 'step.2.mu': ref['step.2.mu'] + 0.01 }).passed, false);
    ctx.verified = true;
    ctx.AlmFeaturesState = { verify: matched };
    const results = spec.text.results();
    assert.equal(results.verifyStats, matched.nPassed);
    assert.equal(results.verifyPage, 0);
  });
}
