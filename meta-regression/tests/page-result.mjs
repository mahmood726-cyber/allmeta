// Execute the page's single-moderator scripts with a minimal DOM, without a browser.
// Numerical routines and the results adapter come from index.html on every run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

export function pageResult(csv, { html = readFileSync(new URL('../index.html', import.meta.url), 'utf8') } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => {
    const listeners = new Map();
    return [id, {
      id, value: '', checked: false, innerHTML: '', hidden: false,
      classList: { add() {}, remove() {} },
      addEventListener(type, fn) { listeners.set(type, fn); },
      dispatchEvent(event) { listeners.get(event.type)?.(event); },
    }];
  }));
  const document = {
    getElementById: id => elements.get(id) ?? null,
    querySelectorAll: () => [...elements.values()].filter(el => el.id.startsWith('f-')),
    addEventListener() {},
  };
  const noop = () => {};
  const window = { alm: {
    plotExport: noop, csvUpload: noop, axisControls: noop,
    resultsExport: noop, resetUndo: noop, tooltips: noop,
    urlState: Object.assign(noop, { read: () => null, write: noop }),
  } };
  const context = vm.createContext({ window, document,
    localStorage: { getItem: () => null, setItem: noop },
    Event: class { constructor(type) { this.type = type; } },
  });
  vm.runInContext(readFileSync(new URL('../../hub/shared/analysis-lifecycle.js', import.meta.url), 'utf8'), context);
  const scripts = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const engine = scripts.find(code => code.includes('function fitPM(studies)'));
  const adapter = scripts.find(code => code.includes('window.__almResults = function'));
  assert.ok(engine && adapter, 'page engine and results adapter must exist');
  // Expose the existing p-value routine for fields absent from the JSON adapter.
  // This adds a reference only; it does not replace any numerical code.
  const end = engine.lastIndexOf('})();');
  assert.ok(end > 0, 'main page closure must exist');
  vm.runInContext(engine.slice(0, end) + 'window.__parityP = tTwoSidedP;\n' + engine.slice(end), context);
  vm.runInContext(adapter, context);
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  assert.equal(header, 'study,yi,vi,year');
  const rows = lines.map(line => {
    const [study, yi, vi, year] = line.split(',');
    return { study, yi: Number(yi), vi: Number(vi), year: Number(year) };
  });
  window.__almLoad(rows);
  const out = window.__almResults();
  assert.equal(out.k, rows.length, 'all fixture rows must reach the page');
  const p0 = window.__parityP(Math.abs(out.intercept / out.intercept_se), out.hksj_q_df);
  const p1 = window.__parityP(Math.abs(out.slope / out.slope_se), out.hksj_q_df);
  // R2 is a percentage in metafor. With one moderator, QM is the squared t statistic.
  const result = {
    intercept: out.intercept, intercept_se: out.intercept_se, intercept_pval: p0,
    intercept_ci_lb: out.intercept_ci_lb, intercept_ci_ub: out.intercept_ci_ub,
    slope: out.slope, slope_se: out.slope_se, slope_pval: p1,
    slope_ci_lb: out.slope_ci_lb, slope_ci_ub: out.slope_ci_ub,
    tau2: out.tau2_pm, R2: 100 * out.R2_tau2,
    QM: (out.slope / out.slope_se) ** 2, QMp: p1, k: out.k,
  };
  for (const [key, value] of Object.entries(result)) assert.ok(Number.isFinite(value), key);
  return { result, raw_q: window._almLastFitted().fit.rss / out.hksj_q_df, q: out.hksj_q };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv[2], 'usage: node page-result.mjs fixture.csv');
  console.log(JSON.stringify(pageResult(readFileSync(process.argv[2], 'utf8')).result));
}
