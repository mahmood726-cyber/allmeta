// Load the production numerical code without a browser or a duplicate JS formula.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
export const sources = {
  accuracy: readFileSync(new URL('shared/effect-size-accuracy.js', root), 'utf8'),
  evalue: readFileSync(new URL('shared/evalue.js', root), 'utf8'),
  html: readFileSync(new URL('effect-size-converter/index.html', root), 'utf8'),
};

export function loadEngine(overrides = {}) {
  const source = { ...sources, ...overrides };
  const blocks = [...source.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(code => code.includes('// --- conversion core ---'));
  assert.equal(blocks.length, 1, 'Exactly one production conversion block is required');
  const end = blocks[0].indexOf('// --- render ---');
  assert.ok(end > 0, 'Pure numerical section must end before rendering');
  const controls = {};
  const document = {
    getElementById(id) {
      assert.ok(Object.hasOwn(controls, id), `Unexpected numerical dependency on DOM field ${id}`);
      return { value: controls[id] };
    },
  };
  const context = vm.createContext({ document });
  vm.runInContext(source.accuracy, context, { filename: 'shared/effect-size-accuracy.js' });
  vm.runInContext(source.evalue, context, { filename: 'shared/evalue.js' });
  vm.runInContext(blocks[0].slice(0, end), context, { filename: 'effect-size-converter/index.html:numerical' });
  function setControls(values) {
    for (const key of Object.keys(controls)) delete controls[key];
    Object.assign(controls, {
      'in-smd-kind': 'd', 'der-n1': '', 'der-n2': '',
      'der-lo': '', 'der-hi': '', 'der-p': '', 'der-scale': 'raw',
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value == null ? '' : String(value)])),
    });
  }
  return {
    accuracy: context.AlmEffectAccuracy,
    evalue: context.AlmEValue,
    withCI: context.withCI,
    convert(c) {
      setControls({ 'in-smd-kind': c.kind ?? 'd', 'der-n1': c.n1, 'der-n2': c.n2 });
      return Array.from(context.convert(c.type, c.est, c.se, c.p0 ?? NaN, c.sd ?? NaN), context.withCI);
    },
    derive(c, supplied) {
      setControls({
        'in-type': c.type, 'in-est': c.est,
        'der-scale': ['OR', 'RR', 'HR', 'IRR'].includes(c.type) ? 'log' : 'raw',
        'der-lo': supplied.lo, 'der-hi': supplied.hi, 'der-p': supplied.p,
      });
      return context.deriveSE();
    },
  };
}

export const tolerance = 1e-6; // Absolute error for every numeric output; no relative scaling.
export function near(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance,
    `${label}: app=${actual}, R=${expected}, abs difference=${Math.abs(actual - expected)}, tolerance=${tolerance}`);
}
export function checkSummary(actual, expected, label) {
  for (const key of ['d', 'g', 'vi', 'se', 'J', 'df']) near(actual[key], expected[key], `${label}.${key}`);
  if (expected.pooledSd === null) assert.equal(actual.pooledSd, null);
  else near(actual.pooledSd, expected.pooledSd, `${label}.pooledSd`);
}
export function checkRows(actual, expected, label) {
  assert.deepEqual(actual.map(row => row.scale), expected.map(row => row.scale), `${label}: full row set`);
  for (let i = 0; i < expected.length; i++) for (const key of ['point', 'se', 'lo', 'hi']) {
    const a = actual[i][key], e = expected[i][key];
    if (e === null) assert.ok(a == null || Number.isNaN(a), `${label}.${expected[i].scale}.${key}: expected unavailable, got ${a}`);
    else near(a, e, `${label}.${expected[i].scale}.${key}`);
  }
}
export function checkEvalue(actual, expected, label) {
  for (const key of ['point', 'ci']) {
    if (expected[key] === null) assert.equal(actual[key], null, `${label}.${key}: no CI was supplied`);
    else near(actual[key], expected[key], `${label}.${key}`);
  }
  for (const key of ['point', 'lo', 'hi']) {
    if (expected.rr[key] === null) assert.equal(actual.rr[key], null, `${label}.rr.${key}`);
    else near(actual.rr[key], expected.rr[key], `${label}.rr.${key}`);
  }
}
