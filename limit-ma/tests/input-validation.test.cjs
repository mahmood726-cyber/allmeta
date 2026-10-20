const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./input-harness.cjs');
const cases = require('./fixtures/input-validation.json');
const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
const cleared = ['body','plot','limit-range-note','limit-diagnostics','plus-body','plus-details','plus-forest','plus-funnel','plus-interpretation'];
function seed(h) {
  h.run(good); h.window.AlmLimitPlusUI.run();
  assert.ok(h.window._almLastLimit());
  assert.ok(h.window.AlmLimitPlusUI.snapshot());
  assert.ok(h.nodes['plus-body'].innerHTML);
  h.nodes['limit-diagnostics'].textContent = 'old diagnostic';
  h.nodes['limit-range-note'].textContent = 'old range note';
}
function refused(h) {
  assert.equal(h.window._almLastLimit(), null);
  assert.equal(h.window.alm.exportOptions.getResults(), null);
  assert.equal(h.window.alm.plotOptions.getReceiptInput(), null);
  assert.equal(h.window.__almLimitValidationSnapshot().result, null);
  assert.equal(h.window.AlmLimitPlusUI.snapshot(), null);
  for (const id of cleared) assert.equal(h.nodes[id].innerHTML, '', id);
  assert.doesNotMatch(h.nodes['plus-status'].textContent, /complete/);
}
for (const c of cases) test(`rejects ${c.name}; clears all previous core and sensitivity results`, () => {
  const h = load(); seed(h);
  h.run(good + '\n\n' + c.line);
  assert.match(h.nodes['limit-error'].textContent, /Line 5:/);
  assert.ok(h.nodes['limit-error'].textContent.includes(c.reason));
  refused(h);
  h.run(good); assert.equal(h.window._almLastLimit().k, 3);
  assert.equal(h.nodes['limit-error'].textContent, '');
});
for (const [name, text, reason] of [
  ['empty','', 'At least three'], ['two rows','0.1, .2\n0.2, .3','At least three'],
  ['equal SE','0.1,.2\n0.2,.2\n0.3,.2','variation']]) test(name + ' preserves refusal and clears sensitivity', () => {
  const h = load(); seed(h); h.run(text); refused(h); assert.ok(h.nodes['limit-error'].textContent.includes(reason));
});
test('collects all physical CRLF line numbers, ignores blank lines and first header', () => {
  const h = load(); seed(h);
  h.run('\r\neffect, SE, label\r\n\r\n0.4O, .2\r\n0.4, 0\r\n' + good);
  assert.match(h.nodes['limit-error'].textContent, /^Line 4:.*; Line 5:/); refused(h);
});
test('valid decimal/exponent forms, header, blanks, CRLF and default labels', () => {
  const h = load();
  const text = '\r\n effect, SE, label\r\n+.1e1, 2.e-1, A\r\n\r\n-.2, +.3\r\n3., .4, C\r\n';
  assert.equal(h.run(text).k, 3); assert.equal(h.nodes['limit-error'].textContent, '');
  assert.deepEqual(JSON.parse(JSON.stringify(h.parse('\n\n .1,.2\n\n.2,.3'))),
    [{te:.1,se:.2,label:'Study 1'},{te:.2,se:.3,label:'Study 3'}]);
  h.window.AlmLimitPlusUI.run(); assert.ok(h.window.AlmLimitPlusUI.snapshot());
});
test('sensitivity Run cannot bypass strict parser or retain core results', () => {
  const h = load(); seed(h); h.nodes.src.value = good + '\n.4,.5,A,B';
  h.window.AlmLimitPlusUI.run(); refused(h); assert.match(h.nodes['limit-error'].textContent, /Line 4:/);
});
test('cleared sensitivity state cannot redraw or recalculate old input', () => {
  const h = load(); seed(h); h.run(good + '\n.4O,.2');
  h.nodes['plus-alpha'].change(); refused(h);
});
test('BCG fixture is accepted and snapshot restores exact alert/result state', () => {
  const h = load(); const bcg = fs.readFileSync(path.join(__dirname,'../../hub/shared/tests/fixtures/hero-bcg-input.csv'),'utf8');
  assert.equal(h.run(bcg).k,13);
  const s = h.window.__almLimitValidationSnapshot(); h.run(good+'\n.4O,.2');
  const bad = h.window.__almLimitValidationSnapshot(); assert.equal(bad.result,null);
  h.window.__almLimitValidationRestore(s); assert.deepEqual(h.window.__almLimitValidationSnapshot(),s);
  h.window.__almLimitValidationRestore(bad); assert.deepEqual(h.window.__almLimitValidationSnapshot(),bad);
});
test('existing accessible alert describes input without changing static text paths', () => {
  const h = load(); assert.match(h.html, /id="limit-error" role="alert"/);
  assert.match(h.html, /<textarea id="src"[^>]*aria-describedby="limit-error"/);
});
