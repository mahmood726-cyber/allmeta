import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
globalThis.AlmEntry = require('../../../../../../shared/alm-entry.js');
globalThis.AlmText = require('../../../../../../shared/alm-text.js');
const spec = require('../../../../../../multivariate-ma/alm-features.js');
const rows = [['A', 'PD', 0.47, 0.0075, 0.003], ['A', 'AL', -0.32, 0.0077, 0.003],
  ['B', 'PD', 0.20, 0.0057, 0.0009], ['B', 'AL', -0.60, 0.0008, 0.0009]];
const table = (header, data) => [header, ...data].map(r => r.join('\t')).join('\n');
const tsv = table(['study', 'outcome', 'yi', 'vi', 'cov'], rows);
const blocks = out => out.flags.filter(f => f.blocking);
// These text tests isolate formatting/auditing. Freshness and real page fits are
// exercised separately by unit/multivariate-review230.test.mjs and browser specs.
globalThis.AlmLiveAdapters = { 'multivariate-ma': {
  currentState: () => ({ result: globalThis._almLastMultivariate() })
} };
function replay(out) {
  for (const r of out.records) {
    const p = { ...r, label: 'Smith 2020', reference: 'Smith et al.', location: 'Table 1',
      source: { type: 'Table', detail: 'Table 1' }, choice: { randomisation: 'not stated' } };
    AlmEntry.provenance.confirm(p, { by: 'QA', via: 'row' });
    assert.deepEqual(spec.entry.validateProvenance(p), []);
    p.values = structuredClone(p.values); p.values[0].value += 1;
    assert.ok(spec.entry.validateProvenance(p).length, 'planted source value must fail');
  }
}
test('REVIEW decimal comma: explicit choice preserves exact values and source provenance', () => {
  const source = tsv.replaceAll('.', ',');
  assert.ok(blocks(spec.entry.convert(source)).length);
  const out = spec.entry.convert(source, { decimal: 'comma' });
  assert.deepEqual(blocks(out), []);
  assert.deepEqual(out.records.map(r => [r.yi, r.vi, r.cov]), rows.map(r => r.slice(2)));
  assert.equal(out.records[0].pastedText, source.split('\n')[1]);
  assert.ok(out.records[0].values.some(v => v.text === '0,0075'));
  replay(out);
});
test('REVIEW reversed CI: answer swaps bounds and replays against verbatim source', () => {
  const source = table(['study', 'outcome', 'yi', 'cov'], rows.map(r => [r[0], r[1], '0.5 (0.7 to 0.3)', 0.001]));
  const pending = spec.entry.convert(source);
  assert.equal(pending.questions.length, 4);
  const out = spec.entry.convert(source, Object.fromEntries(pending.questions.map(q => [q.id, 'swap'])));
  assert.deepEqual(blocks(out), []);
  assert.deepEqual(out.questions, []);
  assert.ok(out.steps.some(s => s.method === 'user-confirmed swap'));
  assert.equal(out.records[0].pastedText, source.split('\n')[1]);
  replay(out);
});
test('REVIEW combined decimal and CI choices retain the comma source', () => {
  const source = table(['study', 'outcome', 'yi', 'cov'], rows.map(r => [r[0], r[1], '0,5 (0,7 to 0,3)', '0,001']));
  const out = spec.entry.convert(source, { decimal: 'comma', ...Object.fromEntries(rows.map((_, i) => ['swap-ci:' + i, 'swap'])) });
  assert.deepEqual(blocks(out), []);
  assert.deepEqual(out.questions, []);
  assert.equal(out.records[0].yi, 0.5);
  assert.equal(out.records[0].pastedText, source.split('\n')[1]);
  replay(out);
});
test('REVIEW dual dispersion: rounded SE agrees; inconsistent or invalid SE blocks explicitly', () => {
  const source = se => table(['study', 'outcome', 'yi', 'vi', 'cov', 'se'], rows.map(r => [...r, se ?? Math.sqrt(r[3]).toFixed(4)]));
  const out = spec.entry.convert(source());
  assert.deepEqual(blocks(out), []);
  assert.equal(out.records[0].vi, 0.0075);
  assert.equal(out.records[0].values.find(v => v.field === 'sei').text, '0.0866');
  assert.ok(out.steps.some(s => /SE.*variance/.test(s.text)));
  replay(out);
  for (const se of ['0.1', '0', '-0.0866', 'invalid']) {
    assert.ok(blocks(spec.entry.convert(source(se))).some(f => /SE.*(variance|positive|finite)/i.test(f.text)), se);
  }
});
// Minimal DOM double; browser specs also exercise the real panel.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.dataset = {}; this.classList = { add() {} }; this.value = ''; this._text = ''; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  appendChild(n) { this.children.push(n); n.parentNode = this; return n; }
  replaceChildren() { this.children = []; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
  fire(k) { for (const fn of this.handlers[k] || []) fn({ target: this }); }
}
const descendants = el => [el, ...el.children.flatMap(descendants)];
function panel() {
  globalThis.document = { createElement: tag => new Element(tag) };
  const root = new Element('div'); spec.entry.mount(root);
  const all = () => descendants(root);
  return { root, all, paste: all().find(n => n.tagName === 'textarea'),
    preview: all().find(n => n.textContent === 'Preview and convert'),
    use: all().find(n => n.textContent === 'Use these rows') };
}
test('REVIEW blocked preview announces its reason and describes the disabled apply button', () => {
  const h = panel(); h.paste.value = tsv.replaceAll('0.003', '1'); h.preview.fire('click');
  const status = h.all().find(n => n.attrs.role === 'status');
  assert.match(status.textContent, /blocked.*positive definite/i);
  assert.ok(h.all().some(n => n.attrs.role === 'alert' && /positive definite/.test(n.textContent)));
  assert.equal(h.use.disabled, true);
  assert.ok(status.id); assert.equal(h.use.attrs['aria-describedby'], status.id);
});
test('REVIEW question controls resolve CI choices and invalidate confirmations on paste', () => {
  const h = panel(); h.paste.value = table(['study', 'outcome', 'yi', 'cov'], rows.map(r => [r[0], r[1], '0.5 (0.7 to 0.3)', 0.001]));
  h.preview.fire('click');
  for (let i = 0; i < 4; i++) {
    const choice = h.all().find(n => n.tagName === 'select' && n.children.some(c => c.value === 'swap'));
    assert.ok(choice, 'question must offer an answer control'); choice.value = 'swap'; choice.fire('change');
  }
  assert.equal(h.all().filter(n => n.tagName === 'fieldset').length, 4);
  h.paste.fire('input');
  assert.equal(h.use.disabled, true);
  assert.equal(h.all().filter(n => n.tagName === 'fieldset').length, 0);
});
function report(cards) {
  globalThis.document = { querySelectorAll: () => cards.map(textContent => ({ textContent })), getElementById: () => ({ textContent: 'k = 5; logLik = 3.692' }) };
  globalThis._almLastMultivariate = () => ({ k: 5, mu: [1, 1], muSE: [0.1, 0.1], G: [[0.01, 0], [0, 0.01]], rho: 0, logLik: 3.692 });
  const r = spec.text.results(), ctx = { app: 'multivariate-ma', entryLog: [], verify: null };
  const rendered = AlmText.render(spec.text.templates, r, ctx);
  return { r, ctx, rendered, audit: AlmText.audit(rendered, r, { ctx, dom: spec.text.dom() }) };
}
test('REVIEW signed zero: audit accepts rounded zero but rejects changed confidence limits', () => {
  const out = report(['1.000 [-0.000, 1.300]', '1.000 [0.800, 1.300]', '0.1000', '0.1000', '0.000']);
  assert.equal(out.audit.ok, true, JSON.stringify(out.audit.failures));
  const dom = spec.text.dom(); dom.loa.text = '-0.001';
  const planted = AlmText.audit(out.rendered, out.r, { ctx: out.ctx, dom });
  assert.equal(planted.ok, false); assert.ok(planted.failures.some(f => f.check === 'dom:loa'));
});
test('REVIEW scale: natural-ratio intervals receive a scale-neutral no-effect caveat', () => {
  const out = report(['1.000 [0.800, 1.300]', '1.000 [0.800, 1.300]', '0.1000', '0.1000', '0.000']);
  assert.equal(out.audit.ok, true);
  assert.match(out.rendered.plain.text, /no.effect value.*supplied scale/);
  assert.match(out.rendered.plain.text, /not evidence of no difference/);
  assert.doesNotMatch(out.rendered.plain.text, /An interval includes no effect/);
});

