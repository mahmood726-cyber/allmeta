#!/usr/bin/env node
/* plus-check.cjs — compare correlation-ma plus-core.js against the metafor oracle (reference-plus.json).
 * usage (repo root): node correlation-ma/validate/plus-check.cjs [--rjson correlation-ma/validate/plus-corpus/rscript-results.json]
 *   defaults: --macore shared/ma-core.js --core correlation-ma/plus-core.js --ref correlation-ma/validate/plus-corpus/reference-plus.json
 *        [--write-r <dir>] [--rjson <rscript-results.json>] [--tamper]
 * Tolerances (= v1 P17): closed form rel 1e-9 of max(1,|R|); PM/REML tau2 (and tau) 1e-6; I2 |d|/100 <= 1e-9;
 * flags, counts, refusals exact. Never widened. Exit 1 on any failure.
 */
"use strict";
const fs = require("fs"), path = require("path");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const here = (p) => path.join(__dirname, p);
globalThis.AlmMaCore = require(path.resolve(arg("--macore", here("../../shared/ma-core.js"))));
const P = require(path.resolve(arg("--core", here("../plus-core.js"))));
const REF = JSON.parse(fs.readFileSync(arg("--ref", here("plus-corpus/reference-plus.json")), "utf8"));
const TAMPER = has("--tamper");
// MANIFEST-plus.json pins the evidence files (SHA-256 over committed LF bytes); a mismatch refuses the run.
{
  const mf = here("MANIFEST-plus.json");
  if (fs.existsSync(mf)) {
    const M = JSON.parse(fs.readFileSync(mf, "utf8"));
    for (const f of M.files) {
      const b = fs.readFileSync(here(f.path));
      const h = require("crypto").createHash("sha256").update(b).digest("hex");
      if (h !== f.sha256 || b.length !== f.bytes || b.includes(13)) { console.log("PLUS-CHECK: REFUSED " + f.path + " does not match MANIFEST-plus.json"); process.exit(1); }
    }
    console.log("MANIFEST-plus: " + M.files.length + " files verified");
  } else if (!arg("--ref")) { console.log("PLUS-CHECK: REFUSED missing MANIFEST-plus.json"); process.exit(1); }
}

let checks = 0, fails = [];
const stat = {};
function bump(k) { stat[k] = (stat[k] || 0) + 1; }
function fail(id, msg) { fails.push(id + " :: " + msg); }
function near(id, field, app, ref, kind) {
  checks++; bump(kind || "num");
  if (ref === null || ref === undefined) { if (app === null || app === undefined) return; return fail(id, field + " app=" + app + " ref=null"); }
  if (typeof app !== "number" || !isFinite(app)) return fail(id, field + " app non-finite " + app);
  let ok;
  if (kind === "I2") ok = Math.abs(app - ref) / 100 <= 1e-9;
  else if (kind === "tau2") ok = Math.abs(app - ref) / Math.max(1, Math.abs(ref)) <= 1e-6;
  else ok = Math.abs(app - ref) / Math.max(1, Math.abs(ref)) <= 1e-9;
  if (!ok) fail(id, field + " app=" + app + " ref=" + ref + " diff=" + (app - ref));
}
function exact(id, field, app, ref) { checks++; bump("exact"); if (app !== ref) fail(id, field + " app=" + JSON.stringify(app) + " ref=" + JSON.stringify(ref)); }
function truthy(id, field, cond, detail) { checks++; bump("control"); if (!cond) fail(id, field + " " + (detail || "")); }
const arr = (x) => (Array.isArray(x) ? x : [x]);
const iter = (m) => m === "REML" || m === "PM";

