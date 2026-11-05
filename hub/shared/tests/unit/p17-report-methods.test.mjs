import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('correlation-ma/index.html');
const plain = html => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>');
const clone = value => JSON.parse(JSON.stringify(value));

// No browser or DOM dependency: execute the real page, panel, core and exporter.
// Only element storage, events, timers and the download boundary are simulated.
function setup() {
  const nodes = new Map(), ready = [], timers = new Map(), blobs = new Map(), downloads = [];
  let timerId = 0;
  class Element {
    constructor() { this.listeners = new Map(); this.children = []; this.value = ''; }
    set innerHTML(value) {
      this.markup = value;
      for (const [, id] of value.matchAll(/\bid=['"]([^'"]+)['"]/g)) nodes.set(id, new Element());
      this.buttons = new Map([...value.matchAll(/data-action="([^"]+)"/g)].map(([, action]) => [action, new Element()]));
    }
    get innerHTML() { return this.markup || ''; }
    get textContent() { return this.text ?? plain(this.innerHTML); }
    set textContent(value) { this.text = value; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); }
    async click() {
      for (const fn of this.listeners.get('click') || []) await fn({ target: this });
      if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) });
    }
    querySelector(selector) { return this.buttons?.get(selector.match(/data-action="([^"]+)"/)?.[1]) || null; }
    appendChild(child) { this.children.push(child); }
    removeChild(child) { this.children = this.children.filter(x => x !== child); }
    setAttribute(name, value) { this[name] = value; }
  }
  const page = new Element();
  page.innerHTML = html.slice(0, html.indexOf('<script>'));
  nodes.get('f-method').value = 'REML';
  const metadata = Object.fromEntries([
    ['h1', /<h1>([\s\S]*?)<\/h1>/], ['header p', /<header>[\s\S]*?<p>([\s\S]*?)<\/p>/],
    ['footer', /<footer>([\s\S]*?)<\/footer>/],
  ].map(([selector, re]) => [selector, { textContent: plain(html.match(re)[1]) }]));
  const document = {
    readyState: 'loading', head: new Element(), body: new Element(),
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) || null : metadata[selector] || null,
    querySelectorAll: () => [], createElement: () => new Element(),
    addEventListener: (type, listener) => { assert.equal(type, 'DOMContentLoaded'); ready.push(listener); },
  };
  const ctx = vm.createContext({
    document, Blob, console, matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    URL: { createObjectURL: blob => { const url = 'blob:' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
  });
  ctx.window = ctx;
  const run = file => vm.runInContext(read(file), ctx, { filename: file });
  run('shared/ma-core.js');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx, { filename: 'correlation-ma/index.html' });
  run('hub/shared/results-export.js');
  run('correlation-ma/plus-core.js');
  run('correlation-ma/plus-ui.js');
  const flush = () => {
    for (let n = 0; timers.size; n++) {
      assert.ok(n < 100, 'timers settle');
      const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
    }
  };
  document.readyState = 'complete';
  ready.forEach(fn => fn()); flush();
  return {
    window: ctx, nodes,
    model(method) { const el = nodes.get('f-method'); el.value = method; el.dispatchEvent({ type: 'change', target: el }); flush(); },
    interval(value) { nodes.get('alm-plus').dispatchEvent({ type: 'change', target: { name: 'alm-plus-test', value } }); flush(); },
    clear() { const el = nodes.get('f-data'); el.value = ''; el.dispatchEvent({ type: 'input', target: el }); flush(); },
    async download(panel, action) {
      const mount = nodes.get(panel === 'main' ? 'alm-export-mount' : 'alm-plus-export');
      const before = downloads.length;
      await mount.querySelector(`[data-action="${action}"]`).click();
      assert.equal(downloads.length, before + 1, 'one download per click');
      const download = downloads.at(-1); flush();
      return { name: download.name, text: await download.blob.text() };
    },
  };
}

function methods(text, format) {
  const start = format === 'report-txt' ? '\nMETHODS\n' : '\n## Methods\n';
  const end = format === 'report-txt' ? '\nRESULTS\n' : '\n## Results\n';
  assert.ok(text.includes(start) && text.includes(end));
  return text.split(start)[1].split(end)[0];
}
const results = (text, format) => text.split(format === 'report-txt' ? '\nRESULTS\n' : '\n## Results\n')[1];
const formats = ['report-txt', 'report-md'];

