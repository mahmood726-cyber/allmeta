// Executes the actual inline app script; DOM/shared UI stubs are intentionally minimal.
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const nodes = {};
function node() {
  return {value: '', innerHTML: '', textContent: '', attrs: {}, parentNode: {},
    addEventListener(event, fn) { const previous = this[event]; this[event] = (...args) => { if (previous) previous(...args); fn(...args); }; },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; }};
}
for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)/gi)) {
  nodes[m[2]] = node(); nodes[m[2]].textContent = m[3];
}
nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
const logs = [node(), node()];
const document = {getElementById: id => nodes[id] || null,
  querySelectorAll: selector => {
    if (selector !== '#alm-axis-mount [data-edge="log"]') {
      throw new Error('Unexpected selector in numeric DOM stub: ' + selector);
    }
    return logs;
  }};
const noop = () => {};
const alm = {csvUpload: noop, plotExport: noop, axisControls: noop,
  resultsExport: noop, urlState: Object.assign(noop, {read: () => null}),
  resetUndo: noop, tooltips: noop};
const window = {alm};
vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], {window, document});
function fit(text) {
  nodes.src.value = text; nodes['btn-run'].click();
  return {gIsNull: window._almLastLimit()?.G_squared === null, result: window._almLastLimit(), table: nodes.body.innerHTML,
    plot: nodes.plot.innerHTML, error: nodes['limit-error']?.textContent || '',
    diagnostics: nodes['limit-diagnostics']?.textContent || ''};
}
const normal = nodes.src.value;
const zero = fit('0, 0.1\n0, 0.2\n0, 0.3');
const recovery = ['0.1, 0.1\n0.2, 0.2', '0.1, 0.2\n0.2, 0.2\n0.3, 0.2'].map(bad =>
  ({before: fit(normal), refused: fit(bad), after: fit(normal), zeroAfter: fit('0, 0.1\n0, 0.2\n0, 0.3')}));
const overflow = fit('1e308, 0.1\n-1e308, 0.2\n1e308, 0.3');
console.log(JSON.stringify({zero, recovery, overflow, logs: logs.map(n => ({disabled: n.disabled,
  describedby: n.attrs['aria-describedby'], description: nodes[n.attrs['aria-describedby']]?.textContent})), html}));
