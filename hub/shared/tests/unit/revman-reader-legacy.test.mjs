import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Legacy reader (shared/revman-reader.js, used by revman-importer): RevMan 5's real continuous tag (CONT_OUTCOME),
// generic inverse variance (IV_OUTCOME), child-element NAME/GROUP_LABEL and YEAR, and rows it cannot use, which
// must be listed on their outcome (outcome.skipped) instead of vanishing. Tag/attribute names follow
// meta::read.rm5 (meta 8.5.0, read.rm5.rm5 / extract_outcomes); rchecks/revman-legacy.R compares with meta itself.
// Same minimal element-only DOMParser as unit/revman-reader-ipd.test.mjs (the unit job installs no packages).
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

const fixture = new URL('../fixtures/revman-legacy/legacy.rm5', import.meta.url);
const source = readFileSync(fixture, 'utf8');
// Independent oracle: data rows read straight from the fixture text, not via any parser.
const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
const block = tag => new RegExp('<' + tag + '\\b[\\s\\S]*?</' + tag + '>').exec(source)[0];
const rows = (tag, data) => [...block(tag).matchAll(new RegExp('<' + data + '\\b[^>]*/>', 'g'))].map(m => m[0]);
const names = { 'STD-Leg-A': 'Synthetic Leg Alpha', 'STD-Leg-B': 'Synthetic Leg Beta', 'STD-Leg-C': 'Synthetic Leg Gamma',
  'STD-Leg-D': 'Synthetic Leg Delta', 'STD-Leg-E': 'Synthetic Leg Epsilon', 'STD-Leg-F': 'Synthetic Leg Zeta' };
const years = { 'STD-Leg-A': 2010, 'STD-Leg-B': 2012, 'STD-Leg-C': 2015, 'STD-Leg-D': 2016, 'STD-Leg-E': 2018, 'STD-Leg-F': 2021 };
const review = () => M._parseXmlString(source);
const byType = (r, t) => r.comparisons[0].outcomes.filter(o => o.type === t);
const T1 = 'Synthetic treatment', T2 = 'Synthetic control';
// The planted invalid rows, as the fixture comment documents them (row = position among the outcome's data rows).
const plantedSkips = {
  continuous: [
    { row: 4, studyId: 'STD-Leg-D', study: 'Synthetic Leg Delta', reason: 'SD_1 must be > 0 (is 0)' },
    { row: 5, studyId: 'STD-Leg-E', study: 'Synthetic Leg Epsilon', reason: 'MEAN_2 missing' },
    { row: 6, studyId: 'STD-Leg-F', study: 'Synthetic Leg Zeta', reason: 'SD_2 must be > 0 (is -1.6); TOTAL_2 must be > 0 (is 0)' }],
  generic_iv: [
    { row: 3, studyId: 'STD-Leg-C', study: 'Synthetic Leg Gamma', reason: 'SE must be > 0 (is 0)' },
    { row: 5, studyId: 'STD-Leg-E', study: 'Synthetic Leg Epsilon', reason: 'SE missing' }],
  binary: [{ row: 3, studyId: 'STD-Leg-F', study: 'Synthetic Leg Zeta', reason: 'TOTAL_2 missing' }],
  o_e_var: [{ row: 2, studyId: 'STD-Leg-C', study: 'Synthetic Leg Gamma', reason: 'VAR must be > 0 (is 0)' }],
};

test('RevMan 5 CONT_OUTCOME / CONT_DATA is imported as continuous (n from TOTAL_1/TOTAL_2, as meta reads it)', () => {
  const [cont] = byType(review(), 'continuous');
  assert.ok(cont, 'CONT_OUTCOME was dropped');
  assert.deepEqual([cont.name, cont.effectMeasure, cont.arm1Name, cont.arm2Name], ['Synthetic continuous score', 'MD', T1, T2]);
  const want = rows('CONT_OUTCOME', 'CONT_DATA').filter(t => !plantedSkips.continuous.some(s => attr(t, 'STUDY_ID') === s.studyId));
  assert.equal(want.length, 3);
  assert.deepEqual(cont.studies, want.map(t => { const id = attr(t, 'STUDY_ID'); return {
    id, name: names[id], year: years[id], scale: 'MD',
    arms: [{ treatment: T1, mean: Number(attr(t, 'MEAN_1')), sd: Number(attr(t, 'SD_1')), n: Number(attr(t, 'TOTAL_1')) },
           { treatment: T2, mean: Number(attr(t, 'MEAN_2')), sd: Number(attr(t, 'SD_2')), n: Number(attr(t, 'TOTAL_2')) }] }; }));
});

