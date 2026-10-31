// FU9 (STATUS.md): the generated Methods text counts REPORTS as distinct references (DOI, else PMID, else normalised
// citation), never rows; two arms of one paper are 1 report. Rows with no identifier at all count individually, and the
// sentence SAYS so. alm-text is loaded first WITHOUT AlmEntry (its own count must hold), then with AlmEntry (parity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AlmText = require('../../../../shared/alm-text.js');
const templates = {
  plain: (T) => ['Pooled estimate ', T.num('est', 2), '.'],
  methods: (T) => ['Random-effects model. ', T.entry(), T.when(T.entry(), ' '), T.software()],
  results: (T) => ['k = ', T.int('k'), '.'],
};
const results = { est: -0.1234, k: 3 };
const build = { version: 'v1.7.0', shortSha: '7899ce5' };
const rec = (id, ids = {}) => ({ id, label: id, location: 'Table 1', conversions: [], flags: [], ...ids });
const methods = (provenance) => AlmText.render(templates, results, { app: 'demo-app', build, provenance }).methods.text;
const entry = (provenance) => /Data were extracted[^.]*\./.exec(methods(provenance))?.[0];
const CASES = {
  sameDoi: [rec('a', { doi: '10.1186/s12875-016-0578-9', reference: 'PRI-SMA' }), rec('b', { doi: '10.1186/s12875-016-0578-9', reference: 'PRI-SMA' })],
  doiForms: [rec('a', { doi: 'https://doi.org/10.1/X' }), rec('b', { doi: 'doi:10.1/x' })],
  samePmid: [rec('a', { pmid: '123' }), rec('b', { pmid: 'PMID: 123' })],
  sameRef: [rec('a', { reference: 'Smith 2019, Lancet' }), rec('b', { reference: 'smith 2019 lancet' })],
  twoDois: [rec('a', { doi: '10.1/a', reference: 'Same title' }), rec('b', { doi: '10.1/b', reference: 'Same title' })],
  noId: [rec('a'), rec('b', { reference: '  ' })],
  mixed: [rec('a', { doi: '10.1/x' }), rec('b', { doi: '10.1/x' }), rec('c')],
};
const EXPECT = { sameDoi: 1, doiForms: 1, samePmid: 1, sameRef: 1, twoDois: 2, noId: 2, mixed: 2 };

test('FU9 without AlmEntry: reports are distinct references, not rows', () => {
  assert.equal(globalThis.AlmEntry, undefined, 'this test must run before AlmEntry is loaded');
  for (const [k, p] of Object.entries(CASES)) assert.equal(AlmText.entrySummary(p).reports, EXPECT[k], k);
  assert.equal(entry(CASES.sameDoi), 'Data were extracted from 1 report (2 rows; source location recorded for each).');
});

test('FU9 without AlmEntry: rows with no identifier count individually and the sentence states it', () => {
  assert.equal(entry(CASES.noId), 'Data were extracted from 2 reports (source location recorded for each study; 2 rows had no DOI, PMID or reference and were each counted as a separate report).');
  assert.equal(entry(CASES.mixed), 'Data were extracted from 2 reports (3 rows; source location recorded for each; 1 row had no DOI, PMID or reference and was counted as a separate report).');
  assert.equal(entry([rec('a', { location: '' }), rec('b', { location: '', reference: 'x' })]), 'Data were extracted from 2 reports (1 row had no DOI, PMID or reference and was counted as a separate report).');
  // every identified -> no rule clause
  assert.doesNotMatch(methods(CASES.sameRef), /no DOI, PMID or reference/);
});

test('FU9 the unidentified count is audited (PLANTED off-by-one fails)', () => {
  const ctx = { app: 'demo-app', build, provenance: CASES.mixed };
  const r = AlmText.render(templates, results, ctx);
  assert.equal(AlmText.audit(r, results, { ctx }).ok, true, JSON.stringify(AlmText.audit(r, results, { ctx }).failures));
  const seg = r.provenance.find(p => p.key === 'entry.unidentified');
  assert.ok(seg, 'unidentified count is a provenance segment');
  seg.value += 1; seg.text = String(seg.value);
  const a = AlmText.audit(r, results, { ctx });
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => /entry\.unidentified/.test(f.check)), JSON.stringify(a.failures));
});

test('FU9 with AlmEntry loaded: same counts (parity with AlmEntry.provenance.summary) and the rule is stated', () => {
  const A = require('../../../../shared/alm-entry.js');
  globalThis.AlmEntry = globalThis.AlmEntry || A;
  for (const [k, p] of Object.entries(CASES)) {
    assert.equal(AlmText.entrySummary(p).reports, A.provenance.summary(p).reports, k);
    assert.equal(AlmText.entrySummary(p).reports, EXPECT[k], k);
  }
  assert.equal(entry(CASES.noId), 'Data were extracted from 2 reports (source location recorded for each study; 2 rows had no DOI, PMID or reference and were each counted as a separate report).');
  assert.equal(entry(CASES.mixed), 'Data were extracted from 2 reports (3 rows; source location recorded for each; 1 row had no DOI, PMID or reference and was counted as a separate report).');
});
