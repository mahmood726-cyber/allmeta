import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

// Model light-DOM traversal separately from shadow roots, as document selectors do.
function setup() {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.style = {};
      this.dataset = {}; this.value = ''; this.id = ''; this.textContent = '';
    }
    append(...nodes) { this.children.push(...nodes); }
    attachShadow({ mode }) { assert.equal(mode, 'open'); return this.shadowRoot = new Element('shadow-root'); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener() {}
    dispatchEvent() {}
  }
  const descendants = el => el.children.flatMap(child => [child, ...descendants(child)]);
  const body = new Element('body');
  const fields = ['textarea', 'select', 'input', 'input'].map((tag, i) => {
    const el = new Element(tag); el.value = 'original-' + i; return el;
  });
  fields[0].id = 'f-data'; fields[2].type = fields[3].type = 'text';
  body.append(...fields);
  const document = {
    body, readyState: 'complete', createElement: tag => new Element(tag),
    getElementById: id => descendants(body).find(el => el.id === id),
    querySelectorAll: tag => descendants(body).filter(el => el.tagName === tag.toUpperCase())
  };
  const ctx = { document }; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('shared/autosave.js'), ctx);
  vm.runInContext(read('shared/alm-examples.js'), ctx);
  // Autosave resolves its selector groups in this order, regardless of DOM position.
  const controls = () => ['textarea', 'select', 'input'].flatMap(tag => document.querySelectorAll(tag));
  const snapshot = () => {
    // Fresh page: do not let indices from a prior snapshot conceal a new field.
    for (const el of controls()) delete el.dataset.autosaveIndex;
    return JSON.parse(JSON.stringify(ctx.AlmAutosave._snapshot(controls())));
  };
  return { ctx, document, body, fields, controls, snapshot, descendants };
}

test('mounting real examples preserves original autosave fields and positional keys', () => {
  const h = setup(), before = h.snapshot(), fields = h.controls();
  h.ctx.AlmExamples.register('dta-sroc');
  assert.deepEqual(h.controls(), fields, 'the example picker must not join legacy form queries');
  assert.deepEqual(h.snapshot(), before);
  for (const el of fields) el.value = 'changed';
  assert.equal(h.ctx.AlmAutosave._restore(fields, before), fields.length);
  assert.deepEqual(h.snapshot(), before, 'saved original fields still restore to the same controls');
});

test('planted light-DOM picker adds a saved key and shifts anonymous input keys', () => {
  const h = setup(), before = h.snapshot();
  const picker = h.document.createElement('select');
  picker.id = 'alm-real-example-choice'; picker.value = 'AuditC'; h.body.append(picker);
  const planted = h.snapshot();
  assert.equal(planted['alm-real-example-choice'], 'AuditC');
  assert.equal(before['idx:2'], 'original-2');
  assert.equal(planted['idx:3'], before['idx:2']);
  assert.notDeepEqual(planted, before);
});

test('isolated picker remains a labelled native select with the published choice', () => {
  const h = setup(); h.ctx.AlmExamples.register('dta-sroc');
  const host = h.descendants(h.body).find(el => el.shadowRoot);
  assert.ok(host, 'picker has its own DOM root');
  const label = host.shadowRoot.children.find(el => el.tagName === 'LABEL');
  assert.match(label.textContent, /Published dataset/);
  const select = label.children.find(el => el.tagName === 'SELECT');
  assert.equal(select.id, 'alm-real-example-choice');
  assert.equal(select.children[0].value, 'AuditC');
  assert.equal(h.document.getElementById(select.id), undefined);
});

test('example section outside main is a named landmark; a missing name is rejected', () => {
  const h = setup(); h.ctx.AlmExamples.register('mh-peto');
  const panel = h.document.getElementById('alm-real-example-panel');
  const assertNamedSection = () => {
    assert.equal(panel.tagName, 'SECTION');
    assert.ok(panel['aria-labelledby'], 'section needs a name to become a region landmark');
    const heading = h.document.getElementById(panel['aria-labelledby']);
    assert.equal(heading?.tagName, 'H2');
    assert.equal(heading?.textContent, 'Real example');
  };
  assertNamedSection();
  const name = panel['aria-labelledby']; delete panel['aria-labelledby'];
  assert.throws(assertNamedSection, /section needs a name/);
  panel['aria-labelledby'] = name; assertNamedSection();
});
