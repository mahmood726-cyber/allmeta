import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const apps = ['bayesian-ma', 'benford-screen', 'effect-size-converter', 'evalue', 'forest-plot',
  'funnel-plot', 'gsdesign', 'living-rob-pool', 'multiplicative-nma', 'multivariate-ma', 'nmi',
  'p-curve', 'prisma-flow', 'quantile-ma', 'registry-survival', 'review-project', 'rob',
  'rob-traffic-light', 'surrogate-validation', 'transportability', 'tsa', 'workbench'];
const hook = /<script\b(?=[^>]*\bsrc="\.\.\/hub\/shared\/chart-export-auto\.js")(?=[^>]*\bdata-presets-only\b)[^>]*><\/script>/g;

test('SVG apps with bespoke export buttons load the shared preset-only hook once', () => {
  for (const app of apps) {
    const html = readFileSync(new URL(`../../../../${app}/index.html`, import.meta.url), 'utf8');
    assert.equal([...html.matchAll(hook)].length, 1, app);
    const missing = html.replace(hook, ''); // planted omitted integration
    assert.equal([...missing.matchAll(hook)].length, 0, app);
  }
});

// The registry owns discovery now; exercise the real shared module instead of
// mocking per-chart mounts. Source hosts, stale handles and cleanup stay pinned.
function fixture(auto = true, transform = source => source) {
  const timers = [], pageEvents = {}, downloads = [], urls = new Map();
  class DownloadURL extends URL {
    static createObjectURL(blob) { const url = 'blob:fixture-' + urls.size; urls.set(url, blob); return url; }
    static revokeObjectURL(url) { urls.delete(url); }
  }
  class Element {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.parentNode = null; this.id = ''; this.attributes = {}; this.events = {}; this.text = ''; }
    get isConnected() { return this === body || this === head || !!this.parentNode?.isConnected; }
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
    insertBefore(el, next) {
      el.remove();
      const at = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(at, 0, el); el.parentNode = this; return el;
    }
    appendChild(el) { return this.insertBefore(el, null); }
    append(...els) { els.forEach(el => this.appendChild(el)); }
    attachShadow() { this.shadowRoot = new Element('shadow-root'); return this.shadowRoot; }
    remove() {
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    set textContent(value) { this.children.forEach(el => { el.parentNode = null; }); this.children = []; this.text = value; }
    get textContent() { return this.text + this.children.map(el => el.textContent).join(''); }
    hasAttribute(key) { return key in this.attributes; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    matches(selector) { return selector.split(',').some(part => {
      const s = part.trim(); return s[0] === '#' ? this.id === s.slice(1) : s[0] === '.' ? (this.className || '').split(' ').includes(s.slice(1)) : this.tagName === s;
    }); }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(el => [...(el.matches(selector) ? [el] : []), ...el.querySelectorAll(selector)]); }
    addEventListener(type, fn) { this.events[type] = fn; }
    dispatchEvent(event) { this.events[event.type]?.(event); }
    click() { downloads.push(this.href); }
    get options() { return this.children; }
    getBoundingClientRect() { return { width: 300, height: 150 }; }
  }
  const body = new Element('body'), head = new Element('head'), host = new Element('main'), first = new Element('svg');
  body.appendChild(host); host.appendChild(first);
  const document = {
    body, head, readyState: 'loading', addEventListener() {},
    currentScript: { src: 'https://example.org/hub/shared/chart-export-auto.js', hasAttribute: key => key === 'data-presets-only' },
    createElement: tag => new Element(tag), getElementById: id => body.querySelectorAll('#' + id)[0],
    querySelectorAll: selector => body.querySelectorAll(selector)
  };
  const window = { document, requestAnimationFrame() {}, addEventListener(type, fn) { pageEvents[type] = fn; },
    Event: class { constructor(type) { this.type = type; } } };
  const context = vm.createContext({ window, document, location: { pathname: '/fixture/index.html' }, URL: DownloadURL,
    setTimeout: fn => timers.push(fn) });
  vm.runInContext(transform(readFileSync(new URL('../../../../shared/alm-figpresets.js', import.meta.url), 'utf8')), context);
  if (auto) vm.runInContext(readFileSync(new URL('../../chart-export-auto.js', import.meta.url), 'utf8'), context);
  return { window, document, body, host, first, Element, timers, pageEvents, downloads, urls, scan: window.AlmFigPresets.scan };
}

