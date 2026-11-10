import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const extra = require('../../../../influence/influence-extra.js');
const core = require('../../../../shared/ma-core.js');
const html = readFileSync(new URL('../../../../influence/index.html', import.meta.url), 'utf8');
// Exercise the page's actual pooling and exclusion functions without a browser.
const context = vm.createContext({ window: { AlmMaCore: core }, X: extra });
function sourceBetween(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `page source markers: ${start}`);
  return html.slice(a, b);
}
vm.runInContext(sourceBetween('      function tau2_PM(', '      function fmt('), context);
vm.runInContext(sourceBetween('      function repool(', '      function setExcluded('), context);

function rows(scale = 1) {
  return [-1, 0, 1].map((te, i) => ({ te: te * scale, se: 0.1 * scale, label: `Study ${i + 1}` }));
}
function summary(data) {
  const p = context.pool(data);
  return { ...p, ...extra.summarize(p, data.map(r => r.se * r.se)) };
}
function close(actual, expected, label, tolerance = 1e-12) {
  assert.ok(Number.isFinite(actual), `${label}: expected finite ${expected}, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`);
}
function sameHeterogeneity(actual, expected, label) {
  for (const key of ['I2', 'H2']) close(actual[key], expected[key], `${label}.${key}`);
}

test('control P11-R2: ordinary equal-variance full, deletion and exclusion summaries', () => {
  const data = rows();
  sameHeterogeneity(summary(data), { I2: 99, H2: 100 }, 'full');
  for (let i = 0; i < data.length; i++) {
    const keep = data.filter((_, j) => j !== i);
    const expected = i === 1 ? { I2: 99.5, H2: 200 } : { I2: 98, H2: 50 };
    sameHeterogeneity(summary(keep), expected, `delete ${i}`);
    sameHeterogeneity(context.repool(keep), expected, `exclude ${i}`);
  }
});

for (const [name, scale] of [['tiny', 1e-80], ['large', 1e90]]) {
  test(`plant P11-R2: ${name} finite units preserve full I2 and H2`, () => {
    const full = summary(rows(scale));
    assert.ok(Number.isFinite(full.tau2) && full.tau2 > 0, 'REML tau2 stays finite and positive');
    sameHeterogeneity(full, summary(rows()), 'full');
  });
  test(`plant P11-R2: ${name} finite units preserve every leave-one-out summary`, () => {
    for (let i = 0; i < 3; i++) {
      sameHeterogeneity(summary(rows(scale).filter((_, j) => j !== i)),
        summary(rows().filter((_, j) => j !== i)), `delete ${i}`);
    }
  });
  test(`plant P11-R2: ${name} finite units preserve exclusion re-pooling`, () => {
    for (let i = 0; i < 3; i++) {
      sameHeterogeneity(context.repool(rows(scale).filter((_, j) => j !== i)),
        context.repool(rows().filter((_, j) => j !== i)), `exclude ${i}`);
    }
  });
  test(`plant P11-R2: ${name} summaries serialize dimensionless values as numbers`, () => {
    const output = JSON.parse(JSON.stringify(summary(rows(scale))));
    sameHeterogeneity(output, { I2: 99, H2: 100 }, 'JSON');
  });
}

test('plant P11-R2: cross-products retain less precise studies when one weight dominates', () => {
  const p = { mu: 0, seMu: 1, tau2: 0.5, Q: 2, df: 2 };
  // In the limit vi[0] -> 0, the typical variance is 1/2, not Infinity.
  for (const vi of [[1e-20, 1, 1], [1, 1e-20, 1], [1, 1, 1e-20]]) {
    sameHeterogeneity(extra.summarize(p, vi), { I2: 50, H2: 2 }, `vi=${vi}`);
  }
});

test('plant P11-R2: zero heterogeneity remains I2=0 and H2=1 in tiny units', () => {
  const p = { mu: 0, seMu: 1e-80, tau2: 0, Q: 0, df: 2 };
  sameHeterogeneity(extra.summarize(p, [1e-162, 1e-162, 1e-162]), { I2: 0, H2: 1 }, 'zero tau2');
});

