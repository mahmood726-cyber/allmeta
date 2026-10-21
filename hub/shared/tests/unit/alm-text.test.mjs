// node:test suite for shared/alm-text.js (F2 in-app text) and the app 9 templates
// (proportion-ma/alm-features-text.js). Run: node --test hub/shared/tests/unit/
// Every gate here has a planted defect that must make the audit FAIL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AlmText = require('../../../../shared/alm-text.js');
const prop = require('../../../../proportion-ma/alm-features-text.js');
const C = AlmText.cochrane;
const MINUS = '−';

// ---------- fixtures ----------
const simpleTemplates = {
  plain: (T) => ['Pooled estimate ', T.num('est', 2), ' (', T.rule('ciLevel'), ' CI ', T.ci('lo', 'hi', 2), ').'],
  methods: (T) => ['Random-effects model (', T.cite('pauleMandel'), '). ', T.entry(), T.when(T.entry(), ' '), T.software(), T.when(T.verify(), [' ', T.verify()])],
  results: (T) => ['k = ', T.int('k'), '; I² = ', T.pct('i2', 1), ' (', T.band('i2', 1), '); ', T.p('pQ'), '.'],
};
const simpleResults = { est: -0.1234, lo: -0.5, hi: 0.25, k: 12, i2: 35.04, pQ: 0.0004 };
const build = { version: 'v1.7.0', shortSha: '7899ce5', sha: '7899ce599bfdedecd4d13b8f35540d129906fb95' };
const ctx0 = { app: 'demo-app', build, entryLog: [], verify: null, revision: undefined };

function report(label, a) {
  console.log(`TEXTAUDIT ${label} ${a.passed}/${a.checks}${a.ok ? '' : ' FAIL: ' + a.failures.map(f => f.check).join(', ')}`);
}

// ---------- formatting ----------
test('format: fixed digits, unicode minus, ints with thousands separators, prop = app fmtPct', () => {
  assert.equal(AlmText.format(-0.1234, { kind: 'num', digits: 2 }), MINUS + '0.12');
  assert.equal(AlmText.format(0.1, { kind: 'num', digits: 3 }), '0.100');
  assert.equal(AlmText.format(12.0, { kind: 'pct', digits: 1 }), '12.0%');
  assert.equal(AlmText.format(1040, { kind: 'int' }), '1,040');
  assert.equal(AlmText.format(7, { kind: 'int' }), '7');
  for (const x of [0.08461538, 0.0001, 0.5, 0.99951, 0.123456]) {
    assert.equal(AlmText.format(x, { kind: 'prop', digits: 1 }), (100 * x).toFixed(1) + '%');
  }
  assert.throws(() => AlmText.format(1.5, { kind: 'int' }), /integer/);
  assert.throws(() => AlmText.format(NaN, { kind: 'num', digits: 2 }), /non-finite/);
  assert.throws(() => AlmText.format(1, { kind: 'num', digits: 2.5 }), /digits/);
});

test('tokens: unicode minus, decimals, percent, thousands groups', () => {
  assert.deepEqual(AlmText.tokens(`a ${MINUS}0.12 to 1,040 and 8.0% (p < 0.001)`), [MINUS + '0.12', '1,040', '8.0%', '0.001']);
  assert.deepEqual(AlmText.tokens('I² and τ² have no digits'), []);
});

// ---------- Cochrane helpers ----------
test('i2Band: overlapping Cochrane Handbook v6.5 §10.10.2 bands at every boundary', () => {
  const cases = [
    [0, ['low']], [29.9, ['low']], [30, ['low', 'moderate']], [40, ['low', 'moderate']], [40.1, ['moderate']],
    [49.9, ['moderate']], [50, ['moderate', 'substantial']], [60, ['moderate', 'substantial']], [60.1, ['substantial']],
    [74.9, ['substantial']], [75, ['substantial', 'considerable']], [90, ['substantial', 'considerable']],
    [90.1, ['considerable']], [100, ['considerable']],
  ];
  for (const [v, bands] of cases) assert.deepEqual(C.i2Band(v).bands, bands, `I2=${v}`);
  assert.equal(C.i2Band(35).phrase, 'might not be important or may represent moderate heterogeneity');
  assert.equal(C.i2Band(95).phrase, 'may represent considerable heterogeneity');
  for (const bad of [-0.1, 100.1, NaN, null, '30']) assert.throws(() => C.i2Band(bad));
  console.log(`TEXTBANDS ${cases.length}/${cases.length}`);
});

test('ciIncludesNull / imprecise / differencePhrase / smallK', () => {
  assert.equal(C.ciIncludesNull(0.8, 1.2, 1), true);
  assert.equal(C.ciIncludesNull(1, 1.2, 1), true);
  assert.equal(C.ciIncludesNull(1.1, 1.2, 1), false);
  assert.equal(C.imprecise(0.8, 1.2, 1), true);
  assert.equal(C.imprecise(1, 1.2, 1), false);
  assert.equal(C.imprecise(-0.3, -0.1, 0), false);
  assert.match(C.differencePhrase(0.8, 1.2, 1), /^no clear evidence of a difference/);
  assert.doesNotMatch(C.differencePhrase(0.8, 1.2, 1), /evidence of no difference|\bno difference\b/);
  assert.throws(() => C.ciIncludesNull(2, 1, 1), /exceeds/);
  assert.deepEqual(C.smallK(2), ['fewK', 'funnelK', 'noPI']);
  assert.deepEqual(C.smallK(7), ['funnelK']);
  assert.deepEqual(C.smallK(10), []);
});

