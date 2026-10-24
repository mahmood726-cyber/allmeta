import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const apps = ['bayesian-ma', 'benford-screen', 'effect-size-converter', 'evalue', 'forest-plot',
  'funnel-plot', 'gsdesign', 'living-rob-pool', 'multiplicative-nma', 'multivariate-ma', 'nmi',
  'p-curve', 'prisma-flow', 'quantile-ma', 'registry-survival', 'review-project', 'rob',
  'rob-traffic-light', 'surrogate-validation', 'transportability', 'tsa', 'workbench'];
const hook = /<script\b(?=[^>]*\bsrc="\.\.\/hub\/shared\/chart-export-auto\.js")(?=[^>]*\bdata-presets-only\b)[^>]*><\/script>/g;

test('SVG apps with bespoke export buttons load the shared preset-only hook once', () => {
  for (const app of apps) {
    const html = readFileSync(new URL(`../../../../${app}/index.html`, import.meta.url), 'utf8');
    assert.equal([...html.matchAll(hook)].length, 1, app);
    const missing = html.replace(hook, ''); // planted omitted integration
    assert.equal([...missing.matchAll(hook)].length, 0, app);
  }
});

test('preset-only scanning keeps source hosts clean and drops detached chart controls', () => {
  class Element {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.parentNode = null; this.id = ''; }
    get isConnected() { return this === body || !!this.parentNode?.isConnected; }
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
    insertBefore(el, next) {
      el.remove();
      const at = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(at, 0, el); el.parentNode = this;
    }
    remove() {
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    hasAttribute() { return false; }
    getAttribute() { return null; }
    closest() { return null; }
    getBoundingClientRect() { return { width: 300, height: 150 }; }
  }
  const body = new Element('body'), host = new Element('div'), first = new Element('svg');
  body.insertBefore(host, null); host.insertBefore(first, null);
  const charts = [first], mounts = [];
  const document = {
    body, readyState: 'loading', addEventListener() {},
    head: { appendChild() {} },
    currentScript: { src: 'https://example.org/hub/shared/chart-export-auto.js', hasAttribute: key => key === 'data-presets-only' },
    createElement: tag => new Element(tag), getElementById: () => ({}),
    querySelectorAll: () => charts.filter(el => el.isConnected)
  };
  const window = { AlmFigPresets: { mount: opts => mounts.push(opts) } };
  vm.runInNewContext(readFileSync(new URL('../../chart-export-auto.js', import.meta.url), 'utf8'),
    { window, document, location: { pathname: '/fixture/index.html' }, URL });
  const scan = window.alm.chartExportAuto.scan;
  scan(); scan();
  assert.equal(mounts.length, 1);
  assert.deepEqual(host.children, [first]);
  assert.equal(mounts[0].plots[0].getSvg(), first);
  const oldBar = mounts[0].target;
  assert.equal(oldBar.parentNode, body);
  // Plant UI inside the source host, which would pollute a legacy innerHTML export.
  host.insertBefore(oldBar, first);
  assert.notDeepEqual(host.children, [first]);
  body.insertBefore(oldBar, null);
  first.remove();
  const second = new Element('svg'); charts.push(second); host.insertBefore(second, null);
  scan();
  assert.equal(mounts[0].plots[0].getSvg(), null);
  assert.equal(oldBar.isConnected, false);
  assert.equal(mounts.length, 2);
  assert.equal(mounts[1].plots[0].getSvg(), second);
  assert.deepEqual(host.children, [second]);
  assert.equal(body.children.length, 2);
  second.remove(); scan();
  assert.deepEqual(body.children, [host]);
});
