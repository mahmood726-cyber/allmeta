import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readZip } from '../zip-reader.mjs';
const require = createRequire(import.meta.url);
const S = require('../../../../shared/alm-sof.js');
const Z = require('../../../../shared/alm-zip.js');
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-12, `${a} != ${b}`);
const result = { measure: 'RR', estimate: 0.5, lower: 0.25, upper: 1, k: 3, n: 300, model: 'Main model' };
for (const [measure, expected] of [['RR', .4], ['OR', 1/3], ['HR', .36]]) {
  test(`${measure}: hand calculation and planted incorrect formula`, () => {
    const gate = fn => close(fn(measure, .2, 2), expected);
    gate(S.risk); assert.throws(() => gate(() => expected + .01));
    close(S.risk(measure, .2, 1), .2);
  });
}
test('absolute CI and differences use unrounded probabilities', () => {
  const r = S.absoluteEffects('RR', .2, .5, .25, 1);
  assert.deepEqual(r, { comparator: .2, intervention: .1, lower: .05, upper: .2, difference: -100, differenceLower: -150, differenceUpper: 0 });
  assert.notEqual(r.differenceLower, 150); // planted sign reversal
});
for (const acr of [0, 1, -.1, 1.1, NaN, Infinity, null, '0.2']) {
  test(`ACR refusal ${String(acr)}`, () => {
    for (const m of ['RR', 'OR', 'HR']) assert.throws(() => S.risk(m, acr, 2));
    close(S.risk('RR', .1, 2), .2);
  });
}
test('invalid effects and impossible RR risks are refused, never clamped', () => {
  for (const m of ['RR', 'OR', 'HR']) for (const e of [0, -1, NaN, Infinity, null]) assert.throws(() => S.risk(m, .2, e));
  assert.throws(() => S.risk('RR', .8, 2));
  assert.throws(() => S.absoluteEffects('RR', .2, 1, 2, 3));
  assert.throws(() => S.risk('MD', .2, 2));
  close(S.risk('RR', .5, 2), 1);
});
test('round half away from zero; no negative zero; per 1000 once', () => {
  assert.equal(S.round(-1.5), -2); assert.equal(S.round(1.5), 2);
  assert.equal(S.round(-.1), 0); assert.equal(S.per1000(.1235), 124);
  assert.notEqual(S.round(-1.5), Math.round(-1.5)); // planted JS rounding
});
test('median control risk and total count require complete app data', () => {
  const rows = [{ e2: 1, n2: 10, n1: 20 }, { e2: 9, n2: 30, n1: 40 }];
  close(S.medianControlRisk(rows), .2); assert.equal(S.participants(rows), 100);
  assert.equal(S.medianControlRisk([]), null); assert.equal(S.participants([{ label: 'no N' }]), null);
  assert.equal(S.participants([{ n: 40 }, {}]), null);
  assert.notEqual(S.medianControlRisk(rows), .25); // planted pooled event rate
});
test('certainty is blank until selected; hints never set or change it', () => {
  const gate = api => {
    assert.equal(api.buildFinding(result, {}).certainty, 'Not selected');
    assert.equal(api.buildFinding({ ...result, lower: 1.1, upper: 2, estimate: 1.5 }, {}).certainty, 'Not selected');
  };
  gate(S);
  assert.throws(() => gate({ buildFinding: () => ({ certainty: 'High' }) }));
  for (const certainty of ['High', 'Moderate', 'Low', 'Very low']) {
    const u = { certainty, reasons: { imprecision: 'Wide CI' } };
    assert.equal(S.buildFinding(result, u).certainty, certainty);
    assert.equal(u.certainty, certainty);
  }
  assert.equal(S.buildFinding(result, { certainty: 'automatic' }).certainty, 'Not selected');
  assert.match(S.buildFinding(result, {}).hint, /hint, not a judgement/);
});
test('MD, SMD and single-group do not invent a comparator', () => {
  for (const measure of ['MD', 'SMD', 'r', 'Effect']) {
    const r = S.buildFinding({ ...result, measure }, { acr: '.2' });
    assert.equal(r.absolute, null); assert.match(r.effect, /0.500/);
  }
  const p = S.buildFinding({ ...result, measure: 'proportion' }, {});
  assert.equal(p.absolute, null); assert.match(p.singleGroup, /500/);
  assert.notEqual(p.comparator, '0 per 1,000'); // planted false comparator
});
test('exports contain user reasons, sources, safe CSV and a real DOCX table', () => {
  const f = S.buildFinding(result, { outcome: '=1+1,"quoted"', certainty: 'Low', acr: '.2', reasons: { imprecision: '<wide & uncertain>' } });
  const csv = S.csv(f);
  assert.match(csv, /'=1\+1/); assert.match(csv, /""quoted""/); assert.match(csv, /Low/); assert.match(csv, /imprecision/i);
  const xml = new TextDecoder().decode(readZip(S.docx(f, Z)).find(e => e.name === 'word/document.xml').bytes);
  assert.match(xml, /<w:tbl>/); assert.match(xml, /&lt;wide &amp; uncertain&gt;/); assert.match(xml, /Guyatt/);
  assert.equal((xml.match(/<w:tr>/g) || []).length, 2, 'DOCX has a SoF header row and outcome row');
  assert.throws(() => assert.match(xml.replaceAll('Low', 'High'), /Low/));
  assert.match(S.copyText(f), /Low/); assert.match(S.copyText(f), /95% CI/);
});
test('adapters read cached values, not an engine; missing CI stays unavailable', () => {
  const env = { _almLastFE: () => ({ sum: { mu: .31, ciLoHKSJ: -.12, ciHiHKSJ: .74, k: 4 } }), _almLastStudies: () => [{}, {}, {}, {}] };
  const f = S.readResult('heterogeneity', env);
  assert.equal(f.estimate, .31); assert.equal(f.lower, -.12); assert.equal(f.n, null);
  const p = S.readResult('pubbias-tests', { _almLastPubbias: () => ({ k: 5, tf_est: .4, tf_se: .1 }) });
  assert.equal(p.estimate, null); assert.match(p.unavailable, /95% CI/);
  assert.notEqual(p.estimate, .4); // planted use of adjusted result as main model
});
test('planted automatic certainty code path is caught in the actual module', () => {
  const source = readFileSync(new URL('../../../../shared/alm-sof.js', import.meta.url), 'utf8');
  const mutated = source.replace("certainty: selectedCertainty(user.certainty)", "certainty: 'High'");
  assert.notEqual(mutated, source);
  const ctx = { module: { exports: {} } }; vm.runInNewContext(mutated, ctx);
  assert.throws(() => assert.equal(ctx.module.exports.buildFinding(result, {}).certainty, 'Not selected'));
});

test('all adapters preserve the selected main result and participant availability', () => {
  const cases = [
    ['mh-peto', { _almLastMhPeto: () => ({ measure: 'RR', mh_est: .6, mh_lo: .4, mh_hi: .9, k: 2, peto_est: .7 }) }, [.6, .4, .9, 2, null]],
    ['proportion-ma', { _almLastPropMA: () => ({ poolP: .6, poolLo: .4, poolHi: .9, k: 2 }), __almPropValidation: { snapshot: () => ({ studies: [{ n: 10 }, { n: 30 }] }) } }, [.6, .4, .9, 2, 40]],
    ['correlation-ma', { _almLastCorrMA: () => ({ r: .6, r_lo: .4, r_hi: .9, k: 2, studies: [{ n: 20 }, { n: 40 }] }) }, [.6, .4, .9, 2, 60]],
    ['influence', { _almLastInfluence: () => ({ mu: .6, ciLo: .4, ciHi: .9, k: 2 }), _almLastExclusion: () => { throw Error('Must not use sensitivity model'); } }, [.6, .4, .9, 2, null]],
    ['limit-ma', { _almLastLimit: () => ({ limit_est: .6, limit_ci_lo: .4, limit_ci_hi: .9, re_est: 99, k: 2 }) }, [.6, .4, .9, 2, null]],
    ['cumulative-subgroup', { _almLastCumSub: () => ({ view: 'cumulative', mu_final: .6, lo_final: .4, hi_final: .9, k: 2 }) }, [.6, .4, .9, 2, null]],
    ['cumulative-subgroup', { _almLastCumSub: () => ({ view: 'subgroup', overall_mu: .6, overall_lo: .4, overall_hi: .9, k: 2 }) }, [.6, .4, .9, 2, null]],
  ];
  for (const [app, env, expected] of cases) {
    const r = S.readResult(app, env);
    const gate = r => assert.deepEqual([r.estimate, r.lower, r.upper, r.k, r.n], expected);
    gate(r); assert.throws(() => gate({ ...r, estimate: r.estimate + .1 }));
    assert.equal(S.readResult(app, {}), null);
  }
});
test('meta-regression reads main intercept CI from the page without fitting', () => {
  const card = { querySelector: s => ({ textContent: s === '.k' ? 'β₀ (intercept)' : '0.600 [0.400, 0.900]' }) };
  const env = { document: { querySelectorAll: () => [card] }, _almLastFitted: () => ({ fit: {} }), _almLastStudies: () => [{}, {}] };
  const r = S.readResult('meta-regression', env);
  assert.deepEqual([r.estimate, r.lower, r.upper], [.6, .4, .9]);
  assert.match(r.model, /intercept at moderator = 0/);
  assert.throws(() => assert.deepEqual([99, r.lower, r.upper], [.6, .4, .9]));
});
test('MH totals and default risk come from the app parser, including zero-event tables', () => {
  const rows = [{ e1: 0, n1: 100, e2: 0, n2: 100 }, { e1: 4, n1: 20, e2: 5, n2: 20 }];
  const env = { _almLastMhPeto: () => ({ mh_est: .8, mh_lo: .2, mh_hi: 2, measure: 'OR', k: 2 }),
    document: { querySelector: s => s === '#src' ? { value: 'app input' } : null }, __mhValidation: { parse: input => { assert.equal(input, 'app input'); return rows; } } };
  const r = S.readResult('mh-peto', env);
  assert.equal(r.n, 240); assert.equal(r.defaultRisk, .125);
  assert.notEqual(r.n, 40); assert.notEqual(r.defaultRisk, .25); // planted dropped zero-event row
});
test('pubbias arm counts remain available even without a main CI', () => {
  const env = { _almLastPubbias: () => ({ format: 'binary', k: 5 }),
    document: { querySelector: () => ({ value: 'binary input' }) },
    __almPubBiasEngine: { parseBinary: () => Array.from({ length: 5 }, () => ({ n1: 10, n2: 20 })) } };
  const r = S.readResult('pubbias-tests', env);
  assert.equal(r.n, 150); assert.equal(r.estimate, null);
  assert.notEqual(r.n, 50); // planted one-arm-only total
});
test('no median claim when arm risk is unavailable; explicit blank is not a default', () => {
  assert.match(S.buildFinding(result, {}).riskSource, /No comparator risk/);
  const f = S.buildFinding({ ...result, defaultRisk: .2 }, { acr: '' });
  assert.equal(f.absolute, null); assert.match(f.riskSource, /User-entered/);
  assert.notEqual(S.buildFinding({ ...result, defaultRisk: .2 }, {}).absolute, null);
});
test('planted formula mutations in the actual module fail hand-value gates', () => {
  const source = readFileSync(new URL('../../../../shared/alm-sof.js', import.meta.url), 'utf8');
  for (const [measure, from, to, expected] of [
    ['RR', 'p = acr * effect', 'p = acr + effect', .4],
    ['OR', 'p = 1 / (1 + (1 - acr) / acr / effect)', 'p = acr * effect', 1/3],
    ['HR', 'p = -Math.expm1(effect * Math.log1p(-acr))', 'p = acr * effect', .36],
  ]) {
    const altered = source.replace(from, to); assert.notEqual(altered, source);
    const ctx = { module: { exports: {} } }; vm.runInNewContext(altered, ctx);
    assert.throws(() => close(ctx.module.exports.risk(measure, .2, 2), expected));
  }
});

test('meta-regression hints use the app result precision, not rounded display text', () => {
  const display = '0.100 [0.000, 0.200]';
  const card = { querySelector: s => ({ textContent: s === '.k' ? 'β₀ (intercept)' : display }) };
  const main = { intercept: .1001, intercept_ci_lb: .0004, intercept_ci_ub: .1998, slope: 99 };
  const env = { document: { querySelectorAll: () => [card] }, _almLastFitted: () => ({ fit: {} }),
    _almLastStudies: () => [{}, {}, {}], __almResults: () => main };
  const gate = r => {
    assert.deepEqual([r.estimate, r.lower, r.upper], [.1001, .0004, .1998]);
    const f = S.buildFinding(r, {});
    assert.equal(f.effect, display);
    assert.equal(f.hint, '');
    assert.equal(f.certainty, 'Not selected');
  };
  const r = S.readResult('meta-regression', env);
  gate(r);
  assert.throws(() => gate({ ...r, lower: 0 }), 'planted rounding before hint is caught');
  const touching = S.readResult('meta-regression', { ...env, __almResults: () => ({ ...main, intercept_ci_lb: 0 }) });
  assert.match(S.buildFinding(touching, {}).hint, /CI includes no effect.*hint, not a judgement/);
});

test('meta-regression unavailable app CI cannot fall back to stale display text', () => {
  const card = { querySelector: s => ({ textContent: s === '.k' ? 'β₀ (intercept)' : '0.600 [0.400, 0.900]' }) };
  const env = { document: { querySelectorAll: () => [card] }, _almLastFitted: () => ({ fit: {} }),
    _almLastStudies: () => [{}, {}], __almResults: () => ({ intercept: .6, intercept_ci_lb: NaN, intercept_ci_ub: NaN }) };
  const r = S.readResult('meta-regression', env);
  assert.equal(S.buildFinding(r, {}).effect, 'Unavailable');
  assert.throws(() => assert.equal(S.buildFinding({ ...r, lower: .4, upper: .9 }, {}).effect, 'Unavailable'));
});

test('influence preserves the full-model display precision, never the exclusion column', () => {
  const full = { mu: .123456, ciLo: .00004, ciHi: .246872, k: 4 };
  const table = [
    ['Studies (k)', '4', '3'],
    ['Pooled estimate', '0.1235', '9.9999'],
    ['95% CI lower', '0.0000', '8.8888'],
    ['95% CI upper', '0.2469', '10.1111'],
  ].map(row => ({ cells: row.map(textContent => ({ textContent })) }));
  const env = { _almLastInfluence: () => full, document: {
    querySelectorAll: selector => selector === '#model-body tr' ? table : [],
  } };
  const gate = r => {
    assert.deepEqual([r.estimate, r.lower, r.upper], [full.mu, full.ciLo, full.ciHi]);
    const f = S.buildFinding(r, {});
    assert.equal(f.effect, '0.1235 [0.0000, 0.2469]');
    assert.equal(f.hint, '');
    assert.equal(f.certainty, 'Not selected');
    assert.ok(S.csv(f).includes(f.effect));
    assert.ok(S.copyText(f).includes(f.effect));
    const doc = new TextDecoder().decode(readZip(S.docx(f, Z)).find(e => e.name === 'word/document.xml').bytes);
    assert.ok(doc.includes(f.effect));
  };
  const r = S.readResult('influence', env);
  gate(r);
  assert.throws(() => gate({ ...r, display: '0.123 [0.000, 0.247]' }), 'planted extra rounding');
  assert.throws(() => gate({ ...r, display: '9.9999 [8.8888, 10.1111]' }), 'planted exclusion result');
  assert.throws(() => gate({ ...r, lower: 0 }), 'planted numeric rounding creates a false hint');
  const noTable = S.readResult('influence', { _almLastInfluence: () => full });
  assert.equal(noTable.estimate, full.mu);
  assert.equal(S.buildFinding(noTable, {}).effect, '0.123 [0.000, 0.247]');
});

// CSV injection guard escapes only cells that a spreadsheet would run as a formula (= + @, tab, CR). A leading minus is an
// ordinary negative number here (a beneficial absolute difference, e.g. "-100 fewer per 1,000") and must stay readable.
test('CSV keeps negative differences as written and still escapes formula cells', () => {
  const f = S.buildFinding(result, { outcome: '+SUM(A1)', certainty: 'Low', acr: '.2' });
  const csv = S.csv(f);
  assert.match(csv, /"'\+SUM\(A1\)/);
  assert.match(csv, /"-\d/, 'a negative absolute difference is exported');
  assert.doesNotMatch(csv, /"'-/, 'a negative number must not be prefixed with a quote');
});