// ---------- render + audit ----------
test('render + audit: good render passes; provenance in order; p threshold is a typed rule token', () => {
  const r = AlmText.render(simpleTemplates, simpleResults, ctx0);
  assert.equal(r.plain.text, `Pooled estimate ${MINUS}0.12 (95% CI ${MINUS}0.50 to 0.25).`);
  assert.match(r.results.text, /k = 12; I² = 35\.0% \(might not be important or may represent moderate heterogeneity\); p < 0\.001\./);
  assert.match(r.methods.text, /Analyses were run in allmeta demo-app v1\.7\.0 \(commit 7899ce5\)\./);
  assert.deepEqual(r.provenance.filter(p => p.source === 'results').map(p => p.key), ['est', 'lo', 'hi', 'k', 'i2']);
  assert.deepEqual(r.cites.map(c => c.id), ['pauleMandel']);
  const a = AlmText.audit(r, simpleResults, { ctx: ctx0 });
  report('simple', a);
  assert.equal(a.ok, true, JSON.stringify(a.failures));
  // p >= threshold prints the value with 3 dp
  const r2 = AlmText.render(simpleTemplates, { ...simpleResults, pQ: 0.0312 }, ctx0);
  assert.match(r2.results.text, /p = 0\.031\./);
});

test('PLANTED: a template with a literal digit -> audit FAILS', () => {
  const bad = { ...simpleTemplates, plain: (T) => ['Pooled estimate ', T.num('est', 2), ' (95% CI ', T.ci('lo', 'hi', 2), ').'] };
  const r = AlmText.render(bad, simpleResults, ctx0);
  const a = AlmText.audit(r, simpleResults, { ctx: ctx0 });
  report('planted-literal-digit', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => f.check === 'plain:tokens'));
});

test('PLANTED: provenance value changed after rendering -> audit FAILS', () => {
  const r = AlmText.render(simpleTemplates, simpleResults, ctx0);
  r.provenance[0].value = r.provenance[0].value + 0.01;
  const a = AlmText.audit(r, simpleResults, { ctx: ctx0 });
  report('planted-provenance-value', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => /provenance\[0\]:est:value/.test(f.check)));
});

test('PLANTED: results changed after rendering, rendered text edited, rule text edited -> audit FAILS', () => {
  const r = AlmText.render(simpleTemplates, simpleResults, ctx0);
  const a1 = AlmText.audit(r, { ...simpleResults, k: 13 }, { ctx: ctx0 });
  assert.equal(a1.ok, false);
  const r2 = AlmText.render(simpleTemplates, simpleResults, ctx0);
  r2.plain.text = r2.plain.text.replace('0.25', '0.26');
  assert.equal(AlmText.audit(r2, simpleResults, { ctx: ctx0 }).ok, false);
  const r3 = AlmText.render(simpleTemplates, simpleResults, ctx0);
  const ruleSeg = r3.plain.segments.find(s => s.type === 'rule');
  ruleSeg.text = '90%';
  r3.plain.text = r3.plain.segments.map(s => s.text).join('');
  assert.equal(AlmText.audit(r3, simpleResults, { ctx: ctx0 }).ok, false);
});

test('missing / non-finite / null key -> render THROWS (never prints NaN/undefined/null)', () => {
  assert.throws(() => AlmText.render(simpleTemplates, { ...simpleResults, est: undefined }, ctx0), /est/);
  const { k, ...noK } = simpleResults;
  assert.throws(() => AlmText.render(simpleTemplates, noK, ctx0), /missing result "k"/);
  assert.throws(() => AlmText.render(simpleTemplates, { ...simpleResults, hi: NaN }, ctx0), /hi/);
  assert.throws(() => AlmText.render(simpleTemplates, { ...simpleResults, lo: null }, ctx0), /lo/);
  assert.throws(() => AlmText.render({ ...simpleTemplates, plain: () => ['k is ', 7] }, simpleResults, ctx0), /numbers must come from T helpers/);
  assert.throws(() => AlmText.render(simpleTemplates, null, ctx0), /run the analysis first/);
  assert.throws(() => AlmText.render({ ...simpleTemplates, plain: (T) => [T.cite('nope')] }, simpleResults, ctx0), /unknown citation/);
});

test('DOM cross-check: matches display digits; PLANTED perturbed value -> FAIL', () => {
  const r = AlmText.render(simpleTemplates, simpleResults, ctx0);
  const dom = { est: { text: '-0.12', fmt: { kind: 'num', digits: 2 } }, k: { text: '12', fmt: { kind: 'int' } }, i2: { text: '35.0%', fmt: { kind: 'pct', digits: 1 } } };
  const a = AlmText.audit(r, simpleResults, { ctx: ctx0, dom });
  assert.equal(a.ok, true, JSON.stringify(a.failures));
  assert.equal(a.domChecked, 3);
  const bad = { ...simpleResults, est: simpleResults.est + 0.05 };
  const r2 = AlmText.render(simpleTemplates, bad, ctx0);
  const a2 = AlmText.audit(r2, bad, { ctx: ctx0, dom });
  report('planted-dom', a2);
  assert.equal(a2.ok, false);
  assert.ok(a2.failures.some(f => f.check === 'dom:est'));
});

