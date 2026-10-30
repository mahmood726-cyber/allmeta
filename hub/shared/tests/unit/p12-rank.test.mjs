import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const app = new URL('../../../../limit-ma/', import.meta.url);
const { load } = require(fileURLToPath(new URL('tests/input-harness.cjs', app)));
const { load: loadLoo } = require(fileURLToPath(new URL('validate/loo/replay.cjs', app)));
const loadPage = () => load(fileURLToPath(new URL('index.html', app)), fileURLToPath(new URL('plus-ui.js', app)));
const inputBytes = readFileSync(new URL('./p12-rank-input.json', import.meta.url));
const { cases } = JSON.parse(inputBytes);
const reference = () => JSON.parse(readFileSync(new URL('./p12-rank-reference.json', import.meta.url), 'utf8'));
const rows = c => c.te.map((te, i) => ({te, se: c.se[i], label: 'Study ' + (i + 1)}));
const csv = c => rows(c).map(r => `${r.te},${r.se},${r.label}`).join('\n');
const rankReason = /numerically rank-deficient radial design/i;
const good = cases.find(c => c.id === 'ordinary_positive_tau');
function close(a, b, label) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)/Math.max(1, Math.abs(b)) <= 1e-9, `${label}: ${a} vs ${b}`);
}

test('P12-R4 control: native R provenance, numerical ranks and limitmeta refusals', () => {
  const r = reference();
  assert.equal(r.provenance.input_md5, createHash('md5').update(inputBytes).digest('hex'));
  assert.deepEqual(r.input, JSON.parse(inputBytes));
  assert.ok(r.provenance.R);
  for (const p of r.provenance.packages) assert.ok(p.version, p.package);
  assert.equal(r.provenance.lm_fit_tolerance, 1e-7);
  assert.match(r.provenance.radialregression_source, /lm\(/);
  for (const c of cases) {
    const f = r.fits.find(f => f.id === c.id);
    assert.equal(Math.min(f.raw.rank, f.inflated.rank), c.rank, c.id);
    assert.equal(f.fit.status, c.rank === 1 ? 'refused' : 'ok', c.id);
    if (c.id.startsWith('heterogeneous')) assert.equal(f.raw.rank, 2, c.id);
  }
});

for (const c of cases.filter(c => c.rank === 1)) {
  test(`P12-R4 plant: estimator refuses ${c.id}`, () => {
    const h = loadPage();
    assert.throws(() => h.window.AlmLimitEngine.fit(rows(c)), rankReason);
  });
  test(`P12-R4 plant: primary refuses ${c.id} and clears stale results`, () => {
    const h = loadPage(); h.run(csv(good)); h.window.AlmLimitPlusUI.run();
    assert.ok(h.window._almLastLimit()); assert.ok(h.window.AlmLimitPlusUI.snapshot());
    assert.equal(h.run(csv(c)), null);
    assert.match(h.nodes['limit-error'].textContent, rankReason);
    assert.equal(h.window.alm.exportOptions.getResults(), null);
    assert.equal(h.window.alm.plotOptions.getReceiptInput(), null);
    assert.equal(h.window.__almLimitValidationSnapshot().result, null);
    assert.equal(h.window.AlmLimitPlusUI.snapshot(), null);
    for (const id of ['body','plot','plus-body','plus-details','plus-forest','plus-funnel']) assert.equal(h.nodes[id].innerHTML, '', id);
    assert.ok(h.run(csv(good)), 'valid inputs still recover after refusal');
    assert.equal(h.nodes['limit-error'].textContent, '');
  });
  test(`P12-R4 plant: sensitivity explains ${c.id} refusal`, () => {
    const h = loadPage(); h.nodes.src.value = csv(c); h.window.AlmLimitPlusUI.run();
    const state = h.window.AlmLimitPlusUI.snapshot();
    assert.ok(state, 'independent sensitivity methods remain available');
    for (const key of ['limit','Qsmall','Qresid','shift','G2']) {
      assert.equal(state.results[key].status, 'refused', key);
      assert.match(state.results[key].reason, rankReason, key);
      assert.equal(state.results[key].values, undefined, key);
    }
    assert.equal(state.results.RE.status, 'ok');
    assert.match(h.nodes['plus-body'].textContent, rankReason);
  });
}

for (const c of cases.filter(c => c.rank === 2)) test(`P12-R4 control: accepts ${c.id}`, () => {
  const h = loadPage(), r = h.run(csv(c));
  assert.ok(r); assert.equal(h.nodes['limit-error'].textContent, '');
  const f = h.window.AlmLimitEngine.fit(rows(c));
  assert.ok([f.limit_est, f.limit_se, f.re_est, f.tau2].every(Number.isFinite));
  if (c.parity) {
    const native = reference().fits.find(f => f.id === c.id).fit.values;
    for (const key of ['limit_est','limit_se','alpha_r','beta_r','Q','Q_small','Q_resid','G_squared']) close(r[key], native[key], key);
    for (const key of ['limit_est','limit_se','re_est','tau2']) close(f[key], native[key], key);
    f.te_limit.forEach((v,i) => close(v, native.te_limit[i], 'te_limit ' + i));
    h.window.AlmLimitPlusUI.run();
    assert.equal(h.window.AlmLimitPlusUI.snapshot().results.limit.status, 'ok');
  }
});

for (const scale of [1e-6, 1e6]) test(`P12-R4 plant/control: rank boundary is invariant to units x${scale}`, () => {
  const h = loadPage();
  for (const id of ['below_rank_boundary', 'above_rank_boundary']) {
    const c = cases.find(c => c.id === id);
    const scaled = rows(c).map(r => ({...r, te:r.te*scale, se:r.se*scale}));
    if (c.rank === 1) assert.throws(() => h.window.AlmLimitEngine.fit(scaled), rankReason);
    else assert.ok(Number.isFinite(h.window.AlmLimitEngine.fit(scaled).limit_est));
  }
});

test('P12-R4 plant: leave-one-out refuses a near-tied deletion with null numbers', () => {
  const h = loadLoo(), c = cases.find(c => c.id === 'loo_rescue');
  const fit = h.window.AlmLimitLoo.compute(rows(c)), deletion = fit.rows.at(-1);
  assert.equal(deletion.status, 'refused'); assert.match(deletion.reason, rankReason);
  for (const key of ['limit_est','limit_se','re_est','tau2','ci_low','ci_high','change']) assert.equal(deletion[key], null, key);
  const native = reference().fits.find(f => f.id === c.id).deletions;
  assert.equal(native.at(-1).fit.status, 'refused');
  fit.rows.slice(0,-1).forEach((r,i) => {
    assert.equal(r.status, 'ok'); assert.equal(native[i].fit.status, 'ok');
    for (const key of ['limit_est','limit_se','re_est','tau2']) close(r[key], native[i].fit.values[key], key);
  });
});

test('P12-R4 plant: leave-one-out refuses a rank-deficient full fit', () => {
  const h = loadLoo();
  assert.throws(() => h.window.AlmLimitLoo.compute(rows(cases[0])), rankReason);
});
