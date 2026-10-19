// Synthetic inputs exercise the first-run/interoperability helpers; they are not research evidence.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const UX = require('../ux.js');

test('AI-ranking gate counts up to two relevant and two irrelevant labels', () => {
  assert.equal(UX.gate([]).text, 'Label 2 relevant and 2 irrelevant to start AI ranking: 0/2, 0/2.');
  const partial = UX.gate([1, null, 0, 0, 0]);
  assert.equal(partial.met, false);
  assert.equal(partial.text, 'Label 2 relevant and 2 irrelevant to start AI ranking: 1/2, 2/2.');
  const met = UX.gate([1, 1, 0, 0, 0]);
  assert.equal(met.met, true);
  assert.equal(met.inc, 2); assert.equal(met.exc, 3);
});

test('progress counts irrelevant decisions since the most recent relevant one, in decision-time order', () => {
  const p = UX.progress([
    {d: 'exclude', at: '2026-01-01T00:00:05Z'},
    {d: 'include', at: '2026-01-01T00:00:02Z'},
    {d: 'exclude', at: '2026-01-01T00:00:03Z'},
    {d: 'maybe', at: '2026-01-01T00:00:04Z'},
    {d: '', at: ''},
    {d: 'include', at: '2026-01-01T00:00:01Z'}
  ]);
  assert.deepEqual([p.screened, p.relevant, p.irrelevant, p.maybe, p.sinceLastRelevant, p.anyRelevant, p.untimed],
    [5, 2, 2, 1, 2, true, 0]);
  // A newer include resets the run; untimed (imported) decisions are ordered first.
  const q = UX.progress([{d: 'include', at: ''}, {d: 'exclude', at: ''}, {d: 'exclude', at: '2026-01-01T00:00:01Z'}]);
  assert.equal(q.sinceLastRelevant, 2); assert.equal(q.untimed, 2);
  const none = UX.progress([{d: 'exclude', at: '2026-01-01T00:00:01Z'}]);
  assert.equal(none.anyRelevant, false);
});

test('ASReview label columns and values are recognised; other values are treated as unseen', () => {
  for (const name of ['included', 'label_included', 'final_included', 'asreview_label', 'Label', 'include'])
    assert.notEqual(UX.labelColumn(['title', 'abstract', name]), -1, name);
  assert.equal(UX.labelColumn(['title', 'abstract', 'labels']), -1);
  assert.equal(UX.labelColumn(['asreview_label', 'included']), 0, 'asreview_label wins');
  assert.deepEqual(['1', '0', '', '1.0', ' 0 ', '-1', 'RCT', null].map(UX.parseLabel), [1, 0, null, 1, 0, null, null, null]);
  assert.equal(UX.risNoteLabel('ASReview_relevant'), 1);
  assert.equal(UX.risNoteLabel('some note; ASReview_irrelevant'), 0);
  assert.equal(UX.risNoteLabel('ASReview_not_seen'), null);
  assert.equal(UX.risNoteLabel('relevant'), null);
});

test('ASReview CSV export uses recognised columns, 1/0/blank labels and neutralises formulas', () => {
  const csv = UX.asreviewCSV([
    {title: 'A', abstract: 'x', authors: ['Doe J', 'Roe K'], year: '2020', journal: 'J', doi: '10.1/a', d: 'include'},
    {title: '=HYPERLINK("bad")', abstract: '', authors: [], year: '', journal: '', doi: '', d: 'exclude'},
    {title: 'C', abstract: '', authors: [], year: '', journal: '', doi: '', d: 'maybe'},
    {title: 'D', abstract: '', d: ''}
  ], r => r.d).split('\n');
  assert.equal(csv[0], '"title","abstract","authors","year","journal","doi","included"');
  assert.equal(csv[1], '"A","x","Doe J; Roe K","2020","J","10.1/a","1"');
  assert.ok(csv[2].startsWith('"\'=HYPERLINK(""bad"")"') && csv[2].endsWith(',"0"'));
  assert.ok(csv[3].endsWith(',""'), 'maybe exports as unlabelled');
  assert.ok(csv[4].endsWith(',""'));
});

test('detected format names follow the import parser order', () => {
  assert.equal(UX.formatName('TY  - JOUR\nTI  - x\nER  - ', 'a.txt'), 'RIS');
  assert.equal(UX.formatName('PMID- 1\nTI  - x', 'a.txt'), 'PubMed/MEDLINE (nbib)');
  assert.equal(UX.formatName('﻿[{"title":"x"}]', 'a.json'), 'JSON');
  assert.equal(UX.formatName('title,abstract\nx,y', 'a.csv'), 'CSV');
  assert.equal(UX.formatName('anything', 'export.ris'), 'RIS');
});