// ---------- verify sentence ----------
const verifyOk = {
  revision: 'rev-abc', passed: true,
  rows: [{ pass: true }, { pass: true }, { pass: true }, { pass: true }, { pass: true }],
  versions: { webr: '0.5.4', R: '4.5.1' }, packages: [{ name: 'metafor', version: '4.8-0' }],
};
test('verify sentence ONLY when passed and revision matches the current state revision', () => {
  const sentence = /Results were independently verified in R \(metafor 4\.8-0; webR 0\.5\.4\), with all 5 compared quantities within tolerance\./;
  const ok = AlmText.render(simpleTemplates, simpleResults, { ...ctx0, verify: verifyOk, revision: 'rev-abc' });
  assert.match(ok.methods.text, sentence);
  assert.equal(AlmText.audit(ok, simpleResults, { ctx: { ...ctx0, verify: verifyOk, revision: 'rev-abc' } }).ok, true);
  const variants = [
    { ...ctx0, verify: verifyOk, revision: 'rev-other' },             // stale: state changed since verification
    { ...ctx0, verify: verifyOk, revision: undefined },               // host has no revision
    { ...ctx0, verify: { ...verifyOk, passed: false }, revision: 'rev-abc' },
    { ...ctx0, verify: { ...verifyOk, rows: [...verifyOk.rows, { pass: false }] }, revision: 'rev-abc' },
    { ...ctx0, verify: { ...verifyOk, versions: {} }, revision: 'rev-abc' }, // no webR version -> never a partial claim
    { ...ctx0, verify: null, revision: 'rev-abc' },
  ];
  for (const c of variants) {
    const r = AlmText.render(simpleTemplates, simpleResults, c);
    assert.doesNotMatch(r.methods.text, /verified in R|pending/i);
  }
  // package versions as a map / strings + versions map
  assert.deepEqual(AlmText.verifyFacts({ verify: { ...verifyOk, packages: { metafor: '4.8-0' } }, revision: 'rev-abc' }),
    { pkg: 'metafor', pkgVersion: '4.8-0', webr: '0.5.4', n: 5 });
  assert.deepEqual(AlmText.verifyFacts({ verify: { ...verifyOk, packages: ['metafor'], versions: { webR: '0.5.4', metafor: '4.8-0' } }, revision: 'rev-abc' }),
    { pkg: 'metafor', pkgVersion: '4.8-0', webr: '0.5.4', n: 5 });
});

// ---------- data-entry provenance sentence ----------
const provenance = [
  { id: 's1', label: 'Smith 2019', reference: 'ref', location: 'Table 2', conversions: [{ code: 'SD_FROM_IQR', field: 'sd1i' }, { code: 'SD_FROM_IQR', field: 'sd2i' }, { code: 'MEAN_FROM_MEDIAN', field: 'm1i' }], flags: [{ code: 'SD_FROM_IQR', text: 'x' }] },
  { id: 's2', label: 'Jones 2020', reference: 'ref', location: 'Figure 3', conversions: [{ code: 'SD_FROM_IQR', field: 'sd1i' }], flags: [] },
  { id: 's3', label: 'Lee 2021', reference: 'ref', location: 'p. 5', conversions: [{ code: 'SE_FROM_CI', field: 'sei' }], flags: [{ code: 'TIMEPOINT_CHOSEN', text: 'y' }] },
  { id: 's4', label: 'Kim 2022', reference: 'ref', location: 'Supplement S4', conversions: [], flags: [{ code: 'SD_FROM_IQR', text: 'z' }] },
  { id: 's5', label: 'Ng 2023', reference: 'ref', location: 'Table 1', conversions: [], flags: [] },
];
test('entry: no provenance -> no sentence', () => {
  for (const c of [ctx0, { ...ctx0, entryLog: undefined }, { ...ctx0, provenance: [] }]) {
    const r = AlmText.render(simpleTemplates, simpleResults, c);
    assert.doesNotMatch(r.methods.text, /Data were extracted|Data-entry conversions/);
  }
});

test('entry: mixed conversions -> correct per-study counts, each method cited once, audited', () => {
  const ctx = { ...ctx0, provenance };
  const r = AlmText.render(simpleTemplates, simpleResults, ctx);
  assert.match(r.methods.text,
    /Data were extracted from 5 reports \(source location recorded for each study\); SDs were estimated from interquartile ranges for 3 studies \(Wan et al\. 2014\); means were estimated from medians for 1 study \(Luo et al\. 2018\); the standard error was derived from the confidence interval for 1 study \(Cochrane Handbook v6\.5, §6\.3\.1\)\./);
  assert.equal((r.methods.text.match(/Wan et al\. 2014/g) || []).length, 1);
  const a = AlmText.audit(r, simpleResults, { ctx });
  report('entry', a);
  assert.equal(a.ok, true, JSON.stringify(a.failures));
  // legacy entryLog strings still accepted
  const r2 = AlmText.render(simpleTemplates, simpleResults, { ...ctx0, entryLog: ['Study 4: SD estimated from IQR (Wan 2014; Luo 2018)', 'Study 5: SD estimated from IQR (Wan 2014; Luo 2018)', 'Study 5: SD estimated from IQR (Wan 2014; Luo 2018)'] });
  assert.match(r2.methods.text, /Data-entry conversions: SD estimated from IQR \(Wan 2014; Luo 2018\) for 2 studies\./);
  // a location missing -> no "recorded for each study" claim
  const r3 = AlmText.render(simpleTemplates, simpleResults, { ...ctx0, provenance: [...provenance.slice(0, 4), { id: 's5', reference: 'r', location: '', conversions: [] }] });
  assert.doesNotMatch(r3.methods.text, /source location recorded/);
});

