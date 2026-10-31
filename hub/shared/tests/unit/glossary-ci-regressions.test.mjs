import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('hub/shared/tooltips.js');

// Run the actual attachment code against its small DOM surface. Replacing a
// result removes the old element and tooltip, as scan() does in the browser.
function attachments(code = source) {
  const live = new Map();
  const layer = { append(tip) { live.set(tip.id, tip); } };
  const document = {
    getElementById: id => id === 'alm-tooltip-style' ? {} : id === 'alm-tip-layer' ? layer : live.get(id),
    createElement: () => ({ dataset: {}, setAttribute() {}, addEventListener() {} })
  };
  const window = {};
  vm.runInNewContext(code.replace('init.rescan = scan;', 'init.rescan = scan; init.attachFixture = attach;'),
    { window, document });
  function term(parentId, index = 0, attributes = {}) {
    const attrs = { 'data-gloss': 'CI', ...attributes };
    const parent = { id: parentId, children: [], parentElement: null };
    const el = { id: '', localName: 'span', parentElement: parent, dataset: {}, textContent: 'CI',
      getAttribute: key => attrs[key] || null,
      setAttribute(key, value) { attrs[key] = value; }, addEventListener() {} };
    parent.children = [...Array(index).fill({}), el];
    window.alm.tooltips.attachFixture(el);
    return { el, attrs, tip: live.get(el.dataset.almTip) };
  }
  return { term, live };
}

test('re-rendering a result restores identical glossary IDs and descriptions', () => {
  const fixture = attachments();
  const first = fixture.term('results', 1, { 'aria-describedby': 'existing-help' });
  fixture.live.delete(first.tip.id);
  const restored = fixture.term('results', 1, { 'aria-describedby': 'existing-help' });
  assert.deepEqual(restored.attrs, first.attrs);
  assert.equal(restored.el.dataset.almTip, first.el.dataset.almTip);
});

test('simultaneous terms have distinct tooltip IDs and keep authored descriptions', () => {
  const { term } = attachments();
  const a = term('results', 0, { 'aria-describedby': 'existing-help' });
  const b = term('results', 1);
  const c = term('other-results', 0);
  assert.equal(new Set([a.tip.id, b.tip.id, c.tip.id]).size, 3);
  assert.match(a.attrs['aria-describedby'], /^existing-help alm-tip-/);
  assert.equal(a.el.tabIndex, 0);
});

function choices(excluded, disabled, code = source) {
  let inserted = 0;
  const select = { selectedOptions: [{ textContent: 'REML' }], isConnected: true,
    closest: () => excluded, matches: () => disabled, after() { inserted++; } };
  const document = { querySelectorAll: () => [select], createElement: () => ({ setAttribute() {} }) };
  const window = {};
  vm.runInNewContext(code.replace('init.rescan = scan;', `init.rescan = scan;
    init.choicesFixture = () => { terms = { REML: 'REML' }; glossary = { REML: { short: 'REML' } }; updateChoices(); };`),
    { window, document });
  window.alm.tooltips.choicesFixture();
  return inserted;
}

test('disabled and excluded select controls do not acquire focusable method help', () => {
  assert.equal(choices(null, true), 0);
  assert.equal(choices({}, false), 0);
  const html = read('dta-sroc/index.html');
  assert.match(html, /<div\b[^>]*id="alm-axis-mount"[^>]*data-gloss-skip/);
});

test('enabled select controls retain selected-method help', () => {
  assert.equal(choices(null, false), 1);
});

function dtaHTML(code = read('dta-sroc/plus-ui.js')) {
  const context = { document: { getElementById: () => ({ addEventListener() {} }) } };
  vm.runInNewContext(code, context);
  return context.AlmDTAPlusUI.html({ studies: 0, coefficients: [], prediction: {
    sens: 0.8, spec: 0.9, positive: 0.5, negative: 0.1, regions: { confidence: [], prediction: [] }
  } });
}

test('published DTA table and cards exclude automatic glossary decoration', () => {
  const html = dtaHTML();
  assert.match(html, /<table\b[^>]*data-gloss-skip/);
  assert.match(html, /<dl\b[^>]*data-gloss-skip/);
});

test('DTA result labels, values and surrounding explanation remain intact', () => {
  const html = dtaHTML();
  assert.ok(html.includes('<caption>Regression coefficients (logit scale)</caption>'));
  assert.ok(html.includes('<dt>Sensitivity</dt><dd data-value="prediction.sens">0.8</dd>'));
  assert.ok(html.includes('<p>Blue solid: confidence region. Brown dashed: prediction region.</p>'));
});