test('Example smoke: three input formats, engine results, audit and snapshot are preserved', () => {
  const data = [[0.47, 0.0075, -0.32, 0.0077, 0.003], [0.20, 0.0057, -0.60, 0.0008, 0.0009],
    [0.40, 0.0021, -0.12, 0.0014, 0.0007], [0.26, 0.0029, -0.31, 0.0015, 0.0009], [0.56, 0.0148, -0.39, 0.0304, 0.0072]];
  const long = data.flatMap((r, i) => [[`Trial ${i + 1}`, 'PD', r[0], r[1], r[4]], [`Trial ${i + 1}`, 'AL', r[2], r[3], r[4]]]);
  const engine = require('../../../../../../shared/multivariate-ma.js');
  const studies = data.map(r => ({ y: [r[0], r[2]], S: [[r[1], r[4]], [r[4], r[3]]] }));
  const fit = engine.fit(studies), z = 1.959963984540054;
  const sources = [table(['study', 'outcome', 'yi', 'vi', 'cov'], long),
    [['Study or Subgroup', 'Outcome', 'Mean Difference', 'Variance', 'Covariance'], ...long].map(r => r.join(';')).join('\n'),
    [['study', 'outcome', 'estimate', 'variance', 'covariance'], ...long.map(r => [r[0], r[1],
      `${r[2]} (${r[2] - z * Math.sqrt(r[3])}–${r[2] + z * Math.sqrt(r[3])})`, r[3], r[4]])].map(r => r.join('  ')).join('\n')];
  for (const source of sources) {
    const out = spec.entry.convert(source);
    assert.deepEqual(blocks(out), []); assert.deepEqual(out.questions, []);
    assert.deepEqual(out.records.map(r => [r.study, r.outcome, r.yi, r.vi, r.cov]), long);
    replay(out);
  }
  const cards = fit.mu.map((mu, i) => `${mu.toFixed(3)} [${(mu - z * fit.muSE[i]).toFixed(3)}, ${(mu + z * fit.muSE[i]).toFixed(3)}]`)
    .concat([Math.sqrt(fit.G[0][0]).toFixed(4), Math.sqrt(fit.G[1][1]).toFixed(4), fit.rho.toFixed(3)]);
  globalThis.document = { querySelectorAll: () => cards.map(textContent => ({ textContent })),
    getElementById: () => ({ textContent: `k = ${fit.k}; logLik = ${fit.logLik.toFixed(3)}` }) };
  globalThis._almLastMultivariate = () => fit;
  const r = spec.text.results(), ctx = { app: 'multivariate-ma', entryLog: [], verify: null,
    build: require('../../../../../../shared/build-info.js') };
  const rendered = AlmText.render(spec.text.templates, r, ctx);
  const audit = AlmText.audit(rendered, r, { ctx, dom: spec.text.dom() });
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
  const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
  assert.deepEqual({ plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results), flags: rendered.flags.map(norm) },
    JSON.parse(readFileSync(new URL('../../../__snapshots__/text-multivariate-ma.json', import.meta.url), 'utf8')));
  console.log(`ENTRYRT 3/3; TEXTAUDIT ${audit.passed}/${audit.checks}; snapshot matches`);
});