test('PLANTED: entry count off by one -> audit FAILS', () => {
  const ctx = { ...ctx0, provenance };
  const r = AlmText.render(simpleTemplates, simpleResults, ctx);
  const e = r.provenance.find(p => p.key === 'entry.0.count');
  e.value = e.value + 1;
  e.text = String(e.value);
  const a = AlmText.audit(r, simpleResults, { ctx });
  report('planted-entry-count', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => /entry\.0\.count:value/.test(f.check)));
  // and if the context itself changes (a study's conversion removed) the old text no longer audits
  const ctx2 = { ...ctx0, provenance: provenance.slice(1) };
  const r2 = AlmText.render(simpleTemplates, simpleResults, ctx);
  assert.equal(AlmText.audit(r2, simpleResults, { ctx: ctx2 }).ok, false);
});

// ---------- app 9 templates ----------
function propResults(over) {
  return Object.assign({
    transform: 'logit', tauEstimator: 'PM', k: 7, mu_re: -2.38, seRE: 0.112, tau2: 0, Q: 0.27, df: 6, i2: 0,
    poolP: 0.0846, poolLo: 0.0690, poolHi: 0.1034, poolPiLo: 0.0651, poolPiHi: 0.1093, totalN: 1040, totalEvents: 88, nBoundary: 0,
  }, over || {});
}
const FORBIDDEN = [
  [/\bno difference\b|evidence of no/i, 'never "no difference"'],
  [/(?<!statistically )\bsignifican/i, 'no bare "significant"'],
  [/\b(caus(e|es|ed|al)|leads? to|effective|efficacy|clinically (important|meaningful|relevant))\b/i, 'no causal / clinical-importance claims'],
  [/NaN|undefined|null|Infinity/, 'no placeholder values'],
];
const variants = [
  ['logit-PM-k7 (built-in example shape)', propResults()],
  ['logit-PM-k7-moderate', propResults({ i2: 45.3, tau2: 0.0312, Q: 10.98 })],
  ['ft-DL-k4', propResults({ transform: 'ft', tauEstimator: 'DL', k: 4, df: 3, i2: 62.5, tau2: 0.0021, Q: 8.0, totalN: 500, totalEvents: 40 })],
  ['raw-FE-k2', propResults({ transform: 'raw', tauEstimator: 'FE', k: 2, df: 1, poolPiLo: null, poolPiHi: null, totalN: 240, totalEvents: 20 })],
  ['logit-FE-k5', propResults({ tauEstimator: 'FE', k: 5, df: 4, nBoundary: 1 })],
  ['logit-PM-k12-noTotals', (() => { const r = propResults({ k: 12, df: 11, i2: 80.2, tau2: 0.4 }); delete r.totalN; delete r.totalEvents; delete r.nBoundary; return r; })()],
];
test('proportion-ma templates: every variant renders, audits clean, and obeys the wording rules', () => {
  const t = prop.text.templates;
  let checks = 0, passed = 0;
  for (const [name, r] of variants) {
    const ctx = { app: 'proportion-ma', build, entryLog: [], verify: null };
    const out = AlmText.render(t, r, ctx);
    const a = AlmText.audit(out, r, { ctx });
    checks += a.checks; passed += a.passed;
    assert.equal(a.ok, true, name + ' ' + JSON.stringify(a.failures));
    const all = [out.plain.text, out.methods.text, out.results.text, ...out.flags.map(f => f.text)].join('\n');
    for (const [re, why] of FORBIDDEN) assert.doesNotMatch(all, re, `${name}: ${why}`);
    // tau2 always reported with I2
    assert.match(out.results.text, /τ² = [\d.]+.*I² = [\d.]+%/s, name);
    const piExpected = r.tauEstimator !== 'FE' && r.k >= 3 && r.poolPiLo != null;
    assert.equal(/prediction interval for the proportion/.test(out.results.text), piExpected, name + ' PI presence');
    if (r.k < 5) assert.ok(out.flags.some(f => /heterogeneity estimates .* imprecise/.test(f.text)), name + ' k<5 flag');
    if (r.k < 10) assert.ok(out.flags.some(f => /underpowered/.test(f.text)), name + ' k<10 flag');
    if (r.transform === 'ft') assert.match(out.methods.text, /Schwarzer et al\. 2019/);
    if (r.transform === 'logit') assert.match(out.methods.text, /0\.5 was added to both the event and the non-event counts/);
    if (r.tauEstimator === 'DL' && r.k < 10) assert.ok(out.flags.some(f => /DerSimonian–Laird estimator tends to underestimate/.test(f.text)));
    assert.match(out.methods.text, /t distribution with degrees of freedom equal to the number of studies minus one|No prediction interval is reported for the fixed-effect model/);
  }
  console.log(`TEXTAUDIT proportion-ma-variants ${passed}/${checks} (${variants.length} variants)`);
});

test('proportion-ma PLANTED: perturbed result vs rendered provenance -> audit FAILS', () => {
  const r = propResults();
  const out = AlmText.render(prop.text.templates, r, ctx0);
  const a = AlmText.audit(out, { ...r, poolP: r.poolP + 0.01 }, { ctx: ctx0 });
  report('proportion-ma-planted', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.length > 0 && a.failures.every(f => /:poolP:value$/.test(f.check)), JSON.stringify(a.failures));
});

test('flags: a skipped (null) flag before a numeric flag keeps provenance labels aligned', () => {
  const t = { ...simpleTemplates, flags: (T) => [null, T.when(false, 'x'), ['k = ', T.int('k')], 'plain flag', ['I² ', T.pct('i2', 1)]] };
  const r = AlmText.render(t, simpleResults, ctx0);
  assert.deepEqual(r.flags.map(f => f.text), ['k = 12', 'plain flag', 'I² 35.0%']);
  assert.deepEqual(r.provenance.filter(p => p.para.startsWith('flags')).map(p => p.para), ['flags.0', 'flags.2']);
  const a = AlmText.audit(r, simpleResults, { ctx: ctx0 });
  report('flags-alignment', a);
  assert.equal(a.ok, true, JSON.stringify(a.failures));
});

