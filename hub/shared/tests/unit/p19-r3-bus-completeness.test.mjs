import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('component-nma/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function fit(rows)'));
const importer = scripts.find(s => s.includes('// ma-comparisons-v1 reader:'));
const comparisons = readFileSync(new URL('shared/ma-comparisons-v1.js', root), 'utf8');

// Exercise the actual engine, input/click handlers, storage reader and converter.
// Only the DOM and localStorage are in-memory doubles; no browser is needed.
function harness(env) {
  const elements = new Map();
  const messages = [];
  function element(id = '') {
    const handlers = new Map();
    const el = {
      id, value: '', innerHTML: '', textContent: '', style: {}, children: [],
      events: [], clicks: 0,
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(fn);
      },
      dispatchEvent(event) {
        this.events.push(event.type);
        for (const fn of handlers.get(event.type) || []) fn(event);
      },
      click() { this.clicks++; this.dispatchEvent({ type: 'click' }); },
      insertAdjacentElement(position, child) { elements.set(child.id, child); },
      replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); },
      setAttribute(name, value) { this[name] = value; },
    };
    if (id) elements.set(id, el);
    return el;
  }
  for (const id of ['src', 'btn-run', 'inactive', 'inactive-note',
    'intervention-heading', 'comp-body', 'int-body', 'forest']) element(id);
  const source = elements.get('src');
  source.value = 'prior | control | 1 | 0.5\nprior | control | 2 | 0.5';
  const raw = JSON.stringify(env);
  const context = vm.createContext({
    document: {
      readyState: 'complete',
      getElementById: id => elements.get(id) || null,
      createElement: () => element(),
    },
    localStorage: { getItem: key => key === 'ma-comparisons-v1' ? raw : null },
    Toast: { show: (message, kind) => messages.push({ message, kind }) },
    Event: class { constructor(type) { this.type = type; } },
  });
  context.window = context;
  vm.runInContext(comparisons, context);
  vm.runInContext(engine, context);
  vm.runInContext(importer, context);
  assert.ok(context._almLastCnma(), 'harness starts with an existing fitted result');
  const initialInput = source.value;
  return {
    context, source, elements, messages, initialInput,
    load: () => elements.get('btn-bus-load').click(),
    result: () => JSON.parse(JSON.stringify(context._almLastCnma())),
  };
}

function envelope(measure = 'MD') {
  return {
    _schema: 'ma-comparisons-v1', _savedAt: '2026-01-01T00:00:00.000Z',
    effectMeasure: measure,
    studies: [0, 6, 40].map((mean, i) => ({
      id: 'study-' + (i + 1),
      arms: measure === 'MD' || measure === 'SMD' ? [
        { treatment: 'drug', mean, sd: 2, n: 20 },
        { treatment: 'control', mean: 0, sd: 2, n: 20 },
      ] : [
        { treatment: 'drug', events: 2 + i, n: 20 },
        { treatment: 'control', events: 5 + i, n: 20 },
      ],
    })),
  };
}

function assertRefused(h) {
  assert.equal(h.elements.get('btn-run').clicks, 0, 'must not fit an incomplete import');
  assert.equal(h.source.value, h.initialInput, 'refusal must preserve the previous input');
  assert.deepEqual(h.source.events, [], 'refusal must not dispatch input/autosave events');
  assert.equal(h.result(), null, 'refusal must clear the stale exported result');
  for (const id of ['comp-body', 'int-body', 'forest']) {
    assert.equal(h.elements.get(id).innerHTML, '', 'refusal must clear stale ' + id);
  }
  assert.ok(h.messages.length, 'refusal needs a visible explanation');
  assert.ok(h.messages.every(m => m.kind === 'warn'));
  assert.doesNotMatch(h.messages.map(m => m.message).join('\n'), /Loaded \d+ contrasts/);
}

for (const measure of ['MD', 'SMD']) {
  for (const study of [0, 1, 2]) {
    for (const arm of [0, 1]) {
      test(`plant P19-R3: ${measure} missing n in study ${study + 1} arm ${arm + 1} refuses atomically`, () => {
        const env = envelope(measure);
        delete env.studies[study].arms[arm].n;
        const h = harness(env);
        assert.equal(h.context.MaComparisons.validate(env).ok, true, 'missing continuous n is schema-valid');
        assert.equal(h.context.MaComparisons.toContrasts(env).length, 2, 'converter contract skips this study');
        h.load();
        assertRefused(h);
        assert.match(h.messages.at(-1).message, /mean\/sd\/n/);
      });
    }
  }
}

test('plant P19-R3: finite n with an underivable MD variance also refuses the whole import', () => {
  const env = envelope();
  env.studies[2].arms[0].sd = Number.MAX_VALUE;
  const h = harness(env);
  assert.equal(h.context.MaComparisons.validate(env).ok, true);
  assert.equal(h.context.MaComparisons.toContrasts(env).length, 2);
  h.load();
  assertRefused(h);
});

for (const measure of ['MD', 'SMD', 'OR', 'RR']) {
  test(`control: complete ${measure} input imports all studies and fits the same contrasts`, () => {
    const env = envelope(measure);
    const h = harness(env);
    assert.equal(h.context.MaComparisons.validate(env).ok, true);
    const rows = h.context.MaComparisons.toContrasts(env);
    assert.equal(rows.length, env.studies.length);
    const expectedInput = rows.map(r => `${r.treatment1} | ${r.treatment2} | ${r.te} | ${r.se}`).join('\n');
    const direct = harness(env);
    direct.context.__almCnmaLoad(expectedInput);
    h.load();
    assert.equal(h.source.value, expectedInput);
    assert.equal(h.elements.get('btn-run').clicks, 1);
    assert.deepEqual(h.source.events, ['input']);
    assert.deepEqual(h.result(), direct.result(), 'bus and pasted complete contrasts agree');
    assert.equal(h.result().df, env.studies.length - 1);
    for (const id of ['comp-body', 'int-body', 'forest']) assert.ok(h.elements.get(id).innerHTML);
    assert.deepEqual(h.messages.map(m => m.message), ['Loaded 3 contrasts from the shared bus.']);
  });
}

test('control: all continuous studies missing n still refuse without changing input', () => {
  const env = envelope();
  for (const study of env.studies) delete study.arms[0].n;
  const h = harness(env);
  h.load();
  assertRefused(h);
  assert.match(h.messages.at(-1).message, /yielded no contrasts/);
});

for (const scenario of ['multi-arm', 'repeated-study']) {
  test(`control: ${scenario} bus inputs still refuse before fitting`, () => {
    const env = envelope();
    if (scenario === 'multi-arm') env.studies[2].arms.push({ treatment: 'exercise', mean: 3, sd: 2, n: 20 });
    else env.studies[2].id = env.studies[0].id;
    const h = harness(env);
    h.load();
    assertRefused(h);
    assert.match(h.messages.at(-1).message, /covariance is required/);
  });
}

test('control: unsupported HR measure still refuses before fitting', () => {
  const h = harness(envelope('HR'));
  h.load();
  assertRefused(h);
  assert.match(h.messages.at(-1).message, /yielded no contrasts/);
});
