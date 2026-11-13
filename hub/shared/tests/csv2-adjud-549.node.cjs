// Run from the repo root: node --test hub/shared/tests/csv2-adjud-549.node.cjs
// Adjudication of the agy review of PR #549 (lane adjud, 2026-11-13). Each case is a row that the
// #549 parsers dropped or refused WITHOUT the line number the PR promises, reproduced by executing the
// page's own function. Deliberately artificial fixtures, not research observations.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

function source(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) return null;
  let depth = 0, i = src.indexOf('{', m.index), q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '/' && /[(,=:!&|?;{}\[]\s*$/.test(src.slice(Math.max(0, i - 3), i))) {
      for (i++; i < src.length && !(src[i] === '/' && src[i - 1] !== '\\'); i++) if (src[i] === '[') { while (src[++i] !== ']'); }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return src.slice(m.index, i + 1);
}
function fn(rel, name, helpers) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const parts = (helpers || []).map(h => source(src, h)).filter(Boolean);
  const body = source(src, name);
  assert.ok(body, rel + ' has no function ' + name);
  return new Function(parts.join('\n') + '\nreturn (' + body + ');')();
}

// ---- csvRows (identical in the 15 pages that carry it): the first-row header heuristic
const CSVROWS_PAGES = ['bayesian-nma', 'cross-design', 'cross-network', 'everything-model', 'gosh-metareg', 'living-rob-pool',
  'multi-outcome-ma', 'multi-outcome-nma', 'nma-global-inconsistency', 'personalised-te', 'pet-peese', 'registry-pubbias',
  'reporting-bias', 'transitivity', 'webr-studio'];
const TESE = [{ name: 'te', num: 1 }, { name: 'se', num: 1 }, { name: 'label', opt: 1, rest: 1 }];
for (const p of CSVROWS_PAGES) {
  test(`${p} csvRows: an unreadable FIRST data row is refused with Line 1, not taken for a header`, () => {
    const csvRows = fn(p + '/index.html', 'csvRows');
    for (const first of ['0.2junk, 0.1junk', 'N/A, N/A', '-0.2x, 0.11']) {
      const r = csvRows(first + '\n-0.31, 0.14\n0.04, 0.19', TESE);
      assert.equal(r.rows.length, 2, first);
      assert.ok(r.errors.some(e => /^Line 1:/.test(e)), `"${first}" on line 1 was dropped silently: errors ${JSON.stringify(r.errors)}`);
    }
    // A real header is still a header.
    for (const head of ['te, se', 'yi, sei, study', 'effect,SE']) {
      const r = csvRows(head + '\n-0.31, 0.14\n0.04, 0.19', TESE);
      assert.deepEqual([r.rows.length, r.errors], [2, []], head);
    }
  });
  test(`${p} csvRows: an empty leading or trailing TAB cell is a cell, as an empty CSV cell is`, () => {
    const csvRows = fn(p + '/index.html', 'csvRows');
    const cols = [{ name: 'label', opt: 1 }, { name: 'yi', num: 1 }, { name: 'se', num: 1 }, { name: 'extra', opt: 1 }];
    const tsv = csvRows('\t-0.22\t0.11\t\nB\t-0.3\t0.1\tx', cols), csv = csvRows(',-0.22,0.11,\nB,-0.3,0.1,x', cols);
    assert.deepEqual(tsv.errors, csv.errors);
    assert.deepEqual(tsv.rows.map(r => [r.label, r.yi, r.se, r.nf]), csv.rows.map(r => [r.label, r.yi, r.se, r.nf]));
  });
}