let nInputs = 0, nCells = 0, nNA = 0, nLooRows = 0, nLooRef = 0, nNegCtl = 0, nTau0 = 0, nNarrow = 0, nPredKnha = 0, nTieSkip = 0, nPiEqCi = 0;
for (const inp of REF.inputs) {
  nInputs++;
  const studies = inp.studies.map((s) => ({ label: s.label, r: s.r, n: s.n }));
  const sens = P.sensitivity(studies, { method: "REML", test: "z" });
  exact(inp.id, "k", sens.k, inp.k);
  exact(inp.id, "schema", sens._schema, "corr-ma-plus-v1");
  const d = P.prepare(studies);
  d.z.forEach((z, i) => near(inp.id, "z[" + i + "]", z, arr(inp.z)[i]));
  d.v.forEach((v, i) => near(inp.id, "v[" + i + "]", v, arr(inp.v)[i]));
  for (const R of inp.sensitivity) {
    const id = inp.id + "::" + R.method + "::" + R.test;
    const A = P.find(sens.cells, R.method, R.test);
    if (!R.app_applicable) { nNA++; exact(id, "applicable", A.applicable, false); continue; }
    nCells++;
    exact(id, "applicable", A.applicable, true);
    let mu = A.mu_z; if (TAMPER && R.method === "PM" && R.test === "knha") mu += 1e-6;
    const tk = iter(R.method) ? "tau2" : "num";
    near(id, "mu_z", mu, R.mu_z); near(id, "se_z", A.se_z, R.se_z);
    near(id, "tau2_z", A.tau2_z, R.tau2_z, tk); near(id, "tau_z", A.tau_z, R.tau_z, tk);
    near(id, "I2", A.I2, R.I2, "I2");
    near(id, "Q", A.Q, R.Q); exact(id, "df", A.df, R.df);
    near(id, "ciLo", A.ciLo, R.ciLo); near(id, "ciHi", A.ciHi, R.ciHi);
    near(id, "r", A.r, R.r); near(id, "r_lo", A.r_lo, R.r_lo); near(id, "r_hi", A.r_hi, R.r_hi);
    near(id, "piLo", A.piLo, R.piLo); near(id, "piHi", A.piHi, R.piHi);
    near(id, "r_pi_lo", A.r_pi_lo, R.r_pi_lo); near(id, "r_pi_hi", A.r_pi_hi, R.r_pi_hi);
    const rEx = R.ciLo > 0 || R.ciHi < 0, tie = Math.min(Math.abs(R.ciLo), Math.abs(R.ciHi)) < 1e-9;
    if (!tie) exact(id, "ci_excludes_0", A.ci_excludes_0, rEx); else nTieSkip++;
    if (R.method !== "FE") {
      if (R.test === "z") {
        // negative control: app PI is the explicit t_{k-1} interval, not metafor's default (qnorm) predict() for z fits
        nNegCtl++;
        truthy(id, "PI differs from qnorm-based predict()", Math.abs(A.piHi - R.pred_piHi) > 1e-6 && Math.abs(A.piLo - R.pred_piLo) > 1e-6,
          "app=" + A.piHi + " predict=" + R.pred_piHi);
        near(id, "R predict(z fit) is the qnorm interval", R.pred_piHi, R.qnorm_piHi);
        if (R.tau2_z < 1e-12) { nTau0++; truthy(id, "tau2=0: PI wider than CI", (A.piHi - A.piLo) > (A.ciHi - A.ciLo), "pi=" + (A.piHi - A.piLo) + " ci=" + (A.ciHi - A.ciLo)); }
      } else {
        nPredKnha++;
        near(id, "app PI hi == metafor predict(" + R.test + " fit)", A.piHi, R.pred_piHi); near(id, "app PI lo == predict", A.piLo, R.pred_piLo);
      }
    }
    if (R.method !== "FE") {
      const wP = R.piHi - R.piLo, wC = R.ciHi - R.ciLo, d = Math.abs(wP - wC);
      if (d <= 1e-13 * Math.max(1, wC) || d >= 1e-11 * Math.max(1, wC)) { exact(id, "pi_equals_ci", A.pi_equals_ci, d <= 1e-13 * Math.max(1, wC)); nPiEqCi += A.pi_equals_ci ? 1 : 0; } else nTieSkip++;
    }
    if (R.test !== "z") {
      const W = inp.sensitivity.find((x) => x.method === R.method && x.test === "z");
      const dw = (R.ciHi - R.ciLo) - (W.ciHi - W.ciLo);
      if (Math.abs(dw) > 1e-12) { nNarrow += dw < 0 ? 1 : 0; exact(id, "narrower_than_wald", A.narrower_than_wald, dw < 0); } else nTieSkip++;
    }
  }
  for (const m of P.METHODS) for (const t of P.TESTS) {
    const id = inp.id + "::LOO::" + m + "::" + t;
    const L = P.leaveOneOut(studies, m, t);
    if (inp.loo_refusal) { nLooRef++; exact(id, "refused", L.refused, true); exact(id, "refusal reason class", /at least 3/.test(L.reason) ? "k<3" : (/limited to 200/.test(L.reason) ? "k>200" : L.reason), inp.loo_refusal); continue; }
    const R = inp.loo.find((x) => x.method === m && x.test === t);
    if (m === "FE" && t !== "z") { exact(id, "refused (FE x HKSJ)", L.refused, true); continue; }
    exact(id, "refused", L.refused, false);
    const tk = iter(m) ? "tau2" : "num";
    L.rows.forEach((row, i) => {
      nLooRows++;
      const rid = id + "::omit" + (i + 1);
      near(rid, "mu_z", row.mu_z, arr(R.mu_z)[i]); near(rid, "se_z", row.se_z, arr(R.se_z)[i]);
      near(rid, "tau2_z", row.tau2_z, arr(R.tau2_z)[i], tk);
      if (m !== "FE") near(rid, "I2", row.I2, arr(R.I2)[i], "I2"); else exact(rid, "FE LOO I2 withheld", row.I2, null);
      near(rid, "Q", row.Q, arr(R.Q)[i]);
      near(rid, "ciLo", row.ciLo, arr(R.ciLo)[i]); near(rid, "ciHi", row.ciHi, arr(R.ciHi)[i]);
      near(rid, "piLo", row.piLo, arr(R.piLo)[i]); near(rid, "piHi", row.piHi, arr(R.piHi)[i]);
      near(rid, "r", row.r, arr(R.r)[i]); near(rid, "delta_r", row.delta_r, arr(R.delta_r)[i]);
      const lo = arr(R.ciLo)[i], hi = arr(R.ciHi)[i];
      if (Math.min(Math.abs(lo), Math.abs(hi)) >= 1e-9) {
        exact(rid, "ci_excludes_0", row.ci_excludes_0, arr(R.ci_excludes_0)[i]);
        exact(rid, "changes_ci_excludes_0", row.changes_ci_excludes_0, arr(R.changes_ci_excludes_0)[i]);
      } else nTieSkip++;
    });
    exact(id, "full_ci_excludes_0", L.full.ci_excludes_0, R.full_ci_excludes_0);
    const dr = arr(R.delta_r).map(Math.abs), mx = Math.max(...dr);
    const ai = L.largest_abs_delta_index;
    if (ai === R.largest_abs_delta_index) exact(id, "largest_abs_delta_index", ai, R.largest_abs_delta_index);
    else { checks++; if (!(Math.abs(dr[ai - 1] - mx) <= 1e-12)) fail(id, "largest |delta r| index app=" + ai + " R=" + R.largest_abs_delta_index); else nTieSkip++; }
    exact(id, "n_changes", L.n_changes_ci_excludes_0, arr(R.changes_ci_excludes_0).filter(Boolean).length);
  }
}

