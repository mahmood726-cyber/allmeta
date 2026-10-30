import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// The legacy reader (shared/revman-reader.js, used by revman-importer) parses with the browser DOMParser.
// Node has none and the unit job installs no packages, so this is a minimal element-only XML DOM covering
// exactly what the reader calls: parseFromString, getElementsByTagName (document order), getAttribute, textContent.
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

// Same synthetic, hand-written fixture as unit/alm-revman-ipd.test.mjs and rchecks/revman-ipd.R.
const fixture = new URL('../fixtures/revman-ipd/ipd.rm5', import.meta.url);
const source = readFileSync(fixture, 'utf8');
// Independent oracle: IPD_DATA attributes read straight from the fixture text, not via any parser.
const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
const ipdRows = [...source.matchAll(/<IPD_DATA\b[^>]*\/>/g)].map(m => ({ id: attr(m[0], 'STUDY_ID'), oe: Number(attr(m[0], 'O_E')), v: Number(attr(m[0], 'VAR')) }));
const names = { 'STD-Synth-A': 'Synthetic Alpha', 'STD-Synth-B': 'Synthetic Beta', 'STD-Synth-C': 'Synthetic Gamma', 'STD-Synth-D': 'Synthetic Delta' };
const buf = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
// The dichotomous outcome exactly as the reader returned it before IPD support (attribute-only NAME/GROUP_LABEL/YEAR_OF_PUB
// reads are pre-existing behaviour, deliberately not changed here).
const dichBefore = {
  name: 'Outcome', type: 'binary', effectMeasure: 'OR', arm1Name: 'Group 1', arm2Name: 'Group 2',
  studies: [['STD-Synth-A', 12, 101, 19, 99], ['STD-Synth-B', 0, 45, 3, 47], ['STD-Synth-C', 30, 250, 41, 248]].map(([id, e1, n1, e2, n2]) => ({
    id, name: names[id], year: null, scale: 'OR',
    arms: [{ treatment: 'Group 1', events: e1, n: n1 }, { treatment: 'Group 2', events: e2, n: n2 }] })),
};

test('legacy reader imports the RevMan 5 IPD (O-E and variance) outcome next to the unchanged dichotomous one', async () => {
  assert.equal(ipdRows.length, 4);
  const review = await M.parse(buf(readFileSync(fixture)));
  assert.equal(review.comparisons.length, 1);
  const outcomes = review.comparisons[0].outcomes;
  assert.deepEqual(outcomes.map(o => [o.type, o.effectMeasure, o.studies.length]), [['binary', 'OR', 3], ['o_e_var', 'HR', 4]]);
  assert.deepEqual(JSON.parse(JSON.stringify(outcomes[0])), dichBefore);
  assert.equal(review.studyCount, 7);
  const ipd = outcomes[1];
  assert.deepEqual([ipd.arm1Name, ipd.arm2Name], ['Experimental', 'Control']);
  ipd.studies.forEach((s, i) => {
    const want = ipdRows[i];
    assert.equal(s.id, want.id); assert.equal(s.name, names[want.id]); assert.equal(s.scale, 'HR');
    assert.deepEqual(s.oeVar, { oe: want.oe, v: want.v });
    assert.equal(s.precomputed.est, want.oe / want.v);
    assert.equal(s.precomputed.se, 1 / Math.sqrt(want.v));
    assert.deepEqual(s.arms, [{ treatment: 'Experimental', oeVarianceEst: want.oe / want.v, se: 1 / Math.sqrt(want.v) }, { treatment: 'Control', isReference: true }]);
  });
});

test('bus push is unchanged: the dichotomous outcome is pushed, an IPD-only comparison is refused explicitly', () => {
  assert.equal(globalThis.MaComparisons, undefined);
  const both = M._parseXmlString(source).comparisons[0];
  const env = M.comparisonToBus(both);
  assert.equal(env.effectMeasure, 'OR');
  assert.deepEqual(env.studies.map(s => [s.id, s.arms[0].events, s.arms[1].events]), [['STD-Synth-A', 12, 19], ['STD-Synth-B', 0, 3], ['STD-Synth-C', 30, 41]]);
  const dich = /<DICH_OUTCOME\b[\s\S]*?<\/DICH_OUTCOME>\r?\n/;
  assert.match(source, dich);
  const onlyIpd = M._parseXmlString(source.replace(dich, '')).comparisons[0];
  assert.deepEqual(onlyIpd.outcomes.map(o => [o.type, o.studies.length]), [['o_e_var', 4]]);
  assert.deepEqual(M.comparisonToBus(onlyIpd), { _unsupported: 'o_e_var', name: 'Outcome', effectMeasure: 'HR' });
});

test('IPD effect measure: EFFECT_MEASURE element text is mapped, attribute wins, absent defaults to HR', () => {
  const em = s => M._parseXmlString(s).comparisons[0].outcomes[1].effectMeasure;
  const child = '<EFFECT_MEASURE>Hazard Ratio</EFFECT_MEASURE>';
  assert.ok(source.includes(child));
  assert.equal(em(source.replace(child, '<EFFECT_MEASURE>Peto Odds Ratio</EFFECT_MEASURE>')), 'OR');
  assert.equal(em(source.replace(child, '')), 'HR');
  assert.equal(em(source.replace('<IPD_OUTCOME DF="3"', '<IPD_OUTCOME EFFECT_MEASURE="PETO_OR" DF="3"')), 'OR');
});

test('legacy IPD import witness for the independent meta::read.rm5 check (rchecks/revman-ipd.R)', () => {
  const ipd = M._parseXmlString(source).comparisons[0].outcomes[1];
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['studyId', 'study', 'o_e', 'var', 'est', 'se'].map(q).join(',')];
  for (const s of ipd.studies) lines.push([s.id, s.name, s.oeVar.oe, s.oeVar.v, s.precomputed.est, s.precomputed.se].map(q).join(','));
  const out = new URL('../rchecks-out/revman-ipd/', import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL('legacy-ipd.csv', out), lines.join('\n') + '\n');
  writeFileSync(new URL('legacy-fixture.md5', out), createHash('md5').update(readFileSync(fixture)).digest('hex') + '\n');
  assert.equal(lines.length, 5);
});
