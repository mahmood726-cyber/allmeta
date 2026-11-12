/* Plain Node regression checks; no packages or network required.
 * Run: node hub/shared/tests/nma-meta-reg-engine.node.cjs
 * Pinned netmetareg values are supplied separately by the reviewer.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require("../../../shared/nma-meta-regression.js");
const html = fs.readFileSync(path.join(__dirname, "../../../nma-meta-reg/index.html"), "utf8");
const example = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1]
  .trim().split(/\r?\n/).map(line => {
    const [studyId, trtA, trtB, yi, sei, covariate] = line.split(/\s*,\s*/);
    return { studyId, trtA, trtB, yi: +yi, sei: +sei, covariate: +covariate };
  });
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS " + name);
}
function near(actual, expected, tol = 1e-9) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected));
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)),
    actual + " differs from " + expected);
}
function row(studyId, trtA, trtB, yi, covariate, sei = 0.2) {
  return { studyId, trtA, trtB, yi, sei, covariate };
}

// Independent Gauss-Jordan GLS (not the engine's Cholesky implementation).
function inverse(a) {
  const n = a.length;
  const m = a.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => +(i === j))));
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    assert.ok(Math.abs(m[k][k]) > 1e-15);
    const divisor = m[k][k];
    m[k] = m[k].map(v => v / divisor);
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = m[i][k];
      m[i] = m[i].map((v, j) => v - factor * m[k][j]);
    }
  }
  return m.map(r => r.slice(n));
}
const transpose = a => a[0].map((_, j) => a.map(r => r[j]));
const multiply = (a, b) => a.map(r => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const quadratic = (a, m) => multiply(multiply([a], m), transpose([a]))[0][0];
function design(rows, treatments) {
  const mean = rows.reduce((s, r) => s + r.covariate, 0) / rows.length;
  const x = rows.map(r => {
    const incidence = treatments.slice(1).map(t => +(r.trtB === t) - +(r.trtA === t));
    return incidence.concat(incidence.map(v => v * (r.covariate - mean)));
  });
  return { x, mean, y: rows.map(r => r.yi), v: rows.map(r => r.sei * r.sei) };
}
function independentGLS(x, y, sigma) {
  const w = inverse(sigma), xtw = multiply(transpose(x), w);
  const cov = inverse(multiply(xtw, x));
  const beta = multiply(multiply(cov, xtw), y.map(v => [v])).map(r => r[0]);
  const residual = y.map((v, i) => v - x[i].reduce((s, a, j) => s + a * beta[j], 0));
  return { beta, cov, Q: quadratic(residual, w) };
}
function determinant(a) {
  const m = a.map(r => r.slice());
  let result = 1;
  for (let k = 0; k < m.length; k++) {
    let p = k;
    for (let i = k + 1; i < m.length; i++) if (Math.abs(m[i][k]) > Math.abs(m[p][k])) p = i;
    if (p !== k) { [m[k], m[p]] = [m[p], m[k]]; result *= -1; }
    const d = m[k][k];
    result *= d;
    for (let i = k + 1; i < m.length; i++) {
      const f = m[i][k] / d;
      for (let j = k + 1; j < m.length; j++) m[i][j] -= f * m[k][j];
    }
  }
  return result;
}
function likelihood(data, tau, blocks, method) {
  const sigma = data.v.map((v, i) => data.v.map((_, j) => i === j ? v + tau : 0));
  for (const ids of blocks) for (const i of ids) for (const j of ids)
    if (i !== j) sigma[i][j] = tau / 2;
  const f = independentGLS(data.x, data.y, sigma);
  const normal = multiply(multiply(transpose(data.x), inverse(sigma)), data.x);
  return -0.5 * (Math.log(determinant(sigma)) + f.Q +
    (method === "REML" ? Math.log(determinant(normal)) : 0));
}

test("constant reference covariate refusal", () => {
  assert.throws(() => engine.fit(example.map(r => ({ ...r, covariate: 2000 })), ["A", "B", "C"]),
    /Invalid reference treatment for interaction/);
  // Variation elsewhere does not rescue a constant reference covariate.
  const rows = example.map(r => ({ ...r, covariate: r.trtA === "A" ? 2000 : r.covariate }));
  assert.throws(() => engine.fit(rows, ["A", "B", "C"]), /Invalid reference treatment for interaction/);
});
test("disconnection precedes reference-covariate refusal", () => {
  const rows = example.map(r => ({ ...r, covariate: 1 })).concat(
    row("island1", "D", "E", 0.2, 1), row("island2", "D", "E", 0.1, 2));
  assert.throws(() => engine.fit(rows, ["A", "B", "C", "D", "E"]),
    /network is disconnected: 2 sub-networks/);
});
test("non-identifiable interaction names its treatment", () => {
  const rows = [row("1", "A", "B", 0, 0), row("2", "A", "B", 1, 1),
    row("3", "A", "C", 0.5, 0), row("4", "A", "C", 0.7, 0)];
  assert.throws(() => engine.fit(rows, ["A", "B", "C"]),
    /interaction \(or effect\) for C not identifiable from these data/);
});
test("invalid rows are counted and cannot affect the mean or fit", () => {
  const invalid = [
    { ...example[0], yi: Infinity }, { ...example[0], sei: 0 },
    { ...example[0], sei: -1 }, { ...example[0], covariate: NaN },
    { ...example[0], trtB: "unknown" }, { ...example[0], trtB: "A" }
  ];
  const f = engine.fit(example.concat(invalid), ["A", "B", "C"], { method: "FE" });
  assert.equal(f.droppedRows.length, invalid.length);
  assert.equal(f.n, example.length);
  near(f.xMean, example.reduce((s, r) => s + r.covariate, 0) / example.length);
  assert.ok(f.droppedRows.every(r => r.reason && r.studyId && r.trtA && r.trtB));
});
test("three-arm reference-baseline keep rule and mean of kept rows", () => {
  const rows = [];
  for (let s = 0; s < 4; s++) {
    rows.push(row("S" + s, "A", "B", 0.3 + s * 0.1, s));
    rows.push(row("S" + s, "A", "C", 0.6 - s * 0.1, s));
    rows.push(row("S" + s, "B", "C", 100, 99));
  }
  const f = engine.fit(rows, ["A", "B", "C"], { method: "FE" });
  assert.equal(f.n, 8);
  assert.equal(f.studies, 4);
  assert.equal(f.droppedRows.length, 4);
  near(f.xMean, 1.5);
  assert.ok(f.droppedRows.every(r => r.trtA === "B" && r.trtB === "C"));
  near(f.gamma.B.estimate, 0.1);
  near(f.gamma.C.estimate, -0.1);
});
test("multi-arm study missing a comparison is refused, as netmeta does", () => {
  const rows = [];
  for (let s = 0; s < 4; s++) {
    rows.push(row("S" + s, "A", "B", 0.3 + s * 0.1, s));
    rows.push(row("S" + s, "A", "C", 0.6 - s * 0.1, s));
    if (s > 0) rows.push(row("S" + s, "B", "C", 0.3, s));
  }
  assert.throws(() => engine.fit(rows, ["A", "B", "C"], { method: "FE" }),
    /Study 'S0' has a wrong number of comparisons/);
});
test("absent reference uses last normalized code-unit label", () => {
  const treatments = ["A", "b c", "bZ", "b_a"];
  const rows = [];
  for (const t of treatments.slice(1)) for (let x = 0; x < 2; x++)
    rows.push(row(t + x, "A", t, x * 0.1, x));
  rows.push(row("multi", "b c", "bZ", 0.2, 3),
    row("multi", "b c", "b_a", 0.3, 3), row("multi", "bZ", "b_a", 0.1, 3));
  const f = engine.fit(rows, treatments, { method: "FE" });
  assert.equal(f.n, 8);
  assert.deepEqual(f.droppedRows.map(r => [r.trtA, r.trtB]), [["bZ", "b_a"]]);
});
test("FE built-in example agrees with independent closed-form GLS for every reference", () => {
  for (const treatments of [["A", "B", "C"], ["B", "A", "C"], ["C", "A", "B"]]) {
    const data = design(example, treatments);
    const sigma = data.v.map((v, i) => data.v.map((_, j) => i === j ? v : 0));
    const expected = independentGLS(data.x, data.y, sigma);
    const f = engine.fit(example, treatments, { method: "FE", predictAt: [0, data.mean, 70] });
    assert.equal(f.tau2, 0);
    assert.equal(f.method, "FE");
    assert.equal(f.converged, true);
    assert.equal(f.iterations, 0);
    assert.equal(f.QEdf, 6);
    assert.equal(f.studies, 10);
    near(f.QE, expected.Q);
    near(f.xMean, data.mean);
    for (let j = 0; j < 2; j++) {
      const t = treatments[j + 1];
      near(f.beta_at_mean[t].estimate, expected.beta[j]);
      near(f.gamma[t].estimate, expected.beta[2 + j]);
      near(f.beta_at_mean[t].se, Math.sqrt(expected.cov[j][j]));
      near(f.gamma[t].se, Math.sqrt(expected.cov[2 + j][2 + j]));
      for (const pred of f.predictions) {
        const c = [0, 0, 0, 0]; c[j] = 1; c[j + 2] = pred.x - data.mean;
        const est = c.reduce((s, v, k) => s + v * expected.beta[k], 0);
        const se = Math.sqrt(quadratic(c, expected.cov));
        near(pred.perTreatment[t].estimate, est);
        near(pred.perTreatment[t].se, se);
        near(pred.perTreatment[t].ci_lo, est - 1.959963984540054 * se);
        near(pred.perTreatment[t].ci_hi, est + 1.959963984540054 * se);
      }
    }
  }
});
function heterogeneous() {
  const rows = [], kept = [], blocks = [];
  const noise = [-1.2, 0.7, 0.4, -0.9, 1.5, -0.3, 0.9, -1.1, 0.1, 1.3, -0.5, -0.8];
  for (let i = 0; i < noise.length; i++) {
    const x = i % 4;
    const b = row("H" + i, "A", "B", 0.2 + x * 0.15 + noise[i], x, 0.12 + 0.01 * (i % 3));
    const c = row("H" + i, "A", "C", -0.1 - x * 0.08 + noise[(i + 3) % noise.length], x, 0.2);
    blocks.push([kept.length, kept.length + 1]);
    kept.push(b, c);
    rows.push(b, c, row("H" + i, "B", "C", c.yi - b.yi, x, 0.18));
  }
  return { rows, kept, blocks };
}
test("REML/ML interior optimum, numerical likelihood score, and correlated block GLS", () => {
  const fixture = heterogeneous(), data = design(fixture.kept, ["A", "B", "C"]);
  for (const method of ["REML", "ML"]) {
    const f = engine.fit(fixture.rows, ["A", "B", "C"], { method });
    assert.equal(f.converged, true);
    assert.ok(f.tau2 > 0.01 && f.iterations > 0);
    assert.equal(f.n, 24);
    const conditional = t => engine._fitGLS(data.x, data.y, data.v, t, fixture.blocks, method);
    const at = conditional(f.tau2);
    near(f.loglik, at.loglik, 1e-12);
    near(f.loglik, likelihood(data, f.tau2, fixture.blocks, method), 1e-9);
    const h = 1e-5 * Math.max(1, f.tau2);
    // Five-point numerical derivative of the same loglik returned by fit.
    const score = (conditional(f.tau2 - 2 * h).loglik - 8 * conditional(f.tau2 - h).loglik +
      8 * conditional(f.tau2 + h).loglik - conditional(f.tau2 + 2 * h).loglik) / (12 * h);
    near(score, 0, 1e-6);
    near(at.score, 0, 1e-8);
    const independentScore = (likelihood(data, f.tau2 + h, fixture.blocks, method) -
      likelihood(data, f.tau2 - h, fixture.blocks, method)) / (2 * h);
    near(independentScore, 0, 1e-6);
    for (const factor of [0, 0.1, 0.5, 0.9, 1.1, 2, 10, 100])
      assert.ok(conditional(f.tau2 * factor).loglik <= f.loglik + 1e-10);
    near(f.QE, conditional(0).Q, 1e-10);
    const sigma = data.v.map((v, i) => data.v.map((_, j) =>
      (i === j ? v : 0) + (i === j ? f.tau2 : Math.floor(i / 2) === Math.floor(j / 2) ? f.tau2 / 2 : 0)));
    const independent = independentGLS(data.x, data.y, sigma);
    for (let j = 0; j < 2; j++) {
      near(f.beta_at_mean[["B", "C"][j]].estimate, independent.beta[j]);
      near(f.gamma[["B", "C"][j]].estimate, independent.beta[2 + j]);
    }
    // Reversing arbitrary supplied contrasts must not alter a baseline-oriented fit.
    const reversed = fixture.rows.map((r, i) => i % 2 ? r :
      { ...r, trtA: r.trtB, trtB: r.trtA, yi: -r.yi });
    const flipped = engine.fit(reversed, ["A", "B", "C"], { method });
    near(flipped.tau2, f.tau2, 1e-10);
    near(flipped.beta_at_mean.B.estimate, f.beta_at_mean.B.estimate, 1e-10);
  }
});
test("zero-boundary solution is exact and REML is the default", () => {
  for (const method of ["REML", "ML"]) {
    const f = engine.fit(example, ["A", "B", "C"], { method });
    assert.equal(f.tau2, 0);
    assert.equal(f.converged, true);
    assert.equal(f.method, method);
  }
  assert.equal(engine.fit(example, ["A", "B", "C"]).method, "REML");
  assert.throws(() => engine.fit(example, ["A", "B", "C"], { method: "PM" }), /method must be/);
});
test("saturated full-rank REML uses the exact zero boundary", () => {
  const rows = [row("1", "A", "B", 0.3, 0), row("2", "A", "B", -0.7, 1)];
  const f = engine.fit(rows, ["A", "B"]);
  assert.equal(f.QEdf, 0);
  assert.equal(f.tau2, 0);
  assert.equal(f.converged, true);
});
test("page method selector, summary, and refusal clear previous results", () => {
  const nodes = Object.create(null);
  function node(id) {
    return nodes[id] || (nodes[id] = { value: "", innerHTML: "",
      addEventListener(type, fn) { this[type] = fn; },
      insertAdjacentHTML(_, text) { this.innerHTML += text; } });
  }
  node("src").value = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  node("f-ref").value = "A"; node("f-predict").value = "0, 58";
  node("f-method").value = "FE";
  const context = { AlmNmaMetaReg: engine, document: { getElementById: node, querySelector: node } };
  context.window = context;
  vm.runInNewContext(html.match(/<script>\s*(\(function \(\) \{[\s\S]*?)<\/script>/)[1], context);
  assert.equal(context.__almLastNmaMetaReg().method, "FE");
  assert.match(node("summary").innerHTML, /QE \(df\)/);
  assert.match(node("summary").innerHTML, /Dropped multi-arm contrasts/);
  node("f-method").value = "ML";
  node("btn-run").click();
  assert.equal(context.__almLastNmaMetaReg().method, "ML");
  node("src").value = example.map(r => [r.studyId, r.trtA, r.trtB, r.yi, r.sei, 1].join(",")).join("\n");
  node("btn-run").click();
  assert.match(node("summary").innerHTML, /Fit failed: Invalid reference treatment for interaction/);
  assert.equal(context.__almLastNmaMetaReg(), null);
  assert.equal(node("#beta tbody").innerHTML, "");
  assert.equal(node("plot-host").innerHTML, "");
});
console.log(passed + " tests passed.");
