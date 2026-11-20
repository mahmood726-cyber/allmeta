'use strict';
// Bus Save and the TruthCert receipt carry the studies the displayed result was computed on
// (lane hf1, reviews of PR #579). Real inline page, bus, receipt UI and HMAC code; only the DOM
// and unrelated UI modules are stubbed, and the analysis lifecycle is an identity wrapper
// (it only toggles notices, it does not disable these buttons). Not a browser test.
// Run from the repository root: node --test gosh/tests/handoff-analysed.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const job = path.resolve(__dirname, '..', '..');
const tree = '.';
const page = process.env.GOSH_PAGE || path.join(job, 'gosh/index.html');
const good = '0, 1, Alpha trial\n2, 1, Beta trial\n4, 1, Gamma trial';
const edited = '10, 1, New A\n12, 1, New B\n14, 1, New C';
const overflow = '0, 1e-200, New A\n2, 1, New B\n4, 1, New C';
const pick = rows => Array.from(rows, r => ({label:r.label, est:r.est, se:r.se}));
const expected = result => result ? Array.from(result.studies, r => ({label:r.label, est:r.te, se:r.se})) : [];

function load(file = page, root = tree) {
  const html = fs.readFileSync(file, 'utf8');
  const nodes = {}, storage = new Map(), toasts = [], receipts = [], pending = [];
  const node = () => ({value:'', style:{}, textContent:'', innerHTML:'', hidden:false,
    listeners:{}, addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); },
    click() { this.dispatchEvent({type:'click'}); }, setAttribute() {}, remove() {},
    appendChild() {}, before() {}, focus() {}});
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes[m[1]] = node();
    nodes[m[1]].value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  nodes.src.value = good; nodes.model.value = 'FE'; nodes['enum-mode'].value = 'sample';
  const noop = () => {};
  const document = {readyState:'complete', getElementById:id => nodes[id] || null,
    querySelector:selector => nodes[selector.slice(1)] || null,
    createElement:node, body:node(), addEventListener:noop, removeEventListener:noop};
  let denyWrite = false;
  const context = vm.createContext({document, console, crypto:webcrypto, TextEncoder, Blob,
    URL:{createObjectURL:() => 'blob:test-only', revokeObjectURL:noop}, setTimeout:noop,
    Event:class Event {constructor(type) {this.type = type;}},
    localStorage:{getItem:key => storage.get(key) ?? null, setItem(key,value) {
      if (denyWrite) throw new Error('storage unavailable'); storage.set(key,String(value));
    }, removeItem:key => storage.delete(key)}, Toast:{show:(...args) => toasts.push(args)},
    alm:{analysisLifecycle:run => run, csvUpload:noop, plotExport:noop, axisControls:noop,
      resultsExport:noop, resetUndo:noop, tooltips:noop,
      urlState:Object.assign(noop, {read:() => null, write:() => true, isSuspended:() => false})}});
  context.window = context;
  for (const file of ['shared/ma-studies-v1.js', 'shared/truthcert-ui.js']) {
    vm.runInContext(fs.readFileSync(path.join(job, root, file), 'utf8'), context, {filename:file});
  }
  const sign = context.MaStudies.toTruthCert;
  context.MaStudies.toTruthCert = (...args) => {
    const p = sign(...args).then(result => {receipts.push(result); return result;});
    pending.push(p); return p;
  };
  for (const m of html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)) {
    vm.runInContext(m[1], context, {filename:file});
  }
  context.TruthCertUI.setKey('test-only-not-a-real-signing-key');
  return {context, nodes, toasts,
    run(text = good) {nodes.src.value = text; nodes['btn-run'].click(); return context._almLastGosh();},
    denyStorage() {denyWrite = true;},
    async capture() {
      receipts.length = 0; pending.length = 0;
      nodes['btn-bus-save'].click(); nodes['btn-truthcert'].click();
      await Promise.all(pending);
      for (const signed of receipts) {
        assert.equal(signed.ok, true, signed.error);
        const verified = await context.MaStudies.verifyTruthCert(signed.receipt, {key:'test-only-not-a-real-signing-key'});
        assert.equal(verified.valid, true);
      }
      return {bus:pick(context.MaStudies.read()), signed:receipts.map(r => pick(r.receipt.studies))};
    }};
}

