'use strict';
// The bootstrap seed input must make the bootstrap reproducible: the same data, settings and seed give
// the same bootstrap result. (Before this fix the study resampling used a Date.now()-seeded generator,
// so the seed only changed an unrelated generator and two runs with seed 123 differed.)
//   node --test tests/p61_bootstrap_seed.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadPage } = require('./p61_page.cjs');
const PAGE = path.resolve(__dirname, '..');

const CSV = `study,treatment,dose,effect,se
S1,Placebo,0,0,0.10
S1,A,5,0.28,0.12
S1,D,5,0.15,0.12
S2,Placebo,0,0.02,0.11
S2,A,10,0.49,0.13
S3,Placebo,0,-0.03,0.10
S3,D,10,0.30,0.14
S3,A,40,1.30,0.15
S4,Placebo,0,0.01,0.09
S4,A,20,0.66,0.12
S4,D,20,0.41,0.13
S5,Placebo,0,0.04,0.10
S5,A,30,0.35,0.14
S5,D,40,0.52,0.12`;

async function bootstrapOnce(model, seed) {
  const p = await loadPage(PAGE);
  const d = p.document;
  d.getElementById('csvInput').value = CSV;
  d.getElementById('modelSelect').value = model;
  d.getElementById('baselineToggle').checked = false;
  d.getElementById('randomEffectsToggle').checked = false;
  d.getElementById('multiArmToggle').checked = false;
  d.getElementById('referenceSelect').value = 'Placebo';
  d.getElementById('targetDose').value = '20';
  d.getElementById('parseCsv').click();
  d.getElementById('bootstrapIter').value = '50';
  d.getElementById('bootstrapSeed').value = String(seed);
  // the loader's setTimeout is inert; the bootstrap loop yields with setTimeout(resolve, 0)
  p.ctx.setTimeout = (fn) => { setImmediate(fn); return 0; };
  d.getElementById('runBootstrap').click();
  const st = p.ctx.__p61.state;
  for (let i = 0; i < 200000 && (st.bootstrap.running || !st.bootstrapResult); i++) await new Promise(r => setImmediate(r));
  assert.ok(st.bootstrapResult, 'bootstrap produced a result');
  const r = st.bootstrapResult;
  return JSON.stringify({ targetCI: r.targetCI, pBest: r.pBest, sucra: r.sucra, valid: r.validIterations });
}

for (const model of ['log_linear', 'hill']) {
  test(`bootstrap (${model}): the same seed gives the same result`, async () => {
    const a = await bootstrapOnce(model, 123);
    await new Promise(r => setTimeout(r, 5)); // a different wall-clock time
    const b = await bootstrapOnce(model, 123);
    assert.strictEqual(b, a);
  });
}
