// Executes the actual inline page engine with DOM/shared-UI plumbing only stubbed.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
module.exports = function load(page) {
  const html = fs.readFileSync(page, 'utf8'), nodes = {};
  let plotExport;
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    let content = '', value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
    nodes[m[1]] = { get value() { return value; }, set value(v) { value = String(v); }, style: {},
      get textContent() { return content; }, set textContent(v) { content = v; },
      get innerHTML() { return content; }, set innerHTML(v) { content = v; },
      addEventListener(event, fn) { this[event] = fn; } };
  }
  nodes.src.value = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
  nodes.model.value = 'FE';
  const noop = () => {};
  const window = { alm: { analysisLifecycle: run => run, csvUpload: noop, plotExport: options => { plotExport = options; },
    axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null, write: () => true, isSuspended: () => false }) } };
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], {window, document: { getElementById: id => nodes[id] }});
  return {window, nodes, get plotExport() { return plotExport; }, run(text) { nodes.src.value = text; nodes['btn-run'].click(); return window._almLastGosh(); },
    seedExtras() {
      // Execute the production extras clear() function with seeded stale DOM/state.
      // The browser suite also exercises the real extras render()/clear() lifecycle.
      function staleNode() { return { innerHTML: 'stale result', replaceChildren() { this.innerHTML = ''; } }; }
      for (const id of ['plus-status','plus-plot','plus-study','plus-het','plus-counts']) nodes[id] = staleNode();
      nodes['plus-table'] = { tBodies: [staleNode()], tHead: { rows: [staleNode()] } };
      const source = fs.readFileSync(path.join(__dirname, '../plus.js'), 'utf8');
      const clear = source.match(/^  function clear\(message=[\s\S]*?^  \}/m)[0];
      vm.runInNewContext(`let state = {k: 3}, selected = 1; const el = id => nodes[id]; ${clear}; window.AlmGoshPlus = {clear, get state() { return state; }};`, {window, nodes});
    }
  };
};