// Explicit composed-tree lookup for the form's own controls. document selectors
// deliberately retain native light-DOM semantics, as the apps' autosave does.
function composed(root, selector) {
  return root.children.flatMap(el => [
    ...(el.matches(selector) ? [el] : []), ...composed(el, selector),
    ...(el.shadowRoot ? composed(el.shadowRoot, selector) : [])
  ]);
}

test('preset controls cannot enter document-wide autosave or validation snapshots', () => {
  const { window, document, body, host, first, scan } = fixture(false);
  const input = document.createElement('input'); input.id = 'study-data'; input.value = '1,2'; host.appendChild(input);
  const snapshot = () => body.querySelectorAll('input, select').map(el => [el.id, el.value]);
  const before = snapshot();
  window.AlmFigPresets.register({ target: host, plots: [{ id: 'chart', getSvg: () => first }] }); scan();
  const panel = body.querySelectorAll('.alm-figpresets')[0];
  assert.equal(composed(panel, 'input, select').length, 7, 'all seven native controls remain usable');
  assert.deepEqual(snapshot(), before);
  const journal = composed(panel, 'select')[0]; journal.value = 'bmj'; journal.dispatchEvent({ type: 'change' });
  assert.deepEqual(snapshot(), before);
  // Plant the exact failure: a preset input in the document enters the snapshot.
  const plant = document.createElement('input'); plant.id = 'alm-fig-plant'; panel.appendChild(plant);
  assert.notDeepEqual(snapshot(), before); plant.remove(); assert.deepEqual(snapshot(), before);
});

test('fallback panel has a named landmark and publishes status only for an export action', async () => {
  const { window, body, scan } = fixture(); scan();
  const panel = body.querySelectorAll('.alm-figpresets')[0];
  const owner = panel.parentNode;
  assert.equal(owner.getAttribute('role'), 'region');
  assert.equal(owner.getAttribute('aria-label'), 'Journal figure export');
  owner.removeAttribute('role'); assert.notEqual(owner.getAttribute('role'), 'region');
  owner.setAttribute('role', 'region'); assert.equal(owner.getAttribute('role'), 'region');
  const status = panel.querySelectorAll('p').find(el => el.getAttribute('aria-live') === 'polite');
  assert.ok(status); assert.equal(status.getAttribute('role'), null);
  // Plant the old empty status: legacy page-wide status lookups become ambiguous.
  status.setAttribute('role', 'status'); assert.equal(status.getAttribute('role'), 'status'); status.removeAttribute('role');
  window.alm.plotExport = { artifact: async () => { throw new Error('Probe failure'); } };
  await panel.querySelectorAll('button')[0].events.click();
  assert.equal(status.getAttribute('role'), 'status'); assert.match(status.textContent, /Probe failure/);
});

test('isolated controls disable during export and recover without duplicate requests', async () => {
  const { window, body, scan } = fixture(); scan();
  const panel = body.querySelectorAll('.alm-figpresets')[0];
  const controls = composed(panel, 'input, select, button');
  assert.equal(controls.length, 8);
  let release, calls = 0;
  window.alm.plotExport = { artifact: () => { calls++; return new Promise((resolve, reject) => { release = () => reject(new Error('Probe failure')); }); } };
  const button = panel.querySelectorAll('button')[0], pending = button.events.click();
  await Promise.resolve();
  assert.equal(calls, 1); assert.equal(controls.every(el => el.disabled), true);
  // Plant a control missed by the old light-DOM disabling query.
  controls[0].disabled = false; assert.equal(controls.every(el => el.disabled), false); controls[0].disabled = true;
  await button.events.click(); assert.equal(calls, 1);
  release(); await pending;
  assert.equal(controls.every(el => !el.disabled), true);
});

