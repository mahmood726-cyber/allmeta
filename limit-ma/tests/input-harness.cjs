// Actual page and sensitivity engines; only DOM/shared UI plumbing is stubbed.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function parser(html) {
  const source = html.match(/    function parse\(text\) \{[\s\S]*?\n    \}/)[0];
  return vm.runInNewContext('(' + source.trim() + ')');
}
function load(page = process.env.LIMIT_MA_PAGE || path.join(root, 'index.html'), plusFile = process.env.LIMIT_MA_PLUS_UI) {
  const html = fs.readFileSync(page, 'utf8'), nodes = {};
  function node(tag = 'div') {
    let content = '';
    return {tag, value: '', attrs: {}, dataset: {}, style: {}, parentNode: {}, children: [], checked: true,
      get innerHTML() { return content + this.children.map(n => typeof n === 'string' ? n : n.innerHTML).join(''); },
      set innerHTML(v) { content = v; this.children = []; },
      get textContent() { return this.innerHTML; }, set textContent(v) { this.innerHTML = v; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { content = ''; this.children = children; },
      querySelectorAll() { return []; },
      addEventListener(event, fn) { this[event] = fn; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }};
  }
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes[m[1]] = node(); nodes[m[1]].value = m[0].match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = {getElementById: id => nodes[id], querySelectorAll: () => [],
    createElement: node, createElementNS: (_, tag) => node(tag), createTextNode: text => text};
  const noop = () => {};
  const alm = {analysisLifecycle: run => run, csvUpload: noop, plotExport: o => { alm.plotOptions = o; },
    axisControls: noop, resultsExport: o => { alm.exportOptions = o; }, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, {read: () => null})};
  const window = {alm};
  const context = vm.createContext({window, document, structuredClone, console});
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  for (const file of ['../shared/ma-core.js', '../shared/trimfill.js', '../shared/selmodel.js', 'plus-opt.js', 'plus-selmodel.js', 'plus.js', 'plus-ui.js']) {
    vm.runInContext(fs.readFileSync(file === 'plus-ui.js' && plusFile ? plusFile : path.join(root, file), 'utf8'), context, {filename: file});
    Object.assign(context, window);
  }
  return {window, nodes, html, parse: parser(html),
    run(text) { nodes.src.value = text; nodes['btn-run'].click(); return window._almLastLimit(); }};
}
module.exports = {load, parser};
