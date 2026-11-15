// cinema (lane audit7). Nikolakopoulou et al. 2020 (PLOS Med 17:e1003082), "Summarising judgments
// across the 6 domains": start at high confidence and drop 1 level for each domain with some
// concerns and 2 levels for each domain with major concerns (reviewers may avoid downgrading twice
// for related concerns). Domain judgements have 3 levels; there is no "Unclear" level.
// On origin/main the page applied its own rule (some concerns: no downgrade unless >= 3 of them;
// major concerns: 1 level) while the header said it rates "across six CINeMA domains", and the
// code attributed "Unclear weighted 0" to Nikolakopoulou 2020. Demo: A vs B (one domain with some
// concerns) and A vs C (two) were rated High.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadPage } from './helpers/page-vm.mjs';

function page() { return loadPage('cinema/index.html', { pick: s => /DEFAULT_ROWS/.test(s) }); }
const rate = (p, row) => vm.runInContext('confidenceFrom(downgradeScore(' + JSON.stringify(row) + '))[1]', p.ctx);
const base = { within: 'none', reporting: 'none', indirect: 'none', imprecision: 'none', hetero: 'none', incoherence: 'none' };

test('cinema: demo ratings follow the published default (some -1, major -2)', () => {
  const p = page();
  const got = vm.runInContext('DEFAULT_ROWS.map(r => r.comparison + "=" + confidenceFrom(downgradeScore(r))[1]).join("; ")', p.ctx);
  assert.equal(got, 'A vs B=Moderate; A vs C=Low; B vs C=Very low; A vs D=Very low');
});

test('cinema: single-domain rules', () => {
  const p = page();
  assert.equal(rate(p, base), 'High');                                  // control
  assert.equal(rate(p, { ...base, imprecision: 'some' }), 'Moderate');
  assert.equal(rate(p, { ...base, imprecision: 'major' }), 'Low');
  assert.equal(rate(p, { ...base, imprecision: 'major', hetero: 'some' }), 'Very low');
  assert.equal(rate(p, { ...base, within: 'unclear' }), 'High');        // unresolved: not rated
});

test('cinema: no false attribution of the Unclear level to Nikolakopoulou 2020', () => {
  const p = page();
  assert.doesNotMatch(p.html, /Unclear is weighted 0 per Nikolakopoulou/);
  assert.doesNotMatch(p.html, /NOT the official CINeMA algorithm/);
});