test('T.when with a function is lazy: guarded parts reading a missing key do not throw; eager parts do', () => {
  const lazy = { ...simpleTemplates, plain: (T) => ['x', T.when(T.has('missing'), () => [' ', T.num('missing', 2)])] };
  assert.equal(AlmText.render(lazy, simpleResults, ctx0).plain.text, 'x');
  const eager = { ...simpleTemplates, plain: (T) => ['x', T.when(T.has('missing'), [' ', T.num('missing', 2)])] };
  assert.throws(() => AlmText.render(eager, simpleResults, ctx0), /missing result "missing"/);
});

// ---------- review of PR #178: P1-b verify sentence must be POSITIVE ----------
// F3 row format (panel lane, rows from AlmValidate.compare): {pass: true|false}. Only pass === true counts.
test('PLANTED (review P1-b): a row without an explicit pass === true -> NO verify sentence', () => {
  const ctxFor = (rows, extra) => ({ ...ctx0, verify: { ...verifyOk, rows }, revision: 'rev-abc', ...(extra || {}) });
  const bad = [
    ['row without pass field', [{ pass: true }, { quantity: 'tau2' }]],
    ['pass: null', [{ pass: true }, { pass: null }]],
    ["status: 'error'", [{ pass: true }, { status: 'error' }]],
    ['pass: 0', [{ pass: true }, { pass: 0 }]],
    ["pass: 'yes'", [{ pass: true }, { pass: 'yes' }]],
    ['pass: 1', [{ pass: true }, { pass: 1 }]],
    ['passed: true but no pass', [{ pass: true }, { passed: true }]],
    ['ok: true but no pass', [{ pass: true }, { ok: true }]],
    ['null row', [{ pass: true }, null]],
  ];
  let held = 0;
  for (const [why, rows] of bad) {
    assert.equal(AlmText.verifyFacts(ctxFor(rows)), null, why);
    const r = AlmText.render(simpleTemplates, simpleResults, ctxFor(rows));
    assert.doesNotMatch(r.methods.text, /verified in R/, why);
    held++;
  }
  // verify.passed must be exactly true
  for (const p of [1, 'true', undefined, null]) assert.equal(AlmText.verifyFacts(ctxFor([{ pass: true }], { verify: { ...verifyOk, passed: p, rows: [{ pass: true }] } })), null, 'passed=' + p);
  // every row pass === true -> sentence
  assert.deepEqual(AlmText.verifyFacts(ctxFor([{ pass: true }, { pass: true }])), { pkg: 'metafor', pkgVersion: '4.8-0', webr: '0.5.4', n: 2 });
  console.log(`TEXTVERIFY planted-rows ${held}/${bad.length} withheld`);
});

test('PLANTED (review P1-b): AlmFeatures.verifiedCurrent(app) !== true -> NO verify sentence; context() reads it', () => {
  const ok = { ...ctx0, verify: verifyOk, revision: 'rev-abc' };
  assert.equal(AlmText.verifyFacts({ ...ok, verifiedCurrent: false }), null);
  assert.ok(AlmText.verifyFacts({ ...ok, verifiedCurrent: true }));
  const saved = { st: globalThis.AlmFeaturesState, f: globalThis.AlmFeatures };
  try {
    globalThis.AlmFeaturesState = { verify: verifyOk };
    let current = false;
    globalThis.AlmFeatures = { revision: () => 'rev-abc', verifiedCurrent: (app) => (app === 'demo-app' ? current : true) };
    let c = AlmText.context('demo-app', {});
    assert.equal(c.verifiedCurrent, false);
    assert.equal(AlmText.verifyFacts(c), null, 'host says the verification is not current');
    current = true;
    c = AlmText.context('demo-app', {});
    assert.equal(c.verifiedCurrent, true);
    assert.ok(AlmText.verifyFacts(c));
    // a host whose verifiedCurrent throws or returns a non-boolean -> not current
    globalThis.AlmFeatures = { revision: () => 'rev-abc', verifiedCurrent: () => { throw new Error('x'); } };
    assert.equal(AlmText.verifyFacts(AlmText.context('demo-app', {})), null);
    globalThis.AlmFeatures = { revision: () => 'rev-abc', verifiedCurrent: () => 'yes' };
    assert.equal(AlmText.verifyFacts(AlmText.context('demo-app', {})), null);
    // host without verifiedCurrent (older panel lane) -> the revision + rows gates alone decide
    globalThis.AlmFeatures = { revision: () => 'rev-abc' };
    assert.ok(AlmText.verifyFacts(AlmText.context('demo-app', {})));
  } finally {
    globalThis.AlmFeaturesState = saved.st;
    globalThis.AlmFeatures = saved.f;
  }
});

// ---------- review of PR #178: P1-a fingerprint of what the text was generated from ----------
test('fingerprint (review P1-a): changes when results, revision, verification or entry provenance change', () => {
  const fp = (r, c) => AlmText.fingerprint(r, c);
  const base = fp(simpleResults, ctx0);
  assert.equal(typeof base, 'string');
  assert.equal(fp({ ...simpleResults }, { ...ctx0 }), base, 'equal inputs -> equal fingerprint');
  assert.notEqual(fp({ ...simpleResults, est: simpleResults.est + 1e-9 }, ctx0), base, 'result changed');
  assert.notEqual(fp(simpleResults, { ...ctx0, revision: 'r2' }), base, 'revision changed');
  assert.notEqual(fp(simpleResults, { ...ctx0, verify: verifyOk, revision: 'rev-abc' }), fp(simpleResults, { ...ctx0, revision: 'rev-abc' }), 'verification became current');
  assert.notEqual(fp(simpleResults, { ...ctx0, provenance }), base, 'entry provenance changed');
  assert.notEqual(fp(null, ctx0), base);
});