test('preset-only scanning keeps source hosts clean and drops detached chart controls', async () => {
  const { window, document, body, host, first, Element, scan } = fixture();
  scan(); scan();
  const panels = () => body.querySelectorAll('.alm-figpresets');
  assert.equal(panels().length, 1);
  assert.deepEqual(host.children, [first]);
  const seen = [];
  window.alm.plotExport = { artifact: async plot => { seen.push(plot.getSvg()); throw new Error('Probe complete'); } };
  await panels()[0].querySelectorAll('button')[0].events.click();
  assert.equal(seen.pop(), first);
  const oldPanel = panels()[0], featureHost = document.getElementById('alm-features');
  assert.equal(oldPanel.closest('#alm-features'), featureHost);
  assert.equal(featureHost.parentNode, body);
  assert.equal(oldPanel.closest('main'), null);
  // Plant UI inside the source host: it violates the exact original container.
  host.insertBefore(oldPanel, first);
  assert.notDeepEqual(host.children, [first]);
  scan(); // The shared owner repairs misplaced controls outside main.
  assert.deepEqual(host.children, [first]);
  const previousPanel = panels()[0];
  first.remove();
  await previousPanel.querySelectorAll('button')[0].events.click();
  assert.equal(seen.pop(), null);
  const second = new Element('svg'); host.appendChild(second);
  scan();
  assert.equal(previousPanel.isConnected, false);
  assert.equal(panels().length, 1);
  assert.equal(panels()[0].querySelectorAll('button').length, 1);
  await panels()[0].querySelectorAll('button')[0].events.click();
  assert.equal(seen.pop(), second);
  assert.deepEqual(host.children, [second]);
  assert.equal(body.children.length, 2);
  second.remove(); scan();
  assert.equal(panels().length, 0);
  assert.deepEqual(host.children, []);
  assert.deepEqual(featureHost.children, []);
});

test('registration aggregates both plots, preserves settings, and removes detached owners', () => {
  const { window, body, host, first, Element, scan } = fixture(false);
  const second = new Element('svg'); host.appendChild(second);
  window.AlmFigPresets.register({ target: host, plots: [{ id: 'first', getSvg: () => first }, { id: 'second', getSvg: () => second }] });
  scan();
  const panel = () => body.querySelectorAll('.alm-figpresets')[0];
  // Repeated registration updates the same owner instead of duplicating controls.
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 1);
  assert.equal(panel().querySelectorAll('button').length, 2);
  const select = composed(panel(), 'select')[0];
  select.value = 'bmj'; select.dispatchEvent({ type: 'change' });
  window.AlmFigPresets.register({ target: host, plots: [{ id: 'first', getSvg: () => first }, { id: 'second', getSvg: () => second }] });
  scan();
  assert.equal(composed(panel(), 'select')[0].value, 'bmj');
  assert.equal(panel().querySelectorAll('button').length, 2);
  host.remove(); scan();
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 0);
});


test('discovery never calls an app export getter (it may re-render or refuse)', () => {
  const { window, body, host, scan } = fixture(false);
  let calls = 0;
  window.AlmFigPresets.register({ target: host, plots: [{ id: 'guarded', getSvg: () => {
    calls++; throw new Error('No valid results to export');
  } }] });
  assert.doesNotThrow(() => { scan(); scan(); });
  assert.equal(calls, 0);
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 1);
  assert.equal(body.querySelectorAll('.alm-figpresets')[0].querySelectorAll('button').length, 1);
});


test('automatic source lifetime removes a stale preset without changing the original bar', () => {
  const { window, body, host, first, scan } = fixture(false);
  let connected = true;
  window.AlmFigPresets.register({ target: host, isCurrent: () => connected,
    plots: [{ id: 'chart', getSvg: () => { throw new Error('Must not read source while scanning'); } }] });
  scan();
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 1);
  connected = false; scan();
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 0);
  assert.equal(host.isConnected, true);
  assert.deepEqual(host.children, [first]);
});

