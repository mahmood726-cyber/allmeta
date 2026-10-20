// node:test — shared/alm-share.js link codec (gzip+base64url via shared/url-pack.js) incl. F1 provenance
// round-trip, the 32,768-character limit, and refusal of corrupted / mismatched links; plus the
// formula-injection-safe provenance/comparison CSVs from shared/alm-verify-r.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../../../../shared/url-pack.js');
const S = require('../../../../shared/alm-share.js');
const V = require('../../../../shared/alm-verify-r.js');
let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };

const STATE = { src: '12, 150, Study A\n8, 90, Study B\n20, 220, Smith – 2019 · “q”', trans: 'ft', tau: 'DL' };
const PROVENANCE = [
  { id: 'p1', label: 'Smith 2019', reference: 'Smith J et al. Lancet 2019;393:1-10', doi: '10.1016/S0140-6736(19)00001-1', pmid: '30000001',
    location: 'Table 2', pastedText: '12/150 (8.0%) vs 20/148', choice: { 'arm(s)': 'treatment: colchicine', outcome: 'MACE', timepoint: '12 months' },
    values: [{ field: 'xi', value: 12, span: [0, 2], text: '12' }, { field: 'ni', value: 150, span: [3, 6], text: '150' }],
    conversions: [], flags: [{ code: 'TIMEPOINT_CHOSEN', text: 'two timepoints reported' }], usedAs: 'proportion', confirmed: true, confirmedAt: '2026-10-20T10:00:00Z' },
  { id: 'p2', label: '=HYPERLINK("http://x")', reference: '+evil, "quoted"', location: 'p. 5', pastedText: 'median 4 (IQR 2-7)',
    choice: { arm: 'control', outcome: 'pain', timepoint: '6 weeks' }, values: [{ field: 'm1i', value: -0.5, span: [7, 8], text: '4' }],
    conversions: [{ field: 'm1i', formula: 'mean from median/IQR', citation: 'Wan 2014' }], flags: [], usedAs: 'mean', confirmed: false, confirmedAt: null },
];

test('state + provenance round-trip through the link codec', async () => {
  const packed = await S.encode('proportion-ma', STATE, PROVENANCE);
  ok(/^[A-Za-z0-9_-]+$/.test(packed), 'base64url only');
  const link = S.makeLink('http://localhost:8089/proportion-ma/index.html#eyJ2IjoxfQ', packed);
  ok(link.startsWith('http://localhost:8089/proportion-ma/index.html#s='), 'replaces any existing hash with #s=');
  const res = await S.decode(link.split('#s=')[1], 'proportion-ma');
  eq(res, { ok: true, state: STATE, provenance: PROVENANCE });
  eq(res.provenance.length, 2, '2-record provenance fixture restored');
  const noProv = await S.decode(await S.encode('proportion-ma', STATE, []), 'proportion-ma');
  eq(noProv, { ok: true, state: STATE, provenance: [] });
  console.log('SHARE link length ' + link.length + ' for ' + JSON.stringify(STATE).length + ' chars of state + 2 provenance records');
});

test('links over 32,768 characters are refused with a clear message', async () => {
  eq(S.MAX_LINK, 32768);
  // mulberry32 (32-bit integer math): a float LCG loses its low bits above 2^53, cycles and compresses away.
  let seed = 7; const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const big = { src: Array.from({ length: 40000 }, () => String.fromCharCode(33 + Math.floor(rnd() * 90))).join(''), trans: 'logit', tau: 'PM' };
  const packed = await S.encode('proportion-ma', big, []);
  ok(packed.length > S.MAX_LINK, 'fixture is genuinely over the limit (packed ' + packed.length + ')');
  assert.throws(() => S.makeLink('http://localhost/proportion-ma/', packed), e => e.code === 'TOO_LARGE' && /too large for a share link/.test(e.message) && /32,768/.test(e.message)); checks++;
  const edge = 'a'.repeat(32768 - 'http://h/#s='.length);
  eq(S.makeLink('http://h/', edge).length, 32768, 'exactly at the limit is allowed');
  assert.throws(() => S.makeLink('http://h/', edge + 'a'), /too large/); checks++;
});

