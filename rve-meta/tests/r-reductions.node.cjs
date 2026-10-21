// node --test rve-meta/tests/r-reductions.node.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('../../shared/stats-qt.js');
const enginePath = process.env.RVE_ENGINE || path.resolve(__dirname, '../../shared/rve.js');
const RVE = require(enginePath);

function close(a, b, absolute, label) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a - b) <= 1e-9 * (absolute ? 1 : Math.max(1, Math.abs(b))),
  `${label}: app=${a}, R=${b}`);
}
// The helpers are production code: a missing or renamed helper fails here.
function reductions() {
  assert.equal(typeof RVE._reductions, 'object', 'RVE._reductions is exported');
  for (const name of ['rSum', 'rMean', 'rFactorKey', 'rFactorLevels', 'rAsCharacterDouble'])
    assert.equal(typeof RVE._reductions[name], 'function', `RVE._reductions.${name}`);
  return RVE._reductions;
}
function agreesWithR(fit, R, label) {
  const summary = RVE.summary(fit);
  close(fit.tau2, R.tau2, false, `${label} tau2`);
  summary.forEach((s, j) => {
    for (const [a, r] of Object.entries({
      estimate: 'b.r', se: 'SE', t: 't', df: 'dfs', p: 'prob',
      ci_lo: 'CI.L', ci_hi: 'CI.U'
    })) close(s[a], R.table[j][r], ['p', 'ci_lo', 'ci_hi'].includes(a), `${label} ${a}[${j}]`);
    for (const [a, r] of Object.entries({
      estimate: 'beta', se: 'SE', t: 'tstat', df: 'df_Satt', p: 'p_Satt'
    })) close(s[a], R.club[r][j], a === 'p', `${label} club_${a}[${j}]`);
  });
}

test('R 4.6 sum/mean controls: cancellation, double rounding, subnormals and overflow', () => {
  const { rSum, rMean } = reductions();
  const controls = require('./fixtures/p15/reduction-controls.json');
  assert.ok(controls.length > 0);
  for (const [i, ref] of controls.entries()) {
    for (const [name, fn] of [['sum', rSum], ['mean', rMean]]) {
      const actual = fn(ref.input);
      assert.equal(Number.isFinite(actual) ? actual : null, ref[name], `${name} control ${i}`);
    }
  }
});

test('C-locale factor ordering uses native Unicode escapes', () => {
  const { rFactorKey } = reductions();
  const labels = ['Kessler', 'King', 'Kyle', 'K�nig'];
  const keys = labels.map(rFactorKey);
  assert.deepEqual(keys, ['Kessler', 'King', 'Kyle', 'K<U+FFFD>nig']);
  assert.deepEqual(labels.slice().sort((a, b) =>
    rFactorKey(a) < rFactorKey(b) ? -1 : 1),
  ['K�nig', 'Kessler', 'King', 'Kyle']);
});

// R 4.6.0: levels(as.factor(c(2, 10, 1))) is "1" "2" "10";
// levels(as.factor(c("2", "10", "1"))) is "1" "10" "2" under LC_COLLATE=C;
// levels(as.factor(c(1e5, 100000.0000000001, -0, 0))) is "0" "1e+05";
// nlevels(as.factor(c(0.3, 0.1 + 0.2))) is 1 (as.character(0.1 + 0.2) is "0.3").
test('factor levels follow the cluster column type, as as.factor() does', () => {
  const { rFactorLevels } = reductions();
  const order = xs => {
    const lv = rFactorLevels(xs);
    return [...new Set(xs.map((_, i) => i).sort((a, b) =>
      lv[a].key < lv[b].key ? -1 : lv[a].key > lv[b].key ? 1 : a - b).map(i => lv[i].group))];
  };
  assert.deepEqual(order([2, 10, 1]), ['1', '2', '10']);
  assert.deepEqual(order(['2', '10', '1']), ['1', '10', '2']);
  assert.deepEqual(order([0.3, 0.1 + 0.2]), ['0.3']);
  assert.deepEqual(order([1e5, 100000.0000000001, -0, 0]), ['0', '1e+05']);
  assert.throws(() => rFactorLevels([1, 'a']), /RVE: cluster IDs must be all numbers or all strings/);
});

// as-character.R: R 4.6.0's as.character(<double>) and the as.factor()
// partition it induces, including 16-17 digit IDs, ULP neighbours and -0.
test('numeric level labels are R\'s as.character(<double>), value by value', () => {
  const { rAsCharacterDouble } = reductions();
  const { vectors } = require('./fixtures/p15/as-character.json');
  let n = 0;
  for (const v of vectors) v.values.forEach((x, i) => {
    assert.equal(rAsCharacterDouble(x), v.as_character[i], `${v.name}: ${x}`); n++;
  });
  assert.ok(n > 1500, `${n} values`);
});

