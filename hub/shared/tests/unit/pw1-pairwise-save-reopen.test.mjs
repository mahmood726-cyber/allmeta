import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const core = readFileSync(new URL('Truthcert1/app.min.js', root), 'utf8');
const page = readFileSync(new URL('Truthcert1/TruthCert-PairwisePro-v1.0-production.html', root), 'utf8');
const hookStart = page.indexOf('// Hook into analysis completion');
const hookEnd = page.indexOf('// Fixed Meta-Regression', hookStart);
assert.ok(hookStart >= 0 && hookEnd > hookStart, 'load the production analysis completion hooks');
const hooks = page.slice(hookStart, hookEnd);
const plain = value => JSON.parse(JSON.stringify(value));

// Run the shipped numerical engine, completion hooks, and save/load handlers.
// Only table input, panel drawing, and browser services are replaced. Timers
// advance deterministically so the 50 ms/500 ms race needs no browser or sleep.
function harness({ supplements = true } = {}) {
  let now = 0, timerId = 0, blobId = 0, rows = [];
  const timers = new Map(), blobs = new Map(), storage = new Map();
  const downloads = [], rendered = [], errors = [], elements = new Map();
  function element() {
    return {
      innerHTML: '', value: '', style: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, appendChild() {}, removeChild() {},
      querySelectorAll() { return []; }, querySelector() { return null; },
      setAttribute() {}, getAttribute() { return null; },
      click() {
        if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
      },
    };
  }
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  const table = getElementById('studyTableBody');
  Object.defineProperty(table, 'innerHTML', {
    get: () => '',
    set(value) { assert.equal(value, ''); rows = []; },
  });
  const context = vm.createContext({
    Blob,
    console: { log() {}, info() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); } },
    alert(message) { errors.push(message); },
    document: {
      addEventListener() {}, getElementById,
      querySelector: () => element(), querySelectorAll: () => [],
      createElement: element, body: element(), documentElement: element(),
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { storage.set(key, value); },
    },
    URL: {
      createObjectURL(blob) { const id = `blob:pw1-${++blobId}`; blobs.set(id, blob); return id; },
      revokeObjectURL(id) { blobs.delete(id); },
    },
    setTimeout(fn, delay = 0) { timers.set(++timerId, { at: now + delay, fn }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++timerId; }, clearInterval() {},
    addEventListener() {},
  });
  context.window = context;
  const run = code => vm.runInContext(code, context);
  vm.runInContext(core, context, { filename: 'Truthcert1/app.min.js' });
  const state = run('AppState');
  context.getStudyData = () => plain(rows);
  context.addStudyRow = row => rows.push(plain(row));
  context.updateEffectMeasures = () => {};
  context.updateTableHeaders = () => {};
  context.showToast = () => {};
  context.renderResults = () => rendered.push(plain(state.results));
  context.renderBiasPanel = () => {};
  context.updateCrossDisciplinary = () => {};
  context.updateCodePanel = () => {};
  context.runTruthCertAnalysis = () => {};
  if (supplements) vm.runInContext(hooks, context, { filename: 'production.html:analysis-completion' });
  rows = plain(run('DEMO_DATASETS.SGLT2_ACM.studies')).map((row, i) => ({ ...row, index: i + 1, valid: true }));

  function advanceTo(time) {
    assert.ok(time >= now);
    let count = 0;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= time)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(++count < 1000, 'timer queue must settle');
      const [id, timer] = next;
      timers.delete(id); now = timer.at; timer.fn();
    }
    now = time;
    assert.deepEqual(errors, [], 'the real analysis and completion hooks must run without errors');
  }
  return {
    state, context, rendered, advanceTo,
    input: () => plain(rows),
    start() { context.runAnalysis(); },
    async save() {
      context.saveProject('plot-regression.json');
      const download = downloads.pop();
      assert.equal(download?.name, 'plot-regression.json');
      assert.equal(download.blob.type, 'application/json');
      const saved = JSON.parse(await download.blob.text());
      assert.deepEqual(JSON.parse(storage.get('truthcert_autosave')), saved);
      return saved;
    },
    async reopen(saved) {
      let refits = 0;
      context.runAnalysis = () => { refits++; };
      await context.loadProject(JSON.stringify(saved));
      advanceTo(now + 2000);
      assert.equal(refits, 0, 'restoring must never refit');
      return plain(state.results);
    },
  };
}

test('plant PW1: save/reopen across late analysis timers preserves the first rendered result', async () => {
  const app = harness();
  const input = app.input();
  app.start();
  app.advanceTo(50);
  assert.equal(app.rendered.length, 1);
  const before = app.rendered[0];
  assert.ok(before.pooled && before.k === 5);
  app.advanceTo(600);
  const saved = await app.save();
  assert.deepEqual(saved.results, before, 'a later save must preserve the first complete result');
  const reopened = harness();
  assert.deepEqual(await reopened.reopen(saved), before);
  assert.deepEqual(reopened.input(), input);
  assert.deepEqual(reopened.rendered, [before]);
});

test('plant PW1: metaoverfit is complete when analysis first renders', () => {
  const app = harness();
  app.start(); app.advanceTo(50);
  const diagnostic = app.rendered[0].metaoverfit;
  assert.equal(diagnostic.risk_level, 'SEVERE');
  assert.equal(diagnostic.k, 5);
  assert.equal(diagnostic.p, 2);
  assert.equal(diagnostic.skipped, undefined);
  assert.ok(Number.isFinite(diagnostic.ESS));
});

test('plant PW1: pending completion timers cannot extend a restored legacy result', async () => {
  const app = harness();
  app.start(); app.advanceTo(50);
  const saved = await app.save();
  saved.results.metaoverfit = { risk: 'unknown', skipped: true };
  assert.deepEqual(await app.reopen(saved), saved.results);
});

test('control PW1: settled analysis saves and reopens without refitting or changing inputs', async () => {
  const app = harness();
  app.start(); app.advanceTo(2000);
  const before = plain(app.state.results), input = app.input();
  const saved = await app.save();
  assert.deepEqual(saved.results, before);
  assert.equal(before.metaoverfit.risk_level, 'SEVERE');
  const reopened = harness();
  assert.deepEqual(await reopened.reopen(saved), before);
  assert.deepEqual(reopened.input(), input);
});

test('control PW1: loading a legacy skipped diagnostic preserves it exactly', async () => {
  const app = harness();
  app.start(); app.advanceTo(2000);
  const saved = await app.save();
  saved.results.metaoverfit = { risk: 'unknown', skipped: true };
  const reopened = harness();
  assert.deepEqual(await reopened.reopen(saved), saved.results);
  assert.deepEqual(reopened.rendered, [saved.results]);
});

test('control PW1: the core still runs without the optional production supplement', async () => {
  const app = harness({ supplements: false });
  app.start(); app.advanceTo(2000);
  assert.equal(app.state.results.k, 5);
  assert.deepEqual(plain(app.state.results.metaoverfit), { risk: 'unknown', skipped: true });
  const saved = await app.save();
  assert.deepEqual(await harness({ supplements: false }).reopen(saved), saved.results);
});
