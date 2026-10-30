import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../../shared/alm-sof.js', import.meta.url), 'utf8');
function mounted(code = source) {
  const listeners = {}, timers = [], elements = new Map();
  const element = () => ({
    value: '', disabled: false, hidden: false, dataset: {}, textContent: '', children: [],
    setAttribute() {}, appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    addEventListener(type, fn) { this.listeners ||= {}; this.listeners[type] = fn; },
  });
  const host = element();
  host.querySelector = selector => {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  };
  const exports = ['CSV', 'DOCX', 'copy'].map(kind => Object.assign(element(), { dataset: { export: kind } }));
  host.querySelectorAll = () => exports;
  host.contains = node => node === host || [...elements.values(), ...exports].includes(node);
  const document = {
    readyState: 'loading', currentScript: { getAttribute: () => 'mh-peto' },
    head: { appendChild() {} }, body: { appendChild() {} },
    getElementById: () => null, querySelector: selector => selector === '#src' ? { value: 'host rows' } : null,
    createElement: tag => tag === 'section' ? host : element(),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  };
  let observer, installed;
  let effect = { measure: 'OR', mh_est: 2, mh_lo: 1, mh_hi: 3, k: 2 };
  const context = {
    document, module: { exports: {} },
    localStorage: { getItem: () => null, setItem() {} },
    AlmZip: {}, AlmAutosave: { install(opts) { installed = opts; return 'installed'; } },
    _almLastMhPeto: () => effect,
    __mhValidation: { parse: () => [{ e2: 2, n2: 10, n1: 10 }, { e2: 4, n2: 20, n1: 20 }] },
    setTimeout: fn => { timers.push(fn); },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
  };
  vm.runInNewContext(code, context);
  const options = { appKey: 'mh-peto', selectors: ['textarea', 'select', 'input[type=text]:not(#loo-only-flagged)'], debounceMs: 321 };
  assert.equal(context.AlmAutosave.install(options), 'installed');
  for (const fn of listeners.DOMContentLoaded) fn();
  return {
    host, exports, context, installed, options, get: selector => host.querySelector(selector),
    flush() { while (timers.length) timers.shift()(); },
    changeResult(next) { effect = next; observer([{ target: document.body }]); this.flush(); },
    disabledChanged() { observer([{ target: host.querySelector('#sof-outcome'), attributeName: 'disabled' }]); this.flush(); },
  };
}

test('SoF scopes legacy autosave before installation without changing caller options', () => {
  const gate = code => {
    const m = mounted(code);
    assert.deepEqual(Array.from(m.installed.selectors), m.options.selectors.map(s => ':is(' + s + '):not(#alm-sof *)'));
    assert.equal(m.installed.debounceMs, 321);
    assert.equal(m.options.selectors[0], 'textarea');
    m.context.AlmAutosave.install({ appKey: 'unrelated' });
  };
  gate(source);
  const plant = source.replace('isolateAutosave(app);', '/* planted: no isolation */');
  assert.notEqual(plant, source);
  assert.throws(() => gate(plant));
});

test('rendering new findings never changes editable values behind live R validation', () => {
  const gate = code => {
    const m = mounted(code), risk = m.get('#sof-risk');
    assert.equal(risk.value, '', 'default risk must not become an editable input value');
    assert.equal(JSON.parse(m.host.dataset.sofAbsolute).comparator, 0.2);
    risk.value = '0.2';
    m.host.listeners.input({ target: risk });
    m.changeResult({ measure: 'RD', mh_est: 0, mh_lo: 0, mh_hi: 0, k: 2 });
    assert.equal(risk.value, '0.2');
    // A default is a suggestion, not an unsolicited assignment to a form input.
    m.get('#sof-default').listeners.click();
    assert.equal(risk.value, '');
    m.changeResult({ measure: 'OR', mh_est: 2, mh_lo: 1, mh_hi: 3, k: 3 });
    assert.equal(risk.value, '');
    assert.equal(JSON.parse(m.host.dataset.sofAbsolute).comparator, 0.2);
  };
  gate(source);
  const plant = source.replace("acr.placeholder =", "acr.value = '0.5'; acr.placeholder =");
  assert.notEqual(plant, source);
  assert.throws(() => gate(plant));
});

test('corpus locks survive scheduled renders; unlocking refreshes current findings', () => {
  const gate = code => {
    const m = mounted(code), outcome = m.get('#sof-outcome');
    assert.ok(m.exports.every(button => !button.disabled));
    outcome.disabled = true;
    m.exports.forEach(button => { button.disabled = true; });
    const before = m.host.dataset.sofAbsolute;
    m.changeResult({ measure: 'RR', mh_est: 0.5, mh_lo: 0.2, mh_hi: 1, k: 3 });
    assert.ok(m.exports.every(button => button.disabled));
    assert.equal(m.host.dataset.sofAbsolute, before);
    outcome.disabled = false;
    m.disabledChanged();
    assert.ok(m.exports.every(button => !button.disabled));
  };
  gate(source);
  const plant = source.replace('if (outcome.disabled) return;', '/* planted: overwrite replay lock */');
  assert.notEqual(plant, source);
  assert.throws(() => gate(plant));
});
