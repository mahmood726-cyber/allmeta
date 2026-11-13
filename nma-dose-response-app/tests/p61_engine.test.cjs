'use strict';
// Regression tests for the dose-response network engine (paper 61 validation). Dependency-free:  node --test tests/
// The page is loaded with tests/p61_page.cjs (the page's own scripts in a Node vm; one read-only export line added).
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

async function run(settings, csv = CSV) {
  const p = await loadPage(PAGE);
  const d = p.document;
  d.getElementById('csvInput').value = csv;
  d.getElementById('modelSelect').value = settings.model;
  d.getElementById('baselineToggle').checked = !!settings.fb;
  d.getElementById('randomEffectsToggle').checked = !!settings.tau2;
  if (settings.tau2) d.getElementById('tau2Method').value = settings.tau2;
  d.getElementById('multiArmToggle').checked = false;
  d.getElementById('referenceSelect').value = 'Placebo';
  d.getElementById('targetDose').value = '20';
  d.getElementById('parseCsv').click();
  return { p, api: p.ctx.__p61, again() { d.getElementById('parseCsv').click(); } };
}

function solve(A, b) {
  const n = A.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

test('RCS: a treatment with >= 3 distinct doses gets a restricted cubic spline fit', async () => {
  const { api } = await run({ model: 'rcs' });
  assert.ok(api.state.fits.A, 'A (doses 5,10,20,30,40) must be fitted');
  assert.strictEqual(api.state.fits.A.model, 'rcs');
});

test('log-linear fixed effect: network fit equals the joint weighted least-squares solution', async () => {
  const { api } = await run({ model: 'log_linear' });
  const rows = api.state.data;
  const studies = [...new Set(rows.map(r => r.study))];
  const trts = ['A', 'D'];                       // Placebo: log(0 + 1) = 0, no parameter
  const shift = t => Math.min(...rows.filter(r => r.treatment === t && r.dose > 0).map(r => r.dose)) / 2;
  const X = rows.map(r => [...studies.map(s => (r.study === s ? 1 : 0)), ...trts.map(t => (r.treatment === t ? Math.log(r.dose + shift(t)) : 0))]);
  const w = rows.map(r => r.baseWeight); const y = rows.map(r => r.effect);
  const p = X[0].length; const A = Array.from({ length: p }, () => new Array(p).fill(0)); const b = new Array(p).fill(0);
  X.forEach((x, i) => { for (let a = 0; a < p; a++) { b[a] += w[i] * x[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += w[i] * x[a] * x[c]; } });
  const beta = solve(A, b);
  rows.forEach((r, i) => {
    const want = X[i].reduce((s, x, j) => s + x * beta[j], 0);
    const got = r.studyOffset + api.predictModel(api.state.fits[r.treatment], r.dose);
    assert.ok(Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `row ${r.study}/${r.treatment}: ${got} vs ${want}`);
  });
});

test('random effects: the REML option returns the REML root, not the DL value', async () => {
  const { api } = await run({ model: 'log_linear', fb: true, tau2: 'reml' });
  const { api: apiDl } = await run({ model: 'log_linear', fb: true, tau2: 'dl' });
  const rows = api.state.data.filter(r => r.treatment === 'A');
  const y = rows.map(r => r.effect - r.studyOffset); const v = rows.map(r => 1 / r.baseWeight);
  const sh = Math.min(...rows.map(r => r.dose)) / 2; const X = rows.map(r => [1, Math.log(r.dose + sh)]);
  const t2 = api.state.tau2ByTreatment.A;
  // REML score at the estimate: y'PPy - tr(P) = 0 (or t2 = 0 with a negative score)
  const w = v.map(x => 1 / (x + t2)); const k = y.length;
  const A = [[0, 0], [0, 0]]; X.forEach((x, i) => { for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) A[a][c] += w[i] * x[a] * x[c]; });
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]; const Ai = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]];
  const P = [...Array(k)].map((_, i) => [...Array(k)].map((__, j) => (i === j ? w[i] : 0) - w[i] * w[j] * (X[i][0] * (Ai[0][0] * X[j][0] + Ai[0][1] * X[j][1]) + X[i][1] * (Ai[1][0] * X[j][0] + Ai[1][1] * X[j][1]))));
  const Py = P.map(r => r.reduce((s, x, j) => s + x * y[j], 0));
  const score = Py.reduce((s, x) => s + x * x, 0) - P.reduce((s, r, i) => s + r[i], 0);
  assert.ok(t2 > 0 ? Math.abs(score) < 1e-6 : score <= 1e-9, `REML score ${score} at tau2=${t2}`);
  assert.notStrictEqual(t2, apiDl.state.tau2ByTreatment.A);
});

