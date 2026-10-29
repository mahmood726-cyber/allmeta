import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const busSource = readFileSync(new URL('shared/ma-studies-v1.js', root), 'utf8');
const html = readFileSync(new URL('mh-peto/index.html', root), 'utf8');
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes)).map(([, , code]) => code);
const main = inlineScripts.find(code => code.includes('window.__mhPetoBusStudies ='));
const wiring = inlineScripts.find(code => code.includes('MaStudies.attachVerifyInRButton('));
assert.ok(main && wiring, 'load the actual mh-peto analysis and bus-button scripts');

const validInput = 'A, 3, 100, 8, 100\nB, 4, 120, 9, 120\nC, 5, 140, 10, 140';
const staleStudies = [{ label: 'Earlier analysis', est: 0.4, se: 0.2 }];
const currentStudies = [{ label: 'Current analysis', est: -0.3, se: 0.1 }];
const plain = value => JSON.parse(JSON.stringify(value));

function element() {
  const listeners = new Map(), attributes = new Map();
  return {
    value: '', innerHTML: '', textContent: '', hidden: false, checked: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    click() {
      assert.ok(listeners.get('click')?.length, 'button has a real click handler');
      for (const fn of listeners.get('click')) fn();
    },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; },
  };
}

function harness({ page = false } = {}) {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, element()]));
  const storage = new Map(), opened = [], alerts = [];
  let failWrites = false;
  const document = {
    readyState: 'complete',
    getElementById: id => nodes.get(id) ?? null,
    querySelector: selector => nodes.get(selector.slice(1)) ?? null,
    querySelectorAll: () => [],
  };
  const noop = () => {};
  // Only unrelated UI integrations are stubbed. Parser, analysis, current-study
  // provider, bus storage and both page button handlers execute their source.
  const context = vm.createContext({
    document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) {
        if (failWrites) throw new Error('storage write refused');
        storage.set(key, value);
      },
      removeItem: key => storage.delete(key),
    },
    alert: message => alerts.push(message),
    open: (...args) => { opened.push(args); return {}; },
    alm: {
      analysisLifecycle: fn => fn,
      csvUpload: noop, plotExport: noop, axisControls: noop, resultsExport: noop, tooltips: noop,
      urlState: Object.assign(() => {}, { read: () => ({}), write: noop }),
      resetUndo: Object.assign(() => {}, { snapshot: noop }),
    },
  });
  context.window = context;
  vm.runInContext(busSource, context, { filename: 'shared/ma-studies-v1.js' });
  if (page) {
    nodes.get('measure').value = 'OR';
    vm.runInContext(main, context, { filename: 'mh-peto/index.html:analysis' });
    vm.runInContext(wiring, context, { filename: 'mh-peto/index.html:bus-buttons' });
  }
  return {
    context, nodes, opened, alerts, bus: context.MaStudies,
    rawBus: () => storage.get(context.MaStudies.KEY),
    failWrites: () => { failWrites = true; },
  };
}

test('plant P10-R2: mh-peto refuses WebR after a broken current count despite saved A/B/C', () => {
  const h = harness({ page: true });
  h.nodes.get('src').value = validInput;
  h.nodes.get('btn-run').click();
  assert.equal(h.context._almLastMhPeto().k, 3);
  h.nodes.get('btn-bus-save').click();
  assert.deepEqual(plain(h.bus.read()).map(s => s.label), ['A', 'B', 'C']);
  const saved = h.rawBus();

  h.nodes.get('src').value = validInput.replace('B, 4,', 'B, broken,');
  h.nodes.get('btn-run').click();
  assert.equal(h.context._almLastMhPeto(), null);
  assert.equal(h.nodes.get('input-errors').hidden, false);
  assert.deepEqual(plain(h.context.__mhPetoBusStudies()), []);
  h.nodes.get('btn-verify-in-r').click();
  assert.equal(h.opened.length, 0, 'refused current input must not open old bus studies');
  assert.equal(h.rawBus(), saved, 'refusal preserves previously saved studies');
  assert.equal(h.alerts.length, 1, 'explain the refusal');
});