test('redrawing a chart preserves the validation input fingerprint without synthetic edits', () => {
  const { window, document, body, host, first, scan } = fixture(false);
  const register = () => window.AlmFigPresets.register({ target: host,
    plots: [{ id: 'chart', getSvg: () => first }] });
  register(); scan();
  const fields = () => composed(body, 'input, select');
  const fingerprint = () => JSON.stringify(fields().map(el => [el.id, el.value, el.checked]));
  fields()[0].value = 'bmj'; fields()[0].dispatchEvent({ type: 'change' });
  fields()[1].value = 'double'; fields()[1].dispatchEvent({ type: 'change' });
  fields()[2].value = '125'; fields()[3].value = '1300';
  fields()[4].value = 'Arial'; fields()[5].value = '9'; fields()[6].value = 'tiff';
  const before = fingerprint();
  // The validator captures change events even when they do not bubble.
  let syntheticEdits = 0;
  window.Event = class { constructor(type) { this.type = type; syntheticEdits++; } };
  register(); scan(); scan();
  assert.equal(fingerprint(), before);
  assert.equal(syntheticEdits, 0);
  assert.match(body.querySelectorAll('.alm-figpresets-verification')[0].textContent, /^BMJ:/);
  // Plant the original ID churn: an otherwise identical form is a different revision.
  const field = fields()[0], savedId = field.id;
  field.id += '-replacement'; assert.notEqual(fingerprint(), before);
  field.id = savedId; assert.equal(fingerprint(), before);
  // Independent mounts must still have distinct native label associations.
  const other = document.createElement('div'); body.appendChild(other);
  window.AlmFigPresets.mount({ target: other, plots: [] });
  assert.equal(new Set(fields().map(el => el.id)).size, fields().length);
});

test('settings survive an empty discovery frame, while stale exports stay removed', () => {
  const { body, host, first, Element, scan } = fixture();
  scan();
  const fields = () => composed(body, 'input, select');
  fields()[0].value = 'bmj'; fields()[0].dispatchEvent({ type: 'change' });
  fields()[2].value = '125'; fields()[3].value = '1300';
  fields()[4].value = 'Arial'; fields()[5].value = '9'; fields()[6].value = 'tiff';
  const snapshot = () => fields().map(el => [el.id, el.value]);
  const before = snapshot();
  first.remove(); scan(); scan();
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 0);
  const replacement = new Element('svg'); host.appendChild(replacement); scan();
  assert.deepEqual(snapshot(), before);
  assert.equal(body.querySelectorAll('.alm-figpresets').length, 1);
  // Plant the reset observed in the browser: 125 mm silently becomes 85 mm.
  fields()[2].value = '85'; assert.notDeepEqual(snapshot(), before);
  fields()[2].value = '125'; assert.deepEqual(snapshot(), before);
});

test('download URLs survive delayed consumption and bfcache, then release on document exit', async () => {
  async function exported(transform) {
    const f = fixture(true, transform); f.scan();
    const blob = { size: 44_356_346 };
    f.window.alm.plotExport = { artifact: async () => blob };
    await f.body.querySelectorAll('.alm-figpresets')[0].querySelectorAll('button')[0].events.click();
    assert.equal(f.downloads.length, 1);
    // Consume only after every scheduled timer. No transfer deadline is safe.
    f.timers.forEach(fn => fn());
    return { ...f, blob, url: f.downloads[0] };
  }
  const control = await exported();
  assert.equal(control.urls.get(control.url), control.blob);
  control.pageEvents.pagehide({ persisted: true });
  assert.equal(control.urls.get(control.url), control.blob);
  control.pageEvents.pagehide({ persisted: false });
  assert.equal(control.urls.size, 0);
  const plant = await exported(source => source.replace('link.click();',
    'link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1500);'));
  assert.equal(plant.urls.has(plant.url), false, 'the original timer invalidates a delayed download');
});
