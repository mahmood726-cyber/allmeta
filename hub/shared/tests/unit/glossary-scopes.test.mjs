import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../tooltips.js', import.meta.url), 'utf8');

// Instrument the DOM traversal boundary without requiring a browser process.
// The browser companion tests exercise actual text replacement, layout and axe.
async function scan(code = source, hostLocation = null) {
  const nodes = [], walked = [];
  class Element {
    constructor(name) {
      this.name = name; this.attrs = {}; this.dataset = {}; this.style = {};
      this.children = []; this.isConnected = true; this.textContent = '';
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...els) { this.children.push(...els); nodes.push(...els); }
    addEventListener() {}
    after(el) { this.sibling = el; nodes.push(el); }
    closest(s) {
      if (s === 'main') return this.inMain ? {} : null;
      return s === '[data-gloss-scope]' && this.scoped ? help : null;
    }
    descendants() { return this.children.flatMap(el => [el, ...el.descendants()]); }
    querySelector(s) { return this.descendants().find(el => el.name === s); }
    querySelectorAll(s) {
      if (s === '[data-gloss-scope]') return this === body ? [help] : [];
      if (s === 'code') return this === body ? [outsideCode, insideCode] : this === help ? [insideCode] : [];
      if (s === '[data-gloss]') return this.descendants().filter(el => el.getAttribute('data-gloss'));
      return [];
    }
  }
  const body = new Element('body'), help = new Element('help');
  const host = new Element('host'); host.id = 'alm-features'; host.inMain = hostLocation === 'main';
  if (hostLocation) nodes.push(host);
  const outsideCode = new Element('outside code'), insideCode = new Element('help code');
  outsideCode.textContent = insideCode.textContent = 'REML'; insideCode.scoped = true;
  const outsideSelect = new Element('outside select'), insideSelect = new Element('help select');
  outsideSelect.selectedOptions = insideSelect.selectedOptions = [{ textContent: 'REML' }];
  const legacy = new Element('legacy'); legacy.textContent = 'τ²_within';
  legacy.setAttribute('data-gloss', 'tau2'); legacy.setAttribute('aria-describedby', 'existing');
  const document = {
    body, head: new Element('head'), documentElement: new Element('html'),
    createElement: name => new Element(name), getElementById: id => nodes.find(el => el.id === id),
    querySelector: s => s === '.alm-lang-switch' ? {} : null,
    querySelectorAll: s => s === '[data-gloss]' ? [legacy]
      : s === 'select:not(.alm-lang-switch select)' ? [outsideSelect, insideSelect]
      : s === '[data-gloss-scope] select:not(.alm-lang-switch select)' ? [insideSelect] : [],
    createTreeWalker(root) { walked.push(root.name); return { nextNode: () => null }; },
    addEventListener() {},
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(code, { window, document, NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class { disconnect() {} observe() {} },
    localStorage: { getItem() {}, setItem() {} }, queueMicrotask, setTimeout, clearTimeout });
  await window.alm.tooltips({ glossary: { REML: { short: 'REML definition' },
    tau2: { short: 'Authored definition' }, WithinVariance: { short: 'Alias definition' } },
  terms: { REML: 'REML', 'τ²_within': 'WithinVariance' } });
  return { walked, outsideCode, insideCode, outsideSelect, insideSelect, legacy, nodes, host, rescan: window.alm.tooltips.rescan };
}

test('automatic text/code scanning visits only opted-in scopes (control)', async () => {
  const result = await scan();
  assert.deepEqual(result.walked, ['help']);
  assert.equal(result.outsideCode.getAttribute('data-gloss'), null);
  assert.equal(result.insideCode.getAttribute('data-gloss'), 'REML');
});

test('selected-option help stays inside opt-in scopes (control)', async () => {
  const result = await scan();
  assert.equal(result.outsideSelect.sibling, undefined);
  assert.equal(result.insideSelect.sibling.textContent, 'Method help: REML');
});

test('authored keys outside help keep their definition, keyboard focus and existing descriptions', async () => {
  const { legacy, nodes } = await scan();
  assert.equal(legacy.getAttribute('data-gloss'), 'tau2');
  assert.equal(legacy.tabIndex, 0);
  assert.match(legacy.getAttribute('aria-describedby'), /^existing alm-tip-/);
  assert.equal(nodes.find(el => el.id === legacy.dataset.almTip).textContent, 'Authored definition');
});

test('app glossary mounts beside the feature panel once, without using main as a fallback', async () => {
  const r = await scan(source, 'outside');
  assert.equal(r.host.sibling.id, 'alm-glossary-help');
  assert.equal(r.host.sibling.name, 'details');
  assert.equal(r.host.sibling.getAttribute('data-gloss-scope'), '');
  const marks = r.host.sibling.querySelectorAll('[data-gloss]');
  assert.deepEqual(marks.map(el => el.getAttribute('data-gloss')), ['REML', 'WithinVariance']);
  r.rescan(); r.rescan();
  assert.equal(r.nodes.filter(el => el.id === 'alm-glossary-help').length, 1);
  assert.equal(r.host.sibling.querySelectorAll('[data-gloss]').length, marks.length);
  assert.equal((await scan(source, 'main')).host.sibling, undefined);
  assert.equal((await scan()).host.sibling, undefined);
});

test('PLANTED main-host defect is rejected, outside-main control still mounts', async () => {
  const from = "if (!host || host.closest('main')) return;";
  assert.equal(source.split(from).length, 2);
  const gate = async code => assert.equal((await scan(code, 'main')).host.sibling, undefined);
  await gate(source);
  await assert.rejects(() => gate(source.replace(from, 'if (!host) return;')));
  assert.equal((await scan(source, 'outside')).host.sibling.id, 'alm-glossary-help');
});

for (const [name, from, to, check] of [
  ['text boundary', "root.querySelectorAll('[data-gloss-scope]').forEach(markScope);", 'markScope(root);',
    r => assert.deepEqual(r.walked, ['help'])],
  ['select boundary', '[data-gloss-scope] select:not(.alm-lang-switch select)', 'select:not(.alm-lang-switch select)',
    r => assert.equal(r.outsideSelect.sibling, undefined)],
  ['authored key', "key && el.closest('[data-gloss-scope]') && glossary[key]", 'key && glossary[key]',
    r => assert.equal(r.legacy.getAttribute('data-gloss'), 'tau2')],
]) test(`PLANTED ${name} defect is rejected, intact implementation passes`, async () => {
  assert.equal(source.split(from).length, 2);
  check(await scan());
  const planted = await scan(source.replace(from, to));
  assert.throws(() => check(planted));
});
