import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, read } from './p17-validation-harness.mjs';

const input = 'Alpha, .2, 40\nBeta, -.4, 70\nGamma, .65, 25\nDelta, .05, 120';
const refs = JSON.parse(read('correlation-ma/validate/corpus/reference.json'));
const corpus = JSON.parse(read('correlation-ma/validate/corpus/corpus.json'));

test('plant P17-CI: current six-column table passes live display validation for every estimator', () => {
  const h = setup();
  for (const method of ['REML', 'PM', 'DL', 'FE']) {
    h.run(input, method);
    const state = h.adapter.live.currentState();
    assert.equal(state.values.find(v => v.key === 'display').value, true, method);
    assert.equal(state.values.length, 12, 'published live comparison count is unchanged');
  }
});

test('plant P17-CI: pinned replay accepts the CI table without changing 17716 checks or the corpus', async () => {
  const h = setup(); h.run(input, 'FE');
  const last = h.window._almLastCorrMA(), data = h.document.getElementById('f-data').value;
  const nodes = h.document.getElementById('res-body').childNodes.slice();
  const result = await h.adapter.corpus.run(h.files);
  assert.equal(result.checks, 17716);
  assert.equal(result.refusals.length, 8);
  assert.equal(result.failed.length, 0, JSON.stringify(result.failed.slice(0, 3).map(f => ({ id: f.id, quantity: f.quantity }))));
  assert.equal(result.passed, result.checks);
  assert.equal(h.window._almLastCorrMA(), last);
  assert.equal(h.document.getElementById('f-data').value, data);
  assert.equal(h.document.getElementById('f-method').value, 'FE');
  assert.deepEqual(h.document.getElementById('res-body').childNodes, nodes);
  assert.equal(h.document.getElementById('f-data').disabled, false);
});

test('control P17-CI: exact original adapter reproduces both planted failures', async () => {
  // Reverse only this job's three adapter edits, in memory. The pass-1 checksum
  // proves this is the supplied original adapter, not an invented faulty model.
  // Normalize checkout line endings before verifying the recorded LF hash.
  const original = read('correlation-ma/validate/adapter.js').replace(/\r\n/g, '\n')
    .replace(/function expectedPageText\(archived\) \{[\s\S]*?(?=function controls\()/, '')
    .replace(/  const expected = a\.studies\.map[\s\S]*?(?=  check\('display\.table')/,
      "  const expected = a.studies.map((s,i)=>[s.label,fmt(s.r),String(s.n),fmt(Math.atanh(s.r)),fmt(100*w[i]/sw,1)+'%']);\n" +
      "  expected.push(['Pooled',fmt(a.r),'\u2014',fmt(a.mu_z),'100%']);\n")
    .replace('expectedPageText(rs.pageText)', 'rs.pageText');
  assert.equal(createHash('sha256').update(original).digest('hex'),
    'c3e72b820855e2a3081a074f58d42ccc70481ffc5a185a0ddc2e00476f8dabf6');
  const h = setup({ adapterSource: original });
  for (const method of ['REML', 'PM', 'DL', 'FE']) {
    h.run(input, method);
    const state = h.adapter.live.currentState();
    assert.equal(state.values.length, 12);
    assert.throws(() => assert.equal(state.values.find(v => v.key === 'display').value, true),
      assert.AssertionError, `${method}: the original adapter must fail the live assertion`);
  }
  const last = h.window._almLastCorrMA();
  const result = await h.adapter.corpus.run(h.files);
  assert.equal(result.checks, 17716);
  assert.equal(result.refusals.length, 8);
  assert.throws(() => assert.equal(result.failed.length, 0), assert.AssertionError,
    'the original adapter must fail the replay assertion');
  assert.equal(result.failed.length, 136);
  assert.equal(result.failed.filter(f => f.quantity === 'page_text').length, 72);
  assert.equal(result.failed.filter(f => f.quantity === 'display.table').length, 64);
  assert.equal(h.window._almLastCorrMA(), last, 'the unchanged restore control still passes');
  assert.equal(h.document.getElementById('f-data').value, input);
  assert.equal(h.document.getElementById('f-data').disabled, false);
});

test('control P17-CI: all displayed study endpoints retain the archived independent R rounding', () => {
  const h = setup();
  for (let i = 0; i < corpus.length; i++) {
    const c = corpus[i], r = refs.configurations[i]; h.run(c.text, c.method);
    const rows = h.document.getElementById('res-body').querySelectorAll('tr');
    if (r.status === 'refused') { assert.equal(rows.length, 0); continue; }
    r.studies.forEach((s, j) => assert.equal(rows[j].querySelectorAll('td')[5].textContent,
      `[${r.study_lo[j].toFixed(3)}, ${r.study_hi[j].toFixed(3)}]`, `${c.id}: ${s.label}`));
  }
});

test('control P17-CI: changed legacy cells, new CI cells and headline all fail live validation', () => {
  for (const mutate of [
    d => { d.getElementById('headline').textContent = 'Pooled r = 99'; },
    ...[0, 1, 2, 3, 4, 5].map(i => d => { d.getElementById('res-body').querySelector('tr').querySelectorAll('td')[i].textContent = 'wrong'; }),
    d => { d.getElementById('res-body').querySelector('tr.pooled-row').querySelectorAll('td')[5].textContent = '[0, 0]'; },
  ]) {
    const h = setup(), run = h.window.__almCorrValidationRun;
    h.window.__almCorrValidationRun = () => { run(); mutate(h.document); };
    assert.equal(h.adapter.live.currentState().values.find(v => v.key === 'display').value, false);
  }
});

test('control P17-CI: old static text, caption and CI heading mutations remain replay failures', async () => {
  for (const selector of ['h1', '#forest-values caption', '#forest-values th']) {
    const h = setup(); h.document.querySelector(selector).textContent = 'Changed contract';
    const result = await h.adapter.corpus.run(h.files);
    assert.equal(result.failed.filter(f => f.quantity === 'page_text').length, 72, selector);
  }
});

test('control P17-CI: the sixth CI heading is checked exactly in replay', async () => {
  const h = setup();
  const headings = h.document.querySelectorAll('#forest-values th');
  assert.equal(headings.length, 6);
  assert.equal(headings[5].textContent, '95% CI (r)');
  headings[5].textContent = 'Changed CI heading';
  const result = await h.adapter.corpus.run(h.files);
  assert.equal(result.failed.filter(f => f.quantity === 'page_text').length, 72);
  assert.equal(result.failed.length, 72, 'the other pinned checks still pass');
});

test('control P17-CI: corrupted pinned input is refused before page state changes', async () => {
  const h = setup(), last = h.window._almLastCorrMA();
  Object.values(h.files)[0][10] ^= 1;
  await assert.rejects(h.adapter.corpus.run(h.files), /SHA-256 mismatch/);
  assert.equal(h.window._almLastCorrMA(), last);
});

test('control P17-CI: refused live input still refuses and clears old output', () => {
  const h = setup(); h.run('Only, .2, 40');
  assert.throws(() => h.adapter.live.currentState(), /need at least 2 valid studies/);
  assert.equal(h.document.getElementById('res-body').innerHTML, '');
  assert.equal(h.document.getElementById('forest-host').innerHTML, '');
});
