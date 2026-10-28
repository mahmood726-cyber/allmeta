import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('multilevel-ma/index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sample = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];

// Execute the real page, GradePush and MaPooled code. Only the DOM, localStorage,
// unrelated UI mounts and the deferred extras timer are replaced by test doubles.
function app(input = sample, mutate = code => code) {
  const nodes = new Map(), storage = new Map(), timers = [], captures = {};
  function element() {
    const events = new Map(), selectors = new Map();
    return {
      value: '', defaultValue: '', innerHTML: '', textContent: '', style: {}, dataset: {}, children: [],
      set id(id) { nodes.set(id, this); },
      setAttribute() {}, append(...children) { this.children.push(...children); },
      appendChild(child) { this.append(child); }, replaceChildren(...children) { this.children = children; },
      addEventListener(type, listener) {
        if (!events.has(type)) events.set(type, []);
        events.get(type).push(listener);
      },
      dispatchEvent(event) { for (const listener of events.get(event.type) || []) listener(event); },
      click() { this.dispatchEvent({ type: 'click' }); if (this.onclick) this.onclick(); },
      querySelector(selector) {
        if (!selectors.has(selector)) selectors.set(selector, element());
        return selectors.get(selector);
      },
    };
  }
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  node('src').value = input;
  node('src').defaultValue = sample;
  const alm = {
    analysisLifecycle: run => run, csvUpload() {}, axisControls() {}, tooltips() {},
    resetUndo: Object.assign(() => {}, { snapshot() {} }),
    resultsExport: config => captures.csv = config,
    plotExport: config => captures.plot = config,
    urlState: Object.assign(() => {}, { read: () => null, write() {} }),
  };
  const context = vm.createContext({
    alm, document: { getElementById: node, createElement: element, readyState: 'complete' },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: callback => timers.push(callback), setInterval() {},
  });
  context.window = context;
  for (const path of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/multilevel-reml.js',
    'shared/ma-pooled-v1.js', 'shared/grade-push.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(scripts.find(s => s.includes('function fit(rows)')), context);
  vm.runInContext(mutate(scripts.find(s => s.includes('GradePush.attach'))), context);
  vm.runInContext(read('multilevel-ma/plus-ui.js'), context);
  const grade = node('alm-grade-push').children[0];
  grade.querySelector('.gp-outcome').value = 'Primary outcome';
  grade.querySelector('.gp-scale').value = 'linear';
  return { context, node, captures, timers,
    push() { grade.querySelector('.gp-btn').click(); return context.MaPooled.read(); },
    run(text) { node('src').value = text; node('btn-run').click(); },
  };
}

function checkPooled(a) {
  const rows = a.context.__almMlmaParse(a.node('src').value);
  const result = a.context._almLastMlma();
  const [stored] = a.push();
  assert.ok(stored, 'GradePush wrote a pooled result');
  assert.equal(stored.k, new Set(rows.map(row => row.study)).size,
    'GRADE k must count independent studies');
  assert.equal(stored.pointEstimate, result.mu);
  assert.equal(stored.ciLo, result.ci_lb_z);
  assert.equal(stored.ciHi, result.ci_ub_z);
  assert.equal(stored.label, 'Primary outcome');
  assert.equal(stored.scale, 'linear');
  assert.equal(stored.model, 'random');
  return stored;
}

test('CI GRADE control: repeated effects publish independent studies and the primary Wald CI', t => {
  const a = app(), stored = checkPooled(a), result = a.context._almLastMlma();
  assert.ok(result.k > stored.k, 'bundled example has repeated effects');
  assert.equal(result.mu, a.context.__almReml().mu);
  t.diagnostic(`Effect rows=${result.k}; independent studies=${stored.k}; primary=${result.method}`);
});

test('CI GRADE plant: restoring the old row-count producer violates the study-count contract', () => {
  const a = app(sample, code => {
    assert.equal(code.split('k: r.J, model:').length, 2, 'locate exactly one producer');
    return code.replace('k: r.J, model:', 'k: r.k, model:');
  });
  assert.throws(() => checkPooled(a), /GRADE k must count independent studies/);
});

test('CI GRADE control: one effect per study preserves the count and current estimate', () => {
  const first = new Map();
  for (const line of sample.trim().split('\n')) {
    const study = line.split(',')[0].trim();
    if (!first.has(study)) first.set(study, line);
  }
  const a = app([...first.values()].join('\n'));
  assert.equal(checkPooled(a).k, a.context._almLastMlma().k);
});

function checkEmpty(a) {
  a.run('');
  assert.match(a.node('summary').innerHTML, /no studies|nothing entered|empty|enter (one|at least)/i);
  assert.equal(a.context._almLastMlma(), null);
  assert.equal(a.context.__almReml(), null);
  assert.equal(a.captures.csv.getResults(), null);
  assert.equal(a.captures.plot.getReceiptInput(), null);
  assert.equal(a.node('body').innerHTML, '');
  assert.equal(a.node('forest').innerHTML, '');
  assert.equal(a.push().length, 0);
}

test('CI empty-input control: actionable refusal clears outputs and cannot publish stale GRADE data', () => {
  const a = app();
  assert.ok(a.node('forest').innerHTML.includes('<polygon'));
  checkEmpty(a);
});

test('CI empty-input plant: a stale previous result is rejected by the refusal contract', () => {
  const a = app(), previous = a.context._almLastMlma();
  a.context._almLastMlma = () => previous;
  assert.throws(() => checkEmpty(a), assert.AssertionError);
});

test('CI example control: the real one-click handler restores the bundled input and refits it', () => {
  const a = app(), original = JSON.stringify(a.context._almLastMlma());
  a.run('');
  a.node('alm-plus-example').click();
  assert.equal(a.node('src').value, sample);
  assert.equal(JSON.stringify(a.context._almLastMlma()), original);
  assert.equal(a.timers.length, 1, 'extras calculation is scheduled by the same click');
  checkPooled(a);
});
