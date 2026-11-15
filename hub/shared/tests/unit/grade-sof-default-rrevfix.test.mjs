// grade-sof (lane rrevfix). GRADE certainty is a judgement made by the reviewer (GRADE Handbook);
// it is not a property of a pooled number. Before this fix every new row -- a pooled result loaded
// from the ma-pooled-v1 bus, "+ Add outcome", a stored/imported row with no certainty -- got
// certainty "moderate" (emptyOutcome(), readOutcomesFromForm() and the renderPreview() fallback),
// so the SoF table showed "Moderate" for evidence nobody had rated. Confirmed in system Chrome:
// a loaded "Mortality" row was stored and shown as Moderate.
// Requirement: an unrated row is "Not assessed" until the user picks a level or uses the wizard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const pick = s => s.includes('"grade-sof-v1"') && s.includes('function outcomeFromPooled');
function load(storage) { return loadPage('grade-sof/index.html', { shared: ['shared/ma-pooled-v1.js'], pick, storage }); }
const BUS = { 'ma-pooled-v1': JSON.stringify({ _schema: 'ma-pooled-v1', _savedAt: '2026-11-15T00:00:00Z',
  results: [{ pointEstimate: 0.8, ciLo: 0.7, ciHi: 0.92, scale: 'ratio', measure: 'RR', k: 5, nTotal: 1200, label: 'Mortality' }] }) };

test('grade-sof: a loaded pooled outcome is "Not assessed", not Moderate', () => {
  const p = load({ ...BUS, 'grade-sof-v1': JSON.stringify({ outcomes: [{ outcome: '', effect: '' }] }) });
  p.fire('btn-load-pooled');
  const sof = text(p.el('sof-host').innerHTML);
  assert.match(sof, /Mortality .*Not assessed/, sof);
  assert.doesNotMatch(sof, /⊕⊕⊕○ Moderate/, sof);
  const st = JSON.parse(p.ctx.localStorage.getItem('grade-sof-v1'));
  assert.deepEqual(st.outcomes.map(o => o.certainty), ['notassessed']);
});

test('grade-sof: a stored row with no certainty renders as Not assessed (no silent Moderate fallback)', () => {
  const p = load({ 'grade-sof-v1': JSON.stringify({ title: 'T', outcomes: [{ outcome: 'Stroke', effect: '0.9' }] }) });
  const sof = text(p.el('sof-host').innerHTML);
  assert.match(sof, /Stroke .*Not assessed/, sof);
  assert.doesNotMatch(sof, /⊕⊕⊕○ Moderate/, sof);
});

test('grade-sof: "+ Add outcome" creates an unrated row', () => {
  const p = load({ 'grade-sof-v1': JSON.stringify({ title: 'T', outcomes: [] }) });
  p.fire('btn-add');
  const st = JSON.parse(p.ctx.localStorage.getItem('grade-sof-v1'));
  assert.equal(st.outcomes[st.outcomes.length - 1].certainty, 'notassessed');
});

test('grade-sof: a user-chosen level is still shown as chosen', () => {
  const p = load({ 'grade-sof-v1': JSON.stringify({ title: 'T', outcomes: [{ outcome: 'Stroke', effect: '0.9', certainty: 'moderate' }] }) });
  assert.match(text(p.el('sof-host').innerHTML), /Stroke .*⊕⊕⊕○ Moderate/);
});
