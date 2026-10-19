// Node DOM execution, not browser/layout evidence. Install linkedom 0.18.12 to run.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {parseHTML} = require('linkedom');
const root = path.resolve(__dirname, '../../..');
function harness({adapter = true} = {}) {
  const html = fs.readFileSync(path.join(root, 'nma-inconsistency/index.html'), 'utf8');
  const {document, window} = parseHTML(html);
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
  c.window = c; c.globalThis = c; vm.createContext(c);
  for (const s of document.querySelectorAll('script')) {
    const src = s.getAttribute('src');
    if (src && /chart-export-auto|alm-validate\.js/.test(src)) continue;
    if (src && /validate\/(adapter|live)\.js/.test(src) && !adapter) continue;
    const code = src ? fs.readFileSync(path.resolve(root, 'nma-inconsistency', src), 'utf8') : s.textContent;
    vm.runInContext(code, c, {filename: src || 'page-inline', timeout: 60000});
  }
  return {c, document, storage, downloads};
}
module.exports = {harness, root};
