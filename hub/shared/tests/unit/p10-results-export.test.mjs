import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const html = source('mh-peto/index.html');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('window._almLastMhPeto ='));
assert.ok(appScript, 'load the complete mh-peto analysis and export wiring');
const validInput = 'Alpha, 3, 50, 8, 50\nBeta, 4, 60, 9, 60';
const actions = ['csv', 'json', 'md', 'report-md', 'report-txt'];

// Execute the real exporter and, when requested, the complete main app script.
// Only DOM/download boundaries and unrelated widgets are replaced. No files,
// browser storage, network, or statistical reference values are needed.
function harness({ app = false, results = null, receipt = false } = {}) {
  const downloads = [], blobs = new Map(), elements = new Map();
  let current = results, reads = 0, receiptReads = 0, signatures = 0;
  function element(tag = 'div', attributes = {}) {
    const listeners = new Map(), children = [];
    let markup = '';
    return {
      id: attributes.id || '', value: '', checked: false, hidden: false, textContent: '',
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name] ?? null; },
      removeAttribute(name) { delete attributes[name]; },
      appendChild(child) { children.push(child); return child; },
      removeChild(child) { children.splice(children.indexOf(child), 1); },
      addEventListener(type, listener) { listeners.set(type, listener); },
      async click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        return listeners.get('click')?.call(this, { target: this });
      },
      matches(selector) {
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        const attr = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
        return !!attr && attributes[attr[1]] === attr[2];
      },
      querySelector(selector) { return children.find(child => child.matches(selector)) ?? null; },
      get innerHTML() { return markup; },
      set innerHTML(value) {
        markup = value;
        children.length = 0;
        // The exporter creates its buttons and live region through innerHTML.
        if (this.id === 'alm-export-mount') for (const match of value.matchAll(/<(\w+)\b([^>]*)>/g)) {
          const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
          children.push(element(match[1], attrs));
        }
      },
    };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], element('div', { id: match[1] }));
  const mount = elements.get('alm-export-mount');
  const document = {
    title: 'MH/Peto test', head: element('head'), body: element('body'),
    createElement: tag => element(tag), addEventListener() {},
    getElementById: id => elements.get(id) ?? null,
    querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) ?? null : null,
    querySelectorAll: selector => selector === '#src, #measure' ? [elements.get('src'), elements.get('measure')] : [],
  };
  const noop = () => {};
  const window = { alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(() => {}, { read: () => ({}), write: noop }),
  } };
  if (receipt) window.AlmTruthCertExport = {
    async buildReceipt(input) {
      signatures++;
      assert.equal(input.label, 'fixture');
      return { signed: true, receipt: { id: 'test-receipt' } };
    },
  };
  const context = vm.createContext({ window, document, Blob, console, setTimeout: noop,
    URL: {
      createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; },
      revokeObjectURL: noop,
    },
  });
  vm.runInContext(source('hub/shared/results-export.js'), context, { filename: 'results-export.js' });
  if (app) {
    elements.get('src').value = validInput;
    elements.get('measure').value = 'OR';
    vm.runInContext(source('hub/shared/analysis-lifecycle.js'), context, { filename: 'analysis-lifecycle.js' });
    vm.runInContext(appScript, context, { filename: 'mh-peto/index.html' });
  } else {
    window.alm.resultsExport({
      target: mount, basename: 'fixture', title: 'Export fixture',
      description: 'Synthetic description.', methods: 'Synthetic methods.',
      getResults() { reads++; return current; },
      ...(receipt ? { getReceiptInput() { receiptReads++; return { label: 'fixture' }; } } : {}),
    });
  }
  return {
    downloads, window, elements,
    set results(value) { current = value; },
    get reads() { return reads; },
    get receiptReads() { return receiptReads; },
    get signatures() { return signatures; },
    get status() { return mount.querySelector('[role="status"]'); },
    click: action => mount.querySelector(`[data-action="${action}"]`).click(),
    run(input) { elements.get('src').value = input; return elements.get('btn-run').click(); },
  };
}

function refused(h) {
  assert.equal(h.downloads.length, 0, 'absent results must not create a download');
  assert.ok(h.status, 'provide an accessible explanation near the export buttons');
  assert.equal(h.status.hidden, false);
  assert.match(h.status.textContent, /successful analysis/i);
}

test('P10-R3 control: an invalid mh-peto run clears previous results', async () => {
  const h = harness({ app: true });
  assert.equal(h.window._almLastMhPeto().k, 2);
  await h.run('Broken, 51, 50, 8, 50');
  assert.equal(h.window._almLastMhPeto(), null);
  assert.equal(h.elements.get('input-errors').hidden, false);
});