test('PLANTED DEFECTS: corrupted, truncated, foreign-app and wrong-version links are refused', async () => {
  const packed = await S.encode('proportion-ma', STATE, PROVENANCE);
  const control = await S.decode(packed, 'proportion-ma');
  ok(control.ok, 'control link decodes');
  const mid = Math.floor(packed.length / 2);
  const flipped = packed.slice(0, mid) + (packed[mid] === 'A' ? 'B' : 'A') + packed.slice(mid + 1);
  for (const [name, bad, app, re] of [
    ['flipped character', flipped, 'proportion-ma', /./],
    ['truncated', packed.slice(0, -8), 'proportion-ma', /./],
    ['invalid characters', 'garbage!!', 'proportion-ma', /invalid characters/],
    ['empty', '', 'proportion-ma', /invalid characters/],
    ['other app', packed, 'dta-sroc', /for app "proportion-ma", not "dta-sroc"/],
  ]) {
    const r = await S.decode(bad, app);
    eq(r.ok, false, name + ' must be refused');
    ok(re.test(r.reason), name + ': ' + r.reason);
  }
  const v2 = await globalThis.AlmUrlPack.pack({ app: 'proportion-ma', v: 2, state: STATE });
  eq((await S.decode(v2, 'proportion-ma')).ok, false, 'unknown version refused');
  const noState = await globalThis.AlmUrlPack.pack({ app: 'proportion-ma', v: 1 });
  eq((await S.decode(noState, 'proportion-ma')).ok, false, 'missing state refused');
  const badProv = await globalThis.AlmUrlPack.pack({ app: 'proportion-ma', v: 1, state: STATE, provenance: [1, 2] });
  eq((await S.decode(badProv, 'proportion-ma')).ok, false, 'malformed provenance refused');
});

const injectionSafe = csv => parseCsv(csv).slice(1).flat().every(c => !/^[=+@\t\r]/.test(c));

// Minimal RFC-4180 reader (quoted fields may contain commas, quotes and newlines).
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const PROV_HEADER = 'label,reference,doi,pmid,location,outcome,arm,timepoint,field,value,value_text,span_start,span_end,pasted_text,quote_exact,quote_prefix,quote_suffix,conversions,flags,used_as,rules_version,confirmed,confirmed_at';
// 2-record fixture in the F1 shape (W3C selectors, replayable conversion, rulesVersion), incl. a '=SUM(' paste.
const AUDIT = [
  { id: 'a1', label: 'Smith 2019', reference: 'Smith J. Lancet 2019;393:1-10', location: 'Table 2', pastedText: 'median 4 (IQR 2-7), n=59',
    rulesVersion: 'entry3.1', choice: { 'arm(s)': 'treatment: colchicine', outcome: 'pain', timepoint: '12 months' },
    values: [{ field: 'm1i', value: 4.3, span: [7, 8], text: '4', selector: [{ type: 'TextPositionSelector', start: 7, end: 8 }, { type: 'TextQuoteSelector', exact: '4', prefix: 'median ', suffix: ' (IQR 2-7), n=59' }] }],
    conversions: [{ field: 'm1i', formula: 'mean from median/IQR', citation: 'Luo 2018', inputs: { q1: 2, med: 4, q3: 7, n: 59 }, output: 4.3, rulesVersion: 'entry3.1' }],
    flags: [{ code: 'SD_FROM_IQR', text: 'SD estimated from IQR' }], usedAs: 'mean (treatment)', confirmed: true, confirmedAt: '2026-10-20T10:00:00Z' },
  { id: 'a2', label: 'Jones 2020', reference: 'Jones K. BMJ 2020', location: 'p. 5', pastedText: '=SUM(A1:A9) 12/150, "quoted"\nline2',
    choice: { arm: 'control', outcome: 'pain', timepoint: '12 months' },
    values: [{ field: 'xi', value: 12, span: [12, 14], text: '12', selector: { type: 'TextQuoteSelector', exact: '12', prefix: '=SUM(A1:A9) ', suffix: '/150' } },
      { field: 'ni', value: 150, span: [15, 18], text: '150' }],
    conversions: [], flags: [], usedAs: 'proportion', confirmed: false, confirmedAt: null },
];

