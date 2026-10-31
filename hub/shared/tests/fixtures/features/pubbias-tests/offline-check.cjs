/* Supplemental Node check for restricted Windows workers. Executes the unchanged
 * page script and adapter against a DOM double. This is NOT browser, axe or R
 * validation. Run from any directory; --write-snapshot writes the reviewed text.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../../../../..');
const html = fs.readFileSync(path.join(ROOT, 'pubbias-tests/index.html'), 'utf8');
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
class Element {
  constructor(id) { this.id = id; this.value = ''; this.innerHTML = ''; this.handlers = {}; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  click() { for (const fn of this.handlers.click || []) fn(); }
  dispatchEvent(event) { for (const fn of this.handlers[event.type] || []) fn(event); }
  get textContent() { return decode(this.innerHTML); }
  set textContent(value) { this.innerHTML = value; }
}
const elements = {};
for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements[id] = new Element(id);
elements.src.value = /<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1];
elements.format.value = 'te-se';
const doc = {
  getElementById: id => elements[id],
  querySelectorAll: selector => {
    if (selector === '#alm-axis-mount input') return [];
    assert.equal(selector, '#body tr', 'only the actual adapter table selector is supported');
    return [...elements.body.innerHTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, tr]) => ({
      cells: [...tr.matchAll(/<td(?: [^>]*)?>([\s\S]*?)<\/td>/g)].map(([, td]) => ({ textContent: decode(td) })),
      querySelector: selector => {
        assert.equal(selector, 'code');
        const code = /<code>([\s\S]*?)<\/code>/.exec(tr);
        return code ? { textContent: decode(code[1]) } : null;
      }
    }));
  }
};
const noop = () => {};
const urlState = Object.assign(noop, { read: () => null, write: noop });
const context = {
  document: doc, console, Event: class { constructor(type) { this.type = type; } },
  alm: { analysisLifecycle: fn => fn, urlState, csvUpload: noop, plotExport: noop,
    axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop },
  AlmFeatures: { register: noop, verifiedCurrent: () => false },
  AlmFeaturesState: { entryLog: [], provenance: [] }
};
context.window = context;
vm.createContext(context);
function load(file) { vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file }); }
for (const file of ['shared/ma-core.js', 'shared/selmodel.js', 'shared/build-info.js', 'shared/alm-entry.js', 'shared/alm-text.js']) load(file);
const mainScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(([, src]) => src.includes('function runAnalysis()'))[1];
vm.runInContext(mainScript, context, { filename: 'pubbias-tests/index.html (unchanged main script)' });
load('pubbias-tests/alm-features.js');
const spec = context.AlmPubbiasFeatures, baseline = context._almLastPubbias();
assert.equal(baseline.k, 10);
function render() {
  const r = spec.text.results(), ctx = { app: 'pubbias-tests', build: context.AlmBuildInfo, entryLog: [], verify: null };
  const rendered = context.AlmText.render(spec.text.templates, r, ctx);
  const audit = context.AlmText.audit(rendered, r, { ctx, dom: spec.text.dom() });
  return { r, rendered, audit };
}
// Reuse the exact unchanged engine/DOM setup for focused review regressions.
if (require.main !== module) {
  module.exports = { context, elements, spec, baseline, render, html };
} else {
const out = render();
assert.equal(out.audit.ok, true, JSON.stringify(out.audit.failures));
assert.equal(out.audit.domChecked, 12);
console.log(`OFFLINE TEXTAUDIT ${out.audit.passed}/${out.audit.checks} DOM-double=${out.audit.domChecked}`);
const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? `<${s.key}>` : s.text).join('');
const snapshot = {
  app: 'pubbias-tests', source: 'Built-in ten-study effect/SE example; default options',
  plain: norm(out.rendered.plain), methods: norm(out.rendered.methods), results: norm(out.rendered.results),
  flags: out.rendered.flags.map(norm), references: out.rendered.cites.map(c => c.full)
};
const snapPath = path.join(ROOT, 'hub/shared/tests/__snapshots__/text-pubbias-tests.json');
if (process.argv.includes('--write-snapshot')) fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2) + '\n');
else assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), JSON.parse(fs.readFileSync(snapPath, 'utf8')));
context.__almTextPerturb = { key: 'egger_t', delta: 1 };
const planted = render().audit;
assert.equal(planted.ok, false);
assert.ok(planted.failures.some(f => f.check === 'dom:egger_t'));
console.log(`OFFLINE TEXTAUDIT planted ${planted.passed}/${planted.checks} FAIL`);
delete context.__almTextPerturb;
// A receipt can be current for edited inputs while the displayed analysis is
// still older. The text must not certify those older results.
context.AlmFeatures.verifiedCurrent = () => true;
context.AlmFeatures.liveAdapter = () => ({
  currentState: () => ({ binary: false, rows: context.__almPubBiasEngine.parseTESE(elements.src.value) })
});
assert.equal(spec.text.results().verified, true);
const originalSrc = elements.src.value;
elements.src.value = originalSrc.replace('0.25', '0.26');
assert.equal(spec.text.results().verified, false);
elements.src.value = originalSrc;
context.AlmFeatures.verifiedCurrent = () => false;
console.log('OFFLINE VERIFY CLAIM 2/2 current-result binding; no R execution');
const rows = baseline.studies, z = 1.959963984540054;
const formats = [
  'Study\tyi\tsei\n' + rows.map((r, i) => `Study ${i + 1}\t${r.te}\t${r.se}`).join('\n'),
  'Study  MD\n' + rows.map((r, i) => `Study ${i + 1}  ${r.te} (${r.te - z * r.se}–${r.te + z * r.se})`).join('\n'),
  'Study or subgroup;Effect;Standard error\n' + rows.map((r, i) => `Study ${i + 1};${r.te};${r.se}`).join('\n')
];
for (const [i, input] of formats.entries()) {
  const E = context.AlmEntry, table = E.parseTable(input), detected = E.detect(table, 'generic');
  const converted = E.convert(table, detected, i === 2 ? { name: 'generic', ratio: false } : 'generic', { decimal: 'point' });
  assert.equal(converted.flags.some(f => f.blocking), false, JSON.stringify(converted.flags));
  assert.equal(spec.entry.apply(converted.records).ok, true);
  const result = context._almLastPubbias();
  const keys = i === 1 ? ['egger_t', 'egger_p', 'tf_est'] : ['egger_t', 'egger_p', 'begg_tau', 'begg_p', 'tf_est'];
  for (const key of keys)
    assert.ok(Math.abs(result[key] - baseline[key]) <= Math.abs(baseline[key]) * 1e-9, `${key}: ${result[key]} vs ${baseline[key]}`);
  assert.equal(result.tf_k0, baseline.tf_k0);
  if (i === 1) assert.equal(converted.steps.length, 10);
}
console.log('OFFLINE ENTRYRT 3/3');
const before = spec.share.get();
assert.throws(() => spec.entry.apply(Array.from({ length: 10 }, () => ({ yi: 0.2, sei: -0.1 }))));
assert.deepEqual(spec.share.get(), before);
const E = context.AlmEntry, badTable = E.parseTable('Study  MD\nBad  0.25 (0.5–0.1)');
assert.ok(E.convert(badTable, E.detect(badTable, 'generic'), 'generic', {}).flags.some(f => f.blocking));
console.log('OFFLINE ENTRY PLANTED 2/2');
elements.format.value = 'binary'; elements.format.dispatchEvent(new context.Event('change'));
const binary = render();
assert.equal(binary.audit.ok, true, JSON.stringify(binary.audit.failures));
assert.equal(binary.audit.domChecked, 16);
console.log(`OFFLINE TEXTAUDIT binary ${binary.audit.passed}/${binary.audit.checks}`);
const saved = spec.share.get(), binaryResult = context._almLastPubbias();
spec.share.set(before); spec.share.set(saved);
assert.deepEqual(context._almLastPubbias(), binaryResult);
assert.throws(() => spec.share.set({ ...saved, src: 'changed', axes: ['NaN'] }));
assert.deepEqual(spec.share.get(), saved);
console.log('OFFLINE SHARE 2/2 state restore/invalid state; no URL or browser claim');
}