test('control: mh-peto valid current input opens WebR from an empty bus', () => {
  const h = harness({ page: true });
  h.nodes.get('src').value = validInput;
  h.nodes.get('btn-run').click();
  assert.equal(h.context._almLastMhPeto().k, 3);
  assert.equal(h.bus.read().length, 0);
  const current = plain(h.context.__mhPetoBusStudies());
  assert.equal(current.length, 3);
  h.nodes.get('btn-verify-in-r').click();
  assert.deepEqual(plain(h.bus.read()).map(({ label, est, se }) => ({ label, est, se })), current);
  assert.deepEqual(h.opened, [['../webr-validator/?fromBus=1', '_blank', 'noopener,noreferrer']]);
  assert.equal(h.alerts.length, 0);
});

for (const [name, getStudies] of [
  ['empty', () => []],
  ['null', () => null],
  ['undefined', () => undefined],
  ['non-array', () => ({})],
  ['throwing', () => { throw new Error('current input refused'); }],
]) {
  test(`plant P10-R2: ${name} current provider cannot fall back to stored studies`, () => {
    const h = harness(), btn = element();
    assert.equal(h.bus.write(staleStudies), true);
    const saved = h.rawBus();
    assert.equal(h.bus.attachVerifyInRButton({ btn, getStudies }), true);
    assert.doesNotThrow(() => btn.click());
    assert.equal(h.opened.length, 0);
    assert.equal(h.rawBus(), saved);
    assert.equal(h.alerts.length, 1);
  });
}

for (const [name, arg] of [
  ['array', []],
  ['options empty', { studies: [] }],
  ['options null', { studies: null }],
  ['options undefined', { studies: undefined }],
]) {
  test(`plant P10-R2: explicit ${name} request refuses a populated bus`, () => {
    const h = harness();
    h.bus.write(staleStudies);
    const saved = h.rawBus();
    assert.equal(h.bus.openInWebR(arg), false);
    assert.equal(h.opened.length, 0);
    assert.equal(h.rawBus(), saved);
    assert.equal(h.alerts.length, 1);
  });
}

test('plant P10-R2: failed current-study write cannot open stale bus studies', () => {
  const h = harness(), btn = element();
  h.bus.write(staleStudies);
  const saved = h.rawBus();
  h.failWrites();
  h.bus.attachVerifyInRButton({ btn, getStudies: () => currentStudies });
  btn.click();
  assert.equal(h.opened.length, 0);
  assert.equal(h.rawBus(), saved);
  assert.equal(h.alerts.length, 1);
});

test('control: valid current provider replaces stale studies and honors custom WebR path', () => {
  const h = harness(), btn = element();
  h.bus.write(staleStudies);
  h.bus.attachVerifyInRButton({ btn, getStudies: () => currentStudies, webrPath: '/webr-validator/?fromBus=1' });
  btn.click();
  assert.deepEqual(plain(h.bus.read()).map(({ label, est, se }) => ({ label, est, se })), currentStudies);
  assert.deepEqual(h.opened, [['/webr-validator/?fromBus=1', '_blank', 'noopener,noreferrer']]);
  assert.equal(h.alerts.length, 0);
});

test('control: omitted provider still opens stored studies without rewriting them', () => {
  const h = harness(), btn = element();
  h.bus.write(staleStudies);
  const saved = h.rawBus();
  h.bus.attachVerifyInRButton({ btn, webrPath: '/webr-validator/?fromBus=1' });
  btn.click();
  assert.deepEqual(h.opened, [['/webr-validator/?fromBus=1', '_blank', 'noopener,noreferrer']]);
  assert.equal(h.rawBus(), saved);
  assert.equal(h.alerts.length, 0);
});

test('control: omitted direct studies use the bus, including options-only custom path', () => {
  const h = harness();
  h.bus.write(staleStudies);
  const saved = h.rawBus();
  assert.equal(h.bus.openInWebR(), true);
  assert.equal(h.bus.openInWebR({ webrPath: '/webr-validator/?fromBus=1' }), true);
  assert.deepEqual(h.opened.map(args => args[0]), ['../webr-validator/?fromBus=1', '/webr-validator/?fromBus=1']);
  assert.equal(h.rawBus(), saved);
  assert.equal(h.alerts.length, 0);
});

test('control: omitted studies still refuse an empty bus', () => {
  const h = harness(), btn = element();
  assert.equal(h.bus.openInWebR(), false);
  h.bus.attachVerifyInRButton({ btn });
  btn.click();
  assert.equal(h.opened.length, 0);
  assert.equal(h.alerts.length, 2);
});
