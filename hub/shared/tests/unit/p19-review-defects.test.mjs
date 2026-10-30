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
function harness(engineSource = engine) {
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
  vm.runInContext(engineSource, context, { filename: 'component-nma-inline.js' });
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

for (const [name, text] of [
  ['implied combination overflows', 'a+b | b | 1e308 | 1\nb | control | 1e308 | 1'],
  ['forest span overflows', 'a | control | 1e308 | 1\nb | control | -1e308 | 1'],
  ['forest padding overflows', 'a | control | 1.7e308 | 1\nb | control | 1.7e308 | 1'],
]) {
  test(`plant P19-R2 follow-up: ${name} clears display and every export`, async () => {
    const h = harness();
    assert.ok(h.result(), 'start with an ordinary published fit');
    finiteTree(h.context.fit(h.context.parse(text)));
    assert.doesNotThrow(() => h.load(text), 'run handles derived arithmetic failures');
    await cleared(h);
    assert.match(h.warnings.at(-1)?.message || '', numericalReason);
    assert.equal(h.warnings.at(-1).kind, 'warn');
    h.load(ordinary);
    assert.ok(h.result(), 'ordinary input recovers after refusal');
    finiteTree(h.result());
    assert.ok(h.elements.get('forest').innerHTML.includes('<rect'));
    assert.doesNotMatch(h.elements.get('forest').innerHTML, /NaN|Infinity/);
  });
}

test('plant P19-R2 follow-up: derived covariance sum cannot publish infinite uncertainty', async () => {
  const h = harness();
  // Isolate the derived-results boundary with finite fit fields. This is a
  // synthetic plant, not a claim that the estimator produces this covariance.
  h.context.fit = () => ({ comps: ['a', 'b'], beta: [0, 0],
    cov: [[1e308, 0], [0, 1e308]], Q: 0, df: 0, tau2: null });
  assert.doesNotThrow(() => h.load('a+b | b | 0 | 1\nb | control | 0 | 1'));
  await cleared(h);
  assert.match(h.warnings.at(-1)?.message || '', numericalReason);
});

test('plant P19-R2 follow-up: tiny saturated fit retains finite sampling-variance results', async () => {
  const ref = JSON.parse(readFileSync(new URL('p19-r2-reference.json', import.meta.url), 'utf8')).cases.tiny_saturated;
  const h = harness();
  const f = h.context.fit(h.context.parse(ref.text));
  finiteTree(f);
  assert.equal(f.Q, ref.Q, 'engine Q for a saturated full-rank design');
  h.load(ref.text);
  const got = h.result();
  assert.ok(got);
  assert.equal(got.df, 0);
  assert.equal(got.tau2, null);
  assert.equal(got.Q, ref.Q);
  assert.equal(h.warnings.length, 0);
  // Relative comparison is essential here: an absolute 1e-9 tolerance would
  // accept zero instead of the tiny, positive R effect/SE/covariance values.
  const near = (a, b, label) => assert.ok(Number.isFinite(a) && b !== 0 &&
    Math.abs(a / b - 1) <= 1e-12, `${label}: ${a} versus ${b}`);
  for (const kind of ['components', 'combinations']) {
    for (const [name, value] of Object.entries(ref[kind])) {
      near(got[kind][name].est, value.est, `${kind}.${name}.est`);
      near(got[kind][name].se, value.se, `${kind}.${name}.se`);
    }
  }
  for (let i = 0; i < f.comps.length; i++) near(f.cov[i][i], ref.components[f.comps[i]].se ** 2, 'variance');
  const exported = JSON.parse(await h.export('json'));
  finiteTree(exported);
  assert.equal(exported.Q, ref.Q, 'exported saturated Q');
  assert.ok(h.elements.get('forest').innerHTML.includes('<rect'));
  assert.doesNotMatch(h.elements.get('forest').innerHTML, /NaN|Infinity/);
});

test('control: positive residual df retains tiny nonzero Q without a magnitude cutoff', () => {
  const h = harness();
  h.load('a | control | 0 | 1\na | control | 1e-16 | 1');
  const got = h.result();
  assert.ok(got);
  finiteTree(got);
  assert.equal(got.df, 1);
  assert.equal(got.tau2, 0);
  // Analytic two-observation, equal-weight residual sum of squares, not an R fixture.
  const expected = (1e-16) ** 2 / 2;
  assert.ok(got.Q > 0 && got.Q < 1e-30);
  assert.ok(Math.abs(got.Q / expected - 1) <= 1e-12);
  assert.equal(h.warnings.length, 0);
});

test('control: saturated fits retain variance, weighted-effect and residual arithmetic guards', async () => {
  const h = harness();
  for (const text of [
    'a | control | 0.2 | 1e-160\nb | control | 0.3 | 1e-160',
    'a | control | 1e250 | 1e-50\nb | control | 2e250 | 1e-50',
    // Finite coefficients but residual subtraction roundoff overflows weighted Q.
    'a | control | 1.3e107 | 1e-100\nb | control | 2e-100 | 1e-100',
  ]) {
    h.load(ordinary);
    assert.ok(h.result());
    assert.throws(() => h.context.fit(h.context.parse(text)), numericalReason);
    h.load(text);
    await cleared(h);
    assert.match(h.warnings.at(-1)?.message || '', numericalReason);
  }
});

test('control: fresh R replay preserves the four existing residual-WLS references', () => {
  const fresh = JSON.parse(readFileSync(new URL('p19-r2-reference.json', import.meta.url), 'utf8'));
  const prior = JSON.parse(readFileSync(new URL('p19-f2-reference.json', import.meta.url), 'utf8'));
  assert.ok(fresh.provenance.R);
  assert.ok(fresh.provenance.stats);
  assert.ok(fresh.provenance.base);
  for (const [name, ref] of Object.entries(prior.cases)) assert.deepEqual(fresh.cases[name], ref, name);
});

test('control: large finite derived effects and forest coordinates remain supported', async () => {
  const h = harness();
  h.load('a | control | 7e307 | 1\nb | control | -7e307 | 1');
  assert.ok(h.result());
  finiteTree(h.result());
  assert.equal(h.result().components.a.est, 7e307);
  assert.equal(h.result().components.b.est, -7e307);
  assert.equal(h.warnings.length, 0);
  const forest = h.elements.get('forest').innerHTML;
  assert.ok(forest.includes('<rect'));
  assert.doesNotMatch(forest, /NaN|Infinity/);
  for (const [, coordinate] of forest.matchAll(/\b(?:x|x1|x2)="([^"]+)"/g)) {
    const x = Number(coordinate);
    assert.ok(Number.isFinite(x) && x >= 0 && x <= 600, `in-view coordinate: ${coordinate}`);
  }
  finiteTree(JSON.parse(await h.export('json')));
});

