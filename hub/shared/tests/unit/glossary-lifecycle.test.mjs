import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../tooltips.js', import.meta.url), 'utf8');

async function fixture(code = source) {
  const nodes = [];
  class Element {
    constructor(name) {
      this.name = name; this.attrs = {}; this.dataset = {}; this.style = {};
      this.children = []; this.isConnected = true; this.textContent = '';
      nodes.push(this);
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...els) { this.children.push(...els); }
    after(el) { this.sibling = el; }
    addEventListener() {}
    closest() { return null; }
    remove() { this.isConnected = false; }
    descendants() { return this.children.flatMap(el => [el, ...el.descendants()]); }
    querySelector(s) { return this.descendants().find(el => el.name === s); }
    querySelectorAll(s) { return s === '[data-gloss]' ? this.descendants().filter(el => el.getAttribute('data-gloss')) : []; }
  }
  const body = new Element('body'), host = new Element('div'); host.id = 'alm-features';
  const mark = new Element('abbr'); mark.textContent = 'REML'; mark.setAttribute('data-gloss', 'REML');
  mark.setAttribute('aria-describedby', 'explanation');
  const document = {
    body, head: new Element('head'), documentElement: new Element('html'),
    createElement: name => new Element(name),
    getElementById: id => nodes.find(el => el.isConnected && el.id === id),
    querySelector: s => s === '.alm-lang-switch' ? nodes.find(el => el.className === 'alm-lang-switch') : s === '[data-gloss]' ? mark : null,
    querySelectorAll: s => s === '[data-gloss]' ? nodes.filter(el => el.isConnected && el.getAttribute('data-gloss')) : [],
    addEventListener() {},
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(code, { window, document, MutationObserver: class { disconnect() {} observe() {} },
    localStorage: { getItem() {} }, queueMicrotask, setTimeout, clearTimeout });
  await window.alm.tooltips({ glossary: { REML: { short: 'Restricted maximum likelihood' } }, terms: { REML: 'REML' } });
  function clone(el) {
    const copy = new Element(el.name); copy.textContent = el.textContent;
    copy.attrs = { ...el.attrs }; copy.dataset = { ...el.dataset }; copy.tabIndex = el.tabIndex;
    return copy;
  }
  return { mark, clone, document, host, rescan: window.alm.tooltips.rescan };
}

test('restored result markup retains tooltip IDs and existing descriptions', async () => {
  const r = await fixture(), before = { ...r.mark.attrs }, id = r.mark.dataset.almTip;
  const restored = r.clone(r.mark); r.mark.remove(); r.rescan();
  assert.deepEqual(restored.attrs, before);
  assert.equal(restored.dataset.almTip, id);
  assert.equal(r.document.getElementById(id).textContent, 'Restricted maximum likelihood');
  r.rescan(); assert.deepEqual(restored.attrs, before);
});

test('fresh marks receive independent tooltips and keep authored descriptions (control)', async () => {
  const r = await fixture();
  assert.match(r.mark.dataset.almTip, /^alm-tip-\d+$/);
  assert.equal(r.mark.getAttribute('aria-describedby'), 'explanation ' + r.mark.dataset.almTip);
  assert.equal(r.mark.tabIndex, 0);
  assert.equal(r.document.getElementById(r.mark.dataset.almTip).getAttribute('role'), 'tooltip');
});

test('PLANTED restored-ID regression is rejected; intact restoration passes', async () => {
  const marker = '? restoredId : null;';
  assert.equal(source.split(marker).length, 2);
  const gate = async code => {
    const r = await fixture(code), before = { ...r.mark.attrs };
    const restored = r.clone(r.mark); r.mark.remove(); r.rescan();
    assert.deepEqual(restored.attrs, before);
  };
  await gate(source);
  await assert.rejects(() => gate(source.replace(marker, '? null : null;')), { name: 'AssertionError' });
});

test('a live copied mark receives its own tooltip without duplicate IDs (control)', async () => {
  const r = await fixture(), copy = r.clone(r.mark), originalId = r.mark.dataset.almTip;
  r.rescan();
  assert.notEqual(copy.dataset.almTip, originalId);
  assert.equal(copy.getAttribute('aria-describedby'), 'explanation ' + copy.dataset.almTip);
  assert.ok(r.document.getElementById(originalId));
  assert.ok(r.document.getElementById(copy.dataset.almTip));
});

test('glossary help and language controls each have a named landmark', async () => {
  const r = await fixture();
  for (const el of [r.host.sibling.querySelector('div'), r.document.querySelector('.alm-lang-switch')]) {
    assert.equal(el.getAttribute('role'), 'region');
    assert.ok(el.getAttribute('aria-label'));
  }
  assert.equal(r.host.sibling.getAttribute('role'), null, 'details retains its native disclosure semantics');
  assert.equal(r.document.querySelector('.alm-lang-switch').querySelector('select').getAttribute('aria-label'), 'Method-help language');
});

test('floating language control retains the existing mobile screenshot appearance', async () => {
  const r = await fixture();
  const css = r.document.getElementById('alm-tooltip-style').textContent;
  const rule = selector => css.slice(css.indexOf(selector + '{') + selector.length + 1).split('}')[0];
  // The DTA mobile references include this fixed control at the plot's edge.
  // Keep its original geometry/paint, independently of the new tooltip styles.
  assert.match(rule('.alm-lang-switch'), /padding:1px 3px(?:;|$)/);
  assert.match(rule('.alm-lang-switch'), /border:1px solid #cbd5e1(?:;|$)/);
  assert.match(rule('.alm-lang-switch'), /opacity:\.7(?:;|$)/);
  assert.match(rule('.alm-lang-switch select'), /font:12px system-ui,sans-serif(?:;|$)/);
  assert.match(rule('.alm-lang-switch select'), /background:transparent(?:;|$)/);
  assert.match(css, /\.alm-lang-switch:hover,\.alm-lang-switch:focus-within\{opacity:1\}/);
  assert.equal(r.document.querySelector('.alm-lang-switch').querySelector('select').children.length, 4);
});

for (const name of ['content', 'wrap']) test(`PLANTED ${name} landmark regression is rejected`, async () => {
  const marker = `${name}.setAttribute('role', 'region')`;
  assert.equal(source.split(marker).length, 2);
  const gate = async code => {
    const r = await fixture(code);
    const el = name === 'content' ? r.host.sibling.querySelector('div') : r.document.querySelector('.alm-lang-switch');
    assert.equal(el.getAttribute('role'), 'region');
  };
  await gate(source);
  await assert.rejects(() => gate(source.replace(marker, `${name}.setAttribute('role', 'group')`)), { name: 'AssertionError' });
});

for (const app of ['mh-peto', 'multilevel-ma', 'pubbias-tests']) {
  test(`${app}: glossary language cannot enter the original autosave selectors`, () => {
    const html = readFileSync(new URL(`../../../../${app}/index.html`, import.meta.url), 'utf8');
    const call = html.match(/AlmAutosave\.install\(\{ appKey:[\s\S]*?\}\);/)[0];
    const capture = code => {
      let options;
      vm.runInNewContext(code, { AlmAutosave: { install(opts) { options = opts; } } });
      return options;
    };
    const options = capture(call);
    assert.equal(options.selectors.length, 7);
    const gate = opts => { for (const selector of opts.selectors) assert.ok(selector.includes(':not(.alm-lang-switch *)'), selector); };
    gate(options);
    assert.throws(() => gate(capture(call.replace(':not(.alm-lang-switch *)', ''))));
    // Existing form-control families and their order remain the original contract.
    assert.deepEqual(Array.from(options.selectors, s => s.split(':not(')[0]),
      ['textarea', 'select', 'input[type=text]', 'input[type=number]', 'input[type=checkbox]', 'input[type=radio]', 'input[type=range]']);
  });
}
