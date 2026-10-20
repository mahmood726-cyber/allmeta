const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./input-harness.cjs');
const cases = require('./fixtures/input-validation.json');
const page = process.env.GOSH_PAGE || path.join(__dirname, '../index.html');
const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
function cleared(h) {
  assert.equal(h.window._almLastGosh(), null);
  assert.equal(h.nodes.plot.innerHTML, '');
  for (const id of ['m-n', 'm-est', 'm-i2']) assert.equal(h.nodes[id].textContent, '\u2014');
  for (const id of ['plot-note', 'plot-error', 'sample-error']) assert.equal(h.nodes[id].textContent, '');
  assert.equal(h.nodes['sample-label'].style.display, 'none');
}
for (const c of cases) test(`invalid ${c.name}: line/reason alert, no stale result, recovery`, () => {
  const h = load(page);
  assert.equal(h.run(good).k, 3);
  h.run(good + '\n\n' + c.line);
  assert.match(h.nodes['input-error']?.textContent || '', /Line 5:/);
  assert.ok(h.nodes['input-error'].textContent.includes(c.reason));
  cleared(h);
  assert.equal(h.run(good).k, 3);
  assert.equal(h.nodes['input-error'].textContent, '');
});
for (const [name, text] of [['empty', ''], ['one', '0.1, 0.2'], ['two', '0.1, 0.2\n0.2, 0.3']]) {
  test(`${name}: fewer than three studies gets an explanation and clears results`, () => {
    const h = load(page); h.run(good); h.run(text);
    assert.match(h.nodes['input-error']?.textContent || '', /at least 3 valid studies/);
    cleared(h);
  });
}
test('all bad physical line numbers are reported, including after a header and blank line', () => {
  const h = load(page);
  h.run('effect, SE, label\n\n0.4O, 1\n0.2, 0\n' + good);
  assert.match(h.nodes['input-error']?.textContent || '', /Line 3:.*Line 4:/);
  cleared(h);
});
test('valid decimals, signs, exponents, CRLF, optional labels and first-line header preserve values', () => {
  const h = load(page);
  const r = h.run('\r\neffect, SE, label\r\n+.1e1, 2.e-1, A\r\n-.2, +.3\r\n\r\n3., .4, C\r\n');
  assert.equal(r.k, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(r.studies)), [
    {te: 1, se: 0.2, label: 'A'}, {te: -0.2, se: 0.3, label: 'S3'}, {te: 3, se: 0.4, label: 'C'}]);
});
test('BCG FE/DL actual page output agrees with the rerun metafor 5.2.1 fixture', () => {
  const h = load(page);
  const text = fs.readFileSync(path.join(__dirname, '../../hub/shared/tests/fixtures/hero-bcg-input.csv'), 'utf8');
  for (const [model, median] of [['FE', -0.43184141599691045], ['DL', -0.71049262611276243]]) {
    h.nodes.model.value = model;
    const r = h.run(text);
    assert.equal(r.k, 13); assert.equal(r.n_subsets, 8191);
    assert.ok(Math.abs(r.median_est - median) < 1e-9);
    assert.ok(Math.abs(r.median_i2 - 87.707424143742912) < 1e-7);
    assert.equal((h.nodes.plot.innerHTML.match(/<circle /g) || []).length, 8191);
  }
});
test('validation snapshot/restore retains an input error and cannot restore stale results', () => {
  const h = load(page); h.run(good); h.run('0.4O, 1');
  const error = h.nodes['input-error']?.textContent;
  assert.match(error || '', /Line 1:/);
  const snap = h.window.__almGoshValidationSnapshot();
  h.run(good); h.window.__almGoshValidationRestore(snap);
  assert.equal(h.nodes['input-error'].textContent, error); cleared(h);
});
for (const text of [good + '\n0.4O, 1', '0.1, 0.2']) test(`refusal clears the extras table, plot and state: ${text.split('\n').length} lines`, () => {
  const h = load(page); h.run(good); h.seedExtras();
  assert.ok(h.window.AlmGoshPlus.state);
  h.run(text);
  assert.equal(h.window.AlmGoshPlus.state, null);
  for (const id of ['plus-plot','plus-study','plus-het']) assert.equal(h.nodes[id].innerHTML, '');
  assert.equal(h.nodes['plus-table'].tBodies[0].innerHTML, '');
  assert.equal(h.nodes['plus-table'].tHead.rows[0].innerHTML, '');
  assert.equal(h.nodes['plus-counts'].textContent, '');
  cleared(h);
});