test('sigmoid Emax: the reported fit is a local minimum of the weighted SSE', async () => {
  const { api } = await run({ model: 'hill', fb: true });
  const pts = api.state.data.filter(r => r.treatment === 'A').map(r => ({ dose: r.dose, value: r.value, weight: r.weight }));
  const f = api.fitModel(pts, 'hill');
  const sse = (e0, emax, ed50, h) => pts.reduce((s, q) => { const pw = Math.pow(q.dose, h); const pr = e0 + emax * pw / (Math.pow(ed50, h) + pw); return s + q.weight * (q.value - pr) ** 2; }, 0);
  const base = sse(f.e0, f.emax, f.ed50, f.hill);
  for (const [i, dlt] of [[0, 1e-4], [1, 1e-4], [2, 1e-4], [3, 1e-4]]) for (const sg of [1, -1]) {
    const pr = [f.e0, f.emax, f.ed50, f.hill]; pr[i] *= (1 + sg * dlt); if (i === 0) pr[0] += sg * 1e-4;
    assert.ok(sse(...pr) >= base * (1 - 1e-9), `perturbing parameter ${i} lowers SSE: ${sse(...pr)} < ${base}`);
  }
});

test('the same data and settings give identical results on a second click', async () => {
  const r = await run({ model: 'hill' });
  const first = JSON.stringify(r.api.state.lastStats);
  r.again();
  assert.strictEqual(JSON.stringify(r.api.state.lastStats), first);
});

test('Emax: the reported fit is a local minimum of the weighted SSE within the page bounds', async () => {
  const { api } = await run({ model: 'emax' });
  for (const t of ['A', 'D']) {
    const pts = api.state.data.filter(r => r.treatment === t).map(r => ({ dose: r.dose, value: r.value, weight: r.weight }));
    const f = api.fitModel(pts, 'emax');
    const R = Math.max(...pts.map(p => p.value)) - Math.min(...pts.map(p => p.value)) || 1;
    const sse = (emax, ed50) => pts.reduce((s, q) => s + q.weight * (q.value - emax * q.dose / (ed50 + q.dose)) ** 2, 0);
    const base = sse(f.emax, f.ed50);
    for (const [de, dd] of [[1e-4, 0], [-1e-4, 0], [0, 1e-4], [0, -1e-4]]) {
      const em = f.emax * (1 + de); if (em > 3 * R || em < -2 * R) continue;
      assert.ok(sse(em, f.ed50 * (1 + dd)) >= base * (1 - 1e-9), `${t}: perturbation (${de},${dd}) lowers SSE below ${base}`);
    }
  }
});

test('fractional polynomial with free baseline: a treatment observed at one dose only is not fitted', async () => {
  const csv = CSV + '\nS6,Placebo,0,0.03,0.10\nS6,E,15,0.40,0.12\nS7,Placebo,0,-0.01,0.11\nS7,E,15,0.36,0.13';
  const { api } = await run({ model: 'fp', fb: true }, csv);
  assert.ok(!api.state.fits.E, 'E (single dose 15, intercept + slope) is not identifiable and must not be fitted');
});

test('Emax with free baseline: the bounded least-squares minimum is reached when the baseline bound is active', async () => {
  const { api } = await run({ model: 'emax', fb: true });
  // points of one treatment (triptans data set, MBNMAdose) after study offsets; R optim minimum 9.488745 (e0 at its lower bound)
  const pts = [{"dose": 0.5, "value": -1.0790506745109116, "weight": 19.74566473988439}, {"dose": 1, "value": -0.5832170733772448, "weight": 24.548223350253807}, {"dose": 1, "value": -0.5784433830923907, "weight": 26.053853296193136}, {"dose": 2, "value": -0.0831674598559182, "weight": 29.510185185185193}, {"dose": 1, "value": -0.614612689077322, "weight": 13.913043478260867}, {"dose": 1, "value": -0.5366978811358415, "weight": 17.532467532467535}, {"dose": 2, "value": -0.23896547283055916, "weight": 18.526315789473685}, {"dose": 1, "value": -0.29873282621960623, "weight": 59.78605049208386}, {"dose": 0.5, "value": -1.126939353457682, "weight": 17.601724137931036}, {"dose": 1, "value": -0.3163102967075655, "weight": 29.189189189189182}, {"dose": 2, "value": -0.3215873538084093, "weight": 30.692307692307686}, {"dose": 0.5, "value": -0.7414699936698481, "weight": 7.2437499999999995}, {"dose": 1, "value": -0.8193592085124808, "weight": 6.598684210526316}, {"dose": 2, "value": -0.5008045844916762, "weight": 7.520270270270273}, {"dose": 1, "value": -0.4272428506473692, "weight": 46.85581395348837}, {"dose": 2, "value": -0.3374419800286974, "weight": 50.098654708520186}, {"dose": 1, "value": -0.6160192798234848, "weight": 20.83495145631068}, {"dose": 2, "value": -0.17733661459435013, "weight": 24.569377990430624}, {"dose": 0.5, "value": -0.7922883312488294, "weight": 6.718346253229974}, {"dose": 1, "value": -0.4657708424641993, "weight": 7.82608695652174}];
  const f = api.fitModel(pts, 'emax');
  assert.ok(f.sse <= 9.488745 * (1 + 1e-6), `SSE ${f.sse} above the R minimum 9.488745`);
});