// ---------- review of PR #178: P2s ----------
test('PLANTED (review P2): DOM cross-check below the declared domMin -> audit FAILS (never a silent zero)', () => {
  const r = AlmText.render(simpleTemplates, simpleResults, ctx0);
  const a = AlmText.audit(r, simpleResults, { ctx: ctx0, dom: {}, domMin: 3 });
  report('planted-dom-min', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => f.check === 'dom:min'));
  const a2 = AlmText.audit(r, simpleResults, { ctx: ctx0, dom: null, domMin: 1 });
  assert.equal(a2.ok, false, 'dom() returning null with domMin set must fail');
  const dom = { est: { text: '-0.12', fmt: { kind: 'num', digits: 2 } }, k: { text: '12', fmt: { kind: 'int' } }, i2: { text: '35.0%', fmt: { kind: 'pct', digits: 1 } } };
  assert.equal(AlmText.audit(r, simpleResults, { ctx: ctx0, dom, domMin: 3 }).ok, true);
  assert.equal(prop.text.domMin, 3, 'app 9 declares its DOM minimum');
});

test('entry (review P2): records with confirmed:false are NOT counted', () => {
  const recs = [
    { id: 'a', reference: 'r', location: 'T1', confirmed: true, conversions: [{ code: 'SD_FROM_IQR' }] },
    { id: 'b', reference: 'r', location: 'T2', confirmed: false, conversions: [{ code: 'SD_FROM_IQR' }] },
    { id: 'c', reference: 'r', location: 'T3', conversions: [] },
  ];
  const s = AlmText.entrySummary(recs);
  assert.equal(s.reports, 2);
  assert.deepEqual(s.groups.map(g => g.count), [1]);
  assert.equal(AlmText.entrySummary([recs[1]]).reports, 0);
  const r = AlmText.render(simpleTemplates, simpleResults, { ...ctx0, provenance: [recs[1]] });
  assert.doesNotMatch(r.methods.text, /Data were extracted|interquartile/);
});

test('proportion-ma (review P2): I² = 0 flag says "few studies" only when k is below the funnel threshold', () => {
  const t = prop.text.templates;
  const ctx = { app: 'proportion-ma', build, entryLog: [], verify: null };
  const big = AlmText.render(t, propResults({ k: 12, df: 11, i2: 0, tau2: 0 }), ctx);
  const f = big.flags.find(x => /does not show that the studies are homogeneous/.test(x.text));
  assert.ok(f, 'I2=0 flag present at k=12');
  assert.doesNotMatch(f.text, /few studies/);
  assert.equal(AlmText.audit(big, propResults({ k: 12, df: 11, i2: 0, tau2: 0 }), { ctx }).ok, true);
  const small = AlmText.render(t, propResults(), ctx);
  assert.ok(small.flags.some(x => /with few studies, heterogeneity statistics have low power/.test(x.text)), 'k=7 keeps the few-studies clause');
});

// FU4: heterogeneity-method citations (Q-profile CI, Sidik-Jonkman estimator, empirical Bayes).
const NEW_CITES = {
  viechtbauerQProfile: ['Viechtbauer 2007', /Confidence intervals for the amount of heterogeneity in meta-analysis\. Stat Med 2007;26:37-52\./],
  sidikJonkman: ['Sidik and Jonkman 2005', /Simple heterogeneity variance estimation for meta-analysis\. J R Stat Soc Ser C Appl Stat 2005;54:367-384\./],
  sidikJonkmanComparison: ['Sidik and Jonkman 2007', /A comparison of heterogeneity variance estimators in combining results of studies\. Stat Med 2007;26:1964-1981\./],
  morris: ['Morris 1983', /Parametric empirical Bayes inference: theory and applications\. J Am Stat Assoc 1983;78:47-55\./],
};
test('citations: Viechtbauer 2007, Sidik & Jonkman 2005/2007, Morris 1983 render as typed tokens and pass the audit', () => {
  for (const [id, [short, full]] of Object.entries(NEW_CITES)) {
    assert.ok(!/\d/.test(id), 'citation id is digit-free: ' + id);
    assert.equal(AlmText.CITES[id].short, short);
    assert.match(AlmText.CITES[id].full, full);
  }
  const t = { ...simpleTemplates, methods: (T) => ['Q-profile CI (', T.cite('viechtbauerQProfile'), '); SJ (', T.cite('sidikJonkman'), '; ',
    T.cite('sidikJonkmanComparison'), '); EB (', T.cite('morris'), ').'] };
  const out = AlmText.render(t, simpleResults, ctx0);
  assert.equal(out.methods.text, 'Q-profile CI (Viechtbauer 2007); SJ (Sidik and Jonkman 2005; Sidik and Jonkman 2007); EB (Morris 1983).');
  assert.deepEqual(out.cites.map(c => c.id), Object.keys(NEW_CITES));
  const a = AlmText.audit(out, simpleResults, { ctx: ctx0 });
  report('new-citations', a);
  assert.equal(a.ok, true, JSON.stringify(a.failures));
  // PLANTED: a citation token whose text no longer matches the table fails the audit.
  const tampered = JSON.parse(JSON.stringify(out));
  const seg = tampered.methods.segments.find(s => s.type === 'cite' && s.id === 'morris');
  seg.text = 'Morris 1984';
  tampered.methods.text = tampered.methods.segments.map(s => s.text).join('');
  const b = AlmText.audit(tampered, simpleResults, { ctx: ctx0 });
  report('new-citations-planted', b);
  assert.equal(b.ok, false);
  assert.ok(b.failures.some(f => f.check === 'methods:cite:morris'), JSON.stringify(b.failures));
});

