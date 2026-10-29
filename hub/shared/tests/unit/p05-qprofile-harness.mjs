// Run the actual page computation, stat markup and export functions without a browser.
// Only bootstrap/event wiring and drawing are omitted; function bodies are unchanged.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');
const decode = s => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export function pageHarness() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', dispatchEvent() { render(); } });
    return nodes.get(id);
  };
  const cards = () => Object.fromEntries([...node('stats-wrap').innerHTML.matchAll(
    /<div class="stat"><span class="k">(.*?)<\/span><span class="v">(.*?)<\/span><\/div>/gs
  )].map(m => [decode(m[1]), decode(m[2])]));
  const document = {
    getElementById: node,
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '#stats-wrap .stat') return Object.entries(cards()).map(([k, v]) => ({
        querySelector: s => ({ textContent: s === '.k' ? k : v })
      }));
      if (selector === '#loo-table tr') return [...node('loo-table').innerHTML.matchAll(/<tr>(.*?)<\/tr>/gs)].map(m => ({
        children: [...m[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map(c => ({ textContent: decode(c[1]) }))
      }));
      throw new Error('Unexpected selector: ' + selector);
    }
  };
  const context = vm.createContext({ document, setTimeout, Event: class Event {} });
  context.window = context;
  context.alm = { urlState: { withoutWrites: fn => fn() } };
  for (const path of ['shared/ma-core.js', 'shared/heterogeneity-ci.js', 'shared/alm-validate.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  context.AlmValidate.mount = () => ({}); // UI mounting is outside this Node harness.
  const html = read('heterogeneity/index.html');
  const start = html.indexOf('    const LS_KEY =');
  const end = html.indexOf('    render = window.alm.analysisLifecycle', start);
  if (start < 0 || end < 0) throw new Error('Page computation boundaries not found');
  vm.runInContext('(function(){\nconst Z975 = 1.959963984540054;\n' + html.slice(start, end) + `
    window.__testRender = function(text, chosen) {
      const parsed = parseStudies(text);
      if (parsed.warnings.length) throw new Error(parsed.warnings.join('; '));
      _lastStudies = parsed.studies;
      _lastInfo = renderStats(parsed.studies, chosen);
      return _lastInfo;
    };
  })();`, context);
  const exportStart = html.indexOf('    window.__almResults = function');
  const exportEnd = html.indexOf('    // Snapshot:', exportStart);
  if (exportStart < 0 || exportEnd < 0) throw new Error('Page export boundaries not found');
  vm.runInContext(html.slice(exportStart, exportEnd), context);
  vm.runInContext(read('hub/shared/results-export.js').replace('window.alm.resultsExport = init;',
    'window.__serializers = { csv: _toCSV, md: _toMD, report: _toReport }; window.alm.resultsExport = init;'), context);
  function render() { return context.__testRender(node('f-data').value, node('f-tau2').value); }
  return {
    context, nodes, cards,
    run(text, estimator = 'pm') { node('f-data').value = text; node('f-tau2').value = estimator; return render(); },
    markup: () => node('stats-wrap').innerHTML,
    exports() {
      const out = context.__almResults(), s = context.__serializers;
      return { json: JSON.stringify(out), csv: s.csv(out), md: s.md(out),
        report_md: s.report(out, { title: 'Heterogeneity' }, false),
        report_txt: s.report(out, { title: 'Heterogeneity' }, true) };
    }
  };
}
export function cases() {
  const corpus = JSON.parse(read('heterogeneity/validate/corpus/corpus.json'));
  return JSON.parse(read('hub/shared/tests/unit/p05-qprofile-input.json')).map(c => ({
    ...c, text: c.corpus ? corpus.find(row => row.id === c.id).text : c.text
  }));
}
export const studies = text => text.split('\n').map(line => {
  const cells = line.split(',').map(s => s.trim());
  return { est: Number(cells.at(-2)), se: Number(cells.at(-1)) };
});