// ---- parseStudies (bayesian-ma, funnel-plot, tsa, webr-validator, workbench): label, est, se
for (const p of ['bayesian-ma', 'funnel-plot', 'tsa', 'webr-validator', 'workbench']) {
  test(`${p} parseStudies: an unreadable row on lines 1-3 is reported, not skipped as a header`, () => {
    const parseStudies = fn(p + '/index.html', 'parseStudies');
    const r = parseStudies('Trial A, 0.2junk, 0.11\nTrial B, -0.31, 0.14\nTrial C, 0.04, 0.19');
    assert.equal(r.studies.length, 2);
    assert.ok(r.warnings.some(w => /^Line 1:/.test(w)), `line 1 dropped with no notice: ${JSON.stringify(r.warnings)}`);
    const e = parseStudies('Trial A;-0,22;0,11\nTrial B;-0,31;0,14\nTrial C;0,04;0,19');
    assert.equal(e.studies.length, 0);
    assert.equal(e.warnings.length, 3, `decimal-comma rows dropped with no notice: ${JSON.stringify(e.warnings)}`);
    const h = parseStudies('Study, logOR, SE\nTrial B, -0.31, 0.14\nTrial C, 0.04, 0.19');
    assert.deepEqual([h.studies.length, h.warnings], [2, []], 'a header line is still skipped quietly');
  });
}

// ---- multilevel-ma parse: study, effect, SE[, label]
test('multilevel-ma parse: unreadable data rows are listed in rows.rejected with their line, a header is not', () => {
  const parse = fn('multilevel-ma/index.html', 'parse');
  const ok = 'S1, 0.30, 0.10, A\nS2, 0.20, 0.12, A\n';
  for (const bad of ['1, NA, 0.12, A', '1, bad, 0.12, A', '1, 0.35, -0.12, A', '1, 0.35, 0, A', '1;0,35;0,00;A', '1\t0.35\t0.12\tA']) {
    const r = parse(ok + bad);
    assert.equal(r.length, 2, bad);
    assert.ok(r.rejected.some(x => /^Line 3:/.test(x)), `"${bad}" dropped with no notice: ${JSON.stringify(r.rejected)}`);
  }
  const h = parse('study, te, se, label\n' + ok);
  assert.deepEqual([h.length, h.rejected], [2, []], 'header still skipped');
  const lead = parse('\n\n' + ok + '1, bad, 0.12, A');
  assert.ok(lead.rejected.some(x => /^Line 5:/.test(x)), `leading blank lines shift the reported line: ${JSON.stringify(lead.rejected)}`);
});

// ---- shared/ma-studies-v1.js (the bus / TruthCert receipt parser)
test('ma-studies parseCSV: NA in an optional year / moderator, or a trailing comma, keeps the study', () => {
  const M = require(path.join(root, 'shared/ma-studies-v1.js'));
  const keep = [['Trial A, -0.22, 0.11, NA, low, 1.5', { year: null, moderator: 1.5 }],
    ['Trial A, -0.22, 0.11, 2015, low, NA', { year: 2015, moderator: null }],
    ['Trial A, -0.22, 0.11, 2015, low, 1.5,', { year: 2015, moderator: 1.5 }],
    ['Trial A, -0.22, 0.11,', { year: null, moderator: null }]];
  for (const [line, exp] of keep) {
    const r = M.parseCSV(line);
    assert.equal(r.length, 1, `"${line}" was dropped`);
    assert.deepEqual([r[0].est, r[0].se, r[0].year, r[0].moderator], [-0.22, 0.11, exp.year, exp.moderator], line);
  }
  // Still refused: a shifted row and an unreadable moderator.
  assert.equal(M.parseCSV('Smith et al., 2001, -0.22, 0.11').length, 0);
  assert.equal(M.parseCSV('Trial A, -0.22, 0.11, 2015, low, 1.5junk').length, 0);
});
test('ma-studies est-se-label-mod: a shifted or unreadable moderator is skipped, as label-est-se does', () => {
  const M = require(path.join(root, 'shared/ma-studies-v1.js'));
  assert.equal(M.studiesFromTextarea('0.2, 0.1, Smith, 2001, 1.5', 'est-se-label-mod').length, 0, 'read 2001 as the moderator');
  assert.equal(M.studiesFromTextarea('0.2, 0.1, Smith, badmod', 'est-se-label-mod').length, 0, 'kept an unreadable moderator as null');
  const ok = M.studiesFromTextarea('0.2, 0.1, Smith, 1.5\n0.3, 0.1, Jones', 'est-se-label-mod');
  assert.deepEqual(ok.map(s => [s.label, s.moderator]), [['Smith', 1.5], ['Jones', null]]);
});
