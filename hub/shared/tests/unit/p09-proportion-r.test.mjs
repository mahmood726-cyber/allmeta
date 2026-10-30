import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './p09-proportion-harness.mjs';

// Captured verbatim from the requested native R run in pass 1 FEEDBACK.md.
// Ordinary references use metafor; extreme references use independent corrected
// count formulae in R, since probability-ratio PLO also loses the complement.
const ref = JSON.parse(readFileSync(new URL('../fixtures/p09-proportion-range.json', import.meta.url), 'utf8'));
function close(actual, expected, tolerance, label, relativeOnly = false) {
  assert.ok(Number.isFinite(actual), `${label} must be finite; got ${actual}`);
  const scale = relativeOnly ? Math.abs(expected) : Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance * scale,
    `${label}: ${actual} vs R ${expected} (tolerance ${tolerance})`);
}

for (const [key, expected] of Object.entries(ref.ordinary)) {
  test(`P09-R5 R control: ordinary zero/full cells ${key}`, () => {
    const [trans, method] = key.split('|');
    const h = harness();
    const fit = h.run(undefined, trans, method);
    assert.ok(fit);
    const details = h.details();
    for (const field of ['yi', 'vi']) expected[field].forEach((v, i) => {
      close(details[field][i], v, 1e-9, `${key} ${field}[${i}]`);
    });
    for (const field of ['mu_re', 'seRE', 'tau2', 'Q']) {
      // Same immutable tolerances as the original corpus adapter.
      close(fit[field], expected[field], method === 'PM' && field !== 'Q' ? 1e-6 : 1e-9, `${key} ${field}`);
    }
  });
}

for (const [index, boundary] of ['zero', 'full'].entries()) for (const trans of ['logit', 'raw']) {
  test(`P09-R5 R ${boundary === 'full' ? 'plant' : 'control'}: huge ${boundary}-cell ${trans} effects and variances`, () => {
    // The script uses exactly 2^53-1. jsonlite prints count metadata with only
    // 15 significant digits; do not use that rounded metadata as test input.
    const n = Number.MAX_SAFE_INTEGER;
    const x = index === 0 ? 0 : n;
    const expected = ref.extreme[index];
    for (const method of ['PM', 'DL', 'FE']) {
      const h = harness();
      assert.ok(h.run(`${x},${n},A\n${x},${n},B`, trans, method));
      const details = h.details();
      const y = trans === 'logit' ? expected.y : expected.raw_y;
      const v = trans === 'logit' ? expected.v : expected.raw_v;
      for (let i = 0; i < 2; i++) {
        close(details.yi[i], y, 1e-12, `${trans}/${method} yi[${i}]`, true);
        close(details.vi[i], v, 1e-12, `${trans}/${method} vi[${i}]`, true);
      }
    }
  });
}
