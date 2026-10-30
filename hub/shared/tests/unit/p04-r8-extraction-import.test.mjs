import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import M from '../../../../shared/ma-comparisons-v1.js';
import NM from '../../../../shared/nma-multiarm-v1.js';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma/index.html', root), 'utf8');
const pageScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function busContrastsText()'));
assert.ok(pageScript, 'execute the real NMA page script');
const continuous = (measure = 'MD', complete = false) => M.buildEnvelope([
  { id: 'Complete', arms: [
    { treatment: 'A', mean: 5, sd: 2, n: 50 },
    { treatment: 'B', mean: 4.2, sd: 2.5, n: 48 },
  ] },
  { id: 'MissingN', arms: [
    { treatment: 'A', mean: 6, sd: 2, ...(complete ? { n: 50 } : {}) },
    { treatment: 'B', mean: 4.5, sd: 2.5, n: 48 },
  ] },
], measure);
const binary = (measure, zero) => M.buildEnvelope([
  { id: 'Binary', arms: [
    { treatment: 'A', events: zero ? 0 : 10, n: 100 },
    { treatment: 'B', events: 20, n: 100 },
  ] },
], measure);

// Minimal DOM around the complete, unmodified inline script. Conversion,
// parsing, rendering and NMA calculations are real; no browser is required.
function page(env, saved = null) {
  function element(tag = 'div') {
    const listeners = {}, classes = new Set();
    return {
      tagName: tag.toUpperCase(), value: '', innerHTML: '', textContent: '', hidden: false,
      classList: { add: s => classes.add(s), remove: s => classes.delete(s) },
      appendChild() {},
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
    };
  }
  const nodes = new Map([...html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)]
    .map(m => { const el = element(m[1]); el.hidden = /\bhidden\b/.test(m[0]); return [m[2], el]; }));
  const el = id => nodes.get(id);
  for (const [id, value] of Object.entries({ 'f-model': 'fe', 'f-ci': 'classic', 'f-dir': 'desirable', 'f-scale': 'log', 'f-example': 'generic' })) el(id).value = value;
  const storage = new Map();
  if (env) storage.set(M.KEY, JSON.stringify(env));
  if (saved) storage.set('nma-v1', JSON.stringify(saved));
  const alerts = [], analyses = [];
  const context = vm.createContext({
    document: { getElementById: el, createElement: element },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    alert: s => alerts.push(s), confirm: () => true,
    window: {
      MaComparisons: { ...M, read: () => JSON.parse(storage.get(M.KEY) || 'null') },
      AlmNmaMultiarm: { ...NM, analyse(rows, opts) { analyses.push(rows); return NM.analyse(rows, opts); } },
      alm: { analysisLifecycle: fn => fn, plotExport() {} },
    },
  });
  vm.runInContext(pageScript, context, { filename: 'nma/index.html' });
  return { el, storage, alerts, analyses, load: () => el('btn-bus').click() };
}

function assertRefusal(p, study = 'MissingN') {
  const notice = p.el('bus-import-error');
  assert.ok(notice, 'an inline import notice must exist');
  assert.equal(notice.hidden, false, 'refusal remains visible after rendering');
  assert.match(notice.textContent, /import refused/i);
  assert.ok(notice.textContent.includes(study), 'name the omitted study');
  assert.match(notice.textContent, /sample size|\bn\b/i);
  assert.match(notice.textContent, /A.*B/);
}

