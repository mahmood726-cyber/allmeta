import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const glossary = JSON.parse(readFileSync(new URL('../../glossary.json', import.meta.url), 'utf8'));
// Fixed pre-review inventory: removing a citation must not remove its obligation.
const cited = {
  10: 'HKSJ REML DL PM I2 tau2 PI Subgroup MetaRegression Q FE RE i2'.split(' '),
  11: 'NMA SUCRA Network Indirect Direct Inconsistency NodeSplit DesignTreatment Transitivity PScore PBest League Consistency'.split(' '),
  13: 'Egger Peters TrimFill Funnel Harbord SmallStudy PublicationBias'.split(' '),
};
const textOf = entry => entry.short + (entry.long ? ' — ' + entry.long : '');
function chapterCitations(g) {
  for (const [key, entry] of Object.entries(g)) {
    if (key === '_meta') continue;
    assert.doesNotMatch(textOf(entry), /§/, `${key}: section citation`);
    assert.doesNotMatch(textOf(entry), /Cochrane Handbook[^.;]*\b\d+\.\d+/i, `${key}: numbered subsection`);
  }
  for (const [chapter, keys] of Object.entries(cited)) for (const key of keys) {
    assert.match(textOf(g[key]), new RegExp(`Cochrane Handbook, chapter ${chapter}\\b(?!\\.)|Cochrane Handbook, chapter ${chapter}\\.(?!\\d)`), `${key}: chapter ${chapter} citation`);
  }
}
const caution = 'biased when there are few studies (k < 10); REML or Paule–Mandel are preferred';
function dlCaution(g) {
  assert.ok(textOf(g.DL).includes(caution), 'DL: small-study bias and preferred estimators');
  assert.ok([...textOf(g.DL)].length <= 280, 'DL: maximum 280 characters');
}

test('Handbook citations use chapters and retain all 33 previously cited entries', () => chapterCitations(glossary));
test('chapter citation controls reject planted sections, removed citations and wrong chapters', () => {
  const control = structuredClone(glossary);
  for (const [chapter, keys] of Object.entries(cited)) for (const key of keys) {
    control[key].long = `Definition. Cochrane Handbook, chapter ${chapter}.`;
  }
  chapterCitations(control);
  for (const [chapter, keys] of Object.entries(cited)) for (const key of keys) {
    for (const long of ['Definition. Cochrane Handbook §10.10.2.', 'Definition.',
      'Definition. Cochrane Handbook, chapter 99.', `Definition. Cochrane Handbook, chapter ${chapter}.10.2.`]) {
      const broken = structuredClone(control); broken[key].long = long;
      assert.throws(() => chapterCitations(broken));
    }
  }
  const broken = structuredClone(control); broken.CI.short += ' §10.10.2';
  assert.throws(() => chapterCitations(broken), /section citation/);
});
test('DL retains the requested small-study caution within the tooltip length limit', () => dlCaution(glossary));
test('DL caution controls reject missing caution, changed threshold, preference and excessive length', () => {
  const control = structuredClone(glossary);
  control.DL.long = `Moment-based estimate of heterogeneity; ${caution}. Cochrane Handbook, chapter 10.`;
  dlCaution(control);
  for (const long of ['Moment-based estimate of heterogeneity.',
    control.DL.long.replace('k < 10', 'k < 5'),
    control.DL.long.replace('REML or Paule–Mandel are preferred', 'DL is preferred'),
    control.DL.long + 'x'.repeat(281)]) {
    const broken = structuredClone(control); broken.DL.long = long;
    assert.throws(() => dlCaution(broken));
  }
});
