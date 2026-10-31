import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma-inconsistency/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function parse(text)'));
const importer = scripts.find(s => s.includes('// ma-comparisons-v1 reader:'));
const bus = readFileSync(new URL('shared/ma-comparisons-v1.js', root), 'utf8');
const priorInput = 'A,B,0.2,0.1,prior1\nB,C,0.3,0.2,prior2\nA,C,0.6,0.15,prior3';

// Execute the actual bus, page engine and import click handler. The small DOM
// surface records input/run events and rendered results; no browser or dependency.
function harness() {
  const elements = new Map(), storage = new Map(), messages = [];
  let inputEvents = 0, runClicks = 0;
  function element(id = '') {
    const listeners = new Map();
    const el = {
      id, value: '', style: {}, innerHTML: '',
      set textContent(text) { this.innerHTML = String(text); },
      get textContent() { return this.innerHTML; },
      setAttribute() {},
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
      click() {
        if (this.id === 'btn-run') runClicks++;
        this.dispatchEvent({ type: 'click' });
      },
      insertAdjacentElement(_where, child) { elements.set(child.id, child); }
    };
    if (id) elements.set(id, el);
    return el;
  }
  for (const id of ['src', 'btn-run', 'ns-body', 'ns-plot', 'dbt', 'f-model']) element(id);
  elements.get('src').value = priorInput;
  elements.get('f-model').value = 'FE';
  elements.get('src').addEventListener('input', () => inputEvents++);
  const c = vm.createContext({
    document: { readyState: 'complete', getElementById: id => elements.get(id) || null, createElement: () => element() },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    Toast: { show: message => messages.push(message) },
    Event: class { constructor(type) { this.type = type; } }
  });
  c.window = c;
  assert.ok(engine && importer, 'locate real page scripts');
  vm.runInContext(bus, c, { filename: 'shared/ma-comparisons-v1.js' });
  vm.runInContext(engine, c, { filename: 'nma-inconsistency engine' });
  vm.runInContext(importer, c, { filename: 'nma-inconsistency bus importer' });
  assert.ok(c._almLastInco().dbt, 'start with a successful prior analysis');
  return { c, elements, storage, messages, get inputEvents() { return inputEvents; }, get runClicks() { return runClicks; } };
}

function continuous(measure) {
  return {
    _schema: 'ma-comparisons-v1', _savedAt: '2026-01-01T00:00:00.000Z', effectMeasure: measure,
    studies: [['A', 'B', 0], ['B', 'C', 0], ['A', 'C', 0], ['A', 'C', 2]].map(([a, b, mean], i) => ({
      id: `study${i + 1}`,
      arms: [{ treatment: a, mean, sd: 1, n: 40 }, { treatment: b, mean: 0, sd: 1, n: 40 }]
    }))
  };
}

function publish(h, env) {
  assert.equal(h.c.MaComparisons.validate(env).ok, true, 'source is a valid bus envelope');
  assert.equal(h.c.MaComparisons.write(env), true);
  const source = h.c.MaComparisons.read();
  assert.equal(source.studies.length, env.studies.length, 'writer preserves every source study');
  return h.storage.get('ma-comparisons-v1');
}

function assertRefused(h, saved) {
  assert.equal(h.c._almLastInco().status, 'refused', 'refuse the import instead of analysing a subset');
  const reason = h.elements.get('dbt').textContent;
  assert.match(reason, /Load from bus refused:/);
  assert.match(reason, /input box was left unchanged and nothing was analysed/);
  assert.equal(h.elements.get('src').value, priorInput);
  assert.equal(h.inputEvents, 0);
  assert.equal(h.runClicks, 0);
  assert.equal(h.elements.get('ns-body').innerHTML, '');
  assert.equal(h.elements.get('ns-plot').innerHTML, '');
  assert.doesNotMatch(reason, /no evidence of inconsistency/);
  assert.equal(h.messages.some(m => /^Loaded /.test(m)), false);
  assert.equal(h.storage.get('ma-comparisons-v1'), saved, 'bus data stays available for correction');
  return reason;
}

