import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const input = JSON.parse(read('./p07-extras-input.json'));
const engineSource = read('../../../../multilevel-ma/plus-engine.js');
const uiSource = read('../../../../multilevel-ma/plus-ui.js');
const context = vm.createContext({});
vm.runInContext(engineSource, context);
const engine = context.AlmMultilevelPlusEngine;
const tied = effect => input.rows.map(row => ({ ...row, y: effect }));
const reason = 'CR2 unavailable: zero residual variance';
const plain = value => JSON.parse(JSON.stringify(value));
const nativeReference = () => JSON.parse(read('./p07-extras-reference.json'));
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) &&
  Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) <= 1e-6, `${label}: ${actual} vs ${expected}`);

// A small DOM surface for the actual UI functions; no browser or dependencies.
function harness(rows) {
  const ids = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; this.listeners = {}; this.text = ''; }
    set id(value) { ids.set(value, this); }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(' '); }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(event, fn) { this.listeners[event] = fn; }
  }
  const document = { getElementById: id => ids.get(id), createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
  document.createElement('section').id = 'alm-plus';
  const src = document.createElement('textarea'); src.id = 'src';
  const setRows = values => { src.value = values.map(r => [r.cluster, r.y, Math.sqrt(r.v)].join(',')).join('\n'); };
  setRows(rows);
  const c = vm.createContext({ document, setInterval() {}, setTimeout(fn) { fn(); } });
  c.window = c;
  vm.runInContext(engineSource, c);
  vm.runInContext(uiSource, c);
  const walk = element => [element, ...element.children.flatMap(walk)];
  return { api: c.AlmMultilevelPlus, ids, src, setRows,
    output: () => walk(ids.get('alm-plus-output')),
    status: () => ids.get('alm-plus-status').textContent };
}

test('P07-R2 control: native R fixture pins input, script, versions and endpoint likelihood', () => {
  const ref = nativeReference();
  for (const [name, file] of [['input', 'p07-extras-input.json'], ['script', 'p07-extras-reference.R']]) {
    assert.equal(ref.provenance[`${name}_md5`], createHash('md5').update(readFileSync(new URL(file, import.meta.url))).digest('hex'));
  }
  assert.ok(ref.provenance.R);
  for (const pkg of ref.provenance.packages) assert.ok(pkg.version, pkg.package);
  assert.ok(ref.provenance.packages.some(pkg => pkg.package === 'metafor'));
  assert.deepEqual(ref.input.rows, input.rows);
  assert.deepEqual(ref.input.ties, input.ties);
  assert.deepEqual(ref.fits.map(f => f.effect), input.ties);
  for (const f of ref.fits) for (const p of f.profiles) {
    assert.equal(p.ub_sign, '');
    assert.equal(p.lower, 0);
    assert.ok(p.upper > 0 && Number.isFinite(p.upper));
    assert.ok(Math.abs(p.endpoint_gap) < 1e-7);
    assert.equal(p.x.length, 9);
    assert.equal(p.ll.length, 9);
  }
});

