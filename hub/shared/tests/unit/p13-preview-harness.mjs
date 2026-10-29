// Execute the real page engine and lifecycle; stub only DOM and optional UI integrations.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');

export function loadPreview() {
  const html = read('gosh/index.html');
  const nodes = {};
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    let content = '';
    nodes[match[1]] = {
      id: match[1], value: match[0].match(/\bvalue="([^"]*)"/)?.[1] || '',
      hidden: /\bhidden\b/.test(match[0]), style: {},
      get textContent() { return content; }, set textContent(value) { content = String(value); },
      get innerHTML() { return content; }, set innerHTML(value) { content = String(value); },
      addEventListener(type, listener) { this[type] = listener; },
    };
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  nodes.model.value = 'FE';
  nodes['enum-mode'].value = 'auto';
  const noop = () => {};
  let exportOptions;
  const window = { alm: {
    csvUpload: noop, plotExport: noop, axisControls: noop, resetUndo: noop, tooltips: noop,
    resultsExport: options => { exportOptions = options; },
    urlState: Object.assign(noop, { read: () => null, write: () => true, isSuspended: () => true }),
  } };
  const document = {
    getElementById: id => nodes[id],
    querySelectorAll: selector => selector.split(',').map(id => nodes[id.trim().slice(1)]),
    addEventListener: noop,
  };
  const context = vm.createContext({ window, document });
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context);
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  const exactRequests = [];
  window.AlmGoshExact = { request: request => exactRequests.push(request), labelResult: noop };
  return {
    window, nodes, exactRequests,
    exported: () => exportOptions.getResults(),
    run(text, model = 'FE', draws = '32') {
      nodes.src.value = text;
      nodes.model.value = model;
      nodes['n-sample'].value = draws;
      nodes['btn-run'].click();
      return window._almLastGosh();
    },
  };
}