test('numeric cluster IDs: level count, partition and level order agree with R', () => {
  const { rFactorLevels } = reductions();
  const { vectors } = require('./fixtures/p15/as-character.json');
  for (const v of vectors) {
    const lv = rFactorLevels(v.values);
    const order = v.values.map((_, i) => i).sort((a, b) =>
      lv[a].key < lv[b].key ? -1 : lv[a].key > lv[b].key ? 1 : a - b);
    const levels = [...new Set(order.map(i => lv[i].group))];
    assert.equal(levels.length, v.nlevels, `${v.name}: nlevels`);
    assert.deepEqual(levels, v.levels, `${v.name}: levels`);
    v.values.forEach((_, i) => assert.equal(levels.indexOf(lv[i].group) + 1, v.codes[i], `${v.name}: code[${i}]`));
  }
});

test('16-digit numeric IDs: m and the fit agree with robumeta at 1e-9', () => {
  const { fits } = require('./fixtures/p15/as-character.json');
  assert.deepEqual(fits.map(f => f.R.m), [6, 4, 6]);
  assert.equal(new Set(fits[2].rows.map(r => r.cluster)).size, 7, 'seven doubles, six R levels');
  for (const f of fits) {
    assert.ok(f.rows.every(r => typeof r.cluster === 'number'));
    const fit = RVE.fitCORR(f.rows, { rho: f.rho });
    assert.equal(fit.m_clusters, f.R.m, `${f.name}: m`);
    assert.equal(fit.m_clusters, f.R.levels.length);
    agreesWithR(fit, f.R, f.name);
    fit.weights.forEach((w, i) => close(w, f.R.weights[i], false, `${f.name} w[${i}]`));
  }
});

test('sorting is internal: input is untouched and weights retain input-row alignment', () => {
  const rows = require('./fixtures/p15/order.json').input.rows;
  const snapshot = JSON.stringify(rows);
  const fit = RVE.fitCORR(rows, { rho: 0 });
  const reverse = RVE.fitCORR(rows.slice().reverse(), { rho: 0 });
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(fit.weights, reverse.weights.slice().reverse());
  assert.deepEqual(fit.beta, reverse.beta);
  rows.forEach((r, i) => assert.equal(fit.weights[i], 1 / (r.vi + fit.tau2)));
});

// numeric-ids.R maps robu's data.full$r.weights back to the input rows.
test('multi-row clusters: weights are R\'s r.weights in caller order', () => {
  const { designs } = require('./fixtures/p15/numeric-ids.json');
  for (const d of designs) {
    for (const type of ['numeric', 'character']) {
      const rows = d[type].rows, snapshot = JSON.stringify(rows);
      assert.ok(new Set(rows.map(r => r.cluster)).size < rows.length, 'has multi-row clusters');
      const fit = RVE.fitCORR(rows, { rho: d.rho });
      assert.equal(JSON.stringify(rows), snapshot, 'caller rows unchanged');
      assert.equal(fit.weights.length, rows.length);
      fit.weights.forEach((w, i) => close(w, d[type].R.weights[i], false, `seed ${d.seed} ${type} w[${i}]`));
      // Within a cluster every row carries 1 / (k_j (mean v_j + tau2)).
      rows.forEach((r, i) => {
        const peers = rows.filter(q => q.cluster === r.cluster);
        const mean = peers.reduce((s, q) => s + q.vi, 0) / peers.length;
        close(fit.weights[i], 1 / (peers.length * (mean + fit.tau2)), false, `w[${i}] cluster ${r.cluster}`);
      });
    }
  }
});

// Cluster IDs 1..K in shuffled row order. R itself separates numeric,
// character and first-seen ordering at the 1e-9 gate for these designs.
for (const type of ['numeric', 'character']) {
  test(`${type} cluster IDs 1..K: factor order agrees with R at 1e-9`, () => {
    const { designs } = require('./fixtures/p15/numeric-ids.json');
    assert.equal(designs.length, 3);
    for (const d of designs) {
      assert.ok(d.clusters >= 12);
      assert.ok(d[type].rows.every(r => typeof r.cluster === (type === 'numeric' ? 'number' : 'string')));
      assert.ok(d.gap_numeric_vs_character > 1e-9 && d.gap_numeric_vs_first_seen > 1e-9);
      agreesWithR(RVE.fitCORR(d[type].rows, { rho: d.rho }), d[type].R, `seed ${d.seed} ${type}`);
    }
  });
}

// Source: robumeta 2.1, R/robu.R.
// 37: dframe$study <- as.factor(dframe$studynum)
// 39: dframe <- dframe[order(dframe$study), ]
// 134: sumW <- sum(data.full$weights)
// 42: dframe$avg.var.eff.size <- stats::ave(dframe$var.eff.size,
// 43:     dframe$study)
for (const cause of ['order', 'sumw', 'mean']) {
  test(`${cause}: smallest archived reproducer agrees with both R references at 1e-9`, () => {
    const f = require(`./fixtures/p15/${cause}.json`);
    agreesWithR(RVE.fitCORR(f.input.rows, { rho: f.input.rho }), f.R, cause);
  });
}
