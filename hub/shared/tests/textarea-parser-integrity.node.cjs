// Run from the repo root: node --test hub/shared/tests/textarea-parser-integrity.node.cjs
// Planted-fixture checks for app textarea parsers of `label, estimate, SE` (lane csvaudit, 2026-11-12).
// Deliberately artificial fixtures, not research observations.
//
// Root cause pinned here: these parsers split on /[,\t]/ and then read the last two fields with
// parseFloat, which accepts a numeric PREFIX. A decimal-comma / semicolon row
// "Trial A;-0,22;0,11" splits into "Trial A;-0" | "22;0" | "11" and was pooled as est=22, se=11
// with no warning. The fix requires a complete decimal token (the forest-plot / heterogeneity rule).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

// Extract a self-contained `function NAME(...) {...}` from an app page by brace matching.
function extract(rel, name) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, rel + ' has no function ' + name);
  let depth = 0, i = src.indexOf('{', start), q = null, re = false;
  for (; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
    if (q) { if (c === q && p !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && /[(,=:!&|?;{}\[]\s*$/.test(src.slice(Math.max(0, i - 3), i))) {
      // regex literal: skip to its unescaped closing slash
      for (i++; i < src.length && !(src[i] === '/' && src[i - 1] !== '\\'); i++) if (src[i] === '[') { while (src[++i] !== ']'); }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return new Function('return (' + src.slice(start, i + 1) + ')')();
}

const APPS = ['bayesian-ma', 'funnel-plot', 'tsa', 'webr-validator', 'workbench'];
const PLAIN = 'Trial A, -0.22, 0.11\nTrial B, -0.31, 0.14\nTrial C, 0.04, 0.19';
const WANT = [['Trial A', -0.22, 0.11], ['Trial B', -0.31, 0.14], ['Trial C', 0.04, 0.19]];

for (const app of APPS) {
  const parseStudies = extract(app + '/index.html', 'parseStudies');
  const rows = r => r.studies.map(s => [s.label, s.est, s.se]);

  test(app + ': plain, tab, CRLF, BOM, sci-notation and "label, with comma" rows parse to the same numbers', () => {
    assert.deepEqual(rows(parseStudies(PLAIN)), WANT);
    assert.deepEqual(rows(parseStudies(PLAIN.replace(/, /g, '\t'))), WANT);
    assert.deepEqual(rows(parseStudies('﻿' + PLAIN.replace(/\n/g, '\r\n') + '\r\n')).map(r => r.slice(1)), WANT.map(r => r.slice(1)));
    assert.deepEqual(rows(parseStudies('Trial A, -2.2e-1, 1.1e-1\nTrial B, -3.1E-1, 1.4e-1\nTrial C, 4e-2, 1.9e-1')), WANT);
    const lc = parseStudies('Smith et al., 2001, 0.04, 0.19');
    assert.deepEqual(rows(lc), [['Smith et al., 2001', 0.04, 0.19]]);
  });

  test(app + ': decimal-comma / semicolon rows are refused with a warning, never pooled as 22 / 11', () => {
    const r = parseStudies('Trial A;-0,22;0,11\nTrial B;-0,31;0,14\nTrial C;0,04;0,19\nTrial D;-0,18;0,09');
    assert.ok(!r.studies.some(s => s.est === 22 || s.se === 11 || s.est === 31), JSON.stringify(r.studies));
    assert.deepEqual(r.studies, []);
    assert.ok(r.warnings.length > 0);
  });

  test(app + ': a numeric prefix with trailing text ("0.2junk") is not a number', () => {
    const r = parseStudies(PLAIN + '\nTrial D, 0.2junk, 0.1');
    assert.deepEqual(rows(r), WANT);
    assert.ok(r.warnings.some(w => /Line 4/.test(w)), JSON.stringify(r.warnings));
  });

  test(app + ': NA and empty cells are flagged, not read as 0', () => {
    for (const bad of ['NA', '']) {
      const r = parseStudies(PLAIN + '\nTrial D, ' + bad + ', 0.1');
      assert.deepEqual(rows(r), WANT);
      assert.ok(r.warnings.some(w => /Line 4/.test(w)));
    }
  });
}

// ------------------------------------------------------------------ multilevel-ma
// Root cause: parse() split on commas with fixed positions study, effect, SE[, label] and read them
// with parseFloat. A study id containing a comma -- including one correctly QUOTED in an uploaded CSV,
// which __almLoad writes back as "Smith, 2001, 0.35, 0.12, A" -- became study="Smith", effect=2001,
// SE=0.35; and a decimal-comma row "1;0,35;0,12" became effect=35, SE=12. Neither raised anything.
{
  const parse = extract('multilevel-ma/index.html', 'parse');
  const BASE = '1, 0.35, 0.12, A\n1, 0.28, 0.10, B\n2, 0.51, 0.15, A\n3, 0.10, 0.09, A';
  const nums = rows => rows.map(r => [r.study, r.te, r.se, r.label]);
  test('multilevel-ma: plain, CRLF, sci-notation rows parse to the same numbers (unchanged behaviour)', () => {
    const want = nums(parse(BASE));
    assert.deepEqual(want, [['1', 0.35, 0.12, 'A'], ['1', 0.28, 0.1, 'B'], ['2', 0.51, 0.15, 'A'], ['3', 0.1, 0.09, 'A']]);
    assert.deepEqual(nums(parse(BASE.replace(/\n/g, '\r\n') + '\r\n')), want);
    assert.deepEqual(nums(parse('1, 3.5e-1, 1.2e-1, A\n1, 2.8e-1, 1e-1, B\n2, 5.1e-1, 1.5e-1, A\n3, 1e-1, 9e-2, A')), want);
    assert.deepEqual(parse(BASE).rejected || [], []);
  });
  test('multilevel-ma: a header line and non-numeric rows are still skipped as before', () => {
    assert.deepEqual(nums(parse('study, effect, SE, label\n' + BASE)), nums(parse(BASE)));
  });
  test('multilevel-ma: a comma inside the study id is refused, never read as effect=2001', () => {
    const r = parse('Smith, 2001, 0.35, 0.12, A\n1, 0.28, 0.10, B\n2, 0.51, 0.15, A\n3, 0.10, 0.09, A');
    assert.ok(!r.some(x => x.te === 2001), JSON.stringify(r));
    assert.ok(r.rejected && r.rejected.some(m => /Line 1/.test(m)), JSON.stringify(r.rejected));
  });
  test('multilevel-ma: decimal-comma / prefix-junk numbers are refused, never read as 35 / 12', () => {
    for (const bad of ['1;0,35;0,12;A', '1, 0.35junk, 0.12, A']) {
      const r = parse(bad + '\n1, 0.28, 0.10, B\n2, 0.51, 0.15, A\n3, 0.10, 0.09, A');
      assert.ok(!r.some(x => x.te === 35 || x.se === 12 || x.te === 0.35), JSON.stringify(r));
      assert.ok(r.rejected && r.rejected.some(m => /Line 1/.test(m)), JSON.stringify(r.rejected));
    }
  });
}

// ------------------------------------------------------------- rev542 M2 / M3 / minor (multilevel-ma)
{
  const parse = extract('multilevel-ma/index.html', 'parse');
  const nums = rows => rows.map(r => [r.study, r.te, r.se, r.label]);
  test('multilevel-ma: trailing empty fields (pasted spreadsheet) are absent, not a refusal', () => {
    const base = '1, 0.35, 0.12, outcome A\n1, 0.28, 0.10, outcome B\n2, 0.51, 0.15, outcome A\n3, 0.10, 0.09, outcome A';
    const r = parse(base.split('\n').map(l => l + ',').join('\n'));
    assert.deepEqual(r.rejected, []);
    assert.deepEqual(nums(r), nums(parse(base)));
    const r2 = parse('study,effect,SE,label,\n' + base.split('\n').map(l => l + ',,').join('\n'));
    assert.deepEqual(r2.rejected, []);
    assert.deepEqual(nums(r2), nums(parse(base)));
  });
  test('multilevel-ma: a quoted field may contain a comma (what the CSV upload writes back)', () => {
    const r = parse('1, 0.35, 0.12, "outcome A, primary"\n"Smith, 2001", 0.28, 0.10, B\n2, 0.51, 0.15, A\n3, 0.10, 0.09, A');
    assert.deepEqual(r.rejected, []);
    assert.deepEqual(nums(r)[0], ['1', 0.35, 0.12, 'outcome A, primary']);
    assert.deepEqual(nums(r)[1], ['Smith, 2001', 0.28, 0.1, 'B']);
  });
  test('multilevel-ma: refusals name the physical line, counting leading blank lines', () => {
    const r = parse('\n\n1, 0.35, 0.12, A\n1, 0.28, 0.10, B\n2, 0.51, 0.15, A\nSmith, 2001, 0.10, 0.09, A');
    assert.ok(r.rejected.some(m => /^Line 6:/.test(m)), JSON.stringify(r.rejected));
  });
}