test('sigmoid Emax: a plateau start does not stop the fit above the bounded minimum', async () => {
  const { api } = await run({ model: 'hill' });
  // points of one treatment (ssri data set, MBNMAdose) after study offsets; R optim minimum 6.283611 (hill <= 5.5)
  const pts = [{"dose": 10, "value": 0.1825539136195576, "weight": 67.56569343065694}, {"dose": 10, "value": 0.310999478795532, "weight": 47.37172774869109}, {"dose": 4, "value": 0.24049162989208606, "weight": 33.27536231884058}, {"dose": 10, "value": 0.24957156219920074, "weight": 21.759999999999998}, {"dose": 20, "value": -0.018692424395478635, "weight": 24.76190476190476}, {"dose": 10, "value": 0.30208394367394653, "weight": 30.24793388429752}, {"dose": 20, "value": 0.1670633474979562, "weight": 29.57983193277311}, {"dose": 20, "value": 0.4295673311454122, "weight": 29.79285714285715}, {"dose": 10, "value": 0.20419998308598986, "weight": 19.285714285714285}, {"dose": 20, "value": -0.06985796522814924, "weight": 10.08}, {"dose": 10, "value": 0.18270020155100164, "weight": 74.59692307692308}, {"dose": 28, "value": 0.24129436581705443, "weight": 77.43072289156626}, {"dose": 10, "value": 0.10778797798348666, "weight": 29.185483870967737}, {"dose": 20, "value": 0.3183195422111918, "weight": 31.367187499999996}, {"dose": 10, "value": 0.05244714876114945, "weight": 43.0344827586207}];
  const f = api.fitModel(pts, 'hill');
  assert.ok(f.sse <= 6.283611 * (1 + 1e-6), `SSE ${f.sse} above the R minimum 6.283611`);
});

test('REML of a residual heterogeneity: the score root is found where Fisher scoring oscillates', async () => {
  const { api } = await run({ model: 'log_linear' });
  if (!api.residualTau2) assert.fail('residualTau2 is not implemented on this page');
  // one treatment of the triptans data set (MBNMAdose): R root of the score 0.001540319666 (metafor does not converge)
  const y = [-0.7804026841093441, -0.8105742335976154, -0.5056006640357733, -0.5344641225658187, -0.7112939032008663, -0.4927914261652507, -0.7804026841093441, -0.8060469048177038, -0.5120064887211052, -0.8185841830771561, -0.4982865279524228, -1.0840938470247514, -0.10758425515754166, -0.7804026841093441, -0.7804026841093441, -0.42961774752699355, -0.8595522645368782, -0.45220568832900837, -0.7528126364505292, -0.5653255363556792, -0.8307462678527983, -0.48095731785497253, -0.8336719226273046, -0.5359788259383313, -0.7804026841093441, -0.7804026841093441, -0.5359788259383313, -0.35963914592977053, -0.5359788259383313, -0.5359788259383313, -0.5062948397085141, -0.842767076329727, -0.41788388236446106, -0.5359788259383313, -0.7804026841093441, -0.5359788259383313, -0.6953914129411853, -0.6953914129411853, -0.7804026841093441]; const v = [0.13392857142857142, 0.04083333333333334, 0.04111295681063123, 0.030985333608758513, 0.03544494720965309, 0.03011690112938379, 0.027747084100675258, 0.009286898839137645, 0.00868143638311066, 0.00924116593388699, 0.00912276336795837, 0.03647214854111406, 0.05144855144855146, 0.040106951871657755, 0.008145131432802665, 0.009066509557475778, 0.03449301219149569, 0.03650793650793652, 0.03282216841538876, 0.03491196114146935, 0.03617992177314211, 0.03954175905395417, 0.006344895495838892, 0.02319711538461539, 0.009270911321025217, 0.030612244897959186, 0.011720169594185342, 0.049697493517718225, 0.09523809523809526, 0.08035714285714286, 0.09065934065934064, 0.11923076923076927, 0.08627450980392157, 0.03867102396514161, 0.040865384615384616, 0.043494019572308806, 0.014801148011480117, 0.015766550522648082, 0.041666666666666664]; const d = [1, 1, 2, 0.5, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 1, 0.5, 1, 2, 1, 2, 1, 2, 2, 2, 1, 1, 2, 2, 2, 2, 0.5, 1, 2, 2, 1, 2, 1.7, 1.7, 1];
  const pos = (x) => Math.pow(Math.max(x, 0), 3);
  const X = d.map(x => [x, pos(x - 0.5) - pos(x - 1) * 1.5 + pos(x - 2) * 0.5]);
  const t2 = api.residualTau2(y, v, X, 'reml');
  assert.ok(Math.abs(t2 - 0.001540319666) < 1e-8, `REML ${t2}`);
});

