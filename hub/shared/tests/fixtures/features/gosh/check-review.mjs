// Run directly with node: no child processes or browser required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { context, element, spec, root, html, original, plain } from './check-offline.mjs';

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
const clean = original.studies.map(r => `${r.te}, ${r.se}, ${r.label}`).join('\n');
function run(src = clean) {
  element('src').value = src; element('model').value = 'FE';
  element('n-sample').value = '5000'; element('btn-run').click();
}
function audit() {
  const r = spec.text.results(), ctx = { app: 'gosh', build: context.AlmBuildInfo, entryLog: [], verify: null };
  return context.AlmText.audit(context.AlmText.render(spec.text.templates, r, ctx), r, { ctx, dom: spec.text.dom() });
}

for (const locale of ['de-DE', 'fr-FR', 'ru-RU', 'ar-EG']) {
  await check('locale ' + locale, () => {
    context.Intl = { NumberFormat: function (requested, options) { return new Intl.NumberFormat(requested || locale, options); } };
    context.localeFormat = new Intl.NumberFormat(locale);
    vm.runInContext('Number.prototype.toLocaleString = function () { return localeFormat.format(Number(this)); };', context);
    run(Array.from({ length: 11 }, (_, i) => `${i / 10}, .1, Study ${i + 1}`).join('\n'));
    assert.equal(element('m-n').textContent, new Intl.NumberFormat(locale).format(2047));
    assert.equal(audit().ok, true, JSON.stringify(audit().failures));
    element('m-n').textContent = new Intl.NumberFormat(locale).format(2048);
    assert.equal(audit().ok, false);
    assert.ok(audit().failures.some(f => f.check === 'dom:n_subsets'));
  });
}
context.Intl = Intl; context.localeFormat = new Intl.NumberFormat('en-US');
const axisNodes = ['', '', false, '', '', false].map(v => ({ type: typeof v === 'boolean' ? 'checkbox' : 'number', value: v, checked: v, dispatchEvent() {} }));
context.document.querySelectorAll = () => axisNodes;
context.Event = class Event {};
for (const [name, input] of Object.entries({
  header: 'effect, SE, label\n' + clean,
  'extra columns': clean.split('\n').map(row => row + ', 2019').join('\n'),
  'blank line': clean.replace('\n', '\n\n'),
  comment: clean + '\n# End of extraction',
  'numeric prefix and empty label': clean.replace('0.22, 0.08, Study A', '0.22 units, 0.08 units, ')
})) {
  await check('share parser ' + name, () => {
    run(input);
    const expected = plain(context._almLastGosh()), state = plain(spec.share.get());
    assert.equal(expected.k, 9);
    run('.7, .1, A\n.8, .2, B\n.9, .3, C');
    spec.share.set(state);
    assert.deepEqual(plain(spec.share.get()), state);
    assert.deepEqual(plain(context._almLastGosh()), expected);
  });
}
await check('share rejects too few surviving rows atomically', () => {
  run();
  const before = plain(spec.share.get()), result = plain(context._almLastGosh());
  assert.throws(() => spec.share.set({ ...before, src: 'header, SE\n.1, .2, A\n.2, .3, B\ninvalid' }), /three through one hundred/);
  assert.deepEqual(plain(spec.share.get()), before);
  assert.deepEqual(plain(context._almLastGosh()), result);
});
await check('perturbation only affects DOM-audited keys', () => {
  run();
  try {
    context.__almTextPerturb = { key: 'k', delta: 3 };
    assert.equal(spec.text.results().k, 9);
    assert.equal(audit().ok, true);
    context.__almTextPerturb = { key: 'median_est', delta: .1 };
    assert.equal(audit().ok, false);
    assert.ok(audit().failures.some(f => f.check === 'dom:median_est'));
  } finally { delete context.__almTextPerturb; }
});
await check('sampled plot R objects documented', () => {
  const adapter = fs.readFileSync(new URL('gosh/validate/adapter.js', root), 'utf8');
  for (const name of ['mus', 'i2s']) {
    assert.match(spec.verify.rObjects, new RegExp(`\\b${name}\\b`));
    assert.ok(spec.verify.plots[0].r.includes(name));
    assert.ok(adapter.includes(`${name}[i]<-`));
  }
});
await check('share captures hash before engine; only one active script', () => {
  const active = html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, '');
  const tags = [...active.matchAll(/<script\b[^>]*src="\.\.\/shared\/alm-share\.js"[^>]*>/g)];
  assert.equal(tags.length, 1);
  assert.ok(tags[0].index < active.indexOf('</head>'), 'alm-share.js must capture the hash in head');
  assert.ok(tags[0].index < active.indexOf('// ---- engine ----'));
});