// R-script generation (B): deterministic, ASCII/injection-safe, one ALMJSON emitter per config
const wdir = arg("--write-r");
const configs = [];
for (const inp of REF.inputs) for (const m of P.METHODS) for (const t of P.TESTS) {
  if (m === "FE" && t !== "z") continue;
  const studies = inp.studies.map((s) => ({ label: s.label, r: s.r, n: s.n }));
  const loo = inp.k >= 3 && inp.k <= 50;
  const s1 = P.rScript(studies, { method: m, test: t, loo }), s2 = P.rScript(studies, { method: m, test: t, loo });
  const id = inp.id + "::R::" + m + "::" + t;
  exact(id, "deterministic", s1 === s2, true);
  exact(id, "one ALMJSON emitter", (s1.match(/ALMJSON:/g) || []).length, 1);
  truthy(id, "ASCII only", /^[\x09\x0a\x20-\x7e]*$/.test(s1));
  const name = (inp.id + "__" + m + "__" + t).replace(/[^A-Za-z0-9._-]+/g, "_") + ".R";
  configs.push({ file: name, input: inp.id, method: m, test: t, loo, k: inp.k });
  if (wdir) { fs.mkdirSync(wdir, { recursive: true }); fs.writeFileSync(path.join(wdir, name), s1); }
}
if (wdir) fs.writeFileSync(path.join(wdir, "configs.json"), JSON.stringify(configs, null, 1));
for (const [lab, st, o] of [["nonfinite r", [{ label: "a", r: NaN, n: 10 }, { label: "b", r: .2, n: 10 }], {}], ["k=1", [{ label: "a", r: .2, n: 10 }], {}], ["FE x knha", [{ label: "a", r: .2, n: 10 }, { label: "b", r: .3, n: 12 }], { method: "FE", test: "knha" }]]) {
  let threw = false; try { P.rScript(st, o); } catch (e) { threw = true; } exact("rScript refusal", lab, threw, true);
}