// FU6: network meta-analysis consistency citations.
test('citations: Dias et al. 2010 and Higgins et al. 2012 render as typed tokens and pass the audit', () => {
  assert.equal(AlmText.CITES.dias2010.short, 'Dias et al. 2010');
  assert.equal(AlmText.CITES.dias2010.full, 'Dias S, Welton NJ, Caldwell DM, Ades AE. Checking consistency in mixed treatment comparison meta-analysis. Stat Med 2010;29:932-944.');
  assert.equal(AlmText.CITES.higgins2012.short, 'Higgins et al. 2012');
  assert.equal(AlmText.CITES.higgins2012.full, 'Higgins JPT, Jackson D, Barrett JK, Lu G, Ades AE, White IR. Consistency and inconsistency in network meta-analysis: concepts and models for multi-arm studies. Res Synth Methods 2012;3:98-110.');
  const t = { ...simpleTemplates, methods: (T) => ['Consistency was checked by node-splitting (', T.cite('dias2010'), ') and the design-by-treatment model (', T.cite('higgins2012'), ').'] };
  const out = AlmText.render(t, simpleResults, ctx0);
  assert.equal(out.methods.text, 'Consistency was checked by node-splitting (Dias et al. 2010) and the design-by-treatment model (Higgins et al. 2012).');
  const a = AlmText.audit(out, simpleResults, { ctx: ctx0 });
  report('nma-citations', a);
  assert.equal(a.ok, true, JSON.stringify(a.failures));
  const tampered = JSON.parse(JSON.stringify(out));
  tampered.methods.segments.find(s => s.id === 'dias2010').text = 'Dias et al. 2011';
  tampered.methods.text = tampered.methods.segments.map(s => s.text).join('');
  const b = AlmText.audit(tampered, simpleResults, { ctx: ctx0 });
  report('nma-citations-planted', b);
  assert.ok(b.failures.some(f => f.check === 'methods:cite:dias2010'), JSON.stringify(b.failures));
});

// FU7: typed label tokens. Labels (study / treatment / outcome names) may contain digits;
// they come verbatim from results() and are excluded from numeric tokenisation by segment type.
const labelTemplates = {
  ...simpleTemplates,
  results: (T) => ['Compared with ', T.label('ref'), ', ', T.label({ key: 'trts', index: 1 }), ' had the largest effect (k = ', T.int('k'), '; first study ', T.label({ key: 'studies', index: 0 }), ').'],
};
const labelResults = { ...simpleResults, ref: 'Placebo', trts: ['Placebo', 'Drug 2'], studies: ['Smith 2019', 'Jones 2020'] };

test('label: "Drug 2" and "Smith 2019" render verbatim from results(), are tracked in order, and the audit passes', () => {
  const r = AlmText.render(labelTemplates, labelResults, ctx0);
  assert.equal(r.results.text, 'Compared with Placebo, Drug 2 had the largest effect (k = 12; first study Smith 2019).');
  assert.deepEqual(r.labels.map(l => [l.key, l.index, l.value]), [['ref', undefined, 'Placebo'], ['trts', 1, 'Drug 2'], ['studies', 0, 'Smith 2019']]);
  assert.deepEqual(r.provenance.filter(p => p.para === 'results').map(p => p.key), ['k']);
  const a = AlmText.audit(r, labelResults, { ctx: ctx0 });
  report('label', a);
  assert.equal(a.ok, true, JSON.stringify(a.failures));
  // Control: the same digits typed as plain template text (not a label) still fail the token audit.
  const plain = AlmText.render({ ...simpleTemplates, results: (T) => ['Drug 2 (k = ', T.int('k'), ').'] }, labelResults, ctx0);
  assert.equal(AlmText.audit(plain, labelResults, { ctx: ctx0 }).ok, false);
});

test('label not in results() -> render THROWS; a label segment with no results value -> audit FAILS', () => {
  assert.throws(() => AlmText.render({ ...simpleTemplates, results: (T) => [T.label('nope')] }, labelResults, ctx0), /missing label "nope"/);
  assert.throws(() => AlmText.render({ ...simpleTemplates, results: (T) => [T.label({ key: 'trts', index: 5 })] }, labelResults, ctx0), /missing label "trts\[5\]"/);
  assert.throws(() => AlmText.render({ ...simpleTemplates, results: (T) => [T.label('k')] }, labelResults, ctx0), /not a non-empty string/);
  // Rendered against results that had the label; audited against results that do not.
  const r = AlmText.render(labelTemplates, labelResults, ctx0);
  const { ref, ...noRef } = labelResults;
  const a = AlmText.audit(r, noRef, { ctx: ctx0 });
  report('label-missing', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => f.check === 'results:label:ref'), JSON.stringify(a.failures));
});

test('PLANTED: a label segment whose text != results value -> audit FAILS', () => {
  const r = AlmText.render(labelTemplates, labelResults, ctx0);
  const seg = r.results.segments.find(s => s.type === 'label' && s.key === 'trts');
  seg.text = 'Drug 3';
  r.results.text = r.results.segments.map(s => s.text).join('');
  const a = AlmText.audit(r, labelResults, { ctx: ctx0 });
  report('label-planted', a);
  assert.equal(a.ok, false);
  assert.ok(a.failures.some(f => f.check === 'results:label:trts[1]'), JSON.stringify(a.failures));
  // Value and text both changed together still disagree with results().
  const r2 = AlmText.render(labelTemplates, labelResults, ctx0);
  const s2 = r2.results.segments.find(s => s.type === 'label' && s.key === 'studies');
  s2.text = s2.value = 'Smith 2018';
  r2.results.text = r2.results.segments.map(s => s.text).join('');
  assert.equal(AlmText.audit(r2, labelResults, { ctx: ctx0 }).ok, false);
});

