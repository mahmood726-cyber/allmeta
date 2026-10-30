// Lane A3 unit tests (node --test): every journal preset is sourced, and the source check can fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../plot-presets.js');
const clone = o => JSON.parse(JSON.stringify(o));

test('every journal preset has a source URL, a retrieved date and fragments stating each number', () => {
  assert.ok(P.JOURNALS.length >= 5);
  for (const j of ['F1000Research', 'The BMJ', 'The Lancet', 'JAMA', 'PLOS ONE']) assert.ok(P.JOURNALS.some(p => p.journal === j), j);
  for (const p of P.JOURNALS) {
    assert.deepEqual(P.checkPreset(p), [], p.id);
    assert.match(p.source.url, /^https:\/\//);
    assert.equal(p.source.retrieved, '2026-10-18');
    for (const q of p.source.quote) assert.ok(q.split(/\s+/).length < 20, 'quotes stay short: ' + q);
  }
  assert.equal(new Set(P.JOURNALS.map(p => p.id)).size, P.JOURNALS.length);
});

test('the source check refuses unsourced or mismatched presets', () => {
  const base = P.byId('lancet-107');
  const cases = {
    'source URL missing': p => { delete p.source.url; },
    'retrieved date missing': p => { p.source.retrieved = 'October'; },
    'quote missing': p => { p.source.quote = []; },
    'is not stated by': p => { p.widthMm = 110; },
    'dpi 600 is not stated': p => { p.dpi = 600; },
    'fragment not in quote': p => { p.source.evidence[0][1] = 'width 110 mm'; },
    'no evidence for minFontPt': p => { p.minFontPt = 8; },
    'dpi must be a positive integer': p => { p.dpi = 0; }
  };
  for (const [expected, mutate] of Object.entries(cases)) {
    const p = clone(base); mutate(p);
    const problems = P.checkPreset(p);
    assert.ok(problems.some(x => x.includes(expected)), expected + ' -> ' + JSON.stringify(problems));
  }
  // A journal claim made from memory (no source at all) is refused.
  assert.ok(P.checkPreset({id: 'memory', journal: 'X', widthMm: 89, dpi: 300}).length > 0);
});

test('fragment numbers convert units exactly', () => {
  assert.equal(P.evidenceValue('(13.2 cm)', 0), 132);
  assert.equal(P.evidenceValue('Maximum width 19.05', 0), 190.5);
  assert.equal(P.evidenceValue('between 75-150 mm width', 1), 150);
  assert.equal(P.evidenceValue('≥600 ppi', 0), 600);
  assert.ok(Number.isNaN(P.evidenceValue('no number', 0)));
});

test('built-in sizes are unchanged and the Okabe-Ito colours are the R grDevices values', () => {
  assert.deepEqual(P.SIZES.map(s => s.widthMm), [85, 170]);
  // R 4.6.0: palette.colors(palette = "Okabe-Ito") minus black (#000000) and grey (#999999).
  assert.deepEqual([...P.OKABE_ITO].sort(), ['#0072B2', '#009E73', '#56B4E9', '#CC79A7', '#D55E00', '#E69F00', '#F0E442']);
  assert.deepEqual(P.COLOUR_MODES.map(m => m[0]), ['default', 'okabe-ito', 'greyscale']);
});

test('colour parsing accepts hex/rgb/rgba and refuses what it does not understand', () => {
  assert.deepEqual(P.parseColour('#14532d'), {r: 20, g: 83, b: 45, a: null});
  assert.deepEqual(P.parseColour('#fff'), {r: 255, g: 255, b: 255, a: null});
  assert.deepEqual(P.parseColour('rgba(1, 2, 3, 0.5)'), {r: 1, g: 2, b: 3, a: '0.5'});
  assert.equal(P.parseColour('none'), null);
  assert.equal(P.parseColour('url(#grad)'), null);
});

test('font warning thresholds', () => {
  const lancet = P.byId('lancet-107'), f1000 = P.byId('f1000-75');
  assert.equal(P.fontWarning({minPt: 7.9}, f1000), 'Smallest text is 7.9 pt at this width; F1000Research asks for at least 8 pt.');
  assert.equal(P.fontWarning({minPt: 8}, f1000), '');
  assert.equal(P.fontWarning({minPt: 5.9}, lancet), 'Smallest text is 5.9 pt at this width; below 6 pt may be hard to read.');
  assert.equal(P.fontWarning({minPt: 6.5}, null), '');
  assert.equal(P.fontWarning({minPt: null}, f1000), '');
});

test('unknown colour mode is refused', () => {
  assert.throws(() => P.applyColourMode({}, 'sepia'), /Unknown colour mode/);
  assert.deepEqual(P.applyColourMode({}, 'default'), {changed: 0, mapped: [], warnings: []});
});