test('provenance CSV is auditable on its own: verbatim pasted text, W3C quote, conversions, flags, rules version', () => {
  const csv = V.provenanceCsv(AUDIT);
  const rows = parseCsv(csv);
  eq(rows[0].join(','), PROV_HEADER);
  eq(V.PROVENANCE_COLUMNS.join(','), PROV_HEADER);
  eq(rows.length, 1 + 1 + 2, 'header + 1 value (Smith) + 2 values (Jones)');
  const col = Object.fromEntries(V.PROVENANCE_COLUMNS.map((c, i) => [c, i]));
  const at = (r, c) => rows[r][col[c]];
  // spans index the exported pasted_text, verbatim (incl. newline and quotes)
  for (const r of [1, 2, 3]) {
    const text = at(r, 'pasted_text').replace(/^'(?==)/, ''); // undo the formula-injection prefix only
    eq(text.slice(+at(r, 'span_start'), +at(r, 'span_end')), at(r, 'value_text'), 'span indexes pasted_text in row ' + r);
  }
  eq(at(1, 'pasted_text'), 'median 4 (IQR 2-7), n=59');
  eq(at(2, 'pasted_text'), "'=SUM(A1:A9) 12/150, \"quoted\"\nline2", 'verbatim, = neutralised');
  eq([at(1, 'quote_exact'), at(1, 'quote_prefix'), at(1, 'quote_suffix')], ['4', 'median ', ' (IQR 2-7), n=59']);
  eq([at(2, 'quote_exact'), at(2, 'quote_prefix'), at(2, 'quote_suffix')], ['12', "'=SUM(A1:A9) ", '/150']);
  eq([at(3, 'quote_exact'), at(3, 'quote_prefix'), at(3, 'quote_suffix')], ['', '', ''], 'no selector -> empty');
  ok(at(1, 'conversions').includes('m1i: mean from median/IQR [Luo 2018]'), at(1, 'conversions'));
  ok(at(1, 'conversions').includes('{"q1":2,"med":4,"q3":7,"n":59}') && at(1, 'conversions').includes('-> 4.3'), at(1, 'conversions'));
  eq(at(1, 'flags'), 'SD_FROM_IQR: SD estimated from IQR');
  eq([at(1, 'used_as'), at(1, 'rules_version'), at(1, 'confirmed'), at(1, 'confirmed_at')], ['mean (treatment)', 'entry3.1', 'yes', '2026-10-20T10:00:00Z']);
  eq([at(2, 'rules_version'), at(2, 'confirmed'), at(2, 'confirmed_at')], ['', 'no', '']);
  ok(injectionSafe(csv), 'formula-injection safe');
});

test('provenance CSV: one row per value, formula-injection safe', () => {
  const csv = V.provenanceCsv(PROVENANCE);
  const rows = parseCsv(csv);
  const col = Object.fromEntries(V.PROVENANCE_COLUMNS.map((c, i) => [c, i]));
  eq(rows.length, 1 + 3, 'header + 2 values (Smith) + 1 value (second record)');
  eq(['label', 'outcome', 'arm', 'timepoint', 'field', 'value', 'span_start', 'span_end', 'flags', 'confirmed'].map(c => rows[1][col[c]]),
    ['Smith 2019', 'MACE', 'treatment: colchicine', '12 months', 'xi', '12', '0', '2', 'TIMEPOINT_CHOSEN: two timepoints reported', 'yes']);
  const lines = csv.trim().split('\n');
  ok(lines[3].startsWith('"\'=HYPERLINK(""http://x"")",'), 'leading = neutralised and quotes doubled: ' + lines[3]);
  ok(lines[3].includes('"\'+evil, ""quoted"""'), 'leading + neutralised: ' + lines[3]);
  ok(lines[3].includes(',-0.5,'), 'negative numbers are NOT prefixed');
  ok(rows[3][col.conversions].startsWith('m1i: mean from median/IQR [Wan 2014]'), rows[3][col.conversions]);
  ok(injectionSafe(csv), 'gate passes on the real writer');
  eq(V.provenanceCsv([]), V.PROVENANCE_COLUMNS.join(',') + '\n', 'empty -> header only');
});

test('PLANTED DEFECT: an unescaped CSV writer fails the injection gate', () => {
  const naive = 'label\n' + PROVENANCE.map(p => p.label).join('\n') + '\n';
  eq(injectionSafe(naive), false, 'gate FAILS on the planted writer');
  const cmp = V.comparisonCsv([{ label: '@SUM(A1)', key: 'k', app: 1, ref: 1, absDiff: 0, tol: 1e-9, kind: 'rel', pass: true }]);
  ok(injectionSafe(cmp) && cmp.includes("'@SUM(A1)"), 'comparison CSV neutralised too');
  console.log('ALMSHARE checks ' + checks);
});
