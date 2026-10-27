import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../../shared/alm-share.js', import.meta.url), 'utf8');

// Exercise the real renderer, including links in the initially hidden version warning.
function render(code = source) {
  const nodes = [];
  const document = { createElement(tag) {
    const node = { tag, attrs: {}, children: [], textContent: '',
      setAttribute(key, value) { this.attrs[key] = value; },
      appendChild(child) { this.children.push(child); },
      addEventListener() {} };
    nodes.push(node);
    return node;
  } };
  const sandbox = { document, console };
  vm.runInNewContext(code, sandbox);
  sandbox.AlmShare.module.render(document.createElement('section'), {
    app: 'rve-meta', block: { get: () => ({}), set() {} }, host: { open() {} }
  });
  return nodes;
}

function checkLinks(nodes) {
  const links = nodes.filter(node => node.tag === 'a' && node.attrs.target === '_blank');
  assert.ok(links.length > 0, 'the check must cover a new-tab link');
  for (const link of links) {
    assert.match(link.attrs['aria-label'] || link.textContent, /new tab/i);
  }
}

test('Share archive link announces its new tab even before a version mismatch', () => {
  checkLinks(render());
});

test('Share archive link keeps its visible action and safe new-tab attributes', () => {
  const link = render().find(node => node.tag === 'a');
  assert.equal(link.textContent, 'Open the archived version');
  assert.equal(link.attrs.target, '_blank');
  assert.equal(link.attrs.rel, 'noopener noreferrer');
});

test('PLANTED: removing the new-tab announcement fails the same accessibility gate', () => {
  const nodes = render();
  checkLinks(nodes);
  const archive = nodes.find(node => node.tag === 'a');
  delete archive.attrs['aria-label'];
  assert.throws(() => checkLinks(nodes), assert.AssertionError);
});
