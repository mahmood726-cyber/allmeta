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
  const at = hub.indexOf('name: "CINeMA (NMA confidence)"');
  assert.ok(at >= 0, 'hub entry for CINeMA not found');
  const entry = hub.slice(at, at + 700);
  assert.match(entry, /suggested/);
  assert.doesNotMatch(entry, /derives High/);
});

test('5 audit7 test states the requirement, not a "published default"', () => {
  const src = readFileSync(new URL('./cinema-rule-audit7.test.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /published default/i);
  assert.match(src, /optional/i);
});

// ---- PR #606 review (agy) follow-ups ----
test('6 export carries no stale override reason when no reviewer override is active', () => {
  const p = page();
  const ex = { comparison: 'X', ...base, imprecision: 'some' };
  run(p, 'ROWS = ' + JSON.stringify([
    { ...ex, override: '', overrideReason: 'stale reason A' },                     // override cleared
    { ...ex, within: 'unclear', override: 'low', overrideReason: 'stale reason B' }, // incomplete
    { ...ex, override: 'high', overrideReason: 'kept reason C' },                  // active override
  ]));
  const csv = run(p, 'exportCsv()');
  assert.doesNotMatch(csv, /stale reason/);
  assert.match(csv, /,High,reviewer,kept reason C\r\n$/);
  assert.equal(fin(p, { ...ex, override: '', overrideReason: 'stale' }).reason, '');
});

test('7 legacy reporting values are migrated on read: none->undetected, some->suspected; major is invalid', () => {
  const p = page();
  assert.equal(sugg(p, { ...base, reporting: 'none' }), 'High');
  assert.equal(sugg(p, { ...base, reporting: 'some' }), 'Moderate');
  // 'major' (old -2 level) has no counterpart in the paper's two descriptions: not guessed.
  const s = run(p, 'suggestedRating(' + JSON.stringify({ ...base, reporting: 'major' }) + ')');
  assert.equal(s.label, 'Not fully assessed');
  assert.match(s.unresolved.join(' '), /Reporting bias \(invalid level "major"\)/);
  run(p, 'ROWS = ' + JSON.stringify([{ comparison: 'old', ...base, reporting: 'some' }]));
  assert.match(run(p, 'exportCsv()'), /\r\nold,No concerns,Suspected,/);
  // The page has no persistence (no localStorage / import), so legacy values only arrive programmatically.
  assert.doesNotMatch(p.html, /localStorage|FileReader/);
});

test('8 csvCell formula guard: = + @ \t \r prefixed, "-1" left numeric', () => {
  const p = page();
  const c = v => run(p, 'csvCell(' + JSON.stringify(v) + ')');
  assert.equal(c('=1+1'), "'=1+1");
  assert.equal(c('+1'), "'+1");
  assert.equal(c('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(c('\tx'), "'\tx");
  assert.equal(c('\rx'), "\"'\rx\"");
  assert.equal(c('-1'), '-1');
  assert.equal(c('a,"b"'), '"a,""b"""');
});
