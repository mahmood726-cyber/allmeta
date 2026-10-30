// Node DOM execution, not browser/layout evidence. Install linkedom 0.18.12 to run.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {parseHTML} = require('linkedom');
const root = path.resolve(__dirname, '../../..');
function harness({adapter = true, live = false, transformPlus = code => code} = {}) {
  const html = fs.readFileSync(path.join(root, 'nma-inconsistency/index.html'), 'utf8');
  const {document, window} = parseHTML(html);
  // LinkeDOM emits separate adjacent Text nodes for HTML entities such as
  // '&gt;'. Browser-pinned pageText treats the same visible text as one node.
  // DOM-standard normalization joins adjacent Text nodes without editing the
  // rendered characters, historical contract or clinical/numerical values.
  const textBefore = document.body.textContent;
  document.body.normalize();
  if (document.body.textContent !== textBefore)
    throw Error('DOM normalization changed source text; refused');
  const storage = new Map(), downloads = [];
  // linkedom does not implement the select value setter or browser disabled properties.
  for (const el of document.querySelectorAll('select')) Object.defineProperty(el, 'value', {
    get() { return this.querySelector('option[selected]')?.value || this.options[0]?.value; },
    set(value) { for (const o of this.options) { if (o.value === value) o.setAttribute('selected', ''); else o.removeAttribute('selected'); } }
  });
  for (const el of document.querySelectorAll('input,select,textarea,button')) {
    el.disabled = false; el.readOnly = false;
  }
  Object.defineProperty(document, 'readyState', {value: 'complete'});
  const c = {document, console, Blob, TextEncoder, TextDecoder, crypto: require('node:crypto').webcrypto,
    structuredClone, Event: window.Event, NodeFilter: {SHOW_TEXT: 4},
    MutationObserver: class { observe() {} disconnect() {} },
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k)},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URL: {createObjectURL: b => {downloads.push(b); return 'blob:node';}, revokeObjectURL() {}},
    AlmValidate: {mount: () => ({})}, location: {protocol: 'file:'}, addEventListener() {}, removeEventListener() {}};
  let now = 0, nextTimer = 0;
  const timers = new Map();
  async function advance(ms) {
    const end = now + ms;
    await Promise.resolve();
    for (;;) {
      const item = [...timers].sort((a, b) => a[1].at - b[1].at).find(x => x[1].at <= end);
      if (!item) break;
      const [id, timer] = item;
      timers.delete(id); now = timer.at; timer.fn();
      await Promise.resolve();
    }
    now = end;
  }
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const s of document.querySelectorAll('script')) {
    const src = s.getAttribute('src');
    if (src && /chart-export-auto|alm-validate\.js/.test(src)) continue;
    if (src && /validate\/(adapter|live)\.js/.test(src) && !adapter) continue;
    let code = src ? fs.readFileSync(path.resolve(root, 'nma-inconsistency', src), 'utf8') : s.textContent;
    if (src === 'plus-ui.js') {
      if (live) {
        c.MutationObserver = window.MutationObserver;
        c.setTimeout = (fn, ms = 0) => { const id = ++nextTimer; timers.set(id, {fn, at: now + ms}); return id; };
        c.clearTimeout = id => timers.delete(id);
      }
      code = transformPlus(code);
    }
    vm.runInContext(code, c, {filename: src || 'page-inline', timeout: 60000});
  }
  // The replay yields via setTimeout; only suppress page startup timers.
  // Leaving the no-op installed makes the first replay await forever.
  if (!live) { c.setTimeout = setTimeout; c.clearTimeout = clearTimeout; }
  return {c, document, storage, downloads, advance};
}
module.exports = {harness, root};
