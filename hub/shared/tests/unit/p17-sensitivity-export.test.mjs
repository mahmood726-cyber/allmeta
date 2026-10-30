import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import P from '../../../../correlation-ma/plus-core.js';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const rows = [
  { label: 'Repeated, "label"', r: 0.1234567890123456, n: 47 },
  { label: 'Repeated, "label"', r: -0.2345678901234567, n: 81 },
  { label: 'Study \u03b1', r: 0, n: 103 },
  { label: 'Study D', r: 0.4567890123456789, n: 29 },
];
const inputText = [
  '# ignored comment',
  ...rows.map(s => `${s.label}, ${s.r}, ${s.n}`),
  'Rejected boundary, 1, 40',
  'Rejected n, 0.2, 3',
  'Rejected blank, , 50',
  'Rejected malformed, 0.2junk, 60',
].join('\n');

// Execute the real parser, panel, and JSON download handler with only the DOM
// methods they need. No browser, layout, third-party DOM, or filesystem output.
function pageHarness() {
  const timers = new Map(), blobs = new Map(), downloads = [];
  let timerId = 0, blobId = 0;
  function element() {
    const listeners = new Map(), buttons = new Map();
    return {
      value: '', textContent: '', innerHTML: '', disabled: false,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      async dispatch(type, target = this) {
        for (const fn of listeners.get(type) || []) await fn({ target });
      },
      querySelector(selector) {
        assert.match(selector, /^\[data-action="[a-z-]+"\]$/);
        if (!buttons.has(selector)) buttons.set(selector, element());
        return buttons.get(selector);
      },
      appendChild() {}, removeChild() {},
      click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); },
    };
  }
  const ids = [
    'f-data', 'f-method', 'res-body', 'headline', 'forest-host',
    'alm-export-mount', 'alm-plus', 'alm-plus-sens', 'alm-plus-prose',
    'alm-plus-loo-btn', 'alm-plus-r', 'alm-plus-export', 'alm-live',
    'f-tools', 'f-notice',
  ];
  const elements = new Map(ids.map(id => [id, element()]));
  const get = id => elements.get(id) || null;
  get('f-method').value = 'REML';
  const document = {
    readyState: 'complete', getElementById: get,
    querySelector: selector => selector.startsWith('#') ? get(selector.slice(1)) : null,
    querySelectorAll: () => [], createElement: element,
    head: element(), body: element(),
  };
  const context = vm.createContext({
    document, console, Blob, matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    URL: {
      createObjectURL(blob) { const id = `blob:test-${++blobId}`; blobs.set(id, blob); return id; },
      revokeObjectURL(id) { blobs.delete(id); },
    },
  });
  context.window = context;
  const run = path => vm.runInContext(read(path), context, { filename: path });
  run('shared/ma-core.js');
  run('hub/shared/results-export.js');
  const pageScript = [...read('correlation-ma/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .find(match => match[1].includes('var EXAMPLE'));
  assert.ok(pageScript, 'the real page analysis script must be present');
  vm.runInContext(pageScript[1], context, { filename: 'correlation-ma/index.html' });
  run('correlation-ma/plus-core.js');
  run('correlation-ma/plus-ui.js');
  function flush() {
    while (timers.size) {
      const [id, fn] = timers.entries().next().value;
      timers.delete(id); fn();
    }
  }
  flush();
  return {
    async setInput(text) { get('f-data').value = text; await get('f-data').dispatch('input'); flush(); },
    async select(method, test) {
      get('f-method').value = method; await get('f-method').dispatch('change'); flush();
      await get('alm-plus').dispatch('change', { name: 'alm-plus-test', value: test }); flush();
    },
    async download(target, name) {
      await get(target).querySelector('[data-action="json"]').dispatch('click');
      const download = downloads.pop();
      assert.ok(download, 'the real JSON handler must download a Blob');
      assert.equal(download.name, name);
      assert.equal(download.blob.type, 'application/json');
      return JSON.parse(await download.blob.text());
    },
  };
}

test('plant P17-R4: sensitivity retains exact label/r/n rows for every selection', () => {
  const accepted = Object.freeze(rows.map(s => Object.freeze({ ...s, z: Math.atanh(s.r), extra: 'omit' })));
  for (const method of P.METHODS) for (const test of P.TESTS) {
    const result = P.sensitivity(accepted, { method, test });
    assert.equal(result.refused, false);
    assert.deepEqual(result.current, { method, test });
    assert.equal(result.cells.length, 12);
    assert.deepEqual(result.studies, rows, `${method}/${test} must retain every accepted row in order`);
  }
});

test('plant P17-R4: retained studies are a snapshot independent of caller rows', () => {
  const accepted = rows.map(s => ({ ...s }));
  const result = P.sensitivity(accepted, { method: 'PM', test: 'knha' });
  assert.deepEqual(result.studies, rows);
  assert.notEqual(result.studies, accepted);
  result.studies.forEach((row, i) => assert.notEqual(row, accepted[i]));
  accepted[0].label = 'Later edit'; accepted[0].r = 0.9; accepted[0].n = 500;
  accepted.reverse(); accepted.push({ label: 'Later row', r: 0.1, n: 50 });
  assert.deepEqual(result.studies, rows);
  result.studies[1].r = 0.75;
  assert.equal(accepted[2].r, rows[1].r, 'editing the snapshot must not mutate the caller');
});

test('plant P17-R4: downloaded sensitivity JSON alone replays all cells after rejected rows', async () => {
  const page = pageHarness();
  await page.setInput(inputText);
  await page.select('PM', 'knha');
  const exported = await page.download('alm-plus-export', 'correlation-ma-sensitivity.json');
  assert.equal(exported._schema, 'corr-ma-plus-v1');
  assert.equal(exported.k, rows.length);
  assert.deepEqual(exported.current, { method: 'PM', test: 'knha' });
  assert.equal(exported.cells.length, 12);
  assert.deepEqual(exported.studies, rows, 'download must carry the accepted inputs, excluding rejected rows');
  const replay = P.sensitivity(exported.studies, exported.current);
  assert.deepEqual(plain(replay), exported, 'only the download is needed to reproduce every result cell');
});

test('control: main JSON already retains every accepted label/r/n row', async () => {
  const page = pageHarness();
  await page.setInput(inputText);
  await page.select('PM', 'knha');
  const exported = await page.download('alm-export-mount', 'correlation-ma-results.json');
  assert.equal(exported._schema, 'corr-ma-results-v1');
  assert.equal(exported.k, rows.length);
  assert.equal(exported.method, 'PM');
  assert.deepEqual(exported.studies, rows);
  assert.equal(exported.r, P.find(P.sensitivity(rows).cells, 'PM', 'z').r);
});

test('control: selection does not alter cells and FE HKSJ remains not applicable', () => {
  const defaultResult = P.sensitivity(rows), selected = P.sensitivity(rows, { method: 'DL', test: 'adhoc' });
  assert.deepEqual(defaultResult.current, { method: 'REML', test: 'z' });
  assert.deepEqual(selected.cells, defaultResult.cells);
  assert.equal(selected.cells.filter(c => c.applicable).length, 10);
  assert.deepEqual(selected.cells.filter(c => !c.applicable).map(c => [c.method, c.test]), [['FE', 'knha'], ['FE', 'adhoc']]);
  const prepared = P.prepare(rows);
  for (const cell of selected.cells) {
    const { narrower_than_wald, ...fit } = cell;
    assert.deepEqual(fit, P.fitCell(prepared.z, prepared.v, cell.method, cell.test));
  }
});

test('control: insufficient or invalid input retains existing refusal behavior', () => {
  for (const studies of [[], rows.slice(0, 1)]) {
    assert.deepEqual(P.sensitivity(studies), {
      _schema: 'corr-ma-plus-v1', refused: true, k: studies.length,
      reason: 'Enter at least 2 studies (label, r, n).',
    });
  }
  assert.throws(() => P.sensitivity([{ label: 'invalid', r: 1, n: 40 }, rows[0]]), /out-of-range study/);
});
