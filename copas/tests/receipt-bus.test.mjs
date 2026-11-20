// Run from the repository root: node --test copas/tests/receipt-bus.test.mjs
// Real page, core, bus and signed receipt code; DOM/UI mounts are minimal stubs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const job = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(job, p), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const rows3 = s => plain(s).map(({label, est, se}) => ({label, est, se}));
const seed = [{label: 'Previously saved', est: 8, se: 0.8}];
function boot(tree, overrideHtml) {
  const html = overrideHtml ?? read(`${tree}/copas/index.html`);
  const elements = new Map();
  function element(id = '') {
    const handlers = new Map();
    return { id, value: '', tagName: 'DIV', style: {}, innerHTML: '', textContent: '',
      addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
      dispatchEvent(e) { for (const fn of handlers.get(e.type) || []) fn(e); },
      click() { this.dispatchEvent({type: 'click'}); },
      setAttribute() {}, appendChild() {}, remove() {}, before() {},
    };
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element(id));
  elements.get('src').value = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  for (const [id, value] of Object.entries({'opt-ngrid': '10', 'opt-tau': 'REML', 'opt-signrsb': '0.1', 'opt-level': '0.95'})) elements.get(id).value = value;
  const storage = new Map([['truthcert-hmac-key', 'independent-local-test-key']]);
  const timers = new Map(), toasts = [], downloads = [], signing = [];
  let timerId = 0, failStorage = false;
  const noop = () => {};
  const urlState = Object.assign(noop, {read: () => null, write: () => true, isSuspended: () => true});
  const ctx = vm.createContext({
    console, performance, TextEncoder, Uint8Array, Blob, crypto: webcrypto,
    Event: class { constructor(type) { this.type = type; } },
    document: {readyState: 'complete', body: element(), getElementById: id => elements.get(id) ?? null,
      querySelector: selector => elements.get(selector?.replace(/^#/, '')) ?? null,
      createElement: () => element(), addEventListener: noop},
    URL: {createObjectURL: b => { downloads.push(b); return 'blob:local-test'; }, revokeObjectURL: noop},
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: {getItem: k => storage.get(k) ?? null,
      setItem(k, v) { if (failStorage) throw new Error('QuotaExceededError'); storage.set(k, v); },
      removeItem: k => storage.delete(k)},
    Toast: {show: (message, kind) => toasts.push({message, kind})},
    alm: {csvUpload: noop, chartDownload: noop, axisControls: noop, resultsExport: noop,
      urlState, resetUndo: noop, tooltips: noop},
  });
  ctx.window = ctx;
  for (const file of ['ma-core.js', 'copas-core.js', 'ma-studies-v1.js', 'truthcert-ui.js'])
    vm.runInContext(read(`${tree}/shared/${file}`), ctx, {filename: `${tree}/shared/${file}`});
  const sign = ctx.MaStudies.toTruthCert;
  ctx.MaStudies.toTruthCert = (...args) => { const p = sign(...args); signing.push(p); return p; };
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const fitScript = scripts.find(s => s.includes('function fitCopas('));
  const receiptScript = scripts.find(s => s.includes('TruthCertUI.attachReceiptButton'));
  assert.ok(fitScript && receiptScript, 'real inline scripts must be found');
  vm.runInContext(fitScript, ctx, {filename: `${tree}/copas/index.html:analysis`});
  vm.runInContext(receiptScript, ctx, {filename: `${tree}/copas/index.html:receipt`});
  function flush() { while (timers.size) { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); } }
  return {ctx, elements, toasts, flush,
    run(text) { elements.get('src').value = text; elements.get('btn-run').click(); flush(); },
    failStorage(value) { failStorage = value; },
    async capture() {
      ctx.MaStudies.write(seed);
      const before = storage.get('ma-studies-v1');
      const priorDownloads = downloads.length;
      const priorSigning = signing.length;
      elements.get('btn-bus-save').click();
      elements.get('btn-truthcert').click();
      await Promise.all(signing.slice(priorSigning));
      await new Promise(resolve => setImmediate(resolve));
      const receipt = downloads.length > priorDownloads ? JSON.parse(await downloads.at(-1).text()) : null;
      if (receipt) assert.equal((await ctx.MaStudies.verifyTruthCert(receipt)).valid, true);
      return {busWritten: storage.get('ma-studies-v1') !== before,
        bus: rows3(ctx.MaStudies.read()), receipt: receipt ? rows3(receipt.studies) : null};
    },
  };
}


test('refused fits neither overwrite the bus nor download a receipt', async () => {
  const p = boot('.');
  p.flush();
  assert.ok(p.ctx._almLastCopas(), 'initial fit must succeed');
  for (const input of [
    '0.25, 0.08\n0.18, 0.10',
    '0.25, 0.10\n0.18, 0.10\n0.40, 0.10',
    '0.25, 0.10\n0.18, 0.10\n0.40, 0.1000001',
  ]) {
    p.run(input);
    assert.equal(p.ctx._almLastCopas(), null);
    const actual = await p.capture();
    assert.equal(actual.busWritten, false);
    assert.deepEqual(actual.bus, seed);
    assert.equal(actual.receipt, null);
  }
});

test('exports follow accepted numeric rows, including zero and whitespace input', async () => {
  const p = boot('.');
  p.flush();
  p.run('0 0.08\n0.18, 0.10\n0.40, 0.15\n.4oops, 0.12');
  const expected = [
    {label: 'Study 1', est: 0, se: 0.08},
    {label: 'Study 2', est: 0.18, se: 0.10},
    {label: 'Study 3', est: 0.40, se: 0.15},
  ];
  assert.equal(p.ctx._almLastCopas().k, 3);
  const actual = await p.capture();
  assert.deepEqual(actual.bus, expected);
  assert.deepEqual(actual.receipt, expected);
});

test('editing without Run still exports the displayed fit', async () => {
  const p = boot('.');
  p.flush();
  p.run('0.25, 0.08\n0.18, 0.10\n0.40, 0.15');
  const expected = [
    {label: 'Study 1', est: 0.25, se: 0.08},
    {label: 'Study 2', est: 0.18, se: 0.10},
    {label: 'Study 3', est: 0.40, se: 0.15},
  ];
  p.elements.get('src').value = '99, 1\n98, 2';
  const actual = await p.capture();
  assert.deepEqual(actual.bus, expected);
  assert.deepEqual(actual.receipt, expected);
});

test('loading and saving the bus preserves study names', async () => {
  const p = boot('.');
  p.flush();
  const expected = [
    {label: 'Trial Alpha 2024', est: 0, se: 0.08},
    {label: 'Trial Beta 2023', est: 0.18, se: 0.10},
    {label: 'Trial Gamma 2022', est: 0.40, se: 0.15},
  ];
  p.ctx.MaStudies.write(expected);
  p.elements.get('btn-bus-load').click();
  p.flush();
  const actual = await p.capture();
  assert.deepEqual(actual.bus, expected);
  assert.deepEqual(actual.receipt, expected);
});

test('full optional labels survive the snapshot without changing the fit', async () => {
  const p = boot('.');
  p.flush();
  p.run('0, 0.08\n0.18, 0.10\n0.40, 0.15');
  const numericResults = plain(p.ctx._almLastCopas());
  assert.ok(numericResults);
  p.run('0, 0.08, Trial Alpha, 2024\n0.18, 0.10, Beta study\n0.40, 0.15, <img src=x onerror=alert(1)>');
  assert.deepEqual(plain(p.ctx._almLastCopas()), numericResults);
  p.elements.get('src').value = '99, 1, edited label';
  const expected = [
    {label: 'Trial Alpha, 2024', est: 0, se: 0.08},
    {label: 'Beta study', est: 0.18, se: 0.10},
    {label: '<img src=x onerror=alert(1)>', est: 0.40, se: 0.15},
  ];
  const actual = await p.capture();
  assert.deepEqual(actual.bus, expected);
  assert.deepEqual(actual.receipt, expected);
  assert.ok(!p.elements.get('summary').innerHTML.includes('<img'));
});

test('missing or throwing snapshot hooks cannot fall back to input or old bus', async () => {
  const p = boot('.');
  p.flush();
  for (const hook of [undefined, () => { throw new Error('failure'); }]) {
    p.ctx.__almValidatorStudies = hook;
    const actual = await p.capture();
    assert.equal(actual.busWritten, false);
    assert.deepEqual(actual.bus, seed);
    assert.equal(actual.receipt, null);
  }
});

test('storage failure is reported without a success notification', () => {
  const p = boot('.');
  p.flush();
  p.failStorage(true);
  p.elements.get('btn-bus-save').click();
  assert.deepEqual(p.toasts.at(-1), {message: 'Could not save to bus.', kind: 'error'});
});
