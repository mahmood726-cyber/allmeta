import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Tail = require('../../../../shared/upper-tail.js');

// Run the shipped nma-global-inconsistency engine script with its DOM endpoints stubbed.
function harness() {
  const els = new Map();
  const el = id => {
    if (!els.has(id)) { let h = ''; els.set(id, { value: '', get innerHTML() { return h; }, set innerHTML(v) { h = String(v); }, addEventListener() {}, setAttribute() {} }); }
    return els.get(id);
  };
  const c = { document: { getElementById: el } };
  c.window = c;
  vm.createContext(c);
  const html = readFileSync(new URL('../../../../nma-global-inconsistency/index.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function pchi('));
  if (!script) throw Error('engine script not found');
  vm.runInContext(script, c, { filename: 'nma-global-inconsistency/index.html' });
  return c;
}
const rel = (a, b) => Math.abs(a - b) / b;
// two designs disagreeing by 5 units with SE 0.1: Delta Q is huge, the exact LR-test p is ~1e-180
const strong = 'A,B,0,0.1,AB\nB,C,0,0.1,BC\nA,C,5,0.1,AC\nA,B,0,0.1,AB\nB,C,0,0.1,BC';

test('NGI tails: the exported likelihood-ratio p is an upper tail, not 1 - CDF', () => {
  const c = harness();
  c.__almNgiLoad(strong);
  const r = c._almLastNgi();
  assert.ok(r && r.dDf > 0 && r.dQ > 500, `dQ ${r && r.dQ}`);
  assert.ok(r.p > 0, `exported p underflowed to ${r.p}`);
  assert.ok(rel(r.p, Tail.pchisqUpper(r.dQ, r.dDf)) < 1e-12, `p ${r.p} vs ${Tail.pchisqUpper(r.dQ, r.dDf)}`);
});

test('NGI tails: R pchisq(q, df, lower.tail = FALSE) control values', () => {
  const c = harness();
  // R 4.6.0, %.17g
  for (const [q, df, ref] of [[81, 1, 2.2571768119076811e-19], [100, 3, 1.5541594313896051e-21], [30, 2, 3.0590232050182579e-07], [2, 3, 0.57240670447087916]]) {
    assert.ok(rel(c.pchiSF(q, df), ref) < 1e-12, `pchiSF(${q}, ${df}) = ${c.pchiSF(q, df)}, R ${ref}`);
  }
});
