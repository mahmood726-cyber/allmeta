import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('hub/shared/tooltips.js');
const glossary = JSON.parse(read('hub/shared/glossary.json'));

// Read the actual authored marks, including literal markup in result templates.
// This DOM double tests tooltip definitions/provenance, not browser layout.
function authoredMarks(html) {
  return [...html.matchAll(/<(?:span|abbr)\b[^>]*data-gloss="([^"]+)"[^>]*>([^<]*)<\/(?:span|abbr)>/g)]
    .map(([, key, text]) => ({ key, text: text.replaceAll('&tau;', '\u03c4').replaceAll('&sup2;', '\u00b2') }));
}

async function render(app, html = read(`${app}/index.html`), code = source) {
  const nodes = [];
  class Element {
    constructor() { this.attrs = {}; this.dataset = {}; this.style = {}; this.isConnected = true; }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    append(...elements) { nodes.push(...elements); }
    addEventListener() {}
    closest() { return null; }
    querySelectorAll() { return []; }
  }
  const marks = authoredMarks(html).map(({ key, text }) => {
    const el = new Element(); el.textContent = text; el.setAttribute('data-gloss', key); return el;
  });
  assert.ok(marks.length, `${app}: fixture must contain actual app marks`);
  const document = {
    body: new Element(), head: new Element(), documentElement: new Element(),
    createElement: () => new Element(), getElementById: id => nodes.find(el => el.id === id),
    querySelector: selector => selector === '.alm-lang-switch' ? {} : null,
    querySelectorAll: selector => selector === '[data-gloss]' ? marks : [],
    addEventListener() {},
  };
  const window = { addEventListener() {} };
  const context = { window, document, MutationObserver: class { disconnect() {} observe() {} },
    localStorage: { getItem() {} }, queueMicrotask, setTimeout, clearTimeout };
  vm.runInNewContext(code, context);
  let options;
  vm.runInNewContext(read(`${app}/alm-glossary.js`), {
    window: { alm: { tooltips: opts => { options = opts; } } }, document,
  });
  await window.alm.tooltips({ glossary, terms: options.terms });
  return marks.map(el => ({ label: el.textContent, key: el.getAttribute('data-gloss'),
    tip: nodes.find(node => node.id === el.dataset.almTip) }));
}

function definition(rows, label, key, count) {
  const matching = rows.filter(row => row.label === label);
  assert.equal(matching.length, count, `actual ${label} marks`);
  for (const row of matching) {
    assert.ok(row.tip, `${label}: tooltip was attached`);
    assert.equal(row.tip.textContent, glossary[key].short + (glossary[key].long ? ' — ' + glossary[key].long : ''));
    assert.equal(row.tip.dataset.rCheckExpression, glossary[key].r_check?.expression);
    assert.equal(row.tip.dataset.rCheckReference, glossary[key].r_check?.reference);
  }
}

test('multilevel within-study help uses its own definition in explanation and result template', async () => {
  definition(await render('multilevel-ma'), '\u03c4\u00b2_within', 'WithinVariance', 2);
});

test('multilevel between-study help retains its definition and R provenance (control)', async () => {
  definition(await render('multilevel-ma'), '\u03c4\u00b2_study', 'tau2', 1);
});

test('PLANTED legacy within-study keys are rejected; prior alias normalization explains the regression', async () => {
  const html = read('multilevel-ma/index.html').replaceAll('data-gloss="WithinVariance"', 'data-gloss="tau2"');
  const gate = rows => definition(rows, '\u03c4\u00b2_within', 'WithinVariance', 2);
  const planted = await render('multilevel-ma', html);
  assert.throws(() => gate(planted), { code: 'ERR_ASSERTION' });
  const priorGuard = "key && el.closest('[data-gloss-scope]') && glossary[key]";
  assert.equal(source.split(priorGuard).length, 2);
  gate(await render('multilevel-ma', html, source.replace(priorGuard, 'key && glossary[key]')));
});

test('meta-regression RSS help supplies the sum-of-squares definition and R expression', async () => {
  definition(await render('meta-regression'), 'RSS', 'RSS', 1);
});

test('meta-regression Q_E retains residual heterogeneity help (control)', async () => {
  definition(await render('meta-regression'), 'Q_E', 'QE', 2);
});

test('PLANTED RSS-as-QE key is rejected; prior alias normalization explains the regression', async () => {
  const html = read('meta-regression/index.html').replaceAll('data-gloss="RSS"', 'data-gloss="QE"');
  const planted = await render('meta-regression', html);
  assert.throws(() => definition(planted, 'RSS', 'RSS', 1), { code: 'ERR_ASSERTION' });
  const priorGuard = "key && el.closest('[data-gloss-scope]') && glossary[key]";
  assert.equal(source.split(priorGuard).length, 2);
  definition(await render('meta-regression', html, source.replace(priorGuard, 'key && glossary[key]')), 'RSS', 'RSS', 1);
});
