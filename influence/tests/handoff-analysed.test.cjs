'use strict';
// Bus Save, the TruthCert receipt and Verify in R carry the studies the displayed analysis was
// computed on (lane hf1, reviews of PR #580). Real page analysis, bus, receipt and HMAC code;
// minimal DOM, storage and downloads, and an identity analysis lifecycle (it only toggles
// notices; it does not disable these buttons). Not a browser test. Adapted from the Codex review.
// Run from the repository root: node --test influence/tests/handoff-analysed.test.cjs
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const plain = value => JSON.parse(JSON.stringify(value));
const project = rows => plain(rows).map(({ label, est, se }) => ({ label, est, se }));
const analysed = app => plain(app.context._almStudies()).map(r => ({ label: r.label, est: r.te, se: r.se }));
const GOOD = '0, 0.2, Alpha\n0.2, 0.3, Beta\n0.4, 0.25, Gamma';

function load(input = GOOD) {
  const tree = '.';
  const downloads = [], messages = [], storage = new Map(), objects = new Map();
  const elements = new Map();
  class Element {
    constructor(id) {
      this.id = id; this.value = ''; this.innerHTML = ''; this.textContent = '';
      this.disabled = false; this.hidden = false; this.handlers = new Map();
      this.classList = { toggle() {}, contains() { return false; } };
    }
    addEventListener(name, fn) {
      this.handlers.set(name, [...(this.handlers.get(name) || []), fn]);
    }
    dispatchEvent(event) { for (const fn of this.handlers.get(event.type) || []) fn.call(this, event); }
    click() {
      if (this.disabled) return;
      if (this.download) downloads.push({ name: this.download, blob: objects.get(this.href) });
      this.dispatchEvent({ type: 'click', target: this });
    }
    setAttribute() {}
    appendChild() {}
    removeChild() {}
    remove() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const document = {
    readyState: 'complete', body: new Element('document-body'),
    getElementById: element,
    querySelector: sel => /^#[\w-]+$/.test(sel) ? element(sel.slice(1)) : null,
    querySelectorAll: () => [], createElement: tag => new Element(tag),
    addEventListener() {}, removeEventListener() {}
  };
  const context = vm.createContext({
    document, crypto: webcrypto, TextEncoder, TextDecoder, Blob, Event, structuredClone,
    setTimeout: fn => { fn(); return 0; },
    URL: { createObjectURL(blob) { const key = 'blob:' + objects.size; objects.set(key, blob); return key; }, revokeObjectURL() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key)
    },
    Toast: { show: (message, kind) => messages.push({ message, kind }) },
    alm: { analysisLifecycle: fn => Object.assign(fn, { snapshot: () => ({}), restore() {} }) }
  });
  context.window = context;
  for (const file of ['shared/ma-core.js', 'shared/diagnostic-plots.js',
    'shared/ma-studies-v1.js', 'shared/truthcert-ui.js', 'influence/influence-extra.js', 'influence/r-script.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, tree, file), 'utf8'), context, { filename: tree + '/' + file });
  }
  context.TruthCertUI.setKey('test-only-not-a-real-signing-key');
  let html = fs.readFileSync(path.join(ROOT, tree, 'influence/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/\bsrc=/.test(m[1])).map(m => m[2]);
  element('src').value = input;
  vm.runInContext(scripts.find(s => s.includes('const LS_KEY = "influence-v1"')), context, { filename: tree + '/influence/index.html:main-inline' });
  vm.runInContext(scripts.find(s => s.includes('TruthCertUI.attachReceiptButton')), context, { filename: tree + '/influence/index.html:receipt-inline' });
  return {
    context, element, storage, downloads, messages,
    edit(text) { element('src').value = text; element('src').dispatchEvent(new Event('input')); },
    run(text) { this.edit(text); element('btn-run').click(); },
    save() { element('btn-bus-save').click(); return project(context.MaStudies.read()); },
    async receipt() {
      const start = downloads.length;
      // Capture the asynchronous signing work without replacing its implementation.
      const pending = [], real = context.MaStudies.toTruthCert;
      context.MaStudies.toTruthCert = function (...args) { const task = real(...args); pending.push(task); return task; };
      try {
        element('btn-truthcert').click();
        await Promise.all(pending);
        await new Promise(resolve => setImmediate(resolve));
      } finally { context.MaStudies.toTruthCert = real; }
      const added = downloads.slice(start);
      if (!added.length) return null;
      assert.equal(added.length, 1);
      const receipt = JSON.parse(await added[0].blob.text());
      const verify = await context.MaStudies.verifyTruthCert(receipt, { key: 'test-only-not-a-real-signing-key' });
      assert.equal(verify.ok, true, JSON.stringify(verify));
      return receipt;
    }
  };
}


const sentinel = [{ label: 'Older bus', est: -4, se: 1 }];
const accepted = [
  ['valid and zero effect', GOOD],
  ['comma in study label', GOOD.replace('Alpha', 'Alpha, subgroup')],
  ['blank lines and implicit labels', '\n0, 0.2\n\n0.2, 0.3\n0.4, 0.25'],
  ['HTML characters in label', GOOD.replace('Alpha', '<img src=x onerror=alert(1)>')]
];
for (const [name, input] of accepted) {
  test(`save and signed receipt match analysed rows: ${name}`, async () => {
    const app = load(input);
    const expected = analysed(app);
    assert.equal(expected.length, 3);
    const bus = app.save();
    const receipt = await app.receipt();
    assert.ok(receipt);
    assert.deepEqual({ bus, receipt: project(receipt.studies) }, { bus: expected, receipt: expected });
  });
}
for (const [name, input] of [
  ['fewer than three studies', '0, 0.2, Alpha\n0.2, 0.3, Beta'],
  ['invalid numeric suffix', GOOD.replace('0.2, 0.3', '0.2oops, 0.3')],
  ['invalid line among valid lines', GOOD + '\nnot a study'],
  ['empty input', ''],
  ['zero SE', GOOD.replace('0.2, 0.3', '0.2, 0')]
]) {
  test(`refused analysis cannot overwrite bus or produce receipt: ${name}`, async () => {
    const app = load(GOOD);
    app.context.MaStudies.write(sentinel);
    app.run(input);
    assert.equal(app.context._almLastInfluence(), null);
    const bus = app.save(), receipt = await app.receipt();
    assert.deepEqual({ bus, receipt: receipt && project(receipt.studies) }, { bus: sentinel, receipt: null });
  });
}
test(`failed fit cannot overwrite bus or produce receipt`, async () => {
  const app = load(GOOD);
  app.context.MaStudies.write(sentinel);
  app.context.AlmMaCore.tau2REML = () => { throw new Error('simulated fit failure'); };
  app.run(GOOD);
  assert.equal(app.context._almLastInfluence(), null);
  const bus = app.save(), receipt = await app.receipt();
  assert.deepEqual({ bus, receipt: receipt && project(receipt.studies) }, { bus: sentinel, receipt: null });
});
test(`valid unsubmitted edit is not signed or stored; the analysed rows are`, async () => {
  const app = load(GOOD), before = analysed(app), mean = app.context._almLastInfluence().mu;
  app.context.MaStudies.write(sentinel);
  app.edit(GOOD.replace('0, 0.2, Alpha', '9, 0.2, Alpha edited'));
  assert.deepEqual(analysed(app), before);
  assert.equal(app.context._almLastInfluence().mu, mean);
  const bus = app.save(), receipt = await app.receipt();
  // The exports carry the rows the displayed result was computed on (as copas and gosh do).
  assert.deepEqual(bus, before);
  assert.ok(receipt, 'a receipt for the displayed analysis');
  assert.deepEqual(project(receipt.studies), before);
  assert.deepEqual(plain(app.context.__almValidatorStudies()), before);
});
test(`re-run after edit exports newly analysed rows`, async () => {
  const app = load(GOOD);
  app.run(GOOD.replace('0, 0.2, Alpha', '9, 0.2, Alpha edited'));
  assert.equal(analysed(app)[0].est, 9);
  assert.deepEqual(app.save(), analysed(app));
  assert.deepEqual(project((await app.receipt()).studies), analysed(app));
});
test(`Load from bus still loads and runs analysis`, () => {
  const app = load(GOOD);
  const rows = [{ label: 'Loaded, A', est: 0, se: 0.2 }, { label: 'Loaded B', est: 1, se: 0.3 }, { label: 'Loaded C', est: 2, se: 0.4 }];
  app.context.MaStudies.write(rows);
  app.element('btn-bus-load').click();
  assert.deepEqual(analysed(app), rows);
  assert.ok(app.context._almLastInfluence());
});
test(`unavailable storage reports failure`, () => {
  const app = load(GOOD);
  app.context.localStorage.setItem = () => { throw new Error('quota exceeded'); };
  app.save();
  assert.ok(app.messages.some(m => m.message === 'Could not save to bus.' && m.kind === 'error'));
});
