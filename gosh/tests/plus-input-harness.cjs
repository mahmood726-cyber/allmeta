// Production engine/capture and live currentState/buildScript, without a browser.
// Only DOM rendering/display validation is stubbed; no parsing, membership,
// arithmetic, input-vector construction or R-script generation is replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = require('./input-harness.cjs');
const app = path.join(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const data = ['0.1, 0.2, Zeta', '-0.4, 0.3, Alpha', '0.8, 0.4, Beta'];
const formats = {
  plain: data.join('\n'),
  header: 'effect, SE, label\n' + data.join('\n'),
  blank: [data[0], '', data[1], data[2]].join('\n'),
  crlf: [' ', 'yi, SE, label', data[0], ' \t', data[1], data[2], ''].join('\r\n')
};
function harness({plusSource, adapterSource} = {}) {
  const h = load(path.join(app, 'index.html'));
  for (const id of ['src', 'model', 'n-sample']) {
    let value = h.nodes[id].value;
    Object.defineProperty(h.nodes[id], 'value', {
      get: () => value, set: next => { value = String(next); }
    });
  }
  const node = () => ({value: '', textContent: '', innerHTML: '',
    replaceChildren() { this.innerHTML = ''; }});
  h.nodes['alm-plus'].isConnected = true;
  for (const id of ['plus-refresh', 'plus-status', 'plus-study', 'plus-het', 'plus-counts', 'plus-plot']) h.nodes[id] = node();
  h.nodes['plus-table'] = {tBodies: [node()], tHead: {rows: [node()]}};
  h.nodes['plus-study'].value = '1';
  h.nodes['plus-het'].value = 'I2';
  h.window.alm.urlState.withoutWrites = fn => fn();
  const document = {getElementById: id => h.nodes[id], querySelector: () => null};
  vm.runInNewContext(plusSource ?? fs.readFileSync(path.join(app, 'plus.js'), 'utf8'),
    {...h.window, window: h.window, document}, {filename: 'gosh/plus.js'});
  const P = h.window.AlmGoshPlus;
  P.render = a => { h.rendered = a; }; // DOM is covered by the unchanged browser suite.
  const source = (adapterSource ?? fs.readFileSync(path.join(app, 'validate/adapter-plus.js'), 'utf8')).replace(/\r\n/g, '\n');
  const start = source.indexOf('  function currentState() {');
  const end = source.indexOf('  const adapter=', start);
  assert.ok(start >= 0 && end > start, 'live adapter extraction anchors');
  const context = {P, document, values: () => [], axisLabels: [], axisSummary: () => [],
    axisNames: {I2: 'I² (%)'}, adapter: {live: {compare: {}}}};
  vm.runInNewContext(source.slice(start, end) + '\nthis.live = {currentState, buildScript};', context,
    {filename: 'gosh/validate/adapter-plus.js:currentState/buildScript'});
  h.capture = (...args) => copy(P.capture(...args));
  h.snapshot = () => copy(h.window.__almGoshValidationSnapshot());
  h.live = context.live;
  h.current = (text, model) => {
    h.nodes.src.value = text; h.nodes.model.value = model;
    return copy(h.live.currentState());
  };
  return h;
}
module.exports = {harness, formats, copy};
