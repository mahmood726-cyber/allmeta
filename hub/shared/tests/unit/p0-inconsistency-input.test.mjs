import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = new URL('../../../../nma-inconsistency/', import.meta.url);
const html = readFileSync(new URL('index.html', app), 'utf8');
const engineCode = html.match(/<script>\s*(\/\/ Cycle 7\.1[\s\S]*?)<\/script>/)[1];
const coreCode = readFileSync(new URL('plus-core.js', app), 'utf8');
const uiCode = readFileSync(new URL('plus-ui.js', app), 'utf8');

// Small DOM contract for the shipped run/refresh paths. The real numerical
// engine runs here; this is not browser or layout evidence.
function harness() {
  const elements = Object.fromEntries(['src', 'f-model', 'btn-run', 'ns-body',
    'ns-plot', 'dbt', 'alm-plus', 'inco-input-msg', 'plus-interpret-list',
    'plus-methods-text'].map(id => [id, {
    value: id === 'f-model' ? 'FE' : '', innerHTML: '', textContent: '',
    addEventListener() {}, setAttribute() {},
  }]));
  const c = vm.createContext({ document: { getElementById: id => elements[id] || null } });
  c.window = c; c.self = c;
  for (const code of [engineCode, coreCode, uiCode]) vm.runInContext(code, c);
  return { c, elements, load(text, model = 'FE') {
    elements['f-model'].value = model;
    c.__almIncoLoad(text);
    c.AlmIncoPlus.refresh();
    return c._almLastInco();
  } };
}

// Deliberately constructed regression inputs, not research results.
const triangle = 'A,B,0,0.1,S1\nB,C,0,0.1,S2\nA,C,1,0.1,S3';
const nonrejection = triangle.replace('A,C,1,', 'A,C,0.3,');
const plain = x => JSON.parse(JSON.stringify(x));
const fixture = name => readFileSync(new URL('tests/fixtures/' + name, app), 'utf8')
  .trim().split(/\r?\n/).slice(1).map(line => {
    const [study, a, b, te, se] = line.split(',');
    return [a, b, te, se, study].join(',');
  }).join('\n');

test('plant P0-31: non-rejected node splits do not claim consistency', () => {
  const h = harness(), result = h.load(nonrejection);
  assert.equal(result.nodeSplit.length, 3);
  assert.ok(result.nodeSplit.every(s => s.p >= 0.05 && s.p < 0.10));
  assert.match(h.elements['ns-body'].innerHTML, />no evidence of inconsistency</);
  assert.doesNotMatch(h.elements['ns-body'].innerHTML, />consistent</);
});

test('control P0-31: rejected node splits retain their significance flag', () => {
  const h = harness(), result = h.load(triangle);
  assert.ok(result.nodeSplit.every(s => s.p < 0.05));
  assert.match(h.elements['ns-body'].innerHTML, /class="chip incon"/);
  assert.doesNotMatch(h.elements['ns-body'].innerHTML, />no evidence of inconsistency</);
});

test('plant P0-34: unreplicated designs qualify comparison, interpretation and methods', () => {
  const h = harness(); h.load(triangle, 'PM');
  const P = h.c.AlmIncoPlusCore, state = h.c.AlmIncoPlus.state();
  assert.equal(state.compare.globalAgree, false);
  assert.ok(state.compare.global.FE.p < 0.05);
  assert.ok(state.compare.global.PM.p >= 0.05 && state.compare.global.PM.tau2 > 0);
  for (const text of [P.compareSummary(state.compare), P.interpret(state).join(' '),
    P.methodsText({ base: state.base }), h.c.AlmIncoPlus.methodsText()]) {
    assert.match(text, /within-design df = 0/);
    assert.match(text, /cannot be separated/);
    assert.doesNotMatch(text, /sensitive to unmodelled heterogeneity/);
  }
});

test('control P0-34: replicated designs are not called unidentifiable', () => {
  const h = harness(); h.load(fixture('inco-het.csv'), 'DL');
  const P = h.c.AlmIncoPlusCore, state = h.c.AlmIncoPlus.state();
  assert.equal(state.base.k, 7);
  assert.equal(state.base.dbt.df, 1);
  for (const text of [P.compareSummary(state.compare), P.interpret(state).join(' '),
    h.c.AlmIncoPlus.methodsText()]) {
    assert.doesNotMatch(text, /within-design df = 0|cannot be separated/);
  }
});

test('plant U-INCO-PARSE: a decimal-comma row refuses the whole input and clears exports', () => {
  const h = harness(); h.load(nonrejection);
  assert.ok(h.c.AlmIncoPlus.methodsText());
  const text = nonrejection + '\nA,B,-0,25,0,10,S4';
  const result = h.load(text);
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /columns/i);
  assert.equal(h.elements['ns-body'].innerHTML, '');
  assert.equal(h.elements['ns-plot'].innerHTML, '');
  assert.equal(h.c.AlmIncoPlus.state().base.status, 'refused');
  assert.equal(h.c.AlmIncoPlus.state().compare, null);
  assert.equal(h.c.AlmIncoPlus.state().loo, null);
  assert.equal(h.c.AlmIncoPlus.methodsText(), '');
  assert.throws(() => h.c.AlmIncoPlus.rScript(false));
  assert.match(h.c.AlmIncoPlus.issueMessage(text), /refused/i);
  assert.match(h.c.AlmIncoPlus.issueMessage(text), /line 4/);
  assert.doesNotMatch(h.c.AlmIncoPlus.issueMessage(text), /Columns after the fifth are ignored/);
});

test('plant U-INCO-PARSE: sixth fields, including empty fields, cannot silently shift a study ID', () => {
  const h = harness();
  for (const row of ['A,B,-0,25,0.1,S4', 'A,B,-0.25,0.1,S4,',
    'A,B,x,0.1,S4,note', 'A,B,-0.25,0.1,S4,note']) {
    const result = h.load(nonrejection + '\n' + row);
    assert.equal(result.status, 'refused', row);
    assert.match(result.reason, /columns/i, row);
  }
});

test('control U-INCO-PARSE: four/five columns and quoted labels preserve effect, SE and IDs', () => {
  const h = harness();
  const text = 't1,t2,TE,seTE,study\r\n"A, one",B,-0.25,0.10,"S,1"\r\nB,C,0.3,0.2\r\n"A, one",C,0.1,0.15,"S""3"';
  const result = h.load(text);
  assert.notEqual(result.status, 'refused');
  assert.deepEqual(plain(h.c.parse(text)), [
    { A: 'A, one', B: 'B', te: -0.25, se: 0.1, study: 'S,1' },
    { A: 'B', B: 'C', te: 0.3, se: 0.2, study: 'row_3' },
    { A: 'A, one', B: 'C', te: 0.1, se: 0.15, study: 'S"3' },
  ]);
  assert.match(h.c.AlmIncoPlus.issueMessage(text), /looks like a header/);
  assert.ok(h.c.AlmIncoPlus.methodsText());
  assert.ok(h.c.AlmIncoPlus.rScript(false));
});
