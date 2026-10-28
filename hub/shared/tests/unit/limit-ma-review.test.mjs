import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

// Run the production page, sensitivity UI and leave-one-out loop. Only DOM/shared
// UI plumbing is stubbed; queued timers let each test stop at the real loop yield.
function setup() {
  const html = read('limit-ma/index.html'), nodes = {}, timers = [];
  function node() {
    let content = '';
    const listeners = {};
    return {value: '', disabled: false, checked: false, attrs: {}, dataset: {}, children: [],
      parentNode: {}, style: {}, namespaceURI: 'http://www.w3.org/2000/svg',
      get innerHTML() { return content + this.children.map(n => typeof n === 'string' ? n : n.innerHTML).join(''); },
      set innerHTML(value) { content = String(value); this.children = []; },
      get textContent() { return this.innerHTML; }, set textContent(value) { this.innerHTML = value; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { content = ''; this.children = children; },
      querySelectorAll() { return []; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      dispatch(type) {
        // Event listeners begin synchronously, as in the browser.
        return Promise.all((listeners[type] || []).map(fn => fn.call(this)));
      },
      click() { if (!this.disabled) return this.dispatch('click'); }
    };
  }
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const n = nodes[m[1]] = node();
    n.value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
    n.disabled = /\sdisabled\b/.test(m[0]); n.checked = /\schecked\b/.test(m[0]);
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = {getElementById: id => nodes[id] || null, querySelectorAll: () => [],
    createElement: node, createElementNS: node, createTextNode: text => text};
  const noop = () => {};
  const alm = {analysisLifecycle: run => run, csvUpload: noop, plotExport: noop, axisControls: noop,
    resultsExport: options => { alm.exportOptions = options; }, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, {read: () => null})};
  const window = {alm};
  const context = vm.createContext({window, document, structuredClone,
    setTimeout: fn => { timers.push(fn); }});
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context, {filename: 'index.html:inline'});
  for (const file of ['shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
    'limit-ma/plus-opt.js', 'limit-ma/loo-limit.js', 'limit-ma/plus-selmodel.js',
    'limit-ma/plus.js', 'limit-ma/plus-ui.js']) {
    vm.runInContext(read(file), context, {filename: file});
    Object.assign(context, window);
  }
  return {window, nodes,
    start() {
      assert.equal(nodes['loo-run'].disabled, false);
      const pending = nodes['loo-run'].click();
      assert.equal(nodes['loo-run'].disabled, true);
      assert.match(nodes['loo-status'].textContent, /^5\/10 deletions calculated/);
      assert.ok(timers.length, 'leave-one-out must be suspended at a timer yield');
      return pending;
    },
    async tick() {
      assert.ok(timers.length, 'expected a queued timer');
      timers.shift()();
      await Promise.resolve();
    },
    async finish(pending) {
      while (timers.length) await this.tick();
      await pending;
    }
  };
}

function assertCancelled(h) {
  assert.equal(h.window._almLastLimit().leave_one_out, undefined);
  assert.equal(h.nodes['loo-body'].innerHTML, '');
  assert.equal(h.nodes['loo-plot'].innerHTML, '');
  assert.equal(h.nodes['loo-plot'].attrs.hidden, '');
  assert.equal(h.nodes['loo-csv'].disabled, true);
}

function assertComplete(h) {
  const result = h.window.alm.exportOptions.getResults().leave_one_out;
  assert.equal(result.rows.length, 10);
  assert.ok(result.rows.every(row => row.status === 'ok'));
  assert.equal(h.nodes['loo-run'].disabled, false);
  assert.equal(h.nodes['loo-csv'].disabled, false);
  assert.match(h.nodes['loo-status'].textContent, /^10\/10 deletions calculated/);
  assert.equal((h.nodes['loo-body'].innerHTML.match(/<tr /g) || []).length, 10);
  // Control for the unchanged estimator: async UI results match the pure engine.
  const rows = h.window.AlmLimitEngine.parse(h.nodes.src.value);
  assert.equal(JSON.stringify(result), JSON.stringify(h.window.AlmLimitLoo.compute(rows)));
}

test('P12-R2: sensitivity cancellation releases leave-one-out and permits retry', async () => {
  const h = setup(), pending = h.start();
  await h.nodes['plus-run'].click();
  assert.match(h.nodes['plus-status'].textContent, /^Sensitivity calculations complete/);
  await h.finish(pending);
  assertCancelled(h);
  assert.equal(h.nodes['loo-run'].disabled, false, 'sensitivity must release the cancelled run button');
  await h.finish(h.start());
  assertComplete(h);
});

test('P12-R2: sensitivity alpha change releases a cancelled leave-one-out run', async () => {
  const h = setup();
  await h.nodes['plus-run'].click();
  assert.ok(h.window.AlmLimitPlusUI.snapshot());
  const pending = h.start();
  h.nodes['plus-alpha'].value = '0.05';
  await h.nodes['plus-alpha'].dispatch('change');
  await h.finish(pending);
  assertCancelled(h);
  assert.equal(h.nodes['loo-run'].disabled, false);
});

test('P12-R2 control: uninterrupted leave-one-out completes and releases its button', async () => {
  const h = setup();
  await h.finish(h.start());
  assertComplete(h);
});

test('P12-R2: cancelled completion cannot release a newer leave-one-out run', async () => {
  const h = setup(), old = h.start();
  await h.nodes['plus-run'].click();
  assert.equal(h.nodes['loo-run'].disabled, false, 'release cancellation before the old timer resumes');
  const newer = h.start();
  await h.tick();
  await old;
  assert.equal(h.nodes['loo-run'].disabled, true, 'the newer run owns the disabled button');
  assertCancelled(h);
  await h.finish(newer);
  assertComplete(h);
});

for (const automaticAxes of [true, false]) {
  test(`P12-R2 control: cancellation preserves a validation lock (automatic axes ${automaticAxes})`, async () => {
    const h = setup(), pending = h.start();
    // The validation adapters own this lock; neither invalidation nor the
    // cancelled loop's finally block may release it, regardless of axis mode.
    h.nodes['loo-run'].disabled = true;
    h.window.__almLimitValidationRun('.1,.2,A\n.2,.3,B\n.3,.4,C', automaticAxes);
    assert.equal(h.nodes['loo-run'].disabled, true);
    await h.finish(pending);
    assertCancelled(h);
    assert.equal(h.nodes['loo-run'].disabled, true);
  });
}
