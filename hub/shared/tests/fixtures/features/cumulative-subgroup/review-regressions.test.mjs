import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
function setup(data = 'A, -0.2, 0.1, 2020, One\nB, 0.2, 0.1, 2021, Two', view = 'subgroup') {
  const html = read('cumulative-subgroup/index.html');
  const input = { value: data, dispatchEvent() {} };
  const ctx = vm.createContext({ console, Event, document: { getElementById: () => input } });
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
  paste.value = 'study\testimate\tyear\tsubgroup\nGood\t-0.2 (-0.8 to 0.4)\t2020\tA';
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
  for (let i = 0; i < 2; i++) {
    descendants(root).find(e => e.tagName === 'textarea').value = 'MD -0.20, 95% CI -0.40 to 0.00';
    assert.ok(button('Extract candidates'), 'source-confirmation workflow is mounted');
    await button('Extract candidates').fire('click');
    await set(root, 'Choose the source result', '0');
    await button('Add chosen result').fire('click');
    const card = descendants(root).filter(e => e.tagName === 'fieldset').at(-1); cards.push(card);
    for (const [title, value] of [['Study label', 'Smith ' + (2020 + i)], ['Full reference', 'Synthetic report'], ['Location', 'Table 2'], ['Outcome measured', 'Symptom score'], ['Timepoint', 'not stated']]) await set(card, title, value);
    assert.equal(use.disabled, true);
    await use.fire('click');
    assert.equal(input.value, before);
    assert.ok(descendants(card).some(e => e.tagName === 'mark'));
    const confirm = field(card, 'I confirm'); assert.equal(confirm.disabled, false);
    confirm.checked = true; await confirm.fire('change');
  }
  assert.equal(use.disabled, false);
  await set(cards[0], 'Location', 'Table 3');
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
