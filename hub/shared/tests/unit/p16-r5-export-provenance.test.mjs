import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('nma-inconsistency/index.html');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = inline.find(code => code.includes('function nodeSplit('));
const wiring = inline.find(code => code.includes('basename:"nma-inconsistency"'));
const actions = ['json', 'csv', 'md', 'report-txt', 'report-md'];
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the real engine, export wiring and serializer with a minimal DOM.
// Downloads stay in memory; this is Node execution, not browser/layout evidence.
function harness({ loadBuild = true } = {}) {
  const elements = [], downloads = [], blobs = new Map();
  function element(tag = 'div') {
    const el = {
      tag, id: '', style: {}, value: '', innerHTML: '', textContent: '',
      listeners: new Map(), buttons: new Map(),
      setAttribute(key, value) { this[key] = value; },
      appendChild(child) { child.parentNode = this; },
      removeChild(child) { child.parentNode = null; },
      insertBefore(child) { this.appendChild(child); },
      addEventListener(type, fn) { this.listeners.set(type, fn); },
      querySelector(selector) {
        const action = selector.match(/^\[data-action="([\w-]+)"\]$/)?.[1];
        if (!action || !this.innerHTML.includes(`data-action="${action}"`)) return null;
        if (!this.buttons.has(action)) this.buttons.set(action, element('button'));
        return this.buttons.get(action);
      },
      async click() {
        if (tag === 'a') downloads.push({ blob: blobs.get(this.href), name: this.download });
        else await this.listeners.get('click')?.();
      },
    };
    elements.push(el);
    return el;
  }
  // Script assignments (e.g. m.id="alm-export-mount") are not existing DOM nodes.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) element().id = match[1];
  const body = element('body');
  const selectors = {};
  for (const [selector, pattern] of [
    ['h1', /<h1>([\s\S]*?)<\/h1>/],
    ['header p', /<header>[\s\S]*?<p>([\s\S]*?)<\/p>/],
    ['footer', /<footer>([\s\S]*?)<\/footer>/],
    ['main', /<main\b[^>]*>([\s\S]*?)<\/main>/],
  ]) {
    selectors[selector] = element();
    selectors[selector].textContent = html.match(pattern)[1].replace(/<[^>]+>/g, '');
    body.appendChild(selectors[selector]);
  }
  const document = {
    readyState: 'complete', title: 'NMA Inconsistency', body, head: element('head'),
    createElement: element,
    getElementById: id => elements.find(el => el.id === id) || null,
    querySelector: selector => selectors[selector] || null,
  };
  document.getElementById('src').value = html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  document.getElementById('f-model').value = 'FE';
  const c = vm.createContext({ document, Blob, console, setTimeout: () => 0,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL() {},
    },
  });
  c.window = c;
  assert.ok(engine && wiring, 'real engine and export wiring must be present');
  if (loadBuild) {
    assert.match(html, /<script src="\.\.\/shared\/build-info\.js"><\/script>/);
    vm.runInContext(read('shared/build-info.js'), c);
  }
  vm.runInContext(engine, c);
  vm.runInContext(read('hub/shared/results-export.js'), c);
  vm.runInContext(wiring, c);
  return {
    c, document,
    async download(action, target = document.getElementById('alm-export-mount')) {
      const before = downloads.length;
      const button = target.querySelector(`[data-action="${action}"]`);
      assert.ok(button, `export button ${action} exists`);
      await button.click();
      assert.equal(downloads.length, before + 1, 'one download per click');
      const { blob, name } = downloads.at(-1);
      return { name, type: blob.type, text: await blob.text() };
    },
  };
}

test('P16-R5 control: loaded build identity and live analysis are available', () => {
  const { c } = harness();
  assert.match(c.AlmBuildInfo.version, /^\S+$/);
  assert.match(c.AlmBuildInfo.sha, /^[0-9a-f]{40}$/);
  assert.ok(Number.isFinite(c._almLastInco().dbt.Q));
  assert.ok(c._almLastInco().nodeSplit.length > 0);
});

