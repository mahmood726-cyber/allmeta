// Run from the repo root: node --test hub/shared/tests/csv2-delimited-parsers.node.cjs
// Planted-fixture checks for app textarea/CSV parsers that are not covered by an F1000 pack
// (lane csv2, 2026-11-12). Deliberately artificial fixtures, not research observations.
//
// Root causes pinned here (lane csvaudit found them in real Chrome):
//  - split(",") + fixed positions: an unquoted comma in a label ("Smith et al., 2001") shifted
//    every later cell, so 2001 was read as the effect.
//  - parseFloat reads a numeric PREFIX: a decimal-comma row "Trial A;-0,22;0,11" became -0 / 0.
//  - rows that failed a check were dropped with no notice, so a study set was pooled short.
// Rule now: a row that cannot be read throws (csvRefuse) with its line number and the page shows it;
// tab / semicolon delimiters and a decimal comma (only when the delimiter is not a comma) are read.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

// Source of a self-contained `function NAME(...) {...}` by brace matching; null when absent.
function source(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=\\s*\\{').exec(src);
  if (!m) return null;
  const start = m.index;
  let depth = 0, i = src.indexOf('{', start), q = null;
  for (; i < src.length; i++) {
    const c = src[i], p = src[i - 1];
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
  const out = src.slice(start, i + 1);
  return /^const/.test(out) ? out + ';' : out;
}
// Build fn with the page's helpers (absent helpers are simply not defined: the pre-fix pages).
function load(rel, fn, helpers, globals) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const parts = ['csvRows', 'csvRefuse'].concat(helpers || []).map(h => source(src, h)).filter(Boolean);
  const body = source(src, fn);
  assert.ok(body, rel + ' has no function ' + fn);
  const g = globals || {};
  return new Function(...Object.keys(g), parts.join('\n') + '\nreturn (' + body + ');')(...Object.values(g));
}

// ---- fixtures (same construction as lane csvaudit's harness.cjs)
function build(t) {
  const rowsTo = (rows, d, euro) => rows.map(r => r.map((c, j) => (euro && t.types[j] === 'n' ? String(c).replace('.', ',') : c)).join(d)).join('\n');
  const clone = () => t.base.map(r => r.slice());
  const firstNum = t.types.findIndex(x => x === 'n' || x === 'i');
  const H = d => (t.head ? t.head.split(',').join(d) + '\n' : '');
  const F = {};
  F.plain = H(',') + rowsTo(t.base, ',');
  if (t.label != null) { const b = clone(); b[0][t.label] = '"Smith, J ""Jr"""'; F.quoted = H(',') + rowsTo(b, ','); }
  F.crlf = (H(',') + rowsTo(t.base, ',')).replace(/\n/g, '\r\n') + '\r\n';
  F.bom = '\uFEFF' + H(',') + rowsTo(t.base, ',');
  F.tab = H('\t') + rowsTo(t.base, '\t');
  F.semicolon = H(';') + rowsTo(t.base, ';');
  F.euro = H(';') + rowsTo(t.base, ';', true);
  if (t.header) F.header = t.header + '\n' + rowsTo(t.base, ',');
  F.sci = H(',') + rowsTo(t.base.map(r => r.map((c, j) => (t.types[j] === 'n' && !Number.isInteger(Number(c)) ? Number(c).toExponential() : c))), ',');
  const R = {};
  { const b = clone(); b[1][firstNum] = ''; R.empty = H(',') + rowsTo(b, ','); }
  { const b = clone(); b[1][firstNum] = 'NA'; R.na = H(',') + rowsTo(b, ','); }
  { const b = clone(); b[1][firstNum] = '0,5'; R.commadecimal = H(',') + rowsTo(b, ','); }
  // A comma in a FIRST/middle text column shifts the numbers: refuse. In a LAST text column (restLabel)
  // the numbers sit before it, so the extra fields are taken back into that column: same numbers.
  const LC = t.restLabel ? F : R;
  // noSemicolon: ";" belongs inside a field on this page, so a ";"-delimited table is refused, visibly.
  if (t.noSemicolon) { R.semicolon = F.semicolon; R.euro = F.euro; delete F.semicolon; delete F.euro; }
  if (t.label != null) { const b = clone(); b[0][t.label] = 'Not randomized 1,807'; LC.negtrap = H(',') + rowsTo(b, ','); }
  if (t.label != null) { const b = clone(); b[2][t.label] = 'Smith et al., 2001'; LC.labelcomma = H(',') + rowsTo(b, ','); }
  return { F, R };
}
const SKIP = /^(line|lineNo|idx|_line)$/;
function nums(x, key, out) {
  if (typeof x === 'number') { if (!SKIP.test(key || '')) out.push(x); return out; }
  if (Array.isArray(x)) { x.forEach(v => nums(v, key, out)); return out; }
  if (x && typeof x === 'object') for (const k of Object.keys(x)) nums(x[k], k, out);
  return out;
}

const L = ['Trial A', 'Trial B', 'Trial C', 'Trial D'];
const E = ['-0.22', '-0.31', '0.04', '-0.18'], S = ['0.11', '0.14', '0.19', '0.09'], V = ['0.0121', '0.0196', '0.0361', '0.0081'];
const cnt = [['12', '100', '20', '100'], ['8', '80', '15', '82'], ['30', '250', '41', '248'], ['5', '60', '9', '61']];
const dta = [['80', '12', '20', '88'], ['45', '8', '15', '52'], ['60', '20', '10', '110'], ['33', '5', '7', '70']];
const nma = [['A', 'B', '-0.22', '0.11', 'S1'], ['A', 'C', '-0.31', '0.14', 'S2'], ['B', 'C', '0.04', '0.19', 'S3'], ['A', 'D', '-0.18', '0.09', 'S4']];
const W = 'webr-studio/index.html';
const T = [
  { id: 'registry-pubbias', rel: 'registry-pubbias/index.html', fn: 'parse', helpers: ['num'], header: 'Study,Est,SE', base: L.map((l, i) => [l, E[i], S[i]]), types: ['s', 'n', 'n'], label: 0 },
  { id: 'cross-network', rel: 'cross-network/index.html', fn: 'parse', header: 'contrast,yi,vi,design', base: L.map((l, i) => ['A vs ' + 'BCDE'[i], E[i], V[i], i % 2 ? 'obs' : 'rct']), types: ['s', 'n', 'n', 's'], label: 0 },
  { id: 'multi-outcome-ma', rel: 'multi-outcome-ma/index.html', fn: 'parse', header: 'label,y1,se1,y2,se2', base: L.map((l, i) => [l, E[i], S[i], E[3 - i], S[3 - i]]), types: ['s', 'n', 'n', 'n', 'n'], label: 0, naAllowed: true },
  { id: 'cross-design', rel: 'cross-design/index.html', fn: 'parse', header: 'label,yi,vi,design', base: L.map((l, i) => [l, E[i], V[i], i % 2 ? 'obs' : 'rct']), types: ['s', 'n', 'n', 's'], label: 0 },
  { id: 'personalised-te', rel: 'personalised-te/index.html', fn: 'parse', header: 'study,subgroup,yi,vi', base: L.map((l, i) => [l, i % 2 ? 'female' : 'male', E[i], V[i]]), types: ['s', 's', 'n', 'n'], label: 0 },
  { id: 'everything-model', rel: 'everything-model/index.html', fn: 'parse', header: 'study,time,outcome,yi,vi', base: L.map((l, i) => [l, '12', 'mortality', E[i], V[i]]), types: ['s', 's', 's', 'n', 'n'], label: 0 },
  { id: 'living-rob-pool', rel: 'living-rob-pool/index.html', fn: 'parse', header: 'yi,vi,published,rob', base: L.map((l, i) => [E[i], V[i], '2020-0' + (i + 1) + '-01', '2020-01-01|low']), types: ['n', 'n', 's', 's'], label: null, noSemicolon: true },
  { id: 'bayesian-nma', rel: 'bayesian-nma/index.html', fn: 'parse', header: 'A,B,te,se', base: nma.map(r => r.slice(0, 4)), types: ['s', 's', 'n', 'n'], label: 0 },
  { id: 'nma-global-inconsistency', restLabel: true, rel: 'nma-global-inconsistency/index.html', fn: 'parse', header: 'A,B,te,se,design', base: nma, types: ['s', 's', 'n', 'n', 's'], label: 4 },
  { id: 'multi-outcome-nma', rel: 'multi-outcome-nma/index.html', fn: 'parse', header: 'study,A,B,y1,se1', base: nma.map(r => [r[4], r[0], r[1], r[2], r[3]]), types: ['s', 's', 's', 'n', 'n'], label: 0 },
  { id: 'gosh-metareg', restLabel: true, rel: 'gosh-metareg/index.html', fn: 'parse', header: 'te,se,mod,label', base: L.map((l, i) => [E[i], S[i], String(2000 + i) + '.5', l]), types: ['n', 'n', 'n', 's'], label: 3 },
  { id: 'pet-peese', rel: 'pet-peese/index.html', fn: 'parseTable', header: 'yi,sei', base: L.map((l, i) => [E[i], S[i]]), types: ['n', 'n'], label: null },
  { id: 'reporting-bias', rel: 'reporting-bias/index.html', fn: 'parseEgger', header: 'y,se', base: L.map((l, i) => [E[i], S[i]]), types: ['n', 'n'], label: null },
  { id: 'transitivity', rel: 'transitivity/index.html', fn: 'parseTransit', helpers: ['num'], head: 'trial,node,age,bmi', base: L.map((l, i) => [l, 'AB'[i % 2], '6' + i + '.5', '2' + i + '.25']), types: ['s', 's', 'n', 'n'], label: 0, naAllowed: true },
  { id: 'webr-studio:parseTESE', rel: W, fn: 'parseTESE', header: 'te,se', base: L.map((l, i) => [E[i], S[i]]), types: ['n', 'n'], label: null },
  { id: 'webr-studio:parseTESELabel', restLabel: true, rel: W, fn: 'parseTESELabel', header: 'te,se,label', base: L.map((l, i) => [E[i], S[i], l]), types: ['n', 'n', 's'], label: 2 },
  { id: 'webr-studio:parseTESEmodLabel', restLabel: true, rel: W, fn: 'parseTESEmodLabel', header: 'te,se,mod,label', base: L.map((l, i) => [E[i], S[i], '1.' + i, l]), types: ['n', 'n', 'n', 's'], label: 3 },
  { id: 'webr-studio:parse2x2', restLabel: true, rel: W, fn: 'parse2x2', header: 'e1,n1,e2,n2,label', base: cnt.map((r, i) => r.concat([L[i]])), types: ['i', 'i', 'i', 'i', 's'], label: 4 },
  { id: 'webr-studio:parseMulti', restLabel: true, rel: W, fn: 'parseMulti', header: 'study,te,se,label', base: L.map((l, i) => ['S' + (i >> 1), E[i], S[i], l]), types: ['s', 'n', 'n', 's'], label: 3 },
  { id: 'webr-studio:parseContrasts', restLabel: true, rel: W, fn: 'parseContrasts', header: 'A,B,te,se,study', base: nma, types: ['s', 's', 'n', 'n', 's'], label: 4 },
  { id: 'webr-studio:parseDTA', restLabel: true, rel: W, fn: 'parseDTA', header: 'TP,FP,FN,TN,label', base: dta.map((r, i) => r.concat([L[i]])), types: ['i', 'i', 'i', 'i', 's'], label: 4 },
  { id: 'dosehtml:parseCSV', rel: 'dosehtml/dose-response-pro.html', fn: 'parseCSV', helpers: ['splitCSVRows', 'parseCSVLine', 'normalizeHeaderName', 'isCommentCSVLine', 'applyContinuityCorrection', 'deriveMissingEffectsFromCounts', 'getStudyGroupKey', 'HEADER_ALIAS_MAP', 'csvShapeError'], globals: { AppState: {}, NUMERICAL_TOLERANCE: 1e-10 },
    head: 'study,dose,cases,n', base: [['Study_A', '0', '45', '50000'], ['Study_A', '2.5', '52', '49000'], ['Study_B', '0', '30', '30000'], ['Study_B', '2.5', '41', '29500']], types: ['s', 'n', 'i', 'i'], label: 0, only: ['plain', 'crlf', 'bom', 'sci', 'labelcomma', 'negtrap', 'commadecimal'] },
];

for (const t of T) {
  let f;
  try { f = load(t.rel, t.fn, t.helpers, t.globals); } catch (e) { const why = e.message; f = () => { throw new Error('cannot load: ' + why); }; }
  const { F, R } = build(t);
  let want = [];
  try { want = nums(f(F.plain), '', []); } catch (e) { want = ['plain threw: ' + e.message]; }
  const use = k => !t.only || t.only.includes(k);
  test(t.id + ': plain input parses', () => assert.ok(want.length >= t.base.length * 2 && want.every(x => typeof x === 'number'), JSON.stringify(want)));
  test(t.id + ': quoted label, CRLF, BOM, header, sci-notation, tab, semicolon and decimal-comma (";") inputs give the plain numbers', () => {
    for (const [k, txt] of Object.entries(F)) {
      if (k === 'plain' || !use(k)) continue;
      let got; try { got = nums(f(txt), '', []); } catch (e) { assert.fail(k + ' threw: ' + e.message); }
      assert.deepEqual(got, want, k);
    }
  });
  test(t.id + ': a shifted, decimal-comma, empty or NA row is refused with its line number, never dropped or read as another column', () => {
    for (const [k, txt] of Object.entries(R)) {
      if (!use(k)) continue;
      if (t.naAllowed && (k === 'na' || k === 'empty')) {
        // A missing value is meaningful here (missing outcome / unreported modifier): kept as NaN or omitted.
        const got = nums(f(txt), '', []);
        assert.ok(got.length === want.length ? got.some(Number.isNaN) : got.length === want.length - 1, k + ' ' + JSON.stringify(got));
        continue;
      }
      let threw = null, out;
      try { out = f(txt); } catch (e) { threw = e; }
      assert.ok(threw, k + ' was not refused; parsed to ' + String(JSON.stringify(out)).slice(0, 200));
      assert.match(threw.message, /Line \d+/, k);
      assert.ok(Array.isArray(threw.csvErrors) && threw.csvErrors.length > 0, k);
    }
  });
}

test('multi-outcome-nma: with two outcomes, an NA outcome is kept as missing; a row with none observed is refused', () => {
  const f = load('multi-outcome-nma/index.html', 'parse');
  const r = f('S1, A, B, -0.2, 0.1, NA, NA\nS2, A, C, -0.3, 0.12, 0.1, 0.2');
  assert.equal(r.K, 2);
  assert.ok(Number.isNaN(r.rows[0].outcomes[1].yi));
  assert.throws(() => f('S1, A, B, NA, NA, NA, NA\nS2, A, C, -0.3, 0.12, 0.1, 0.2'), /Line 1/);
  assert.throws(() => f('S1, A, B, -0.2, 0.1, 0.3, 0.1\nS2, A, C, -0.3, 0.12'), /Line 2/);
});

test('label-last parsers: a decimal comma that pushes a number into the label is refused', () => {
  const f = load('webr-studio/index.html', 'parseTESELabel');
  assert.throws(() => f('0.1, 0.2, Smith\n0,5, 0.14, Jones'), /Line 2/);
  assert.throws(() => f('0.1, 0.2, Smith\n0,5, 0.14'), /Line 2/);
  assert.deepEqual(f('0.1, 0.2, Smith, 2001').map(r => r.label), ['Smith, 2001']);
});

test('transitivity: a comma header over semicolon / decimal-comma rows is refused, never comma-split into modifiers', () => {
  const f = load('transitivity/index.html', 'parseTransit', ['num']);
  assert.throws(() => f('trial,node,age,bmi\nTrial A;A;60,5;20,25\nTrial B;B;61,5;21,25'), /Line 2/);
});
