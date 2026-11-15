// cinema (lane cinemafix). Requirements taken from the full text of Nikolakopoulou et al. 2020
// (PLOS Med 17:e1003082, PMC7122720):
//  - Reporting bias: "CINeMA assumes 2 possible descriptions for reporting bias: suspected and
//    undetected." The page offered No / Some / Major concerns for it.
//  - "Summarising judgments across the 6 domains": reviewers "may then choose" to summarise using
//    the 4 GRADE levels; "one may start at high confidence and drop ... 1 step for each domain
//    with some concerns, and by 2 levels for each domain with major concerns" (an OPTIONAL rule),
//    "avoiding downgrading the overall level of confidence more than once for related concerns".
//    The paper's own example: citalopram vs venlafaxine has some concerns for imprecision and
//    heterogeneity and major concerns for incoherence, "However, downgrading by 2 levels is
//    sufficient" -> the -1/-2 tally gives Very low (4 levels), the reviewer's judgement gives Low.
//  - "Unclear" is not a CINeMA level; a comparison with an unresolved domain has not been assessed
//    and must not display a rating (origin/main showed High for a lone Unclear).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadPage } from './helpers/page-vm.mjs';

function page() { return loadPage('cinema/index.html', { pick: s => /DEFAULT_ROWS/.test(s) }); }
const run = (p, js) => vm.runInContext(js, p.ctx);
const base = { within: 'none', reporting: 'undetected', indirect: 'none', imprecision: 'none', hetero: 'none', incoherence: 'none' };
const sugg = (p, row) => run(p, 'suggestedRating(' + JSON.stringify(row) + ').label');
const fin = (p, row) => run(p, 'finalRating(' + JSON.stringify(row) + ')');

test('1 reporting bias uses the paper\'s two levels (undetected / suspected), suspected = 1 level', () => {
  const p = page();
  const labels = run(p, 'levelsFor("reporting").map(l => l[1]).join("|")');
  assert.match(labels, /^Undetected\|Suspected\|Unclear/);
  assert.doesNotMatch(labels, /Some concerns|Major concerns|No concerns/);
  assert.equal(sugg(p, base), 'High');                                   // control
  assert.equal(sugg(p, { ...base, reporting: 'suspected' }), 'Moderate');
  // The other five domains keep the paper's 3 levels.
  assert.match(run(p, 'levelsFor("within").map(l => l[1]).join("|")'), /^No concerns\|Some concerns\|Major concerns/);
  // A level that is not valid for the domain is never silently scored 0.
  assert.equal(sugg(p, { ...base, reporting: 'major' }), 'Not fully assessed');
  assert.equal(sugg(p, { ...base, within: 'bogus' }), 'Not fully assessed');
  assert.match(p.html, /Suspected reporting bias counts as one level/);
});

test('2 related concerns: suggested -1/-2 tally and a reasoned reviewer override, both shown', () => {
  const p = page();
  const paperEx = { ...base, imprecision: 'some', hetero: 'some', incoherence: 'major' };
  assert.equal(sugg(p, paperEx), 'Very low');                            // tally: 1 + 1 + 2
  let f = fin(p, paperEx);
  assert.equal(f.label, 'Very low'); assert.equal(f.source, 'suggested');
  f = fin(p, { ...paperEx, override: 'low', overrideReason: 'Imprecision, heterogeneity and incoherence are related; downgrade 2 levels' });
  assert.equal(f.label, 'Low'); assert.equal(f.source, 'reviewer');
  assert.equal(f.suggested, 'Very low');
  // An override with no reason is refused, not applied and not dropped silently.
  f = fin(p, { ...paperEx, override: 'low', overrideReason: '   ' });
  assert.equal(f.source, 'reason-required'); assert.equal(f.label, 'Reason required');
  // Export carries both ratings and the reason.
  run(p, 'ROWS = [' + JSON.stringify({ comparison: 'citalopram vs venlafaxine', ...paperEx, override: 'low', overrideReason: 'related concerns' }) + ']');
  const csv = run(p, 'exportCsv()');
  const [head, row] = csv.trim().split(/\r?\n/);
  assert.match(head, /Suggested \(-1\/-2 tally\),Final rating,Final set by,Override reason/);
  assert.match(row, /,Very low,Low,reviewer,related concerns$/);
});

test('3 any Unclear domain -> Not fully assessed, never a rating', () => {
  const p = page();
  assert.equal(sugg(p, { ...base, within: 'unclear' }), 'Not fully assessed');
  assert.equal(sugg(p, { ...base, reporting: 'unclear' }), 'Not fully assessed');
  const f = fin(p, { ...base, within: 'unclear', override: 'high', overrideReason: 'x' });
  assert.equal(f.label, 'Not fully assessed'); assert.equal(f.source, 'incomplete');
  const demo = run(p, 'DEFAULT_ROWS.map(r => r.comparison + "=" + suggestedRating(r).label + "/" + finalRating(r).label).join("; ")');
  assert.equal(demo, 'A vs B=Moderate/Moderate; A vs C=Low/Low; B vs C=Very low/Very low; A vs D=Not fully assessed/Not fully assessed');
});

test('4 wording: a suggested summary under the paper\'s optional rule, not a derived/default rating', () => {
  const p = page();
  const header = p.html.match(/<header>([\s\S]*?)<\/header>/)[1];
  const footer = p.html.match(/<footer>([\s\S]*?)<\/footer>/)[1];
  for (const s of [header, footer]) {
    assert.doesNotMatch(s, /default summary/i);
    assert.doesNotMatch(s, /derives a confidence rating/i);
  }
  assert.match(header, /suggested/i); assert.match(header, /optional/i);
  assert.match(footer, /optional/i);
  assert.match(footer, /user-defined rules/);           // official app: rules assign domain levels
  assert.match(footer, /not downgrade, or downgrade by 1 or 2 levels/);
  assert.doesNotMatch(footer, /derives them from the network/);
  const hub = readFileSync(new URL('../../../projects.js', import.meta.url), 'utf8');
  const entry = hub.slice(hub.indexOf('name: "CINeMA (NMA confidence)"'), hub.indexOf('name: "CINeMA (NMA confidence)"') + 700);
  assert.doesNotMatch(entry, /derives High/);
});

test('5 audit7 test states the requirement, not a "published default"', () => {
  const src = readFileSync(new URL('./cinema-rule-audit7.test.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /published default/i);
  assert.match(src, /optional/i);
});
