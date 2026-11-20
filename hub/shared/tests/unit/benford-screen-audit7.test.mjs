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

// Review of #593 (agy): the first fix still merged values silently. Rule now (auto mode):
// a comma followed by whitespace / end of line separates values. A comma BETWEEN digits is
// read by run ("120,340,560" = one run): a run with >= 2 commas and a group that is not 3
// digits can only be a list; anything else (1,200 / 120,340 / 1,234,567 / 12,5) can be a
// thousands separator, a list or a decimal comma, so the input is REFUSED with a visible
// message unless another run in the same input proves the list convention, or the user
// picks "separate values" / "thousands separators" in the comma control.
function screenMode(v, mode) {
  const p = loadPage('benford-screen/index.html', { shared: ['shared/benford-v1.js'], pick: s => /AlmBenford\.analyze/.test(s) });
  p.el('f-data').value = v; p.el('f-comma').value = mode;
  p.fire('btn-run');
  return { r: p.ctx.__lastBenford, out: text(p.el('result').innerHTML) };
}
const vals = r => r ? Array.from(r.counts).reduce((a, b) => a + b, 0) : null;

test('benford: comma-separated values without spaces are separate values', () => {
  assert.equal(screen('120,340,560,780,1200').r.n, 5);
  assert.deepEqual(Array.from(screen('120,340,560,780,1200').r.counts), [2, 0, 1, 0, 1, 0, 1, 0, 0]);
  assert.equal(screenMode('120,340,560', 'list').r.n, 3);
});

test('benford: thousands separators parse when declared; space/; separated lists parse (control)', () => {
  assert.deepEqual(Array.from(screenMode('1,200 3,400 56,000', 'thousands').r.counts), [1, 0, 1, 0, 1, 0, 0, 0, 0]);
  assert.equal(screenMode('1,200\n3,400\n56,000\n7,000,000', 'thousands').r.n, 4);
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

test('benford review: ambiguous tight commas are refused visibly, never merged', () => {
  for (const v of ['120,340,560\n780,120,900', '120,340, 560, 780', '1,200 3,400 56,000', '12,5 13,7 14,2']) {
    const { r, out } = screenMode(v, 'auto');
    assert.equal(r, null, v + ' must not produce a result');
    assert.match(out, /ambiguous/i, out);
  }
});

test('benford review: unambiguous shapes parse to the right values', () => {
  assert.equal(vals(screenMode('120\n340\n560\n780', 'auto').r), 4);               // newline
  assert.equal(vals(screenMode('120, 340, 560, 780', 'auto').r), 4);               // comma + space
  assert.equal(vals(screenMode('120,340,560,780,1200', 'auto').r), 5);             // run proves a list
  assert.equal(vals(screenMode('120,340,560\n780,120,1200', 'auto').r), 6);        // proof applies input-wide
  assert.equal(screenMode('120,340,560\n780,1200', 'auto').r, null);                // 780,1200 could be a decimal comma
  assert.equal(vals(screenMode('120;340;560\t780', 'auto').r), 4);                 // ; and tab
  assert.equal(vals(screenMode('n = 120, events = 34', 'auto').r), 2);             // labels
});

test('benford review: the comma control resolves the ambiguous cases', () => {
  assert.equal(vals(screenMode('120,340,560\n780,120,900', 'list').r), 6);
  assert.equal(vals(screenMode('120,340, 560, 780', 'list').r), 4);
  const t = screenMode('1,200 3,400 56,000 7,000,000', 'thousands').r;
  assert.deepEqual(Array.from(t.counts), [1, 0, 1, 0, 1, 0, 1, 0, 0]);
  const bad = screenMode('120,3400 5', 'thousands');                                   // not thousands-shaped
  assert.equal(bad.r, null); assert.match(bad.out, /not a thousands/i, bad.out);
});
