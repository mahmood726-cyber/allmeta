// transitivity (lane audit7). The CV / standardised-difference arithmetic matches R (run/tr.R:
// CV BMI 0.0874, HbA1c 0.1932, age 0.1367; std diffs -0.0417 0.1 -0.5 2.25). The defect is the
// example: it put invented baseline values under real trial names. SURMOUNT-2 (NCT04657003) is the
// tirzepatide trial in type 2 diabetes - the source workstream's own registry extract
// (glp1-obesity-mbnma/transitivity.csv) gives mean age 54.2, the example said 46 with HbA1c 5.9;
// "PIONEER-obese" is not a trial (the PIONEER programme is oral semaglutide in T2D).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

function example() {
  const p = loadPage('transitivity/index.html', { shared: ['shared/transitivity-v1.js'], pick: s => /assessTransitivity/.test(s) });
  p.fire('btn-example');
  return { p, src: p.el('f-transit').value, out: text(p.el('transit-out').innerHTML), last: p.ctx.__lastTransit };
}

test('transitivity: the example does not attach invented values to real trial names', () => {
  const { src, p } = example();
  assert.doesNotMatch(src, /\b(STEP|SURMOUNT|PIONEER|SUSTAIN|OASIS)-/i, src);
  assert.match(p.html, /illustrative|hypothetical/i);
});

test('transitivity: example screening result is unchanged (HbA1c flagged, CV 0.193)', () => {
  const { out, last } = example();
  assert.equal(last.flags, 1);
  assert.match(out, /HbA1c \(%\) 5\.75 5\.80 7\.95 CV 0\.193/, out);
  assert.match(out, /Baseline BMI 37\.95 38\.00 32\.50 CV 0\.087/, out);
});