for (const measure of ['MD', 'SMD']) {
  test(`control P04-R8: ${measure} storage still accepts and retains optional n`, () => {
    const env = continuous(measure);
    assert.deepEqual(M.validate(env), { ok: true, errors: [] });
    assert.deepEqual(env.studies.map(s => s.id), ['Complete', 'MissingN']);
    assert.equal(Object.hasOwn(env.studies[1].arms[0], 'n'), false);
    assert.deepEqual(M.toContrasts(env).map(r => r.study), ['Complete']);
  });

  test(`plant P04-R8: ${measure} conversion returns named omissions without mutating the envelope`, () => {
    const env = continuous(measure), before = JSON.stringify(env);
    const result = M.toContrastsDetailed(env);
    assert.deepEqual(result.rows, M.toContrasts(env), 'legacy row values stay identical');
    assert.equal(result.omissions.length, 1);
    assert.equal(result.omissions[0].study, 'MissingN');
    assert.equal(result.omissions[0].treatment1, 'A');
    assert.equal(result.omissions[0].treatment2, 'B');
    assert.match(result.omissions[0].reason, /sample size|\bn\b/i);
    assert.equal(JSON.stringify(env), before);
  });

  test(`plant P04-R8: ${measure} button refuses a partial import and preserves existing inputs and storage`, () => {
    const env = continuous(measure);
    const p = page(env, { data: 'Previous, A, B, 0.2, 0.3', title: 'Previous analysis' });
    const storageBefore = [...p.storage], calls = p.analyses.length;
    assert.ok(calls > 0, 'control: prior data were analysed');
    p.load();
    assertRefusal(p);
    assert.equal(p.el('f-data').value, 'Previous, A, B, 0.2, 0.3');
    assert.equal(p.el('f-title').value, 'Previous analysis');
    assert.equal(p.analyses.length, calls, 'no reduced network is analysed');
    assert.deepEqual([...p.storage], storageBefore);
    assert.equal(p.el('stats-wrap').innerHTML, '', 'clear prior results on refusal');
  });

  test(`plant P04-R8: ${measure} automatic import refuses missing n before analysing or saving a subset`, () => {
    const env = continuous(measure), p = page(env);
    assertRefusal(p);
    assert.equal(p.el('f-data').value, '');
    assert.equal(p.el('f-title').value, '');
    assert.equal(p.el('stats-wrap').innerHTML, '');
    assert.equal(p.analyses.length, 0);
    assert.equal(p.storage.has('nma-v1'), false);
    assert.equal(p.storage.get(M.KEY), JSON.stringify(env));
  });

  test(`control P04-R8: complete ${measure} imports both studies automatically and by button`, () => {
    const env = continuous(measure, true);
    for (const saved of [null, { data: '', title: '' }]) {
      const p = page(env, saved);
      if (saved) p.load();
      assert.match(p.el('f-data').value, /Complete/);
      assert.match(p.el('f-data').value, /MissingN/);
      assert.match(p.el('stats-wrap').innerHTML, /Studies<\/span><span class="v">2<\/span>/);
      assert.ok(p.analyses.length > 0);
      assert.equal(p.alerts.length, 0);
      assert.ok(!p.el('bus-import-error') || p.el('bus-import-error').hidden);
    }
  });
}

test('plant P04-R8: a partly convertible three-arm study reports each missing pair and is refused', () => {
  const env = continuous();
  env.studies = [{ id: 'PartialThree', arms: [
    ...env.studies[0].arms, { treatment: 'C', mean: 4, sd: 2 },
  ] }];
  const result = M.toContrastsDetailed(env);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.omissions.map(o => [o.study, o.treatment1, o.treatment2]),
    [['PartialThree', 'A', 'C'], ['PartialThree', 'B', 'C']]);
  const p = page(env);
  assert.equal(p.analyses.length, 0);
  assert.match(p.el('bus-import-error').textContent, /PartialThree.*A.*C.*B.*C/s);
});

test('plant P04-R8: an entirely unconvertible bus names the missing study instead of loading the demo', () => {
  const env = continuous();
  env.studies.shift();
  const p = page(env);
  assertRefusal(p);
  assert.equal(p.el('f-data').value, '');
  assert.equal(p.analyses.length, 0);
});

test('plant P04-R8: correcting sample sizes clears the refusal and imports every study', () => {
  const p = page(continuous());
  assertRefusal(p);
  p.storage.set(M.KEY, JSON.stringify(continuous('MD', true)));
  p.load();
  assert.equal(p.el('bus-import-error').hidden, true);
  assert.equal(p.el('bus-import-error').textContent, '');
  assert.match(p.el('stats-wrap').innerHTML, /Studies<\/span><span class="v">2<\/span>/);
});

for (const measure of ['OR', 'RR']) for (const zero of [false, true]) {
  test(`control P04-R8: ${measure} ${zero ? 'zero-cell' : 'complete binary'} import retains the contrast`, () => {
    const env = binary(measure, zero), row = M.toContrasts(env)[0];
    assert.ok(Number.isFinite(row.te) && row.se > 0);
    for (const saved of [null, { data: '', title: '' }]) {
      const p = page(env, saved);
      if (saved) p.load();
      assert.ok(p.el('f-data').value.includes(`Binary, B, A, ${row.te.toFixed(6)}, ${row.se.toFixed(6)}`));
      assert.match(p.el('stats-wrap').innerHTML, /Studies<\/span><span class="v">1<\/span>/);
      assert.ok(!p.el('bus-import-error') || p.el('bus-import-error').hidden);
    }
  });
}

test('control P04-R8: absent bus still loads the existing demo', () => {
  const p = page(null);
  assert.match(p.el('f-data').value, /TRIAL1,/);
  assert.match(p.el('f-title').value, /Example NMA/);
});
