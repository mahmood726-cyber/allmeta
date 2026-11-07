import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('../../../../meta-regression/plus-engine.js');
const input = JSON.parse(readFileSync(new URL('fixtures/p08-ml-input.json', import.meta.url), 'utf8'));

// At an interior ML optimum the profile variance score is zero. This checks
// stationarity independently of the engine's stopping condition.
function checkScore(c) {
  const r = AlmMetaPlus.compute(c);
  assert.equal(r.status, 'ok', r.reason);
  for (const model of ['full', 'reduced']) {
    const m = r[model];
    assert.ok(m.tau2 > 0);
    let score = 0, information = 0;
    c.yi.forEach((y, i) => {
      const x = [1, ...c.mods[i]].slice(0, m.p);
      const residual = y - x.reduce((s, v, j) => s + v * m.beta[j], 0);
      const w = 1 / (c.vi[i] + m.tau2);
      score += (residual * w) ** 2 - w;
      information += w * w;
    });
    assert.ok(Math.abs(score / information) < 1e-9,
      `${model}: unconverged variance step ${score / information}; tau2=${m.tau2}`);
  }
}
test('plant P08 review: a nearly weightless study cannot accept an unconverged ML fit', () => {
  const c = structuredClone(input);
  c.vi[11] = 1e14;
  checkScore(c);
});
test('control P08 review: ordinary-variance ML fits satisfy the profile score', () => checkScore(input));