const rj = arg("--rjson");
let nRun = 0;
if (rj) {
  const RUN = JSON.parse(fs.readFileSync(rj, "utf8"));
  const byFile = new Map(RUN.map((x) => [x.file, x]));
  for (const c of configs) {
    const id = "Rscript::" + c.file, x = byFile.get(c.file);
    if (!x) { checks++; fail(id, "script not executed"); continue; }
    nRun++;
    exact(id, "ALMJSON lines", x.n_almjson, 1);
    if (x.n_almjson !== 1) continue;
    const J = x.almjson;
    const inp = REF.inputs.find((i) => i.id === c.input);
    const A = P.find(P.sensitivity(inp.studies, {}).cells, c.method, c.test);
    const tk = iter(c.method) ? "tau2" : "num";
    exact(id, "k", J.k, A.k);
    near(id, "mu_z", A.mu_z, J.mu_z); near(id, "se_z", A.se_z, J.se_z); near(id, "tau2_z", A.tau2_z, J.tau2_z, tk);
    near(id, "Q", A.Q, J.Q); near(id, "ciLo", A.ciLo, J.ciLo); near(id, "ciHi", A.ciHi, J.ciHi);
    near(id, "piLo", A.piLo, J.piLo); near(id, "piHi", A.piHi, J.piHi);
    near(id, "I2", A.I2, J.I2, "I2");
    if (c.loo) {
      const L = P.leaveOneOut(inp.studies, c.method, c.test);
      L.rows.forEach((row, i) => { near(id, "loo_mu_z[" + i + "]", row.mu_z, J.loo_mu_z[i]); near(id, "loo_ciLo[" + i + "]", row.ciLo, J.loo_ciLo[i]); near(id, "loo_ciHi[" + i + "]", row.ciHi, J.loo_ciHi[i]); });
    }
  }
}

const BANNED = [/more accurate than R/i, /\bcauses\b/i, /\beffect of\b/i];
let nProse = 0;
for (const inp of REF.inputs) {
  const sens = P.sensitivity(inp.studies, {});
  for (const A of sens.cells) {
    if (!A.applicable) continue;
    for (const b of ["cohen", "gignac"]) {
      nProse++;
      const pl = P.plainLanguage(A, { benchmark: b }), mt = P.methodsText(A, {});
      const txt = pl.summary + " " + pl.caveats.join(" ") + " " + mt.methods + " " + mt.results;
      const id = inp.id + "::prose::" + A.method + "::" + A.test + "::" + b;
      for (const re of BANNED) truthy(id, "banned " + re, !re.test(txt));
      for (const s of [P.fmt(A.r), P.fmt(A.r_lo), P.fmt(A.r_hi)]) truthy(id, "contains " + s, pl.summary.includes(s) && mt.results.includes(s));
      if (A.r_pi_lo != null) for (const s of [P.fmt(A.r_pi_lo), P.fmt(A.r_pi_hi), P.fmt(A.tau2_z, 4), P.fmt(A.I2, 1) + "%"]) truthy(id, "contains " + s, pl.summary.includes(s));
      exact(id, "category", pl.summary.includes(" " + P.category(A.r, b) + " "), true);
      exact(id, "CI zero statement", pl.summary.includes("it excludes zero"), A.ci_excludes_0);
      exact(id, "names estimator", mt.methods.includes(A.method === "FE" ? "fixed-effect" : P.METHOD_NAMES[A.method]), true);
      exact(id, "k<5 caveat", pl.caveats.some((c) => /fewer than 5/.test(c)), A.k < 5);
    }
  }
}
const boundary = [[0.0999999999999999, "very small", "very small"], [0.1, "small", "small"], [-0.1, "small", "small"], [0.2, "small", "typical"],
  [0.2999999999999999, "small", "typical"], [0.3, "medium", "large"], [0.4999999999999999, "medium", "large"], [0.5, "large", "large"], [-0.5, "large", "large"], [0, "very small", "very small"]];
for (const [r, c, g] of boundary) { exact("category", "cohen " + r, P.category(r, "cohen"), c); exact("category", "gignac " + r, P.category(r, "gignac"), g); }

console.log(JSON.stringify({ inputs: nInputs, applicable_cells: nCells, not_applicable_cells: nNA, loo_rows: nLooRows, loo_refusal_configs: nLooRef,
  negative_controls_qnorm: nNegCtl, tau2_zero_wald_cells: nTau0, hksj_vs_predict_cells: nPredKnha, hksj_narrower_than_wald: nNarrow, pi_equals_ci_cells: nPiEqCi, tie_guarded: nTieSkip,
  rscripts_generated: configs.length, rscripts_compared: nRun, prose_configs: nProse, by_kind: stat }));
console.log("PLUS-CHECK: " + (checks - fails.length) + "/" + checks + " checks pass" + (TAMPER ? " (TAMPER run: failures expected)" : ""));
fails.slice(0, 40).forEach((f) => console.log("FAIL " + f));
if (fails.length > 40) console.log("... " + (fails.length - 40) + " more failures");
process.exit(fails.length ? 1 : 0);
