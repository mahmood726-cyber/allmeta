// Supplementary checks for environments unable to spawn a browser. Executes the
// unchanged inline app engine in a minimal DOM, never substitutes an R oracle.
// Run from any directory: node <this file>. Browser/webR/axe remain separate gates.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../../../../../../', import.meta.url);
const html = fs.readFileSync(new URL('gosh/index.html', root), 'utf8');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', style: {}, listeners: {},
    addEventListener(event, fn) { this.listeners[event] = fn; },
    click() { this.listeners.click?.(); } });
  return elements.get(id);
}
element('src').value = /<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1];
element('model').value = 'FE'; element('n-sample').value = '5000';
const noop = () => {};
const urlState = Object.assign(noop, { read: () => ({}), write: noop, withoutWrites: fn => fn() });
const context = { console, document: { getElementById: element, querySelectorAll: () => [] },
  alm: { analysisLifecycle: fn => fn, csvUpload: noop, plotExport: noop, axisControls: noop,
    resultsExport: noop, urlState, resetUndo: noop, tooltips: noop },
  AlmFeaturesState: { entryLog: [], provenance: [] },
  AlmFeatures: { register(app, spec) { this.spec = spec; }, verifiedCurrent: () => false, revision: () => null } };
context.window = context; context.globalThis = context;
vm.createContext(context);
const engine = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('// ---- engine ----'));
vm.runInContext(engine, context, { filename: 'gosh/index.html (unchanged engine)' });
for (const file of ['shared/build-info.js', 'shared/alm-entry.js', 'shared/alm-text.js', 'gosh/alm-features.js']) {
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}
const plain = x => JSON.parse(JSON.stringify(x));
const spec = context.AlmGoshFeatures, E = context.AlmEntry, T = context.AlmText;
const original = plain(context._almLastGosh()), z = 1.959963984540054;
const inputs = [
  'Study\tEffect\tSE\n' + original.studies.map(r => [r.label, r.te, r.se].join('\t')).join('\n'),
  'Study  Effect\n' + original.studies.map(r => `${r.label}  ${r.te} (${r.te-z*r.se}–${r.te+z*r.se})`).join('\n'),
  'Study;Effect;Standard error\n' + original.studies.map(r => [r.label, r.te, r.se].join(';')).join('\n')
];
for (const [index, input] of inputs.entries()) {
  const table = E.parseTable(input), c = E.convert(table, E.detect(table, 'generic'), 'generic', {});
  assert.equal(c.flags.some(f => f.blocking), false, JSON.stringify(c));
  assert.deepEqual(plain(c.questions), []);
  assert.deepEqual(plain(spec.entry.apply(c.records)), { ok: true, n: 9 });
  const actual = context._almLastGosh();
  assert.equal(actual.n_subsets, original.n_subsets);
  for (const key of ['median_est','median_i2','min_est','max_est','q25_est','q75_est']) {
    assert.ok(Math.abs(actual[key]-original[key]) <= 1e-9 * Math.max(Math.abs(original[key]),1e-12), key);
  }
  if (index === 1) {
    assert.equal(c.steps.length, 9);
    const entryLog = c.steps.map(s => ({ study: s.study, method: s.method, citation: s.citation }));
    const methods = T.render(spec.text.templates, spec.text.results(), { app: 'gosh', build: context.AlmBuildInfo, entryLog }).methods.text;
    assert.match(methods, /SE from CI/);
  }
}
console.log('OFFLINE ENTRYRT 3/3; conversion log 9/9');
const bad = E.parseTable('Study\tEffect\nBad\t0.22 (0.4–0.1)');
assert.ok(E.convert(bad, E.detect(bad, 'generic'), 'generic', {}).flags.some(f => f.blocking));
const before = element('src').value;
assert.throws(() => spec.entry.apply(original.studies.map(r => ({ study: r.label, yi: r.te, sei: -r.se }))), /SE positive/);
assert.equal(element('src').value, before);
console.log('OFFLINE ENTRY planted checks 2/2');
const ctx = { app: 'gosh', build: context.AlmBuildInfo, entryLog: [], verify: null };
const r = spec.text.results(), rendered = T.render(spec.text.templates, r, ctx);
const audit = T.audit(rendered, r, { ctx, dom: spec.text.dom() });
assert.equal(audit.ok, true, JSON.stringify(audit.failures)); assert.equal(audit.domChecked, 3);
console.log(`OFFLINE TEXTAUDIT ${audit.passed}/${audit.checks}; DOM stub contains unchanged app output`);
const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
const snapshot = { app: 'gosh', source: 'Built-in nine-study example; fixed effect; all nonempty subsets.',
  plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results),
  flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) };
const snapshotPath = new URL('hub/shared/tests/__snapshots__/text-gosh.json', root);
if (process.argv.includes('--candidate')) console.log(JSON.stringify(snapshot, null, 2));
else assert.deepEqual(plain(snapshot), JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
context.__almTextPerturb = { key: 'median_est', delta: 0.1 };
const pr = spec.text.results(), pa = T.audit(T.render(spec.text.templates, pr, ctx), pr, { ctx, dom: spec.text.dom() });
assert.equal(pa.ok, false); assert.ok(pa.failures.some(f => f.check === 'dom:median_est'));
console.log(`OFFLINE TEXTAUDIT planted ${pa.passed}/${pa.checks} FAIL dom:median_est`);
delete context.__almTextPerturb;
element('src').value = Array.from({length:16}, (_,i) => `${i/10}, 0.1, Synthetic ${i+1}`).join('\n');
element('model').value = 'DL'; element('n-sample').value = '37'; element('btn-run').click();
const sampled = spec.text.results(), sa = T.render(spec.text.templates, sampled, ctx);
assert.ok(T.audit(sa, sampled, { ctx, dom: spec.text.dom() }).ok);
assert.match(sa.methods.text, /DerSimonian–Laird/); assert.match(sa.methods.text, /drew 37 subsets/);
element('src').value = ''; element('btn-run').click(); assert.equal(spec.text.results(), null);
console.log('OFFLINE text variants 2/2 (sampled DL and no results)');

export { context, element, spec, root, html, original, plain };
