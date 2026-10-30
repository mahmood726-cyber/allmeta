import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('effect-size-converter/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const plain = value => JSON.parse(JSON.stringify(value));
const study = { m1: 52.5, sd1: 8.2, n1: 30, m2: 47.1, sd2: 7.9, n2: 30 };
const formats = {
  json: ['.json', 'application/json'],
  csv: ['.csv', 'text/csv'],
  md: ['.md', 'text/markdown'],
  'report-md': ['-report.md', 'text/markdown'],
  'report-txt': ['-report.txt', 'text/plain'],
};

// Run the unmodified page's conversion and adapter scripts plus its real export
// and URL modules. Only DOM/download plumbing and unrelated UI mounts are faked.
// Blobs stay in memory: no browser, network, output files, or dependency packages.
function harness({ build = true, hash = '' } = {}) {
  const elements = new Map(), blobs = new Map(), downloads = [];
  function element(tag = 'div') {
    const listeners = new Map(), buttons = new Map();
    return {
      value: '', innerHTML: '', textContent: '', children: [],
      appendChild(child) { this.children.push(child); },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
      setAttribute(key, value) { this[key] = value; },
      addEventListener(event, fn) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
      },
      async click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        for (const fn of listeners.get('click') || []) await fn();
      },
      querySelector(selector) {
        const action = /^\[data-action="([^"]+)"\]$/.exec(selector)?.[1];
        if (!action || !this.innerHTML.includes(`data-action="${action}"`)) return null;
        if (!buttons.has(action)) buttons.set(action, element('button'));
        return buttons.get(action);
      },
    };
  }
  for (const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const el = element(match[1]);
    el.value = /\bvalue="([^"]*)"/.exec(match[0])?.[1] || '';
    elements.set(match[2], el);
  }
  for (const match of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    elements.get(match[1]).value = /<option\b[^>]*\bvalue="([^"]*)"/.exec(match[2])?.[1] || '';
  }
  const document = {
    title: 'Effect-Size Converter', readyState: 'complete', head: element(), body: element(),
    getElementById: id => elements.get(id) || null,
    createElement: element,
    querySelector(selector) {
      if (/^#[\w-]+$/.test(selector)) return elements.get(selector.slice(1)) || null;
      const markup = { h1: /<h1>([\s\S]*?)<\/h1>/, 'header p': /<header>[\s\S]*?<p>([\s\S]*?)<\/p>/,
        footer: /<footer>([\s\S]*?)<\/footer>/ }[selector];
      return markup ? { textContent: markup.exec(html)[1].replace(/<[^>]*>/g, '') } : null;
    },
  };
  let csvOptions;
  const context = vm.createContext({
    document, console, Blob,
    URL: {
      createObjectURL(blob) { const id = `blob:test-${blobs.size}`; blobs.set(id, blob); return id; },
      revokeObjectURL() {},
    },
    setTimeout() {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    location: { hash },
    alm: {
      csvUpload(opts) { csvOptions = opts; },
      axisControls() {},
      // CSV import calls this public method before it populates any fields.
      resetUndo: Object.assign(function () {}, { snapshot() {} }),
      tooltips() {},
    },
  });
  context.window = context;
  for (const path of ['shared/effect-size-accuracy.js', 'hub/shared/results-export.js',
    'hub/shared/url-state.js', ...(build ? ['shared/build-info.js'] : [])]) {
    assert.ok(html.includes(`src="../${path}"`), `${path} must be loaded by the page`);
    vm.runInContext(read(path), context, { filename: path });
  }
  for (const marker of ['function convert(', 'window.__almResults = function']) {
    const matches = scripts.filter(source => source.includes(marker));
    assert.equal(matches.length, 1, `one complete inline script for ${marker}`);
    vm.runInContext(matches[0], context, { filename: 'effect-size-converter/index.html' });
  }
  return {
    context,
    set(id, value) { assert.ok(elements.has(id), id); elements.get(id).value = String(value); },
    import(row = study) {
      csvOptions.onParse({ rows: [row] });
      assert.doesNotMatch(elements.get('warn-slot').innerHTML, /CSV rejected:/,
        'CSV import must finish before export assertions');
      assert.equal(elements.get('in-type').value, 'SMD', 'CSV import selected SMD');
      assert.equal(elements.get('der-n1').value, String(row.n1), 'CSV import populated n1');
      assert.equal(elements.get('der-n2').value, String(row.n2), 'CSV import populated n2');
    },
    results() { return plain(context.__almResults()); },
    async download(format) {
      const button = elements.get('alm-export-mount').querySelector(`[data-action="${format}"]`);
      assert.ok(button, `real ${format} export button`);
      const count = downloads.length;
      await button.click();
      assert.equal(downloads.length, count + 1, 'one actual download');
      const { name, blob } = downloads.at(-1);
      return { name, type: blob.type, text: await blob.text() };
    },
  };
}

function field(text, format, key, value) {
  if (format === 'json') {
    const actual = key.split('.').reduce((obj, part) => obj?.[part], JSON.parse(text));
    assert.equal(actual, value, key);
  } else if (format === 'csv') {
    assert.ok(text.split('\r\n').includes(`${key},${value}`), `${key}=${value} in CSV`);
  } else if (format === 'report-txt') {
    assert.ok(text.split('\n').includes(`${key}: ${value}`), `${key}=${value} in plain report`);
  } else {
    assert.ok(text.split('\n').some(line => {
      const cells = line.split('|').map(cell => cell.trim());
      return cells[1] === key && cells[2] === String(value);
    }), `${key}=${value} in Markdown table`);
  }
}

for (const format of Object.keys(formats)) {
  test(`plant P20-R4: ${format} retains both group sizes after 30-per-group CSV import`, async () => {
    const h = harness(); h.import();
    const out = await h.download(format);
    field(out.text, format, 'n1', 30);
    field(out.text, format, 'n2', 30);
  });

  test(`plant P20-R4: ${format} retains the complete loaded build identity`, async () => {
    const h = harness(); h.import();
    const identity = plain(h.context.AlmBuildInfo);
    assert.ok(identity.version && identity.sha && identity.builtAt, 'real build module loaded');
    const out = await h.download(format);
    for (const [key, value] of Object.entries(identity)) field(out.text, format, `build.${key}`, value);
  });

  test(`control: ${format} downloads keep existing schema, input values and conversion rows`, async () => {
    const h = harness(); h.import();
    const displayed = plain(h.context.__almResultRows);
    const out = await h.download(format);
    assert.equal(out.name, `effect-size-converter-results${formats[format][0]}`);
    assert.equal(out.type, formats[format][1]);
    if (format !== 'report-txt') field(out.text, format, '_schema', 'esc-results-v1');
    field(out.text, format, 'type', 'SMD');
    field(out.text, format, 'smd_estimator', 'g');
    field(out.text, format, 'input_estimate', Number(h.context.__almSnapshot()['in-est']));
    field(out.text, format, 'input_se', Number(h.context.__almSnapshot()['in-se']));
    assert.ok(displayed.length > 0, 'import produced actual results');
    if (format === 'json') {
      assert.deepEqual(JSON.parse(out.text).rows, displayed.map(r => ({
        scale: r.scale, point: r.point, se: r.se, ci_lower: r.lo ?? null,
        ci_upper: r.hi ?? null, note: r.note || '',
      })));
    } else {
      assert.ok(out.text.includes('SMD (Hedges\' g)'), 'converted row is present');
      assert.ok(out.text.includes(String(displayed[0].point)), 'full precision point retained');
    }
  });
}

test('plant P20-R4: manually entered unequal group sizes survive URL restore and JSON export', async () => {
  const h = harness();
  h.set('in-type', 'SMD'); h.set('in-smd-kind', 'd');
  h.set('der-n1', 23); h.set('der-n2', 47);
  h.context.alm.urlState.write(h.context.__almSnapshot());
  const restored = harness({ hash: h.context.location.hash });
  const out = JSON.parse((await restored.download('json')).text);
  assert.equal(out.n1, 23);
  assert.equal(out.n2, 47);
});

test('plant P20-R4: blank sizes and unavailable build identity export as explicit nulls', async () => {
  const h = harness({ build: false });
  const out = JSON.parse((await h.download('json')).text);
  assert.equal(out.n1, null);
  assert.equal(out.n2, null);
  assert.equal(out.build, null);
  h.set('der-n1', 23);
  const partial = JSON.parse((await h.download('json')).text);
  assert.equal(partial.n1, 23);
  assert.equal(partial.n2, null);
});

test('plant P20-R4: exports read current build metadata without hard-coded identity', async () => {
  const h = harness();
  const alternate = { app: 'allmeta', version: 'test-next', sha: 'different-test-sha',
    shortSha: 'differe', builtAt: '2001-02-03T04:05:06Z', url: 'https://example.invalid/' };
  h.context.AlmBuildInfo = alternate;
  for (const format of Object.keys(formats)) {
    const out = await h.download(format);
    for (const [key, value] of Object.entries(alternate)) field(out.text, format, `build.${key}`, value);
  }
});

test('control: CSV group sizes and conversion rows already round-trip through URL state', () => {
  const h = harness(); h.import({ ...study, n1: 23, n2: 47 });
  const state = h.context.alm.urlState.read();
  assert.equal(state['der-n1'], '23');
  assert.equal(state['der-n2'], '47');
  const restored = harness({ hash: h.context.location.hash });
  assert.deepEqual(plain(restored.context.__almSnapshot()), plain(h.context.__almSnapshot()));
  assert.deepEqual(restored.results().rows, h.results().rows);
});

test('control: every format still exports when build-info is unavailable', async () => {
  const h = harness({ build: false });
  for (const format of Object.keys(formats)) {
    const out = await h.download(format);
    field(out.text, format, 'type', 'OR');
    field(out.text, format, 'input_estimate', 0.75);
    field(out.text, format, 'input_se', 0.12);
  }
});