test('RevMan 5 IV_OUTCOME / IV_DATA is imported as generic_iv with EFFECT_SIZE and SE exactly as stored', () => {
  const [iv] = byType(review(), 'generic_iv');
  assert.ok(iv, 'IV_OUTCOME was dropped');
  assert.deepEqual([iv.name, iv.effectMeasure, iv.logData, iv.arm1Name, iv.arm2Name], ['Synthetic generic inverse variance', 'RR', 'YES', T1, T2]);
  const want = rows('IV_OUTCOME', 'IV_DATA').filter(t => !plantedSkips.generic_iv.some(s => attr(t, 'STUDY_ID') === s.studyId));
  assert.equal(want.length, 3);
  assert.deepEqual(iv.studies, want.map(t => { const id = attr(t, 'STUDY_ID'), est = Number(attr(t, 'EFFECT_SIZE')), se = Number(attr(t, 'SE')); return {
    id, name: names[id], year: years[id], scale: 'RR', precomputed: { est, se },
    arms: [{ treatment: T1, est, se }, { treatment: T2, isReference: true }] }; }));
  // Effect measure: attribute wins, child text is mapped as meta maps it, absent is null (never guessed).
  const em = s => byType(M._parseXmlString(s), 'generic_iv')[0].effectMeasure;
  assert.equal(em(source.replace('<EFFECT_MEASURE>Risk Ratio</EFFECT_MEASURE>', '<EFFECT_MEASURE>Std. Mean Difference</EFFECT_MEASURE>')), 'SMD');
  assert.equal(em(source.replace('<IV_OUTCOME DF="4"', '<IV_OUTCOME EFFECT_MEASURE="MD" DF="4"')), 'MD');
  assert.equal(em(source.replace('<EFFECT_MEASURE>Risk Ratio</EFFECT_MEASURE>', '')), null);
});

test('every unusable row is listed in outcome.skipped with row, study and reason; none vanishes', () => {
  const r = review();
  const tags = { binary: ['DICH_OUTCOME', 'DICH_DATA'], continuous: ['CONT_OUTCOME', 'CONT_DATA'], generic_iv: ['IV_OUTCOME', 'IV_DATA'], o_e_var: ['IPD_OUTCOME', 'IPD_DATA'] };
  for (const [type, [outcomeTag, dataTag]] of Object.entries(tags)) {
    const [o] = byType(r, type);
    assert.deepEqual(o.skipped, plantedSkips[type], type);
    // Conservation: imported + skipped = every data row in the file for that outcome.
    assert.equal(o.studies.length + o.skipped.length, rows(outcomeTag, dataTag).length, type + ' row count');
  }
  assert.equal(r.studyCount, 2 + 3 + 3 + 2);
  // The legacy-layout tags report the same way (they were the silent `continue`s before).
  const legacy = M._parseXmlString('<COCHRANE_REVIEW><ANALYSES_AND_DATA><COMPARISON NAME="C">' +
    '<CONTINUOUS_OUTCOME NAME="Cont"><CONTINUOUS_DATA STUDY_ID="x1" N_1="10" MEAN_1="1" SD_1="1" N_2="10" MEAN_2="2" SD_2="1"/>' +
    '<CONTINUOUS_DATA STUDY_ID="x2" N_1="0" MEAN_1="1" SD_1="1" N_2="10" MEAN_2="2" SD_2="1"/>' +
    '<CONTINUOUS_DATA STUDY_ID="x3" N_1="10" MEAN_1="12abc" SD_1="1" N_2="10" MEAN_2="2" SD_2="1"/></CONTINUOUS_OUTCOME>' +
    '<O_E_AND_VARIANCE_OUTCOME NAME="OE"><O_E_AND_VARIANCE_DATA STUDY_ID="x1" O_MINUS_E="-1" VARIANCE="-2"/>' +
    '<O_E_AND_VARIANCE_DATA STUDY_ID="x2" O_MINUS_E="1" VARIANCE="4"/></O_E_AND_VARIANCE_OUTCOME>' +
    '<DICH_OUTCOME NAME="D"><DICH_DATA STUDY_ID="x1" EVENTS_1="1" TOTAL_1="10" EVENTS_2="" TOTAL_2="10"/></DICH_OUTCOME>' +
    '</COMPARISON></ANALYSES_AND_DATA></COCHRANE_REVIEW>').comparisons[0].outcomes;
  assert.deepEqual(legacy.map(o => [o.name, o.studies.map(s => s.id), o.skipped]), [
    ['D', [], [{ row: 1, studyId: 'x1', study: 'x1', reason: 'EVENTS_2 missing' }]],
    ['Cont', ['x1'], [{ row: 2, studyId: 'x2', study: 'x2', reason: 'N_1 must be > 0 (is 0)' },
                      { row: 3, studyId: 'x3', study: 'x3', reason: 'MEAN_1 is not a number ("12abc")' }]],
    ['OE', ['x2'], [{ row: 1, studyId: 'x1', study: 'x1', reason: 'VARIANCE must be > 0 (is -2)' }]],
  ]);
});