// FU12: design flags from F1 provenance (cluster not adjusted / adjusted, crossover, not randomised) reach the
// F2 Methods paragraph through the provenance summary, counted per confirmed study and cited to Cochrane Handbook ch. 23.
const AlmEntry = require('../../../../shared/alm-entry.js');
function designRecord(label, choice, text = 'Death: 12/50 in the intervention group vs 20/50 in the control group.') {
  const P = AlmEntry.provenance, c = AlmEntry.extract(text, 'binary2x2').candidates.find(x => x.kind === 'counts');
  let r = P.create({ pastedText: text, label, reference: label + ' trial report', location: 'Table 2' });
  r = P.fromCandidate(r, c, { treatmentIndex: 0, controlIndex: 1, outcome: 'death', timepoint: '1 year', facets: { timepoint: '1 year' }, denominator: 'ITT', ...choice });
  return P.confirm(r, { by: 'MA' });
}
const designProvenance = () => [
  designRecord('Adams 2015', { randomisation: 'clusters', cluster: { action: 'decline' } }),
  designRecord('Brown 2016', { randomisation: 'clusters', cluster: { action: 'decline' } }),
  designRecord('Clark 2017', { randomisation: 'clusters', cluster: { action: 'adjust', m: 10, icc: 0.05, iccSource: 'assumed' } }),
  designRecord('Davis 2018', { randomisation: 'crossover' }),
  designRecord('Evans 2019', { randomisation: 'not randomised' }),
  designRecord('Ford 2020', { randomisation: 'individuals' }),
];
test('FU12: CLUSTER_NOT_ADJUSTED, cluster adjustment, crossover and not-randomised sentences appear in the F2 Methods paragraph (provenance-tracked counts)', () => {
  const recs = designProvenance();
  assert.deepEqual(recs.map(r => AlmEntry.provenance.validate(r)), recs.map(() => []), 'fixtures are valid confirmed F1 rows');
  const s = AlmText.entrySummary(recs);
  const by = Object.fromEntries(s.groups.map(g => [g.desc, g]));
  const notAdj = s.groups.find(g => /not adjusted for clustering/.test(g.desc));
  assert.ok(notAdj, JSON.stringify(s.groups));
  assert.equal(notAdj.count, 2);
  assert.equal(notAdj.cite, 'handbookCluster');
  assert.equal(s.groups.find(g => /adjusted with a design effect/.test(g.desc)).count, 1);
  assert.equal(s.groups.find(g => /crossover/.test(g.desc)).cite, 'handbookCrossover');
  assert.equal(s.groups.find(g => /not from a randomised comparison/.test(g.desc)).count, 1);
  assert.ok(!Object.keys(by).some(d => /converted$/.test(d)), 'the cluster conversion is described, not "field converted"');
  assert.match(AlmText.CITES.handbookCluster.full, /chapter 23/);
  assert.match(AlmText.CITES.handbookCrossover.full, /chapter 23/);
  for (const [name, t] of [['simple', simpleTemplates], ['proportion-ma', prop.text.templates]]) {
    const res = name === 'simple' ? simpleResults : propResults();
    const ctx = { ...ctx0, app: name === 'simple' ? 'demo-app' : 'proportion-ma', provenance: recs };
    const r = AlmText.render(t, res, ctx);
    assert.match(r.methods.text, /cluster-randomised trials were not adjusted for clustering \(flag CLUSTER_NOT_ADJUSTED; their confidence intervals are too narrow\) for 2 studies \(Cochrane Handbook v6\.5, §23\.1\)/, r.methods.text);
    assert.match(r.methods.text, /crossover trials were entered as parallel-group data \(no paired analysis\) for 1 study \(Cochrane Handbook v6\.5, §23\.2\)/);
    assert.match(r.methods.text, /data were not from a randomised comparison for 1 study/);
    assert.equal((r.methods.text.match(/§23\.1\)/g) || []).length, 1, 'each citation once');
    const a = AlmText.audit(r, res, { ctx });
    report('fu12-design-' + name, a);
    assert.equal(a.ok, true, JSON.stringify(a.failures));
    // PLANTED: the CLUSTER_NOT_ADJUSTED count is changed in the rendered provenance -> audit FAILS.
    const tampered = JSON.parse(JSON.stringify(r));
    const i = s.groups.indexOf(notAdj), e = tampered.provenance.find(p => p.key === 'entry.' + i + '.count');
    e.value = e.value + 1; e.text = String(e.value);
    const b = AlmText.audit(tampered, res, { ctx });
    report('fu12-design-planted-' + name, b);
    assert.equal(b.ok, false);
  }
  // Unconfirmed rows are not counted; with no design flags no design sentence is printed.
  const un = designProvenance(); AlmEntry.provenance.unconfirm(un[0]);
  assert.equal(AlmText.entrySummary(un).groups.find(g => /not adjusted for clustering/.test(g.desc)).count, 1);
  const plain = AlmText.render(simpleTemplates, simpleResults, { ...ctx0, provenance: [designRecord('Ford 2020', { randomisation: 'individuals' })] });
  assert.doesNotMatch(plain.methods.text, /cluster|crossover|randomised comparison/);
});
