// benford-screen (lane audit7). The engine matches the closed form in R 4.6.0 (counts, MAD,
// chisq.test(obs, p = log10(1 + 1/d)): example 7.527462 / p 0.4809331; anomalous 162.6878 /
// p 4.38e-31; run/bf.R). Defects in the page on origin/main:
//  1. "Paste numbers (any separator)": a comma-separated list without spaces was read as ONE
//     number ("120,340,560,780,1200" -> n = 1), because every ",ddd" was stripped as a
//     thousands separator before tokenising.
//  2. The verdict printed "p=0.0000" for p = 4.4e-31 (the stats card already used 4.4e-31).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

function screen(v) {
  const p = loadPage('benford-screen/index.html', { shared: ['shared/benford-v1.js'], pick: s => /AlmBenford\.analyze/.test(s) });
  p.el('f-data').value = v;
  p.fire('btn-run');
  return { r: p.ctx.__lastBenford, out: text(p.el('result').innerHTML), p };
}

test('benford: comma-separated values without spaces are separate values', () => {
  assert.equal(screen('120,340,560,780,1200').r.n, 5);
  assert.deepEqual(Array.from(screen('120,340,560,780,1200').r.counts), [2, 0, 1, 0, 1, 0, 1, 0, 0]);
  assert.equal(screen('120,340,560').r.n, 3);
});

test('benford: thousands separators inside space/newline separated values still parse (control)', () => {
  assert.deepEqual(Array.from(screen('1,200 3,400 56,000').r.counts), [1, 0, 1, 0, 1, 0, 0, 0, 0]);
  assert.equal(screen('1,200\n3,400\n56,000\n7,000,000').r.n, 4);
  assert.equal(screen('120, 340, 560, 780, 1200').r.n, 5);
  assert.equal(screen('120;340;560').r.n, 3);
});

test('benford: the anomalous example verdict does not print p = 0', () => {
  const p = loadPage('benford-screen/index.html', { shared: ['shared/benford-v1.js'], pick: s => /AlmBenford\.analyze/.test(s) });
  p.fire('btn-example-anom');
  const out = text(p.el('result').innerHTML);
  assert.ok(Math.abs(p.ctx.__lastBenford.chi2 - 162.687809) < 1e-5);
  assert.doesNotMatch(out, /p=0\.0000/, out);
  assert.match(out, /p=4\.4e-31/, out);
});
