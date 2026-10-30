import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Legacy reader (shared/revman-reader.js, used by revman-importer): two ways a RevMan 5 file used to lose data without a
// trace. (1) An element inside a COMPARISON the reader does not read (e.g. OTHER_OUTCOME, an outcome type it does not
// support) vanished; (2) a dichotomous row with events > n, a negative count or a non-whole count was passed on and only
// caught (or not) when pushed into an app. Both must now be listed on outcome.skipped with a reason, the same list the
// importer already shows for unusable rows. Fixtures: fixtures/revman-gaps/*.rm5 (synthetic).
// Same minimal element-only DOMParser as unit/revman-reader-legacy.test.mjs (the unit job installs no packages).
function el(tagName, attrs, parent) {
  const n = { tagName, attrs, parent, children: [], text: '' };
  n.getAttribute = k => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null);
  n.getElementsByTagName = t => { const out = []; const walk = e => e.children.forEach(c => { if (c.tagName === t) out.push(c); walk(c); }); walk(n); return out; };
  Object.defineProperty(n, 'textContent', { get() { return n.text + n.children.map(c => c.textContent).join(''); } });
  return n;
}
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
class MiniDOMParser {
  parseFromString(xml) {
    const doc = el('#document', {}, null); let cur = doc;
    const body = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const re = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g; let m, seen = 0;
    while ((m = re.exec(body))) {
      if (m.index !== seen) throw new Error('MiniDOMParser: unparsed input at ' + seen);
      seen = re.lastIndex;
      if (m[5] !== undefined) { cur.text += unesc(m[5]); continue; }
      if (m[1]) { if (cur.tagName !== m[2]) throw new Error('MiniDOMParser: mismatched </' + m[2] + '>'); cur = cur.parent; continue; }
      const attrs = {}; for (const a of m[3].matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = unesc(a[2]);
      const child = el(m[2], attrs, cur); cur.children.push(child); if (!m[4]) cur = child;
    }
    if (seen !== body.length || cur !== doc) throw new Error('MiniDOMParser: unbalanced document');
    return doc;
  }
}
globalThis.DOMParser = MiniDOMParser;
const M = require('../../../../shared/revman-reader.js');

const read = name => readFileSync(new URL('../fixtures/revman-gaps/' + name, import.meta.url), 'utf8');
// Independent oracle: every data row (an element carrying STUDY_ID) inside ANALYSES_AND_DATA, read from the text.
const dataRows = src => [.../<ANALYSES_AND_DATA>[\s\S]*<\/ANALYSES_AND_DATA>/.exec(src)[0].matchAll(/<\w+\b[^>]*\bSTUDY_ID="([^"]*)"/g)].map(m => m[1]);
const accounted = r => r.comparisons.flatMap(c => c.outcomes.flatMap(o => [...o.studies.map(s => s.id), ...(o.skipped || []).map(s => s.studyId)]))
  .filter(id => id != null);
const T1 = 'Synthetic treatment', T2 = 'Synthetic control';

test('gap 1: an element the reader does not read inside a COMPARISON is listed on the skipped list, never dropped', () => {
  const src = read('unknown-element.rm5');
  const r = M._parseXmlString(src);
  const [c] = r.comparisons;
  // The valid outcome is read exactly as before.
  const [dich] = c.outcomes.filter(o => o.type === 'binary');
  assert.equal(dich.skipped, undefined);
  assert.deepEqual(dich.studies.map(s => [s.id, s.arms[0].events, s.arms[0].n, s.arms[1].events, s.arms[1].n]),
    [['STD-Unk-A', 4, 40, 9, 42], ['STD-Unk-B', 11, 55, 13, 53]]);
  // What it cannot read is reported, one entry per data row it holds, or one entry for an element without rows.
  const other = c.outcomes.filter(o => o.type !== 'binary');
  assert.deepEqual(other.map(o => [o.name, o.type, o.tag, o.studies, o.skipped]), [
    ['Synthetic other data table', 'unsupported', 'OTHER_OUTCOME', [], [
      { row: 1, studyId: 'STD-Unk-B', study: 'Synthetic Unk Beta', reason: 'OTHER_OUTCOME is not an outcome type this importer reads' },
      { row: 2, studyId: 'STD-Unk-C', study: 'Synthetic Unk Gamma', reason: 'OTHER_OUTCOME is not an outcome type this importer reads' }]],
    ['SYNTHETIC_NOTE', 'unsupported', 'SYNTHETIC_NOTE', [], [
      { row: null, studyId: null, study: null, reason: 'SYNTHETIC_NOTE element is not read by this importer' }]],
  ]);
  // Conservation: every data row in the file is imported or listed.
  assert.deepEqual(accounted(r).sort(), dataRows(src).sort());
  assert.equal(r.studyCount, 2);
  // The bus push still takes the valid outcome, with no reader-skipped count of its own.
  const env = M.comparisonToBus(c);
  assert.deepEqual([env.effectMeasure, env.studies.map(s => s.id), env._readerSkipped], ['RR', ['STD-Unk-A', 'STD-Unk-B'], undefined]);
  // A comparison holding only what the reader cannot read pushes nothing.
  assert.equal(M.comparisonToBus({ outcomes: other }), null);
});

test('gap 1: known outcomes nested in an unknown element are read once and not reported twice; known children are not reported', () => {
  const r = M._parseXmlString('<COCHRANE_REVIEW><ANALYSES_AND_DATA><COMPARISON><NAME>C</NAME><GROUP_LABEL_1>g1</GROUP_LABEL_1>' +
    '<GROUP_LABEL_2>g2</GROUP_LABEL_2><WRAPPER><DICH_OUTCOME NAME="D"><DICH_DATA STUDY_ID="x1" EVENTS_1="1" TOTAL_1="10" EVENTS_2="2" TOTAL_2="10"/>' +
    '</DICH_OUTCOME><EXTRA_DATA STUDY_ID="x2"/></WRAPPER><OTHER_WRAPPER><IV_OUTCOME NAME="I"><IV_DATA STUDY_ID="x3" EFFECT_SIZE="0.1" SE="0.2"/>' +
    '</IV_OUTCOME></OTHER_WRAPPER></COMPARISON></ANALYSES_AND_DATA></COCHRANE_REVIEW>');
  assert.deepEqual(r.comparisons[0].outcomes.map(o => [o.name, o.type, o.studies.map(s => s.id), o.skipped]), [
    ['D', 'binary', ['x1'], undefined],
    ['I', 'generic_iv', ['x3'], undefined],
    ['WRAPPER', 'unsupported', [], [{ row: 1, studyId: 'x2', study: 'x2', reason: 'WRAPPER is not an outcome type this importer reads' }]],
  ]);
});

const plantedCounts = [
  { row: 3, studyId: 'STD-Cnt-C', study: 'Synthetic Cnt Gamma', reason: 'EVENTS_1 exceeds TOTAL_1 (31 > 30)' },
  { row: 4, studyId: 'STD-Cnt-D', study: 'Synthetic Cnt Delta', reason: 'EVENTS_2 must be a whole number >= 0 (is -2)' },
  { row: 5, studyId: 'STD-Cnt-E', study: 'Synthetic Cnt Epsilon', reason: 'EVENTS_1 must be a whole number >= 0 (is 2.5)' },
  { row: 6, studyId: 'STD-Cnt-F', study: 'Synthetic Cnt Zeta', reason: 'TOTAL_2 must be a whole number > 0 (is 0)' },
  { row: 7, studyId: 'STD-Cnt-G', study: 'Synthetic Cnt Eta', reason: 'TOTAL_1 must be a whole number > 0 (is 40.5); EVENTS_2 exceeds TOTAL_2 (45 > 44)' },
];

test('gap 2: impossible dichotomous counts are flagged at read time on the skipped list and not passed on', () => {
  const src = read('dich-counts.rm5');
  const r = M._parseXmlString(src);
  const [o] = r.comparisons[0].outcomes;
  assert.equal(r.comparisons[0].outcomes.length, 1);
  assert.deepEqual(o.skipped, plantedCounts);
  // Valid rows are imported with unchanged numbers (0 events is a valid count).
  assert.deepEqual(o.studies, [
    { id: 'STD-Cnt-A', name: 'Synthetic Cnt Alpha', year: 2010, scale: 'OR',
      arms: [{ treatment: T1, events: 4, n: 40 }, { treatment: T2, events: 9, n: 42 }] },
    { id: 'STD-Cnt-B', name: 'Synthetic Cnt Beta', year: 2012, scale: 'OR',
      arms: [{ treatment: T1, events: 0, n: 55 }, { treatment: T2, events: 13, n: 53 }] }]);
  assert.deepEqual(accounted(r).sort(), dataRows(src).sort());
  assert.equal(r.studyCount, 2);
  // Same rule in the legacy attribute layout; events == n is valid.
  const legacy = M._parseXmlString('<COCHRANE_REVIEW><ANALYSES_AND_DATA><COMPARISON NAME="C"><DICH_OUTCOME NAME="D">' +
    '<DICH_DATA STUDY_ID="x1" EVENTS_1="10" TOTAL_1="10" EVENTS_2="0" TOTAL_2="10"/>' +
    '<DICH_DATA STUDY_ID="x2" EVENTS_1="1e1" TOTAL_1="9" EVENTS_2="1" TOTAL_2="-10"/>' +
    '</DICH_OUTCOME></COMPARISON></ANALYSES_AND_DATA></COCHRANE_REVIEW>').comparisons[0].outcomes[0];
  assert.deepEqual(legacy.studies.map(s => s.id), ['x1']);
  assert.deepEqual(legacy.skipped, [{ row: 2, studyId: 'x2', study: 'x2',
    reason: 'TOTAL_2 must be a whole number > 0 (is -10); EVENTS_1 exceeds TOTAL_1 (1e1 > 9)' }]);
});

test('gap 2: the bus push carries only the valid rows, counted as reader-skipped, with nothing left for the bus to drop', () => {
  assert.equal(globalThis.MaComparisons, undefined);
  const plain = M.comparisonToBus(M._parseXmlString(read('dich-counts.rm5')).comparisons[0]);
  assert.deepEqual([plain.studies.map(s => s.id), plain._readerSkipped], [['STD-Cnt-A', 'STD-Cnt-B'], 5]);
  // With the real bus helper loaded, buildEnvelope finds nothing further to drop (before, it dropped four of these rows
  // at push time and let the 2.5-event row through).
  require('../../../../shared/ma-comparisons-v1.js');
  assert.ok(globalThis.MaComparisons && globalThis.MaComparisons.buildEnvelope);
  const env = M.comparisonToBus(M._parseXmlString(read('dich-counts.rm5')).comparisons[0]);
  assert.deepEqual([env.studies.map(s => s.id), env._readerSkipped, env._dropped], [['STD-Cnt-A', 'STD-Cnt-B'], 5, undefined]);
  assert.deepEqual(env.studies.map(s => s.arms.map(a => [a.events, a.n])), [[[4, 40], [9, 42]], [[0, 55], [13, 53]]]);
});