// Minimal DOM for the real shared provenance UI, using the actual gosh block.
class Element {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.handlers = {}; this.value = ''; this._text = ''; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  replaceChildren(...cs) { this.children = []; this._text = ''; cs.forEach(c => this.appendChild(c)); }
  setAttribute() {}
  addEventListener(type, fn) { this.handlers[type] = fn; }
  async fire(type) { await this.handlers[type]?.({ target: this }); }
  remove() { this.parent.children = this.parent.children.filter(c => c !== this); }
}
const descendants = el => [el, ...el.children.flatMap(descendants)];
await check('share restores after real startup without navigation timing', async () => {
  const active = html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, '');
  const input = '.7, .1, A\n.8, .2, B\n.9, .3, C';
  const hash = '#s=' + gzipSync(JSON.stringify({ app: 'gosh', v: 1, state: { src: input } })).toString('base64url');
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', style: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, click() { this.listeners.click?.(); } });
    return nodes.get(id);
  };
  get('src').value = clean; get('model').value = 'FE'; get('n-sample').value = '5000';
  const doc = { getElementById: get, querySelectorAll: () => [], createElement(tag) { return new Element(tag, this); } };
  const realm = { console, document: doc, location: { hash, href: 'http://localhost/gosh/index.html' + hash },
    performance: { getEntriesByType: () => [] }, history: { replaceState() {} },
    Blob, Response, DecompressionStream, TextDecoder, Uint8Array, atob,
    alm: { ...context.alm, urlState: Object.assign(() => {}, { read: () => ({}), write() { realm.location.hash = '#engine-state'; }, withoutWrites: fn => fn() }) } };
  realm.window = realm; realm.globalThis = realm; vm.createContext(realm);
  for (const tag of active.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (tag[1].includes('src="../shared/alm-share.js"')) vm.runInContext(fs.readFileSync(new URL('shared/alm-share.js', root), 'utf8'), realm);
    else if (tag[2].includes('// ---- engine ----')) vm.runInContext(tag[2], realm);
  }
  assert.equal(realm.location.hash, '#engine-state');
  assert.equal(realm._almLastGosh().k, 9);
  const panel = new Element('div', doc);
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('share restoration never started')), 1000);
      realm.AlmShare.module.render(panel, { app: 'gosh', block: { set(state) { get('src').value = state.src; get('btn-run').click(); } }, host: { open() {
        try {
          assert.match(panel.textContent, /Analysis restored from the share link/);
          assert.equal(realm._almLastGosh().k, 3);
          assert.equal(get('src').value, input);
          resolve();
        } catch (e) { reject(e); }
      } } });
    });
  } finally { clearTimeout(timer); }
});
vm.runInContext(fs.readFileSync(new URL('shared/alm-entry-ui.js', root), 'utf8'), context);
async function provenanceWorkflow(block) {
  const doc = { createElement(tag) { return new Element(tag, this); } }, host = new Element('div', doc);
  const ui = context.AlmEntryUI.mount(host, block);
  const button = label => descendants(host).find(e => e.tagName === 'button' && e.textContent === label);
  async function fill(card, label, value) {
    const wrap = descendants(card).find(e => e.tagName === 'label' && e.textContent.startsWith(label));
    const input = wrap.children.find(e => ['input', 'select'].includes(e.tagName));
    input.value = value; await input.fire(input.tagName === 'select' ? 'change' : 'input');
  }
  for (let i = 0; i < 3; i++) {
    const paste = descendants(host).find(e => e.tagName === 'textarea');
    paste.value = 'MD 0.2 (95% CI 0.1-0.3)'; await paste.fire('input');
    await button('Extract candidates').fire('click');
    await fill(host, 'Choose the source result', '0');
    await button('Add chosen result').fire('click');
    const card = descendants(host).filter(e => e.tagName === 'fieldset').at(-1);
    for (const [label, value] of [['Study label', `Smith ${2020 + i}`], ['Full reference', 'Synthetic report'], ['Location', 'Table 1'], ['Outcome measured', 'Synthetic outcome'], ['Timepoint', '12 weeks']]) await fill(card, label, value);
    assert.equal(button('Use these rows').disabled, true);
    const confirm = descendants(card).find(e => e.tagName === 'input' && e.type === 'checkbox');
    assert.equal(confirm.disabled, false, 'complete source details must allow confirmation');
    confirm.checked = true; await confirm.fire('change');
  }
  assert.equal(button('Use these rows').disabled, false);
  await button('Use these rows').fire('click');
  assert.equal(context._almLastGosh().k, 3);
  assert.ok(ui.getResult().provenance.every(r => r.confirmed && r.usedAs === block.usedAs));
  return { host, ui, button, fill };
}
await check('ENTRY real gosh provenance workflow', async () => {
  const h = await provenanceWorkflow(spec.entry);
  const card = descendants(h.host).find(e => e.tagName === 'fieldset');
  await h.fill(card, 'Outcome measured', 'Edited outcome');
  assert.equal(h.button('Use these rows').disabled, true);
});
await check('ENTRY planted missing usedAs is detected by the same workflow', async () => {
  const before = plain(context._almLastGosh());
  await assert.rejects(() => provenanceWorkflow({ ...spec.entry, usedAs: undefined }), /complete source details must allow confirmation/);
  assert.deepEqual(plain(context._almLastGosh()), before);
});

console.log(`REVIEW ${passed}/${passed + failed} passed`);
process.exitCode = failed ? 1 : 0;
