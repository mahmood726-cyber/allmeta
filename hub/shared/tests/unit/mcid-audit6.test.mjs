// mcid (lane audit6): two definitional defects in the rule arithmetic.
//
// 1. Non-inferiority margin. The page labels the row "NI margin (preserve X% of active effect)"
//    but computed X% x M1. Preserving a fraction f of the active-comparator effect M1 leaves
//    M2 = (1 - f) x M1 as the margin (FDA 2016 NI guidance; ICH E10). The two coincide only at
//    f = 0.5, which is the page default AND the value in mcid/tests/fixtures/mcid-oracle.json, so
//    the existing parity spec could not see it. At f = 0.75, M1 = 8 the page said 6.00; it is 2.00.
// 2. Smallest detectable change. The page called 1.96 x SEM the "SDC". The SDC / minimally
//    detectable change of a change score is 1.96 x sqrt(2) x SEM (de Vet et al., Health Qual Life
//    Outcomes 2006;4:54, doi:10.1186/1477-7525-4-54: "sqrt(2) is included because two measurements
//    are involved"). 1.96 x SEM (9.80 at SEM 5) is kept, labelled for what it is; SDC = 13.86.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const Z = 1.959963984540054; // R qnorm(0.975)

function run(vals) {
  const p = loadPage('mcid/index.html', { pick: s => s.includes('function run()') });
  const def = { 'd-sd': 12, 'd-sem': 5, 'a-somewhat': 6.5, 'a-none': 0.5, 'ni-hist': 8, 'ni-frac': 0.5 };
  for (const [k, v] of Object.entries({ ...def, ...vals })) p.el(k).value = String(v);
  p.fire('btn-run');
  return { p, out: text(p.el('tbody').innerHTML), last: p.ctx.__almLastMcid() };
}

test('mcid: NI margin preserving 75% of M1 = 8 is 0.25 x 8 = 2.00 (not 6.00)', () => {
  const { out, last, p } = run({ 'ni-frac': 0.75 });
  assert.match(out, /NI margin \(preserve 75% of active effect\) 2\.00/, out);
  const row = last.thresholds.find(t => /NI margin/.test(t.method));
  assert.equal(row.value, 2);
  assert.equal(p.ctx.__almMcid({ sd: 12, sem: 5, somewhat: 8, none: 3, hist: 8, frac: 0.75 }).niMargin, 2);
});

test('mcid: default (50% preservation) margin is unchanged at 4.00', () => {
  const { out } = run({});
  assert.match(out, /NI margin \(preserve 50% of active effect\) 4\.00/, out);
});

test('mcid: SDC is 1.96 x sqrt(2) x SEM (13.86 at SEM 5); 1.96 x SEM is not labelled SDC', () => {
  const { out, last } = run({});
  const sdc = last.thresholds.find(t => /SDC/.test(t.method));
  assert.ok(sdc, out);
  assert.ok(Math.abs(sdc.value - Math.round(Z * Math.SQRT2 * 5 * 1e4) / 1e4) < 1e-12, JSON.stringify(sdc));
  assert.match(out, /13\.86/, out);
  const plain = last.thresholds.find(t => /^1\.96·SEM/.test(t.method));
  assert.ok(plain && !/SDC/.test(plain.method), JSON.stringify(last.thresholds));
  assert.ok(Math.abs(plain.value - 9.7998) < 1e-12);
});