for (const measure of ['MD', 'SMD']) {
  test(`control P16-R4: ${measure} schema retains a missing-n study while conversion omits its contrast`, () => {
    const h = harness(), env = continuous(measure);
    delete env.studies[3].arms[1].n;
    publish(h, env);
    const source = h.c.MaComparisons.read();
    assert.equal(source.studies.length, 4);
    assert.deepEqual(Array.from(h.c.MaComparisons.toContrasts(source), r => r.study), ['study1', 'study2', 'study3']);
  });

  for (const arm of [0, 1]) {
    test(`plant P16-R4: ${measure} missing n on arm ${arm + 1} refuses partial import and names study4`, () => {
      const h = harness(), env = continuous(measure);
      delete env.studies[3].arms[arm].n;
      const saved = publish(h, env);
      h.elements.get('btn-bus-load').click();
      const reason = assertRefused(h, saved);
      assert.match(reason, /study4/);
      assert.match(reason, /sample size|\bn\b/i);
    });
  }

  test(`plant P16-R4: ${measure} names every omitted study regardless of input position`, () => {
    const h = harness(), env = continuous(measure);
    delete env.studies[0].arms[0].n;
    delete env.studies[2].arms[1].n;
    const saved = publish(h, env);
    h.elements.get('btn-bus-load').click();
    const reason = assertRefused(h, saved);
    assert.match(reason, /study1/);
    assert.match(reason, /study3/);
  });

  test(`plant P16-R4: ${measure} a repeated ID cannot hide a missing-n source study`, () => {
    const h = harness(), env = continuous(measure);
    env.studies[3].id = 'study1';
    delete env.studies[3].arms[1].n;
    const saved = publish(h, env);
    h.elements.get('btn-bus-load').click();
    assert.match(assertRefused(h, saved), /study1/);
  });

  test(`control P16-R4: ${measure} complete four-study import preserves every contrast and runs once`, () => {
    const h = harness(), saved = publish(h, continuous(measure));
    const expected = Array.from(h.c.MaComparisons.toContrasts(h.c.MaComparisons.read()), r => ({
      A: r.treatment1, B: r.treatment2, te: r.te, se: r.se, study: r.study
    }));
    h.elements.get('btn-bus-load').click();
    assert.deepEqual(JSON.parse(JSON.stringify(h.c.parse(h.elements.get('src').value))), expected);
    assert.equal(expected.length, 4);
    assert.ok(h.c._almLastInco().dbt);
    assert.notEqual(h.c._almLastInco().status, 'refused');
    assert.equal(h.runClicks, 1);
    assert.equal(h.inputEvents, 1);
    assert.match(h.messages.at(-1), /Loaded 4 contrasts/);
    assert.equal(h.storage.get('ma-comparisons-v1'), saved);
  });

  test(`control P16-R4: ${measure} no convertible studies still refuses without replacing input`, () => {
    const h = harness(), env = continuous(measure);
    for (const study of env.studies) delete study.arms[1].n;
    const saved = publish(h, env);
    h.elements.get('btn-bus-load').click();
    assertRefused(h, saved);
  });
}

test('control P16-R4: multi-arm bus refusal still precedes conversion', () => {
  const h = harness(), env = continuous('MD');
  env.studies[0].arms.push({ treatment: 'C', mean: 0, sd: 1, n: 40 });
  const saved = publish(h, env);
  h.elements.get('btn-bus-load').click();
  assert.match(assertRefused(h, saved), /Multi-arm studies are unsupported/);
});

for (const measure of ['OR', 'RR']) {
  test(`control P16-R4: ${measure} complete binary bus still imports all four studies`, () => {
    const h = harness(), env = continuous(measure);
    for (const study of env.studies) study.arms = study.arms.map((arm, i) => ({
      treatment: arm.treatment, events: 5 + i, n: 40
    }));
    const saved = publish(h, env);
    h.elements.get('btn-bus-load').click();
    assert.deepEqual(Array.from(h.c.parse(h.elements.get('src').value), r => r.study), ['study1', 'study2', 'study3', 'study4']);
    assert.ok(h.c._almLastInco().dbt);
    assert.equal(h.runClicks, 1);
    assert.equal(h.inputEvents, 1);
    assert.match(h.messages.at(-1), /Loaded 4 contrasts/);
    assert.equal(h.storage.get('ma-comparisons-v1'), saved);
  });
}


for (const measure of ['MD', 'SMD']) {
  for (const [label, badN] of [
    ['fractional n', 40.5],
    ['unsafe n', Number.MAX_SAFE_INTEGER + 1],
    ['singleton sample-SD n', 1]
  ]) {
    test(`plant P16-R4-count-domain: ${measure} rejects ${label} before numerical import`, () => {
      const h = harness(), env = continuous(measure);
      env.studies[1].arms[0].n = badN;
      const saved = publish(h, env);
      // The shared schema deliberately allows n to remain optional and
      // currently accepts these values: the consumer must not silently use them.
      const source = h.c.MaComparisons.read();
      assert.equal(source.studies[1].arms[0].n, badN);
      if (label === 'fractional n' || label === 'singleton sample-SD n') {
        assert.equal(h.c.MaComparisons.toContrasts(source).length, 4,
          'without the new consumer guard an invalid sample size produces a contrast');
      }
      h.elements.get('btn-bus-load').click();
      const reason = assertRefused(h, saved);
      assert.match(reason, /study2/);
      assert.match(reason, /sample size n|safe integers/);
    });
  }
}

for (const measure of ['OR', 'RR']) {
  for (const [label, changed] of [
    ['fractional events', { events: 5.5 }],
    ['fractional denominator', { n: 40.5 }],
    ['unsafe denominator', { n: Number.MAX_SAFE_INTEGER + 1 }]
  ]) {
    test(`plant P16-R4-count-domain: ${measure} rejects ${label} before numerical import`, () => {
      const h = harness(), env = continuous(measure);
      for (const study of env.studies) study.arms = study.arms.map((arm, i) => ({
        treatment: arm.treatment, events: 5 + i, n: 40
      }));
      Object.assign(env.studies[1].arms[0], changed);
      const saved = publish(h, env);
      const source = h.c.MaComparisons.read();
      if (label !== 'unsafe denominator') {
        assert.equal(h.c.MaComparisons.toContrasts(source).length, 4,
          'without the new consumer guard fractional counts produce plausible contrasts');
      }
      h.elements.get('btn-bus-load').click();
      const reason = assertRefused(h, saved);
      assert.match(reason, /study2/);
      assert.match(reason, /event count|sample size n/);
    });
  }
}
