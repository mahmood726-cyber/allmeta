import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
export const pageSource = readFileSync(new URL('meta-regression/index.html', root), 'utf8');
export const lsSource = readFileSync(new URL('shared/location-scale.js', root), 'utf8');
const coreSource = readFileSync(new URL('shared/ma-core.js', root), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

export function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length, 2, `Expected exactly one mutation target: ${from}`);
  return source.replace(from, to);
}

// Execute the actual page IIFE, parser, render(), and exported result getter.
// DOM/UX stubs only supply values and event listeners; no statistical code is copied.
// The sole instrumentation exposes existing private numeric helpers for unrounded tests.
export function loadPage(source = pageSource) {
  const elements = new Map();
  for (const [, id] of source.matchAll(/\bid="([^"]+)"/g)) elements.set(id, {
    value: '', checked: false, innerHTML: '', listeners: {},
    classList: { add() {}, remove() {} },
    addEventListener(event, fn) { this.listeners[event] = fn; },
  });
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) ?? null },
    localStorage: { getItem: () => null, setItem() {} },
    alm: { analysisLifecycle: fn => fn, plotExport() {} },
  });
  context.window = context;
  vm.runInContext(coreSource, context, { filename: 'shared/ma-core.js' });
  vm.runInContext(lsSource, context, { filename: 'shared/location-scale.js' });
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const mains = scripts.filter(s => s.includes('function fitPM(studies)'));
  assert.equal(mains.length, 1, 'Locate the real single-moderator engine');
  const instrumented = replaceOnce(mains[0], '    const loaded = loadSaved();',
    '    window.__p08 = { tTwoSidedP, fitPMNull };\n    const loaded = loadSaved();');
  vm.runInContext(instrumented, context, { filename: 'meta-regression/index.html:engine' });
  const getter = source.match(/    window\.__almResults = function \(\) \{[\s\S]*?\n    \};/g);
  assert.equal(getter?.length, 1, 'Locate the actual JSON-export getter');
  vm.runInContext(getter[0], context, { filename: 'meta-regression/index.html:export' });
  return c => {
    elements.get('f-data').value = c.yi.map((y, i) => `S${i + 1},${y},${c.se[i]},${c.x[i]}`).join('\n');
    elements.get('btn-run').listeners.click();
    const result = context.__almResults();
    const fitted = context._almLastFitted();
    if (fitted) {
      result.slope_t = result.slope / result.slope_se;
      result.slope_p = context.__p08.tTwoSidedP(Math.abs(result.slope_t), result.hksj_q_df);
      result.tau2Null = context.__p08.fitPMNull(context._almLastStudies());
    }
    return copy({ result, fitted, pi: context._almLastPI() });
  };
}

export function loadLocationScale(source = lsSource) {
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'shared/location-scale.js' });
  return c => copy(context.AlmLocationScale.fit(c.yi, c.vi ?? c.se.map(s => s * s),
    c.x.map(x => [1, x]), c.x.map(x => [1, x])));
}

export const tolerance = 1e-6; // Absolute, including all iterative outputs; never relaxed.
export function differences(actual, expected, prefix = '') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return [`${prefix}: wrong array shape`];
    return expected.flatMap((v, i) => differences(actual[i], v, `${prefix}[${i}]`));
  }
  if (expected && typeof expected === 'object') return Object.entries(expected)
    .flatMap(([k, v]) => differences(actual?.[k], v, prefix ? `${prefix}.${k}` : k));
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual)
    && Math.abs(actual - expected) <= tolerance ? [] : [`${prefix}: app=${actual}, R=${expected}, absdiff=${Math.abs(actual - expected)}`];
  return actual === expected ? [] : [`${prefix}: app=${actual}, R=${expected}`];
}
export const compare = (a, b) => assert.deepEqual(differences(a, b), []);

export function pmExpected(r) {
  return { k: r.k, intercept: r.beta[0], slope: r.beta[1], intercept_se: r.se[0], slope_se: r.se[1],
    intercept_ci_lb: r.ciLo[0], intercept_ci_ub: r.ciHi[0], slope_ci_lb: r.ciLo[1], slope_ci_ub: r.ciHi[1],
    tau2_pm: r.tau2, hksj_q: r.q, hksj_q_df: r.df, slope_t: r.t[1], slope_p: r.p[1],
    tau2Null: r.tau2Null, QE: r.QE, QE_df: r.df, QE_p: r.QEp, R2_tau2: r.R2 };
}
