import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const html = source('dta-sroc/index.html');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('const LS_KEY = "dta-sroc-v1"'));
if (!main) throw new Error('DTA main script not found');

// Run the actual app, lifecycle, numerical engine and download handlers without
// a browser. Only DOM/storage and unrelated UI modules are substituted.
export function harness({ faganHost = true } = {}) {
  const nodes = new Map(), blobs = new Map(), downloads = [];
  function element(id = '', tagName = 'DIV') {
    const children = new Map(), handlers = new Map();
    return {
      id, tagName, value: '', textContent: '', innerHTML: '', hidden: false,
      classList: { add() {}, remove() {} },
      appendChild() {}, removeChild() {},
      addEventListener(type, handler) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(handler);
      },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element(selector, 'BUTTON'));
        return children.get(selector);
      },
      async click() {
        if (this.tagName === 'A') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        for (const handler of handlers.get('click') || []) await handler({ target: this });
      },
    };
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(id, element(id));
  for (const id of ['f-method', 'f-cc', 'f-cov', 'f-example']) nodes.get(id).tagName = 'SELECT';
  for (const [id, value] of Object.entries({ 'f-method': 'reml', 'f-cc': 'all', 'f-example': 'generic' })) nodes.get(id).value = value;
  if (!faganHost) nodes.delete('fagan-host');
  const document = {
    title: 'DTA SROC Explorer', head: element(), body: element(),
    getElementById: id => nodes.get(id) || null,
    createElement: tag => element('', tag.toUpperCase()),
    addEventListener() {},
    querySelectorAll: selector => selector === '[id^="f-"]'
      ? [...nodes.values()].filter(e => e.id.startsWith('f-')) : [],
    querySelector(selector) {
      if (!selector.startsWith('#')) return null;
      const [id, ...rest] = selector.slice(1).split(' '), node = nodes.get(id);
      return node && rest.length ? node.querySelector(rest.join(' ')) : node || null;
    },
  };
  const urlState = Object.assign(() => {}, { read: () => null, write() {} });
  const context = vm.createContext({
    document, Blob, console, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {} }, setTimeout() {},
    URL: {
      createObjectURL(blob) { const id = 'blob:' + blobs.size; blobs.set(id, blob); return id; },
      revokeObjectURL() {},
    },
    alm: { csvUpload() {}, axisControls() {}, resetUndo() {}, tooltips() {}, plotExport() {}, urlState },
  });
  context.window = context;
  for (const path of ['shared/dta-bivariate.js', 'hub/shared/results-export.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(source(path), context, { filename: path });
  }
  vm.runInContext(main, context, { filename: 'dta-sroc/index.html' });
  return {
    context, nodes,
    result: () => JSON.parse(JSON.stringify(context.__almResults())),
    restore: state => context.__almRestore(state),
    async download(action) {
      const count = downloads.length;
      await nodes.get('alm-export-mount').querySelector(`[data-action="${action}"]`).click();
      if (downloads.length !== count + 1) throw new Error('Expected one download');
      const last = downloads.at(-1);
      return { name: last.name, text: await last.blob.text() };
    },
  };
}
