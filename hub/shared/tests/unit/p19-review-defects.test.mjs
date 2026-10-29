import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('component-nma/index.html', root), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function fit(rows)'));
const wiring = scripts.find(s => s.includes('getResults:function()'));
const exportsCode = readFileSync(new URL('hub/shared/results-export.js', root), 'utf8');
const example = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
const ordinary = 'a | control | 0.2 | 0.1\na | control | 0.3 | 0.1';
const actions = ['json', 'csv', 'md', 'report-md', 'report-txt'];
const numericalReason = /numerical range|too (?:small|large)|underflow|overflow/i;

// Execute the real inline engine, export wiring and export handlers. This is a
// DOM/download stub for node:test, not a browser or a substitute implementation.
function harness() {
  const elements = new Map(), downloads = [], blobs = new Map(), warnings = [];
  let nextBlob = 0;
  function element(tag = 'div') {
    const listeners = new Map(), buttons = new Map();
    return {
      tag, innerHTML: '', textContent: '', value: '', style: {}, children: [],
      addEventListener(type, fn) { listeners.set(type, fn); },
      dispatchEvent(event) { return listeners.get(event.type)?.(event); },
      click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        return listeners.get('click')?.();
      },
      setAttribute(name, value) { this[name] = value; },
      appendChild(child) {
        child.parentNode = this; this.children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      insertBefore(child) { return this.appendChild(child); },
      removeChild(child) { this.children = this.children.filter(c => c !== child); },
      replaceChildren() { this.children = []; },
      querySelector(selector) {
        const action = selector.match(/^\[data-action="([\w-]+)"\]$/)?.[1];
        assert.ok(action && actions.includes(action), `unsupported stub selector ${selector}`);
        assert.ok(this.innerHTML.includes(`data-action="${action}"`));
        if (!buttons.has(action)) buttons.set(action, element('button'));
        return buttons.get(action);
      },
    };
  }
  for (const id of ['src', 'inactive', 'inactive-note', 'btn-run', 'intervention-heading', 'comp-body', 'int-body', 'forest']) {
    elements.set(id, element());
  }
  elements.get('src').value = example;
  const body = element('body'), footer = element('footer');
  body.appendChild(footer);
  const document = {
    readyState: 'complete', title: 'Component NMA', body, head: element('head'),
    createElement: element,
    getElementById: id => elements.get(id) || null,
    querySelector: selector => selector === 'footer' ? footer : null,
  };
  const context = vm.createContext({ document, Blob, console,
    setTimeout: fn => fn(),
    URL: { createObjectURL(blob) { const url = `blob:${++nextBlob}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
  });
  context.window = context;
  context.Toast = { show(message, kind) { warnings.push({ message, kind }); } };
  vm.runInContext(engine, context, { filename: 'component-nma-inline.js' });
  vm.runInContext(exportsCode, context, { filename: 'results-export.js' });
  vm.runInContext(wiring, context, { filename: 'component-nma-exports.js' });
  return {
    context, elements, warnings,
    load: text => context.__almCnmaLoad(text),
    result: () => context._almLastCnma(),
    async export(action) {
      const before = downloads.length;
      await elements.get('alm-export-mount').querySelector(`[data-action="${action}"]`).click();
      assert.equal(downloads.length, before + 1, `${action} download`);
      return downloads.at(-1).blob.text();
    },
  };
}

function finiteTree(value, path = 'result') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path}: ${value}`);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) finiteTree(child, `${path}.${key}`);
  }
}

async function cleared(h) {
  assert.equal(h.result(), null, 'unsafe or stale fit must not be published');
  for (const id of ['comp-body', 'int-body', 'forest']) assert.equal(h.elements.get(id).innerHTML, '', id);
  assert.deepEqual(JSON.parse(await h.export('json')), {});
  assert.equal(await h.export('csv'), 'key,value');
  assert.doesNotMatch(await h.export('md'), /components|combinations|tau2|NaN|Infinity/);
  for (const action of ['report-md', 'report-txt']) {
    const report = await h.export(action);
    assert.match(report, /No results yet/);
    assert.doesNotMatch(report, /components\.|combinations\.|NaN|Infinity/);
  }
}

const stress = [
  ['SE squared underflows to zero', '1e-200', '0.2', '0.3'],
  ['positive variance has infinite reciprocal', '1e-160', '0.2', '0.3'],
  ['finite weights overflow the DL denominator', '1e-100', '0.2', '0.3'],
  ['finite weights overflow weighted effects', '1e-50', '1e250', '2e250'],
  ['finite weighted effects overflow residual Q', '1', '1e200', '-1e200'],
  ['SE squared overflows', '1e200', '0.2', '0.3'],
];
for (const [name, se, a, b] of stress) {
  const text = `a | control | ${a} | ${se}\na | control | ${b} | ${se}`;
  test(`plant P19-R2: ${name} is refused by the engine`, () => {
    const h = harness();
    const rows = h.context.parse(text);
    assert.equal(rows.length, 2, 'finite positive input scalars pass syntax validation');
    assert.throws(() => h.context.fit(rows), numericalReason);
  });
  test(`plant P19-R2: ${name} clears display and every export with an explanation`, async () => {
    const h = harness();
    assert.ok(h.result());
    assert.ok(JSON.parse(await h.export('json')).components, 'prior export has results');
    h.load(text);
    await cleared(h);
    assert.ok(h.warnings.some(w => w.kind === 'warn' && numericalReason.test(w.message)), 'actionable numerical refusal');
    h.load(ordinary);
    assert.ok(h.result(), 'valid input recovers after refusal');
    finiteTree(h.result());
    assert.ok(JSON.parse(await h.export('json')).components);
  });
}

test('control: default example and small representable SEs remain finite', async () => {
  const h = harness();
  for (const text of [example, 'a | control | 2e-50 | 1e-50\na | control | 3e-50 | 1e-50']) {
    h.load(text);
    assert.ok(h.result());
    finiteTree(h.result());
    assert.equal(h.warnings.length, 0);
    assert.ok(h.elements.get('comp-body').innerHTML.includes('<tr>'));
    assert.doesNotMatch(h.elements.get('forest').innerHTML, /NaN|Infinity/);
    assert.ok(h.elements.get('forest').innerHTML.includes('<rect'));
    finiteTree(JSON.parse(await h.export('json')));
    for (const action of actions.filter(a => a !== 'json')) assert.match(await h.export(action), /components/);
  }
});

test('control: malformed, missing and nonpositive SEs still clear results', async () => {
  const h = harness();
  for (const se of ['junk', '', '0', '-0.1', 'Infinity']) {
    h.load(ordinary);
    assert.ok(h.result());
    h.load(`a | control | 0.2 | ${se}\na | control | 0.3 | 0.1`);
    await cleared(h);
    assert.match(h.warnings.at(-1).message, /Invalid contrast input/);
  }
});

test('control: an input edit clears all five exports', async () => {
  const h = harness();
  assert.ok(h.result());
  h.elements.get('src').value = ordinary;
  h.elements.get('src').dispatchEvent({ type: 'input' });
  await cleared(h);
});

test('control: ordinary, heterogeneous and saturated fits match fresh R residual-WLS references', () => {
  const reference = JSON.parse(readFileSync(new URL('p19-f2-reference.json', import.meta.url), 'utf8'));
  assert.ok(reference.provenance.R);
  assert.ok(reference.provenance.stats);
  assert.match(reference.provenance.method, /lm.wfit/);
  assert.equal(reference.cases.example.text.replace(/\r/g, ''), example.replace(/\r/g, ''));
  const h = harness();
  const near = (got, want, label) => assert.ok(Number.isFinite(got) &&
    Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${label}: ${got} versus ${want}`);
  for (const [name, ref] of Object.entries(reference.cases)) {
    h.load(ref.text);
    const got = h.result();
    assert.ok(got, name);
    finiteTree(got);
    assert.equal(got.df, ref.df);
    near(got.Q, ref.Q, `${name} Q`);
    if (ref.tau2 === null) assert.equal(got.tau2, null);
    else near(got.tau2, ref.tau2, `${name} tau2`);
    for (const kind of ['components', 'combinations']) {
      assert.deepEqual(Object.keys(got[kind]).sort(), Object.keys(ref[kind]).sort());
      for (const [label, value] of Object.entries(ref[kind])) {
        near(got[kind][label].est, value.est, `${name} ${kind}.${label}.est`);
        near(got[kind][label].se, value.se, `${name} ${kind}.${label}.se`);
      }
    }
  }
});