test('NAME / GROUP_LABEL are read from RevMan 5 child elements and the study year from YEAR; attributes still win', () => {
  const r = review();
  assert.equal(r.comparisons[0].name, 'Synthetic legacy comparison');
  for (const o of r.comparisons[0].outcomes) {
    assert.notEqual(o.name, 'Outcome'); assert.deepEqual([o.arm1Name, o.arm2Name], [T1, T2]);
    for (const s of o.studies) assert.equal(s.year, years[s.id]);
  }
  assert.deepEqual(r.comparisons[0].outcomes.map(o => o.name),
    ['Synthetic dichotomous events', 'Synthetic continuous score', 'Synthetic time to event', 'Synthetic generic inverse variance']);
  const one = x => M._parseXmlString('<COCHRANE_REVIEW><STUDIES><STUDY ID="s" NAME="S" ' + x.year + '/></STUDIES><ANALYSES_AND_DATA>' +
    '<COMPARISON ' + x.cAttr + '>' + x.cChild + '<DICH_OUTCOME ' + x.oAttr + '>' + x.oChild +
    '<DICH_DATA STUDY_ID="s" EVENTS_1="1" TOTAL_1="10" EVENTS_2="2" TOTAL_2="10"/></DICH_OUTCOME></COMPARISON></ANALYSES_AND_DATA></COCHRANE_REVIEW>');
  const view = r => { const c = r.comparisons[0], o = c.outcomes[0]; return [c.name, o.name, o.arm1Name, o.arm2Name, o.studies[0].year]; };
  // Attribute beats child element; YEAR_OF_PUB beats YEAR.
  assert.deepEqual(view(one({ year: 'YEAR_OF_PUB="1999" YEAR="2001"', cAttr: 'NAME="cA"', cChild: '<NAME>cC</NAME>',
    oAttr: 'NAME="oA" GROUP_LABEL_1="g1A"', oChild: '<NAME>oC</NAME><GROUP_LABEL_1>g1C</GROUP_LABEL_1><GROUP_LABEL_2>g2C</GROUP_LABEL_2>' })),
    ['cA', 'oA', 'g1A', 'g2C', 1999]);
  // Only DIRECT children count: a comparison never takes its outcome's NAME; comparison-level labels are inherited.
  assert.deepEqual(view(one({ year: '', cAttr: '', cChild: '<GROUP_LABEL_1>cg1</GROUP_LABEL_1><GROUP_LABEL_2>cg2</GROUP_LABEL_2>',
    oAttr: '', oChild: '<NAME>Only the outcome</NAME>' })), ['Comparison', 'Only the outcome', 'cg1', 'cg2', null]);
});