test('restricted cubic spline with free baseline: columns of very different scale are not treated as singular', async () => {
  const csv = CSV.split('\n').map((l, i) => { if (!i) return l; const c = l.split(','); c[2] = String(Number(c[2]) * 100); return c.join(','); }).join('\n');
  const { api } = await run({ model: 'rcs', fb: true }, csv);
  assert.ok(api.state.fits.A, 'A (5 doses, 4 knots) must be fitted when doses are in large units');
});

test('sigmoid Emax: the profile grid start reaches the bounded minimum for a treatment with few doses', async () => {
  const { api } = await run({ model: 'hill' });
  // points of one treatment (ssri data set, MBNMAdose) after study offsets; R optim minimum 1.96409943
  const pts = [{"dose": 100, "value": 0.280370187346591, "weight": 7.40093996546894}, {"dose": 50, "value": 0.35241951225929047, "weight": 5.275307300169281}, {"dose": 50, "value": 0.22200989873204574, "weight": 11.987236130222172}, {"dose": 100, "value": 0.0933925209099522, "weight": 11.598834283895863}, {"dose": 200, "value": -0.23557121051513263, "weight": 10.843111136208519}];
  const f = api.fitModel(pts, 'hill');
  assert.ok(f.sse <= 1.96409943 * (1 + 1e-6), `SSE ${f.sse} above the R minimum 1.96409943`);
});

test('residual heterogeneity: PM/EB and REML roots beyond 1e12 are bracketed, not cut at the search cap', async () => {
  const { api } = await run({ model: 'log_linear' });
  // intercept only, y = (-1e7, 1e7), v = (1, 1): y'P(t)y = 2e14 / (1 + t) = k - p = 1 and the REML score
  // 2e14 / (1 + t)^2 - 1 / (1 + t) = 0 both have the root t = 2e14 - 1 (metafor uses an unbounded search)
  for (const m of ['pm', 'eb', 'reml']) {
    const t2 = api.residualTau2([-1e7, 1e7], [1, 1], [[1], [1]], m);
    assert.ok(Math.abs(t2 - (2e14 - 1)) <= 1e-9 * 2e14, `${m}: ${t2}`);
  }
});

test('residual heterogeneity: with k <= p the value 0 is flagged as not estimable', async () => {
  const { api } = await run({ model: 'log_linear' });
  // two observations, intercept + slope: no residual degrees of freedom (metafor refuses the fit)
  const info = {};
  const t2 = api.residualTau2([0.1, 0.5], [0.01, 0.02], [[1, 1], [1, 2]], 'reml', info);
  assert.strictEqual(t2, 0, 'value kept at 0 (fixed-effect weights), as the pre-registered P61 oracle');
  assert.strictEqual(info.notEstimable, 'k <= p', `info ${JSON.stringify(info)}`);
  const info2 = {};
  api.residualTau2([0.1, 0.5, 0.2], [0.01, 0.02, 0.03], [[1, 1], [1, 2], [1, 3]], 'reml', info2);
  assert.ok(!info2.notEstimable, 'k > p is estimable');
});

test('network fit: a treatment whose residual heterogeneity is not estimable is named', async () => {
  // E has two doses, so log-linear with a free baseline (intercept + slope) leaves no residual df for E
  // (the diagnostics panel names it; the Node page stub has no #diagTau2 element, so that is checked in a browser)
  const csv = CSV + '\nS6,Placebo,0,0.00,0.10\nS6,E,10,0.30,0.12\nS7,Placebo,0,0.03,0.10\nS7,E,20,0.45,0.12';
  const { api } = await run({ model: 'log_linear', fb: true, tau2: 'reml' }, csv);
  assert.ok(api.state.fits.E, 'E must be fitted');
  assert.deepStrictEqual(Array.from(api.state.tau2NotEstimable || []), ['E'], `tau2NotEstimable ${JSON.stringify(api.state.tau2NotEstimable)}`);
  assert.strictEqual(api.state.tau2ByTreatment.E, 0, 'E keeps fixed-effect weights (tau2 0)');
});