for (const format of formats) {
  test(`plant P17-R2: main FE ${format} Methods describes fixed-effect Wald results`, async () => {
    const h = setup(); h.model('FE');
    const m = methods((await h.download('main', format)).text, format);
    assert.match(m, /under a fixed-effect \(common-effect\) model/i);
    assert.match(m, /Wald/);
    assert.doesNotMatch(m, /Random-effects pooling|HKSJ|t\(0\.975/);
  });

  test(`plant P17-R2: sensitivity HKSJ ${format} Methods describes the selection and comparison grid`, async () => {
    const h = setup(); h.interval('knha');
    const m = methods((await h.download('sensitivity', format)).text, format);
    assert.match(m, /HKSJ/);
    assert.match(m, /REML/);
    assert.match(m, /k − 1 degrees of freedom/);
    assert.match(m, /compar(?:es|ison).*REML.*PM.*DL.*FE/s);
    assert.match(m, /Wald.*HKSJ.*(?:ad-hoc|floor)/s);
    assert.doesNotMatch(m, /Random-effects pooling/);
  });

  test(`plant P17-R2: ${format} Methods follows model and interval changes after registration`, async () => {
    const h = setup();
    for (const [model, interval, estimator] of [['PM', 'adhoc', /Paule–Mandel/], ['DL', 'z', /DerSimonian–Laird/], ['FE', 'z', /fixed-effect/]]) {
      h.model(model); h.interval(interval);
      const main = methods((await h.download('main', format)).text, format);
      assert.match(main, model === 'FE' ? /fixed-effect/ : new RegExp(model));
      assert.match(main, /Wald/); assert.doesNotMatch(main, /HKSJ/);
      const panel = methods((await h.download('sensitivity', format)).text, format);
      assert.match(panel, estimator);
      if (interval === 'adhoc') assert.match(panel, /scaling factor floored at 1/);
      else assert.match(panel, /normal \(Wald\)/);
    }
  });

  test(`plant P17-R2: sensitivity FE/HKSJ ${format} Methods reports non-applicability`, async () => {
    const h = setup(); h.model('FE'); h.interval('knha');
    const m = methods((await h.download('sensitivity', format)).text, format);
    assert.match(m, /HKSJ is not applicable to the fixed-effect model/);
    assert.match(m, /compar(?:es|ison).*REML.*PM.*DL.*FE/s);
    assert.doesNotMatch(m, /confidence interval used.*HKSJ|Random-effects pooling/);
  });

  test(`plant P17-R2: empty ${format} reports do not claim a completed pooling analysis`, async () => {
    const h = setup(); h.clear();
    for (const panel of ['main', 'sensitivity']) {
      const m = methods((await h.download(panel, format)).text, format);
      assert.match(m, /(?:No .*results|Enter at least 2 studies)/i);
      assert.doesNotMatch(m, /Random-effects pooling|were transformed|confidence interval used/);
    }
  });

  test(`control: default random-effects ${format} reports retain Fisher transformation and REML`, async () => {
    const h = setup();
    for (const panel of ['main', 'sensitivity']) {
      const m = methods((await h.download(panel, format)).text, format);
      assert.match(m, /random-effects/i); assert.match(m, /Fisher/); assert.match(m, /REML/);
    }
  });
}

test('control: on-screen Methods follows selected FE, HKSJ and ad-hoc intervals', () => {
  const h = setup();
  h.model('FE'); assert.match(h.nodes.get('alm-plus-prose').innerHTML, /under a fixed-effect \(common-effect\) model/);
  h.model('REML'); h.interval('knha'); assert.match(h.nodes.get('alm-plus-prose').innerHTML, /Hartung–Knapp–Sidik–Jonkman/);
  h.interval('adhoc'); assert.match(h.nodes.get('alm-plus-prose').innerHTML, /scaling factor floored at 1/);
});

test('control: selecting HKSJ preserves main Wald results and every main export payload', async () => {
  const h = setup(), before = clone(h.window._almLastCorrMA()), exports = new Map();
  for (const format of ['json', 'csv', 'md', ...formats]) exports.set(format, await h.download('main', format));
  h.interval('knha');
  assert.deepEqual(clone(h.window._almLastCorrMA()), before);
  const panel = h.window._almCorrPlus();
  assert.notEqual(panel.cells.find(c => c.method === 'REML' && c.test === 'knha').r_lo, before.r_lo);
  for (const format of ['json', 'csv', 'md', ...formats]) {
    const after = await h.download('main', format), expected = exports.get(format);
    assert.equal(after.name, expected.name);
    assert.equal(formats.includes(format) ? results(after.text, format) : after.text,
      formats.includes(format) ? results(expected.text, format) : expected.text, format);
  }
});

function flat(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value) ? flat(value, path) : [[path, Array.isArray(value) ? JSON.stringify(value) : value]];
  });
}

test('control: both registrations export their current payload in all five formats', async () => {
  const h = setup();
  for (const [method, interval] of [['REML', 'z'], ['FE', 'z'], ['REML', 'knha']]) {
    h.model(method); h.interval(interval);
    for (const panel of ['main', 'sensitivity']) {
      const expected = clone(panel === 'main' ? h.window._almLastCorrMA() : h.window._almCorrPlus());
      assert.deepEqual(JSON.parse((await h.download(panel, 'json')).text), expected);
      for (const format of ['csv', 'md', ...formats]) {
        const download = await h.download(panel, format);
        const content = formats.includes(format) ? results(download.text, format) : download.text;
        for (const [key, value] of flat(expected)) {
          if (format === 'report-txt' && key === '_schema') continue;
          const str = String(value ?? '');
          if (format === 'csv') {
            const encoded = /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
            assert.ok(content.split('\r\n').includes(`${key},${encoded}`), `${panel} ${format} ${key}`);
          } else if (format === 'report-txt') {
            assert.ok(content.split('\n').includes(`${key}: ${str}`), `${panel} ${format} ${key}`);
          } else {
            const row = content.split('\n').find(line => line.split('|')[1]?.trim() === key);
            assert.ok(row, `${panel} ${format} ${key}`);
            assert.equal(row.split('|')[2].trim(), str, `${panel} ${format} ${key}`);
          }
        }
      }
    }
  }
});
