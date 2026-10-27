import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../tooltips.js', import.meta.url), 'utf8');

// Exercise the actual scanner, including its opt-in boundary and text filter.
// The HTML control must produce a replacement: an unvisited fixture cannot pass.
async function scan(tag, inSVG, code = source, scoped = true) {
  const nodes = [];
  class Element {
    constructor(name, parent = null) {
      this.name = name; this.parentElement = parent; this.children = [];
      this.attrs = {}; this.dataset = {}; this.style = {}; this.isConnected = true;
      this.textContent = 'REML';
      this.namespaceURI = inSVG && name !== 'code' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml';
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...els) { this.children.push(...els); nodes.push(...els); }
    addEventListener() {}
    closest(selector) {
      for (let el = this; el; el = el.parentElement) {
        if (selector.split(',').some(s => s === el.name || s === '[data-gloss-scope]' && el === scope && scoped || s === '[data-gloss]' && el.getAttribute('data-gloss'))) return el;
      }
      return null;
    }
    querySelectorAll(s) {
      if (s === '[data-gloss-scope]') return scoped ? [scope] : [];
      return s === 'code' && tag === 'code' ? [parent] : [];
    }
  }
  const body = new Element('body'), scope = new Element('section', body);
  const svg = new Element('svg', scope), parent = new Element(tag, inSVG ? svg : scope);
  let replacement = null, visited = false;
  const text = { nodeValue: 'REML', parentElement: parent, replaceWith(fragment) { replacement = fragment; } };
  const document = {
    body, head: new Element('head'), documentElement: new Element('html'),
    createElement: name => new Element(name), createElementNS: (_, name) => new Element(name),
    createDocumentFragment: () => new Element('fragment'), createTextNode: text => ({ textContent: text }),
    getElementById: id => nodes.find(el => el.id === id),
    querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {},
    createTreeWalker(root, what, filter) {
      assert.equal(root, scope); visited = true;
      let done = false;
      return { nextNode() { if (done) return null; done = true; return filter.acceptNode(text) === 1 ? text : null; } };
    }
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(code, { window, document,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    MutationObserver: class { disconnect() {} observe() {} },
    localStorage: { getItem() {} }, queueMicrotask, setTimeout, clearTimeout });
  await window.alm.tooltips({ glossary: { REML: { short: 'Restricted maximum likelihood' } }, terms: { REML: 'REML' } });
  return { replacement, parent, visited };
}

for (const tag of ['text', 'tspan', 'title', 'desc', 'metadata', 'code']) {
  test(`automatic glossary marking preserves SVG ${tag} inside an opted-in scope`, async () => {
    const result = await scan(tag, true);
    assert.equal(result.visited, true);
    assert.equal(result.replacement, null);
    assert.equal(result.parent.getAttribute('data-gloss'), null);
  });
}

test('HTML prose and standalone code retain help inside opted-in scopes', async () => {
  const prose = await scan('p', false);
  assert.equal(prose.visited, true);
  assert.equal(prose.replacement.children[1].getAttribute('data-gloss'), 'REML');
  assert.equal((await scan('code', false)).parent.getAttribute('data-gloss'), 'REML');
});

test('HTML outside opted-in scopes remains untouched (control)', async () => {
  for (const tag of ['p', 'code']) {
    const result = await scan(tag, false, source, false);
    assert.equal(result.visited, false);
    assert.equal(result.replacement, null);
    assert.equal(result.parent.getAttribute('data-gloss'), null);
  }
});

test('control and planted SVG annotation defect exercise both scanner paths', async () => {
  const marker = "const SKIP = 'svg,";
  assert.equal(source.split(marker).length, 2);
  for (const tag of ['text', 'code']) {
    const gate = async code => {
      const result = await scan(tag, true, code);
      assert.equal(result.visited, true);
      assert.equal(result.replacement, null);
      assert.equal(result.parent.getAttribute('data-gloss'), null);
    };
    await gate(source);
    await assert.rejects(() => gate(source.replace(marker, "const SKIP = '")), { name: 'AssertionError' });
  }
});
