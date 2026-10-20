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
});