for (const action of actions) {
  test(`P10-R3 plant: ${action} refuses results cleared by an invalid mh-peto run`, async () => {
    const h = harness({ app: true });
    assert.equal(h.window._almLastMhPeto().k, 2);
    await h.run('Broken, 51, 50, 8, 50');
    assert.equal(h.window._almLastMhPeto(), null);
    await h.click(action);
    refused(h);
  });

  test(`P10-R3 plant: ${action} refuses undefined before signing or downloading`, async () => {
    const h = harness({ receipt: true });
    h.results = undefined;
    await h.click(action);
    assert.equal(h.reads, 1, 'read the current results once per action');
    assert.equal(h.receiptReads, 0);
    assert.equal(h.signatures, 0);
    refused(h);
  });
}

const payload = { nested: { value: 2.5 }, label: '=SUM(A1:A9)', missing: null, studies: ['A', 'B'] };
const metadata = {
  csv: ['fixture.csv', 'text/csv'], json: ['fixture.json', 'application/json'],
  md: ['fixture.md', 'text/markdown'], 'report-md': ['fixture-report.md', 'text/markdown'],
  'report-txt': ['fixture-report.txt', 'text/plain'],
};
for (const action of actions) {
  test(`P10-R3 control: ${action} preserves valid content and download metadata`, async () => {
    const h = harness({ results: payload });
    await h.click(action);
    assert.equal(h.reads, 1);
    assert.equal(h.downloads.length, 1);
    const { name, blob } = h.downloads[0], text = await blob.text();
    assert.equal(name, metadata[action][0]);
    assert.equal(blob.type, metadata[action][1]);
    if (action === 'csv') assert.equal(text,
      'key,value\r\nnested.value,2.5\r\nlabel,\'=SUM(A1:A9)\r\nmissing,\r\nstudies,"[""A"",""B""]"');
    else if (action === 'json') assert.deepEqual(JSON.parse(text), payload);
    else if (action === 'report-txt') {
      assert.match(text, /^Export fixture\n=+/);
      assert.match(text, /METHODS\n\nSynthetic description\.\n\nSynthetic methods\./);
      assert.match(text, /RESULTS\n\nnested\.value: 2\.5\nlabel: =SUM\(A1:A9\)\nmissing: \nstudies: \["A","B"\]/);
    } else {
      assert.match(text, /\| nested\.value\s*\| 2\.5\s*\|/);
      assert.match(text, /\| label\s*\| =SUM\(A1:A9\)\s*\|/);
      assert.match(text, /\| missing\s*\|\s*\|/);
      assert.match(text, /\| studies\s*\| \["A","B"\]\s*\|/);
      if (action === 'report-md') {
        assert.match(text, /^# Export fixture\n/);
        assert.match(text, /## Methods\n\nSynthetic description\.\n\nSynthetic methods\./);
        assert.match(text, /## Results\n\n\|/);
      }
    }
  });
}

test('P10-R3 control: valid mh-peto CSV and JSON contain current results', async () => {
  const h = harness({ app: true }), result = h.window._almLastMhPeto();
  assert.equal(result.k, 2);
  assert.ok(Number.isFinite(result.mh_est));
  await h.click('csv');
  await h.click('json');
  assert.equal(h.downloads.length, 2);
  assert.equal(h.downloads[0].name, 'mhpeto-results.csv');
  assert.ok((await h.downloads[0].blob.text()).split('\r\n').includes('mh_est,' + result.mh_est));
  assert.equal(h.downloads[1].name, 'mhpeto-results.json');
  assert.deepEqual(JSON.parse(await h.downloads[1].blob.text()), JSON.parse(JSON.stringify(result)));
});

test('P10-R3 plant: CSV refuses a run with fewer than two studies', async () => {
  const h = harness({ app: true });
  await h.run('Alpha, 3, 50, 8, 50');
  assert.equal(h.window._almLastMhPeto(), null);
  await h.click('csv');
  refused(h);
});

test('P10-R3 plant: a successful retry clears the explanation and exports fresh results', async () => {
  const h = harness({ app: true });
  await h.run('Broken, 51, 50, 8, 50');
  await h.click('csv');
  refused(h);
  await h.run(validInput + '\nGamma, 5, 70, 10, 70');
  assert.equal(h.window._almLastMhPeto().k, 3);
  await h.click('csv');
  assert.equal(h.downloads.length, 1);
  assert.equal(h.status.textContent, '');
  assert.ok((await h.downloads[0].blob.text()).split('\r\n').includes('k,3'));
});

test('P10-R3 control: valid JSON still obtains a TruthCert receipt', async () => {
  const h = harness({ results: payload, receipt: true });
  await h.click('json');
  assert.equal(h.reads, 1);
  assert.equal(h.receiptReads, 1);
  assert.equal(h.signatures, 1);
  assert.equal(h.downloads.length, 1);
  assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()), { ...payload, _truthcert: { id: 'test-receipt' } });
});

test('P10-R3 control: an empty object retains its existing CSV behavior', async () => {
  const h = harness({ results: {} });
  await h.click('csv');
  assert.equal(h.downloads.length, 1);
  assert.equal(await h.downloads[0].blob.text(), 'key,value');
});