for (const effect of input.ties) {
  test(`P07-R2 control: ties_${effect} direct CR2 still refuses zero residual variance`, () => {
    assert.throws(() => engine.cr2(tied(effect), 0, 0), { message: reason });
  });

  test(`P07-R2 plant: ties_${effect} retains native R variance profiles when CR2 is unavailable`, () => {
    const result = engine.fit(tied(effect));
    assert.equal(result.status, 'ok');
    assert.deepEqual(plain(result.robust), { status: 'unavailable', reason });
    assert.equal(result.rows, 6); assert.equal(result.clusters, 3);
    const ref = nativeReference().fits.find(f => f.effect === effect);
    near(result.logLik, ref.logLik, 'logLik');
    assert.equal(result.profiles.length, 2);
    result.profiles.forEach((p, j) => {
      for (const key of ['estimate', 'lower', 'upper']) near(p[key], ref.profiles[j][key], `${j}.${key}`);
      for (const key of ['x', 'll']) {
        assert.equal(p[key].length, 9);
        p[key].forEach((v, i) => near(v, ref.profiles[j][key][i], `${j}.${key}.${i}`));
      }
    });
  });

  test(`P07-R2 plant: ties_${effect} UI renders and exports profiles with a specific CR2 reason`, () => {
    const h = harness(tied(effect));
    const result = h.api.calculate();
    const notice = h.output().find(el => Object.hasOwn(el.dataset, 'robustUnavailable'));
    assert.ok(notice, 'Specific robust-inference notice is rendered');
    assert.equal(notice.textContent, reason);
    assert.ok(h.status().includes(reason));
    assert.equal(h.ids.get('alm-plus-export').disabled, false);
    assert.equal(h.output().filter(el => el.tagName === 'svg').length, 2);
    assert.equal(h.output().filter(el => Object.hasOwn(el.dataset, 'refusal')).length, 0);
    const cells = h.output().filter(el => el.dataset.quantity);
    for (const j of [0, 1]) for (const key of ['estimate', 'lower', 'upper']) {
      assert.equal(cells.find(el => el.dataset.quantity === `profile.${j}.${key}`).textContent, String(result.profiles[j][key]));
    }
    const quantities = h.api.quantities(result);
    assert.ok(Object.keys(quantities).every(key => !key.startsWith('robust.')), 'No fabricated robust statistics');
    assert.ok(Object.values(quantities).every(Number.isFinite));
    const exported = JSON.parse(h.api.exportText());
    assert.deepEqual(exported.robust, { status: 'unavailable', reason });
    assert.deepEqual(exported.profiles, plain(result.profiles));
    assert.equal(exported.inference, reason);
    // A later valid analysis replaces the unavailable result and notice.
    h.setRows(input.rows);
    h.api.calculate();
    assert.equal(h.output().filter(el => Object.hasOwn(el.dataset, 'robustUnavailable')).length, 0);
    assert.equal(h.status(), 'Extras calculated.');
    assert.ok(JSON.parse(h.api.exportText()).robust.se > 0);
    // A later edit must invalidate the partial result, just like a complete result.
    h.setRows(tied(effect)); h.api.calculate();
    h.src.value += '\nA,1,0.25'; h.src.listeners.input();
    assert.equal(h.ids.get('alm-plus-export').disabled, true);
    assert.throws(() => h.api.exportText(), /out of date/);
    assert.equal(h.ids.get('alm-plus-output').children.length, 0);
  });
}

test('P07-R2 control: heterogeneous data retains complete CR2, display and export quantities', () => {
  const h = harness(input.rows), result = h.api.calculate();
  assert.equal(result.status, 'ok');
  const direct = engine.cr2(input.rows, ...result.profiles.map(p => p.estimate));
  assert.deepEqual(plain(result.robust), plain(direct));
  assert.deepEqual(Object.keys(result.robust), ['estimate', 'se', 'df', 't', 'p', 'lower', 'upper']);
  assert.ok(Object.values(result.robust).every(Number.isFinite));
  assert.ok(result.robust.se > 0);
  assert.equal(h.status(), 'Extras calculated.');
  assert.equal(h.ids.get('alm-plus-export').disabled, false);
  assert.equal(h.output().filter(el => Object.hasOwn(el.dataset, 'robustUnavailable')).length, 0);
  const quantities = h.api.quantities(result);
  for (const [key, value] of Object.entries(result.robust)) {
    assert.equal(quantities[`robust.${key}`], value);
    assert.equal(h.output().find(el => el.dataset.quantity === `robust.${key}`).textContent, String(value));
  }
  const exported = JSON.parse(h.api.exportText());
  assert.equal(exported.inference, 'CR2; Satterthwaite; 95% confidence');
  assert.deepEqual(exported.robust, plain(result.robust));
  assert.deepEqual(exported.profiles, plain(result.profiles));
});

test('P07-R2 control: invalid input and unidentifiable fits remain full refusals', () => {
  assert.throws(() => engine.fit(input.rows.slice(0, 2)), /three valid/);
  assert.throws(() => engine.fit(input.rows.map(r => ({ ...r, cluster: 'A' }))), /two clusters/);
  assert.throws(() => engine.fit(input.rows.map((r, i) => ({ ...r, cluster: i }))), /not identifiable/);
  assert.throws(() => engine.fit(input.rows.map(r => ({ ...r, v: 0 }))), /positive variances/);
  assert.throws(() => engine.fit(input.rows, { searchBound: 0 }), /searchBound/);
  const h = harness(input.rows); h.src.value = 'A,0x1F,0.25';
  assert.throws(() => h.api.calculate(), /Row 1/);
  assert.equal(h.ids.get('alm-plus-export').disabled, true);
  assert.equal(h.output().filter(el => Object.hasOwn(el.dataset, 'refusal')).length, 1);
  assert.match(h.status(), /^Extras refused:/);
});

test('P07-R2 control: bounded profile limit remains null without suppressing valid CR2', () => {
  const result = engine.fit(input.rows, { searchBound: 0.001 });
  assert.equal(result.profiles[0].upper, null);
  assert.ok(result.robust.se > 0);
  const h = harness(input.rows); h.api.render(result);
  assert.equal(h.output().find(el => el.dataset.quantity === 'profile.0.upper').textContent, h.api.notEstimable);
});
