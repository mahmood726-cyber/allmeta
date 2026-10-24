const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
  delete require.cache[require.resolve('./offline-check.cjs')];
  return require('./offline-check.cjs');
}
function binary(h) {
  h.elements.format.value = 'binary';
  h.elements.format.dispatchEvent(new h.context.Event('change'));
}
function withResults(h, changes, ctx = {}) {
  const r = Object.assign(h.spec.text.results(), changes);
  const rendered = h.context.AlmText.render(h.spec.text.templates, r, ctx);
  assert.equal(h.context.AlmText.audit(rendered, r, { ctx }).ok, true);
  return rendered;
}
test('P1 Thompson-Sharp is explicitly an extrapolated effect, not asymmetry', () => {
  const h = setup(), out = h.render().rendered;
  for (const text of [out.methods.text, out.results.text]) {
    assert.match(text, /effect extrapolated to (?:SE|standard error) (?:= )?zero/);
    assert.match(text, /not a test of asymmetry/);
  }
});
test('P1 binary copyable paragraphs prefer Peters and Harbord and caveat Egger inline', () => {
  const h = setup(); binary(h);
  const out = h.render().rendered;
  assert.match(out.plain.text, /Peters.*p = .*Harbord.*p = /);
  assert.doesNotMatch(out.plain.text, /Egger.*gave t/);
  for (const text of [out.plain.text, out.results.text]) assert.match(text, /Egger.*not recommended for.*odds ratios/);
});
test('P1 VERIFY spec cannot accept unavailable packages instead of a comparison', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../../features-pubbias-tests.spec.mjs'), 'utf8');
  const live = source.slice(source.indexOf("test('VERIFY: live R"), source.indexOf("test('SHARE:"));
  assert.doesNotMatch(live, /quantities match R\|unavailable|if \(message.includes\('unavailable'\)\)/);
  assert.match(live, /VERIFY planted/);
});
test('P2 tiny exact and rounded DOM p-values use a threshold, never zero', () => {
  const h = setup(); binary(h);
  const out = withResults(h, { egger_p: 0.00001, begg_p: 0.00002, thompson_p: 0,
    peters_p: 0, harbord_p: 0.0005, sel_LRTp: 0 });
  assert.doesNotMatch(out.plain.text + out.results.text, /p = 0\.000/);
  assert.equal((out.results.text.match(/p < 0\.001/g) || []).length, 6);
  assert.match(withResults(h, { egger_p: 0.001 }).results.text, /Egger:.*p = 0\.001/);
});
test('P2 comparison scope requires a complete verification sentence', () => {
  const h = setup();
  const ctx = { revision: 'run', verify: { revision: 'run', passed: true,
    rows: [{ pass: true }], packages: ['metafor'], versions: { metafor: '4.8-0' } } };
  const out = withResults(h, { verified: true }, ctx);
  assert.doesNotMatch(out.methods.text, /This comparison covers|independently verified/);
  ctx.verify.versions.webR = '0.5.8';
  assert.match(withResults(h, { verified: true }, ctx).methods.text, /This comparison covers/);
});
test('P2 selection boundary fits are qualified at both displayed bounds', () => {
  const h = setup(); binary(h);
  for (const sel_delta2 of [0, 0.0004, 99.9996, 100]) {
    assert.match(withResults(h, { sel_delta2 }).results.text, /selection weight reached its boundary; the model is not informative/);
  }
  assert.doesNotMatch(withResults(h, { sel_delta2: 2 }).results.text, /reached its boundary/);
});
test('P2 trim-and-fill uses singular study only for one imputation', () => {
  const h = setup();
  assert.match(withResults(h, { tf_k0: 1 }).results.text, /imputed 1 study,/);
  for (const tf_k0 of [0, 2]) assert.match(withResults(h, { tf_k0 }).results.text, /imputed \d studies,/);
});
test('P2 rejected entry restores inputs and does not accept stale same-size results', () => {
  const h = setup(); binary(h);
  const before = h.spec.share.get();
  const click = h.elements['btn-run'].click;
  // A refused/no-op run leaves the old result with the SAME study count.
  h.elements['btn-run'].click = () => {};
  const records = h.context._almLastPubbias().studies.map(r => ({ yi: r.te + 1, sei: r.se }));
  assert.equal(h.spec.entry.apply(records).ok, false);
  assert.deepEqual(h.spec.share.get(), before);
  h.elements['btn-run'].click = () => { throw new Error('run refused'); };
  assert.throws(() => h.spec.entry.apply(records), /run refused/);
  assert.deepEqual(h.spec.share.get(), before);
  h.elements['btn-run'].click = click;
});
test('P2 DOM audit identifies its nine independent engine quantities', () => {
  const h = setup();
  const source = fs.readFileSync(path.join(__dirname, '../../../features-pubbias-tests.spec.mjs'), 'utf8');
  assert.match(source, /independentKeys/);
  const independent = Object.keys(h.spec.text.dom()).filter(k => Object.hasOwn(h.baseline, k));
  assert.equal(independent.length, 9);
});
test('P2 binary R and stale-result binding have explicit browser gates', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../../features-pubbias-tests.spec.mjs'), 'utf8');
  assert.match(source, /test\('VERIFY BINARY:/);
  assert.match(source, /verified inputs with unrun results/);
  assert.match(source, /peters_statistic/);
  assert.match(source, /harbord_statistic/);
});
test('P2 fixed settings match the actual engine; planted source drift fails', () => {
  const h = setup(), r = h.spec.text.results();
  function settingsGate(source) {
    const cutpoint = Number(/steps: \[([\d.]+)\]/.exec(source)[1]);
    const correction = /e1 \+= ([\d.]+); n1 \+= ([\d.]+); e2 \+= ([\d.]+); n2 \+= ([\d.]+)/.exec(source).slice(1).map(Number);
    assert.equal(cutpoint, r.selectionCutpoint);
    assert.deepEqual(correction, [r.cc, 2 * r.cc, r.cc, 2 * r.cc]);
  }
  settingsGate(h.html);
  assert.throws(() => settingsGate(h.html.replace('steps: [0.025]', 'steps: [0.05]')), /Expected values/);
  assert.throws(() => settingsGate(h.html.replace('e1 += 0.5', 'e1 += 0.1')), /Expected values/);
  const row = h.context.__almPubBiasEngine.parseBinary('0,10,2,12')[0];
  assert.equal(row.te, Math.log((0.5 / 10.5) / (2.5 / 10.5)));
  assert.equal(row.se, Math.sqrt(1 / 0.5 + 1 / 10.5 + 1 / 2.5 + 1 / 10.5));
});
test('PLANTED: tampering with engine-sourced Egger still fails the number audit', () => {
  const h = setup(); h.context.__almTextPerturb = { key: 'egger_t', delta: 1 };
  const audit = h.render().audit;
  assert.equal(audit.ok, false);
  assert.ok(audit.failures.some(f => f.check === 'dom:egger_t'));
});
