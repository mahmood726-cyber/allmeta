import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../tooltips.js', import.meta.url), 'utf8');
const svgNS = 'http://www.w3.org/2000/svg';

// Exercise the shipped scanner with a minimal DOM surface. Browser coverage in
// features-glossary-svg.spec.mjs checks real serialization, rescans and focus.
function scanText(code, ancestors, text = 'Moses SROC unavailable') {
  let parent = null;
  const elements = ancestors.map(tag => {
    const el = {
      tag, parentElement: parent, namespaceURI: ancestors.includes('svg') ? svgNS : null,
      textContent: text, attrs: {},
      closest(selectors) {
        for (let p = this; p; p = p.parentElement) {
          if (selectors.split(',').includes(p.tag)) return p;
        }
        return null;
      },
      setAttribute(key, value) { this.attrs[key] = value; }
    };
    parent = el;
    return el;
  });
  let replacement = null;
  const node = { parentElement: parent, nodeValue: text, replaceWith(fragment) { replacement = fragment; } };
  const document = {
    createTreeWalker(root, whatToShow, filter) {
      let visited = false;
      return { nextNode() {
        if (visited) return null;
        visited = true;
        return filter.acceptNode(node) === 1 ? node : null;
      } };
    },
    createDocumentFragment: () => ({ children: [], append(child) { this.children.push(child); } }),
    createTextNode: textContent => ({ textContent }),
    createElement: () => ({ attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } }),
    createElementNS: () => document.createElement()
  };
  const window = {};
  const hook = 'init.rescan = scan;';
  assert.equal(code.split(hook).length, 2);
  vm.runInNewContext(code.replace(hook, `${hook}
    init.scanFixture = root => {
      terms = { Moses: 'Moses', SROC: 'SROC' };
      glossary = { Moses: { short: 'Method' }, SROC: { short: 'Curve' } };
      mark(root);
    };`), { window, document, NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 } });
  window.alm.tooltips.scanFixture({ querySelectorAll: tag => elements.filter(el => el.tag === tag) });
  return { replacement, elements };
}

for (const tag of ['text', 'tspan', 'title', 'desc', 'metadata']) {
  test(`automatic glossary marking preserves SVG ${tag} text`, () => {
    assert.equal(scanText(source, ['svg', 'g', tag]).replacement, null);
  });
}

test('HTML prose and standalone code retain glossary help outside SVG', () => {
  const { replacement } = scanText(source, ['main', 'p']);
  assert.equal(replacement.children.map(node => node.textContent).join(''), 'Moses SROC unavailable');
  assert.deepEqual(replacement.children.filter(node => node.attrs).map(node => node.attrs['data-gloss']), ['Moses', 'SROC']);
  const { elements } = scanText(source, ['main', 'code'], 'SROC');
  assert.equal(elements.at(-1).attrs['data-gloss'], 'SROC');
});

test('code inside an SVG foreignObject is preserved', () => {
  const { replacement, elements } = scanText(source, ['svg', 'foreignObject', 'code'], 'SROC');
  assert.equal(replacement, null);
  assert.equal(elements.at(-1).attrs['data-gloss'], undefined);
});

test('control and planted SVG annotation defect', () => {
  const marker = 'samp,svg,';
  assert.equal(source.split(marker).length, 2);
  const gate = code => assert.equal(scanText(code, ['svg', 'text']).replacement, null);
  gate(source);
  assert.throws(() => gate(source.replace(marker, 'samp,')), { name: 'AssertionError' });
});