test('control: disabling numerical guards reproduces the original six unsafe engine paths', () => {
  // A documented mutation experiment, not an authenticated historical parent.
  const noFiniteGuard = engine.replace(/function checkedNumber\(value, positive = false\) \{[\s\S]*?return value;\s*\}/,
    'function checkedNumber(value, positive = false) { return value; }');
  assert.notEqual(noFiniteGuard, engine, 'the real guard must be found');
  // Overflow can subsequently create a zero weighted pivot. Disable that
  // numerical guard too, so this deliberately unchecked mutant reaches its
  // result. The structural design-rank refusal remains active.
  const unchecked = noFiniteGuard.replace(/if \(Math\.abs\(piv\) < 1e-14\) throw new Error\([^\n]+\);/,
    '/* weighted-pivot numerical guard disabled for mutation experiment */');
  assert.notEqual(unchecked, noFiniteGuard, 'the weighted-pivot guard must be found');
  const h = harness(unchecked);
  finiteTree(h.context.fit(h.context.parse(ordinary)));
  assert.throws(() => h.context.fit(h.context.parse('a+b | control | 1 | 1\na+b | control | 2 | 1')),
    /not identifiable/, 'structural rank control is still enforced');
  for (const [name, se, a, b] of stress) {
    const text = `a | control | ${a} | ${se}\na | control | ${b} | ${se}`;
    assert.doesNotThrow(() => h.context.fit(h.context.parse(text)), name);
    const result = h.context.fit(h.context.parse(text));
    if (name === 'finite weights overflow the DL denominator') {
      assert.ok(result.Q > result.df);
      assert.equal(result.tau2, 0, 'overflow silently discards heterogeneity');
    } else {
      assert.throws(() => finiteTree(result), { code: 'ERR_ASSERTION' }, `${name}: mutant emits nonfinite results`);
    }
  }
});