// Minimal tree for the adapter's real page-text traversal. Keep authored tags,
// labels, and text auditable; only generated glossary spans are transparent.
const txt = textContent => ({ nodeType: 3, textContent });
function element(localName, attrs, ...childNodes) {
  return { nodeType: 1, localName, childNodes, getAttribute: name => attrs[name] ?? null,
    matches: selector => selector.split(',').some(part => part === localName ||
      (part === '[data-alm-choice]' && Object.hasOwn(attrs, 'data-alm-choice')) ||
      (part === '[data-alm-glossary]' && Object.hasOwn(attrs, 'data-alm-glossary'))) };
}
function pageText(children, code = read('nma-inconsistency/validate/adapter.js')) {
  const start = code.indexOf('const normal =');
  const end = code.indexOf('// Canonical DOM');
  assert.ok(start >= 0 && end > start);
  const context = { document: { body: { children } } };
  vm.runInNewContext(code.slice(start, end) + '\nresult = pageText();', context);
  return JSON.parse(JSON.stringify(context.result));
}
const plain = () => element('main', {}, element('p', {}, txt('Use REML for this model.')));
const marked = (word = 'REML') => element('main', {}, element('p', {}, txt('Use '),
  element('span', { 'data-gloss': 'REML', 'data-alm-glossary': '' }, txt(word)), txt(' for this model.')),
  element('span', { 'data-alm-choice': '' }, txt('Method help: REML')));

test('NMA page-text validation is unchanged by generated glossary markup', () => {
  assert.deepEqual(pageText([marked()]), pageText([plain()]));
});

test('NMA page-text validation still detects altered words, tags and accessible labels', () => {
  const expected = pageText([plain()]);
  assert.notDeepEqual(pageText([marked('WRONG')]), expected);
  assert.notDeepEqual(pageText([element('main', {}, element('h2', {}, txt('Use REML for this model.')))]), expected);
  assert.notDeepEqual(pageText([element('main', {}, element('p', { 'aria-label': 'WRONG' }, txt('Use REML for this model.')))]), expected);
  assert.notDeepEqual(pageText([element('main', {}, element('p', {}, txt('Use '),
    element('span', {}, txt('REML')), txt(' for this model.')))]), expected);
});

function scanTerm(excluded = false, code = source) {
  let fragment = null;
  const parent = { namespaceURI: null, closest: selectors => excluded && selectors.includes('[data-gloss-skip]') ? {} : null };
  const node = { parentElement: parent, nodeValue: 'Use REML.', replaceWith(value) { fragment = value; } };
  const document = {
    createTreeWalker(root, type, filter) { let done = false; return { nextNode() {
      if (done) return null; done = true; return filter.acceptNode(node) === 1 ? node : null;
    } }; },
    createDocumentFragment: () => ({ children: [], append(value) { this.children.push(value); } }),
    createTextNode: textContent => ({ textContent }),
    createElement: () => ({ attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } })
  };
  const window = {};
  vm.runInNewContext(code.replace('init.rescan = scan;', `init.rescan = scan;
    init.markFixture = root => { terms = { REML: 'REML' }; glossary = { REML: { short: 'REML' } }; mark(root); };`),
    { window, document, NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 } });
  window.alm.tooltips.markFixture({ querySelectorAll: () => [] });
  return fragment;
}

test('scanner identifies generated spans, preserves words, and honors artifact exclusions', () => {
  const fragment = scanTerm();
  assert.equal(fragment.children.map(n => n.textContent).join(''), 'Use REML.');
  assert.deepEqual(fragment.children.find(n => n.attrs).attrs, { 'data-gloss': 'REML', 'data-alm-glossary': '' });
  assert.equal(scanTerm(true), null);
});

test('planted glossary ID churn and disabled-choice defects are detected', () => {
  const restoreGate = code => {
    const fixture = attachments(code);
    const first = fixture.term('results'); fixture.live.delete(first.tip.id);
    assert.deepEqual(fixture.term('results').attrs, first.attrs);
  };
  restoreGate(source);
  assert.throws(() => restoreGate(source.replace('let id = locationIds.get(location);', 'let id;')), { name: 'AssertionError' });
  const choiceGate = code => assert.equal(choices(null, true, code), 0);
  choiceGate(source);
  assert.throws(() => choiceGate(source.replace("select.matches(':disabled')", 'false')), { name: 'AssertionError' });
});

test('planted artifact decoration and page-text wrapper defects are detected', () => {
  const render = read('dta-sroc/plus-ui.js');
  const artifactGate = code => assert.match(dtaHTML(code), /<table\b[^>]*data-gloss-skip/);
  artifactGate(render);
  assert.throws(() => artifactGate(render.replaceAll(' data-gloss-skip', '')), { name: 'AssertionError' });
  const adapter = read('nma-inconsistency/validate/adapter.js');
  const textGate = code => assert.deepEqual(pageText([marked()], code), pageText([plain()], code));
  textGate(adapter);
  assert.throws(() => textGate(adapter.replace("child.matches('[data-alm-glossary]')", 'false')), { name: 'AssertionError' });
});
