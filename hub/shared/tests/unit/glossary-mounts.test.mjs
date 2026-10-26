import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('hub/shared/tooltips.js');
const glossary = JSON.parse(read('hub/shared/glossary.json'));
const apps = 'proportion-ma dta-sroc nma heterogeneity pubbias-tests multilevel-ma meta-regression mh-peto influence limit-ma gosh cumulative-subgroup rve-meta nma-inconsistency correlation-ma multivariate-ma component-nma dose-response-ma'.split(' ');

// Exercise mounting with the hosts actually shipped by each page. The older
// scope fixture supplied a feature host even for apps which do not have one.
async function mount(app, transform = html => html, code = source) {
  const html = transform(read(`${app}/index.html`));
  const nodes = [];
  class Element {
    constructor(name) {
      this.name = name; this.attrs = {}; this.children = [];
      this.dataset = {}; this.style = {}; this.textContent = ''; this.isConnected = true;
    }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    append(...children) { this.children.push(...children); nodes.push(...children); }
    after(node) { this.sibling = node; nodes.push(node); }
    addEventListener() {}
    closest(selector) { return selector === 'main' && this.inMain ? {} : null; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    querySelector(selector) { return this.descendants().find(node => node.name === selector); }
    querySelectorAll(selector) {
      return selector === '[data-gloss]' ? this.descendants().filter(node => node.getAttribute('data-gloss')) : [];
    }
  }
  for (const match of html.matchAll(/<div\b[^>]*\bid="(alm-features|alm-glossary-mount)"[^>]*>/g)) {
    const node = new Element('div'); node.id = match[1];
    node.inMain = html.lastIndexOf('<main', match.index) > html.lastIndexOf('</main>', match.index);
    nodes.push(node);
  }
  const document = {
    body: new Element('body'), head: new Element('head'), documentElement: new Element('html'),
    createElement: name => new Element(name), getElementById: id => nodes.find(node => node.id === id),
    querySelector: selector => selector === '.alm-lang-switch' ? {} : null,
    querySelectorAll: selector => selector === '[data-gloss]' ? nodes.filter(node => node.getAttribute('data-gloss')) : [],
    addEventListener() {},
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(code, { window, document, queueMicrotask, setTimeout, clearTimeout,
    MutationObserver: class { disconnect() {} observe() {} }, localStorage: { getItem() {} } });
  let options;
  vm.runInNewContext(read(`${app}/alm-glossary.js`), { document, window: { alm: { tooltips: value => { options = value; } } } });
  await window.alm.tooltips({ glossary, terms: options.terms });
  window.alm.tooltips.rescan();
  return { nodes, help: nodes.find(node => node.id === 'alm-glossary-help'), options };
}

for (const app of apps) test(`${app}: actual page hosts one populated glossary outside main`, async () => {
  const { nodes, help, options } = await mount(app);
  assert.ok(help, `${app}: no glossary host in the shipped page`);
  assert.equal(nodes.filter(node => node.id === 'alm-glossary-help').length, 1);
  const host = nodes.find(node => node.sibling === help);
  assert.equal(host.inMain, false);
  assert.equal(help.getAttribute('data-gloss-scope'), '');
  assert.equal(help.querySelectorAll('[data-gloss]').length, new Set(Object.values(options.terms)).size);
  for (const term of help.querySelectorAll('[data-gloss]')) {
    assert.equal(term.tabIndex, 0);
    assert.ok(nodes.find(node => node.id === term.dataset.almTip)?.textContent);
  }
});

test('PLANTED missing explicit glossary mount is detected; feature-host app remains a control', async () => {
  const gate = result => assert.ok(result.help);
  gate(await mount('heterogeneity'));
  const missing = await mount('heterogeneity', html => html.replace(/<div id="alm-glossary-mount"><\/div>/, ''));
  assert.throws(() => gate(missing));
  gate(await mount('dta-sroc'));
});

test('PLANTED glossary mount inside main is refused; outside-main control mounts', async () => {
  assert.ok((await mount('heterogeneity')).help);
  const misplaced = await mount('heterogeneity', html => html
    .replace('<div id="alm-glossary-mount"></div>', '')
    .replace('</main>', '<div id="alm-glossary-mount"></div></main>'));
  assert.equal(misplaced.help, undefined);
});

test('PLANTED feature-only lookup loses standalone help, while a feature-host control still works', async () => {
  const from = "document.getElementById('alm-features') || document.getElementById('alm-glossary-mount')";
  assert.equal(source.split(from).length, 2);
  const planted = source.replace(from, "document.getElementById('alm-features')");
  assert.ok((await mount('heterogeneity')).help);
  assert.equal((await mount('heterogeneity', undefined, planted)).help, undefined);
  assert.ok((await mount('dta-sroc', undefined, planted)).help);
});
