// Actual inline page engine in a VM, following limit-ma/tests/page-probe.cjs.
// No duplicate numerical implementation. Minimal DOM is not browser evidence.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(options = {}) {
  const html = fs.readFileSync(options.page || path.join(__dirname, '../../index.html'), 'utf8');
  const nodes = {};
  function node() {
    return {value: '', innerHTML: '', textContent: '', attrs: {}, parentNode: {}, hidden: false, disabled: false,
      addEventListener(event, fn) { const prev = this[event]; this[event] = async (...args) => { if (prev) await prev(...args); return fn(...args); }; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      removeAttribute(k) { delete this.attrs[k]; }};
  }
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)/gi)) {
    nodes[m[2]] = node(); nodes[m[2]].textContent = m[3];
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = {getElementById: id => nodes[id] || null,
    querySelectorAll: selector => {
      if (selector !== '#alm-axis-mount [data-edge="log"]') throw Error('Unexpected selector: ' + selector);
      return [node(), node()];
    }};
  const noop = () => {};
  const alm = {analysisLifecycle: run => run, csvUpload: noop, plotExport: noop, axisControls: noop,
    resultsExport: opts => { alm.exportOptions = opts; }, urlState: Object.assign(noop, {read: () => null}),
    resetUndo: noop, tooltips: noop};
  const window = {alm};
  const context = vm.createContext({window, document, structuredClone, setTimeout, Blob, URL});
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context, {filename: 'index.html:inline'});
  for (const file of ['plus-opt.js', ...(options.disabled ? [] : ['loo-limit.js'])]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../', file), 'utf8'), context, {filename: file});
  }
  return {window, nodes, html};
}
function replay(corpus) {
  const {window: w} = load(), out = [];
  for (const c of corpus) {
    const rows = c.te.map((te, i) => ({te, se: c.se[i], label: 'Study ' + (i + 1)}));
    const result = w.AlmLimitLoo.compute(rows);
    for (const row of result.rows) out.push({id: c.id, k: rows.length, ...row});
  }
  return out;
}
module.exports = {load, replay};
if (require.main === module) {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json')));
  const rows = replay(corpus), destination = process.argv[2] || path.join(__dirname, 'app.json');
  fs.writeFileSync(destination, JSON.stringify(rows, null, 2) + '\n');
  const expected = corpus.reduce((n, c) => n + c.te.length, 0);
  console.log(`${rows.length}/${expected} deletions replayed; ${rows.filter(r => r.status === 'refused').length} refused`);
  if (rows.length !== expected) process.exitCode = 1;
}