for (const [name, input] of [
  ['zero estimate and multiword labels', good],
  ['default labels with blank line and header', '\neffect, SE, label\n0, 1\n\n2, 1\n4, 1'],
  ['HTML-looking label remains data', '0, 1, <img src=x onerror=alert(1)>\n2, 1, B\n4, 1, C']
]) test(name + ': bus and verified receipt equal analysed studies', async () => {
  const h = load(), result = h.run(input), wanted = expected(result);
  assert.equal(result.k, 3);
  const got = await h.capture();
  assert.deepEqual(got.bus, wanted); assert.deepEqual(got.signed, [wanted]);
});

for (const [name, input] of [
  ['malformed suffix', good + '\n0.4O, 1, Bad'],
  ['invalid SE', good + '\n1, 0, Bad'],
  ['too few studies', '0, 1, A\n2, 1, B'],
  ['over cap', Array.from({length:101}, (_,i) => `${i}, 1, S${i}`).join('\n')],
  ['arithmetic refusal', overflow]
]) test(name + ': refused run neither saves nor signs', async () => {
  const h = load(); assert.equal(h.run(input), null);
  const got = await h.capture();
  assert.deepEqual(got, {bus:[], signed:[]});
});

test('invalid draw count: refused run neither saves nor signs', async () => {
  const h = load(); h.nodes['n-sample'].value = '0';
  assert.equal(h.run(Array.from({length:16},(_,i) => `${i}, 1, S${i}`).join('\n')), null);
  assert.deepEqual(await h.capture(), {bus:[], signed:[]});
});

test('invalid CSV import leaves old textarea but cannot save or sign it', async () => {
  const h = load(); h.run();
  h.context.__almGoshLoad([{yi:1, vi:0, study:'Rejected'}]);
  assert.equal(h.context._almLastGosh(), null);
  assert.equal(h.nodes.src.value, good);
  assert.deepEqual(await h.capture(), {bus:[], signed:[]});
});

test('refusal preserves existing bus and cannot sign that bus as a fallback', async () => {
  const h = load(), old = [{label:'Prior session', est:42, se:1}];
  h.context.MaStudies.write(old); h.run(good + '\n0.4O, 1');
  assert.deepEqual(await h.capture(), {bus:old, signed:[]});
});

for (const mode of ['missing', 'throws']) test('getter ' + mode + ': fail closed', async () => {
  const h = load();
  h.context.__almValidatorStudies = mode === 'missing' ? undefined : () => {throw new Error('probe');};
  assert.deepEqual(await h.capture(), {bus:[], signed:[]});
});

test('bus storage failure is reported', () => {
  const h = load(); h.denyStorage(); h.nodes['btn-bus-save'].click();
  assert.deepEqual(h.toasts.at(-1), ['Could not save to bus.', 'error']);
  assert.deepEqual(pick(h.context.MaStudies.read()), []);
});

test('Load from bus still updates textarea and reruns analysis', () => {
  const h = load(), rows = [{label:'Load A',est:10,se:1},{label:'Load B',est:12,se:1},{label:'Load C',est:14,se:1}];
  h.context.MaStudies.write(rows); h.nodes['btn-bus-load'].click();
  assert.deepEqual(expected(h.context._almLastGosh()), rows);
});

for (const [name,input] of [['valid changed studies',edited], ['unanalysable changed studies',overflow]]) {
  test('pending edit (' + name + '): export stays bound to analysed result', async t => {
    const h = load(), wanted = expected(h.run());
    h.nodes.src.value = input;
    h.nodes.src.dispatchEvent({type:'input'});
    const got = await h.capture();
    t.diagnostic(JSON.stringify({analysed:wanted, getter:pick(h.context.__almValidatorStudies()), ...got}));
    assert.deepEqual(got.bus, wanted);
    assert.deepEqual(got.signed, [wanted]);
  });
}
