'use strict';
// REMLEstimator.profileLikelihoodCI (the "Show tau² CI" interval) = metafor confint(type = "PL").
//   node --test nma-dose-response-app/tests/nmaexp_tau2pl.test.cjs
// It used a Wilson-Hilferty chi-square(1) critical value (about 3.70-3.75 instead of qchisq(.95, 1)
// = 3.8415), which narrowed the interval: dat.bcg [0.11664, 0.95027] against metafor [0.11527, 0.96470],
// dat.normand1999 [258.69, 2337.14] against [255.81, 2379.19]. Fixed in bc161c96 (exact chi2 critical
// value via shared/upper-tail.js); this test pins it on two datasets of very different scale.
// Reference: tests/fixtures/nma_dose_tau2pl_metafor.json (tests/fixtures/nma_dose_tau2pl_reference.R).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadPage } = require('./p61_page.cjs');
const R = require('../../tests/fixtures/nma_dose_tau2pl_metafor.json');
const PAGE = path.resolve(__dirname, '..');

for (const key of ['bcg', 'normand']) {
  test(`REML tau² and its profile-likelihood CI equal metafor on ${R[key].data}`, async () => {
    const p = await loadPage(PAGE);
    const ref = R[key];
    const res = new p.ctx.REMLEstimator(ref.yi, ref.vi).estimate();
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
    assert.ok(rel(res.tau2, ref.tau2) < 1e-6, `tau2 ${res.tau2} vs metafor ${ref.tau2}`);
    assert.ok(Array.isArray(res.tau2CI), 'tau2CI is reported');
    // bisection stops at 1e-10 absolute; metafor's roots are solved to 1e-12
    assert.ok(rel(res.tau2CI[0], ref.tau2PL[0]) < 1e-6, `lower ${res.tau2CI[0]} vs metafor ${ref.tau2PL[0]}`);
    assert.ok(rel(res.tau2CI[1], ref.tau2PL[1]) < 1e-6, `upper ${res.tau2CI[1]} vs metafor ${ref.tau2PL[1]}`);
  });
}
