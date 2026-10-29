// Load the actual inline page and sensitivity engines; stub only DOM/UI wiring.
// No environment access, browser, copied estimator formulas, or archived app output.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
export function loadLimit({ pageTransform = s => s, plusTransform = s => s } = {}) {
  const html = pageTransform(readFileSync(new URL('limit-ma/index.html', root), 'utf8'));
  const nodes = {};
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes[match[1]] = { value: match[0].match(/\bvalue="([^"]*)"/)?.[1] || '',
      innerHTML: '', textContent: '', attrs: {}, parentNode: {},
      addEventListener(event, fn) { this[event] = fn; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = { getElementById: id => nodes[id], querySelectorAll: () => [] };
  const noop = () => {};
  const window = { alm: { analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
    axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null }) } };
  const context = vm.createContext({ window, document, console });
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context, { filename: 'limit-ma/index.html' });
  for (const file of ['shared/ma-core.js','shared/trimfill.js','limit-ma/plus-opt.js','limit-ma/plus-selmodel.js','limit-ma/plus.js']) {
    const source = readFileSync(new URL(file, root), 'utf8');
    vm.runInContext(file.endsWith('/plus.js') ? plusTransform(source) : source, context, { filename: file });
    Object.assign(context, window);
  }
  return { window,
    run(c) {
      nodes.src.value = c.te.map((te, i) => `${te},${c.se[i]},S${i + 1}`).join('\n');
      nodes['btn-run'].click();
      return { result: window._almLastLimit(), error: nodes['limit-error'].textContent };
    },
    plus(c, limit) { return window.AlmLimitPlus.compute(c, limit); }
  };
}