test('control P11-R2: ordinary unequal variances and zero heterogeneity', () => {
  const p = { mu: 0.2, seMu: 0.1, tau2: 0.3, Q: 4, df: 2 };
  const vi = [0.04, 0.09, 0.16], w = vi.map(v => 1 / v);
  const sw = w.reduce((a, b) => a + b, 0);
  const s2 = 2 * sw / (sw * sw - w.reduce((a, b) => a + b * b, 0));
  sameHeterogeneity(extra.summarize(p, vi), { I2: 100 * p.tau2 / (s2 + p.tau2), H2: 1 + p.tau2 / s2 }, 'unequal');
  sameHeterogeneity(extra.summarize({ ...p, tau2: 0 }, vi), { I2: 0, H2: 1 }, 'zero');
});

test('control P11-R2: fewer than two studies keep null heterogeneity and Q p-value', () => {
  const p = { mu: 0.2, seMu: 0.1, tau2: 0, Q: 0, df: 0 };
  for (const vi of [[], [0.01]]) {
    const result = extra.summarize(p, vi);
    assert.equal(result.I2, null);
    assert.equal(result.H2, null);
    assert.equal(result.Qp, null);
    assert.equal(result.z, 2);
  }
});

// Captured verbatim from the requested R run; the fixture records R/package versions.
const reference = JSON.parse(readFileSync(new URL(
  '../../../../influence/tests/fixtures/p11-r2-reference.json', import.meta.url), 'utf8'));

function referenceFits(input, unit) {
  const scale = unit === 'tiny' ? input.tiny.scale : 1;
  const expected = unit === 'tiny' ? input.tiny : input;
  const data = input.yi.map((yi, i) => ({ te: yi * scale, se: input.se[i] * scale }));
  const excluded = [].concat(input.excluded_zero_based);
  return {
    scale,
    fits: [
      { label: 'full', data, expected: expected.full, run: summary },
      ...data.map((_, i) => ({ label: `delete ${i}`, data: data.filter((_, j) => j !== i),
        expected: expected.deleted[i], run: summary })),
      { label: 'exclude', data: data.filter((_, i) => !excluded.includes(i)),
        expected: expected.kept, run: kept => context.repool(kept) }
    ]
  };
}

for (const [name, input] of Object.entries(reference.cases)) {
  for (const unit of ['ordinary', 'tiny']) {
    const kind = unit === 'ordinary' ? 'control' : 'parity';
    test(`R ${kind} P11-R2: ${name} ${unit} summaries match metafor at supplied tau2`, () => {
      for (const fit of referenceFits(input, unit).fits) {
        // Supplying R's tau2 isolates the corrected summary arithmetic from the optimizer.
        const actual = extra.summarize(fit.expected, fit.data.map(r => r.se * r.se));
        sameHeterogeneity(actual, fit.expected, fit.label);
        sameHeterogeneity(JSON.parse(JSON.stringify(actual)), fit.expected, `${fit.label} JSON`);
      }
    });

    test(`R ${kind} P11-R2: ${name} ${unit} page pooling and exclusion match REML references`, () => {
      const { scale, fits } = referenceFits(input, unit);
      for (const fit of fits) {
        const actual = fit.run(fit.data), expected = fit.expected;
        assert.equal(actual.k, expected.k, `${fit.label}.k`);
        assert.equal(actual.df, expected.df, `${fit.label}.df`);
        // Use the existing Influence validation contract: 1e-6 for fitted quantities,
        // 1e-9 for closed-form Q. Undo units so tiny absolute values cannot hide errors.
        for (const key of ['mu', 'seMu']) {
          close(actual[key] / scale, expected[key] / scale, `${fit.label}.${key}`, 1e-6);
        }
        close(actual.tau2 / (scale * scale), expected.tau2 / (scale * scale), `${fit.label}.tau2`, 1e-6);
        close(actual.Q, expected.Q, `${fit.label}.Q`, 1e-9);
        for (const key of ['I2', 'H2']) close(actual[key], expected[key], `${fit.label}.${key}`, 1e-6);
      }
    });
  }
}