test('valid legacy-layout input is unchanged: tiny.rm5 output is byte-identical to the pre-change reader', async () => {
  const tiny = readFileSync(new URL('../../../../tests/fixtures/revman/tiny.rm5', import.meta.url));
  const out = JSON.stringify(await M.parse(tiny.buffer.slice(tiny.byteOffset, tiny.byteOffset + tiny.byteLength)));
  assert.ok(!out.includes('"skipped"'));
  // sha256 of JSON.stringify(parse(tiny.rm5)) produced by shared/revman-reader.js at 5fe5adf1 (before this change).
  assert.equal(createHash('sha256').update(out).digest('hex'), '90e90ae5e5bd61242e5cd5b4ee229baa744e6a3ac3960304f9be74039181705a');
});

test('bus push: countable outcome pushed with the reader-skipped count; IV-only refused explicitly; CONT-only pushes', () => {
  assert.equal(globalThis.MaComparisons, undefined);
  const env = M.comparisonToBus(review().comparisons[0]);
  assert.equal(env.effectMeasure, 'RR');
  assert.deepEqual(env.studies.map(s => s.id), ['STD-Leg-A', 'STD-Leg-B']);
  assert.equal(env._readerSkipped, 1);
  const only = keep => {
    let s = source;
    for (const t of ['DICH_OUTCOME', 'CONT_OUTCOME', 'IV_OUTCOME', 'IPD_OUTCOME']) if (t !== keep) s = s.replace(new RegExp('<' + t + '\\b[\\s\\S]*?</' + t + '>\\r?\\n'), '');
    return M._parseXmlString(s).comparisons[0];
  };
  assert.deepEqual(M.comparisonToBus(only('IV_OUTCOME')), { _unsupported: 'generic_iv', name: 'Synthetic generic inverse variance', effectMeasure: 'RR' });
  const cont = M.comparisonToBus(only('CONT_OUTCOME'));
  assert.equal(cont.effectMeasure, 'MD');
  assert.deepEqual(cont.studies.map(s => [s.id, s.arms[0].n, s.arms[1].n]), [['STD-Leg-A', 40, 42], ['STD-Leg-B', 55, 53], ['STD-Leg-C', 31, 30]]);
  assert.equal(cont._readerSkipped, 3);
});

test('legacy-reader witness for the independent meta::read.rm5 check (rchecks/revman-legacy.R)', () => {
  const r = review();
  const q = v => (v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"');
  const head = ['type', 'comparison', 'outcome', 'label_e', 'label_c', 'studyId', 'study', 'year', 'mean_e', 'sd_e', 'n_e', 'mean_c', 'sd_c', 'n_c', 'event_e', 'event_c', 'o_e', 'var', 'est', 'se'];
  const lines = [head.map(q).join(',')], skipped = [['type', 'outcome', 'row', 'studyId', 'study', 'reason'].map(q).join(',')];
  const c = r.comparisons[0].name;
  for (const o of r.comparisons[0].outcomes) {
    for (const s of o.studies) {
      const [a, b] = s.arms;
      const v = o.type === 'continuous' ? [a.mean, a.sd, a.n, b.mean, b.sd, b.n, null, null, null, null, null, null]
        : o.type === 'binary' ? [null, null, a.n, null, null, b.n, a.events, b.events, null, null, null, null]
        : o.type === 'o_e_var' ? [null, null, null, null, null, null, null, null, s.oeVar.oe, s.oeVar.v, s.precomputed.est, s.precomputed.se]
        : [null, null, null, null, null, null, null, null, null, null, s.precomputed.est, s.precomputed.se];
      lines.push([o.type, c, o.name, o.arm1Name, o.arm2Name, s.id, s.name, s.year, ...v].map(q).join(','));
    }
    for (const s of o.skipped || []) skipped.push([o.type, o.name, s.row, s.studyId, s.study, s.reason].map(q).join(','));
  }
  const out = new URL('../rchecks-out/revman-legacy/', import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL('legacy-rows.csv', out), lines.join('\n') + '\n');
  writeFileSync(new URL('legacy-skipped.csv', out), skipped.join('\n') + '\n');
  writeFileSync(new URL('legacy-fixture.md5', out), createHash('md5').update(readFileSync(fixture)).digest('hex') + '\n');
  assert.equal(lines.length, 1 + 10);
  assert.equal(skipped.length, 1 + 7);
});
