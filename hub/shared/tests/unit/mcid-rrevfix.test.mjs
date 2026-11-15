// mcid (lane rrevfix, re-review F1 of #592). After the audit6 fix the page TABLE used the right
// definitions, but two things that claim to check it did not:
//
// 1. The R oracle. mcid/tests/fixtures/mcid-oracle.R computed niMargin = frac * hist -- the
//    formula #592 removed -- and its only case had frac = 0.5, where f*M1 == (1-f)*M1, so the
//    R-labelled oracle could not tell the right margin from the wrong one. The oracle now
//    computes M2 = (1 - f) * M1 and carries a case with f = 0.75, where the two differ.
// 2. The export hook. window.__almMcid().sdc was 1.96 x SEM (9.80 at SEM 5) while the table
//    calls 1.96 x sqrt(2) x SEM (13.86) the SDC (de Vet et al., HQLO 2006;4:54). A field named
//    sdc now carries the SDC; the one-occasion 1.96 x SEM band is exported as semBand95.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './helpers/page-vm.mjs';

const ORACLE = JSON.parse(readFileSync(new URL('../../../../mcid/tests/fixtures/mcid-oracle.json', import.meta.url), 'utf8'));
const Z = 1.959963984540054; // R qnorm(0.975)
const hook = () => loadPage('mcid/index.html', { pick: s => s.includes('window.__almMcid') }).ctx.__almMcid;

test('mcid oracle: has a case with a preservation fraction other than 0.5 (where f*M1 != (1-f)*M1)', () => {
  assert.ok(Array.isArray(ORACLE.cases), 'oracle must list cases');
  assert.ok(ORACLE.cases.some(c => Math.abs(c.input.frac - 0.5) > 1e-9 && c.input.hist !== 0),
    'every oracle case has frac = 0.5, so it cannot detect M2 = f*M1');
});

test('mcid oracle: every case encodes M2 = (1 - f) x M1 and SDC = qnorm(.975) x sqrt(2) x SEM', () => {
  for (const c of ORACLE.cases) {
    const i = c.input;
    assert.ok(Math.abs(c.niMargin - (1 - i.frac) * i.hist) < 1e-12, `niMargin ${c.niMargin} for ${JSON.stringify(i)}`);
    assert.ok(Math.abs(c.sdc - ORACLE.z975 * Math.SQRT2 * i.sem) < 1e-12, `sdc ${c.sdc} for ${JSON.stringify(i)}`);
    assert.ok(Math.abs(c.semBand95 - ORACLE.z975 * i.sem) < 1e-12, `semBand95 ${c.semBand95}`);
  }
});

test('mcid export: the field named sdc is the de Vet SDC (13.86 at SEM 5), not 1.96 x SEM (9.80)', () => {
  const r = hook()({ sd: 12, sem: 5, somewhat: 8, none: 3, hist: 10, frac: 0.5 });
  assert.ok(Math.abs(r.sdc - Z * Math.SQRT2 * 5) < 1e-12, 'sdc = ' + r.sdc);
  assert.ok(Math.abs(r.semBand95 - Z * 5) < 1e-12, 'semBand95 = ' + r.semBand95);
  for (const [k, v] of Object.entries(r)) {
    if (/sdc/i.test(k)) assert.ok(Math.abs(v - Z * 5) > 1e-6, `field ${k} carries 1.96 x SEM`);
  }
});

test('mcid export matches every R oracle case', () => {
  const f = hook();
  assert.ok(Array.isArray(ORACLE.cases) && ORACLE.cases.length > 0, 'oracle must list cases');
  for (const c of ORACLE.cases) {
    const r = f(c.input);
    for (const k of ['halfSD', 'threeSD', 'oneSEM', 'semBand95', 'sdc', 'anchor', 'niMargin']) {
      assert.ok(Math.abs(r[k] - c[k]) < 1e-12, `${k}: js ${r[k]} R ${c[k]} at ${JSON.stringify(c.input)}`);
    }
  }
});