for (const action of ['json', 'csv', 'md']) {
  test(`P16-R5 plant: ${action} download includes explicit loaded version and full SHA provenance`, async () => {
    const h = harness(), build = h.c.AlmBuildInfo;
    const { text } = await h.download(action);
    if (action === 'json') {
      const provenance = JSON.parse(text)._provenance;
      assert.ok(provenance, 'download must identify the producing application and build');
      assert.equal(provenance.app, 'nma-inconsistency');
      assert.equal(provenance.version, build.version);
      assert.equal(provenance.sha, build.sha);
    } else if (action === 'csv') {
      const lines = text.split('\r\n');
      for (const [key, value] of Object.entries({ app: 'nma-inconsistency', version: build.version, sha: build.sha })) {
        assert.ok(lines.includes(`_provenance.${key},${value}`), `CSV provenance ${key}`);
      }
    } else {
      const cells = text.split('\n').map(line => line.split('|').map(cell => cell.trim()));
      for (const [key, value] of Object.entries({ app: 'nma-inconsistency', version: build.version, sha: build.sha })) {
        assert.ok(cells.some(row => row[1] === `_provenance.${key}` && row[2] === value), `Markdown provenance ${key}`);
      }
    }
  });
}

for (const action of ['report-txt', 'report-md']) {
  test(`P16-R5 plant: ${action} identifies the loaded build in report metadata`, async () => {
    const h = harness(), build = h.c.AlmBuildInfo;
    const { text } = await h.download(action);
    const header = text.split(action === 'report-txt' ? '\nMETHODS\n' : '\n## Methods\n')[0];
    assert.ok(header.includes('Application: nma-inconsistency'));
    assert.ok(header.includes(`Application version: ${build.version}`));
    assert.ok(header.includes(`Build SHA: ${build.sha}`));
  });
}

test('P16-R5 plant: all formats read the current build identity without hardcoding it', async () => {
  const h = harness();
  h.c.AlmBuildInfo = { version: 'v-test-provenance', sha: 'abcdef0123456789abcdef0123456789abcdef01' };
  for (const action of actions) {
    const { text } = await h.download(action);
    assert.ok(text.includes(h.c.AlmBuildInfo.version), `${action} uses loaded version`);
    assert.ok(text.includes(h.c.AlmBuildInfo.sha), `${action} uses loaded SHA`);
    assert.ok(!text.includes('42a94da2110a02200d0b5bff4c56f636b9cbffa9'), `${action} has no stale SHA`);
  }
});

test('P16-R5 control: FE, DL and PM JSON data equal live state and exporting does not mutate it', async () => {
  const h = harness();
  for (const model of ['FE', 'DL', 'PM']) {
    h.document.getElementById('f-model').value = model;
    h.c.run();
    const state = h.c._almLastInco(), before = plain(state), buildBefore = plain(h.c.AlmBuildInfo);
    assert.equal(before.model, model);
    const data = JSON.parse((await h.download('json')).text);
    delete data._provenance;
    assert.deepEqual(data, before, `${model}: every exported analysis field is unchanged`);
    for (const action of actions.filter(action => action !== 'json')) {
      const { text } = await h.download(action);
      assert.ok(text.includes(String(before.dbt.Q)), `${model}/${action}: global Q`);
      assert.ok(text.includes(before.nodeSplit[0].comparison), `${model}/${action}: split result`);
    }
    assert.equal(h.c._almLastInco(), state);
    assert.deepEqual(plain(state), before);
    assert.deepEqual(plain(h.c.AlmBuildInfo), buildBefore);
  }
});

test('P16-R5 control: absent build information leaves exports usable without invented identity', async () => {
  const h = harness({ loadBuild: false });
  const data = JSON.parse((await h.download('json')).text);
  assert.deepEqual(data, plain(h.c._almLastInco()));
  for (const action of actions) {
    const { text } = await h.download(action);
    assert.doesNotMatch(text, /_provenance|Application version:|Build SHA:|undefined/);
  }
});

test('P16-R5 control: an empty result still exports no analysis', async () => {
  const h = harness();
  h.c._almLastInco = () => null;
  assert.deepEqual(JSON.parse((await h.download('json')).text), {});
  for (const action of ['report-txt', 'report-md']) {
    assert.match((await h.download(action)).text, /No results yet/);
  }
});

test('P16-R5 control: generic exports without provenance retain their payload and report header', async () => {
  const h = harness(), target = h.document.createElement('div');
  const payload = { effect: 0.25, label: '=SUM(A1:A9)' };
  h.c.alm.resultsExport({ target, basename: 'control', getResults: () => payload });
  assert.deepEqual(JSON.parse((await h.download('json', target)).text), payload);
  assert.match((await h.download('csv', target)).text, /'=SUM\(A1:A9\)/);
  for (const action of ['report-txt', 'report-md']) {
    assert.doesNotMatch((await h.download(action, target)).text, /Application version:|Build SHA:/);
  }
});
