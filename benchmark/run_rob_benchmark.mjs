// allmeta /rob/ — honest Risk-of-Bias benchmark vs RoBBR gold + RobotReviewer.
//
// Runs the SAME deterministic engine the /rob/ app runs (shared/rob-core.js)
// over the RoBBR labelled corpus and reports per-domain accuracy / sensitivity /
// specificity / Cohen's kappa / Macro-F1, then compares to RobotReviewer's
// published Table-8 numbers. No training on the test set — rules come from the
// Cochrane Handbook. Every reported number is [m] (measured here).
//
// Run:
//   node benchmark/run_rob_benchmark.mjs              # RR subset (head-to-head) + full test if present
//   node benchmark/run_rob_benchmark.mjs --json out.json
import { readFileSync, existsSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { gunzipSync } from "zlib";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const RobCore = require("../shared/rob-core.js");
const DATA = join(__dirname, "data", "rob");

function loadRecords(name) {
  const json = join(DATA, name);
  const gz = json + ".gz";
  let text;
  if (existsSync(json)) text = readFileSync(json, "utf8");
  else if (existsSync(gz)) text = gunzipSync(readFileSync(gz)).toString("utf8");
  else return null;
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : Object.values(parsed);
}

// ---- metrics --------------------------------------------------------------
// Binary confusion for a single class label `pos` ("low").
function binaryMetrics(rows) {
  // rows: [{gold:'low'|'nonlow', pred:'low'|'nonlow'}]
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const gp = r.gold === "low", pp = r.pred === "low";
    if (gp && pp) tp++; else if (!gp && pp) fp++; else if (!gp && !pp) tn++; else fn++;
  }
  const prec = (a, b) => (a + b === 0 ? 0 : a / (a + b));
  const f1of = (p, r) => (p + r === 0 ? 0 : (2 * p * r) / (p + r));
  // class "low"
  const precLow = prec(tp, fp), recLow = prec(tp, fn), f1Low = f1of(precLow, recLow);
  // class "nonlow"
  const precNon = prec(tn, fn), recNon = prec(tn, fp), f1Non = f1of(precNon, recNon);
  const macroF1 = (f1Low + f1Non) / 2;
  const n = rows.length;
  const acc = n ? (tp + tn) / n : 0;
  // Cohen's kappa (binary)
  const po = acc;
  const pYesG = (tp + fn) / n, pYesP = (tp + fp) / n;
  const pe = pYesG * pYesP + (1 - pYesG) * (1 - pYesP);
  const kappa = pe === 1 ? 0 : (po - pe) / (1 - pe);
  return {
    n, tp, fp, tn, fn,
    accuracy: +(acc * 100).toFixed(1),
    sensitivity_low: +(recLow * 100).toFixed(1), // recall of low (positive class)
    specificity_low: +(recNon * 100).toFixed(1), // recall of nonlow
    macroF1: +(macroF1 * 100).toFixed(1),
    kappa: +kappa.toFixed(3),
  };
}

function threeWayAccuracy(rows) {
  // rows: [{gold, pred}] with gold/pred in low/some/high (unclear->some)
  let correct = 0;
  for (const r of rows) if (r.gold === r.pred) correct++;
  const n = rows.length;
  // weighted kappa-ish: simple Cohen's kappa over 3 classes
  const cls = ["low", "some", "high"];
  const idx = (x) => cls.indexOf(x);
  const cm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const r of rows) { const g = idx(r.gold), p = idx(r.pred); if (g >= 0 && p >= 0) cm[g][p]++; }
  const rowSum = cm.map((r) => r.reduce((a, b) => a + b, 0));
  const colSum = [0, 1, 2].map((c) => cm[0][c] + cm[1][c] + cm[2][c]);
  const po = correct / n;
  let pe = 0; for (let i = 0; i < 3; i++) pe += (rowSum[i] / n) * (colSum[i] / n);
  const kappa = pe === 1 ? 0 : (po - pe) / (1 - pe);
  return { n, accuracy: +(po * 100).toFixed(1), kappa: +kappa.toFixed(3) };
}

const DOMAIN_LABELS = { sequence: "Random sequence gen", allocation: "Allocation conceal", performance: "Blinding (particip.)", detection: "Blinding (outcome)", attrition: "Incomplete data", reporting: "Selective reporting" };

// ---- RobotReviewer head-to-head (binary low vs high/unclear, Macro-F1) ----
function runHeadToHead() {
  const recs = loadRecords("Main_task_Cochrane_test_RobotReviewer_subset.json");
  if (!recs) { console.log("  (RR subset missing — run benchmark/fetch_rob_corpus.mjs)"); return null; }
  const byDom = {};
  for (const r of recs) {
    const key = RobCore.canonicalDomain(r.bias);
    if (!key) continue;
    const pred = RobCore.predict(r.full_paper, r.bias);
    const goldBin = r.label === "low" ? "low" : "nonlow";
    const predBin = pred.judgment === "low" ? "low" : "nonlow";
    (byDom[key] = byDom[key] || []).push({ gold: goldBin, pred: predBin });
  }
  const perDomain = {};
  let macroSum = 0, count = 0;
  for (const key of ["allocation", "detection", "performance", "sequence"]) {
    if (!byDom[key]) continue;
    const m = binaryMetrics(byDom[key]);
    perDomain[key] = m; macroSum += m.macroF1; count++;
  }
  const avgMacroF1 = count ? +(macroSum / count).toFixed(1) : 0;
  return { perDomain, avgMacroF1, n: recs.length };
}

// ---- Full Cochrane test, 6 canonical domains, 3-way + binary --------------
function runFullTest() {
  const recs = loadRecords("Main_task_Cochrane_test.json");
  if (!recs) return null;
  const byDom = {}, byDom3 = {};
  let used = 0;
  for (const r of recs) {
    const key = RobCore.canonicalDomain(r.bias);
    if (!key) continue;
    used++;
    const pred = RobCore.predict(r.full_paper, r.bias);
    const goldBin = r.label === "low" ? "low" : "nonlow";
    const predBin = pred.judgment === "low" ? "low" : "nonlow";
    (byDom[key] = byDom[key] || []).push({ gold: goldBin, pred: predBin });
    const gold3 = r.label === "unclear" ? "some" : r.label;
    const pred3 = pred.judgment === "unclear" ? "some" : pred.judgment;
    (byDom3[key] = byDom3[key] || []).push({ gold: gold3, pred: pred3 });
  }
  const perDomain = {};
  let macroSum = 0, c = 0;
  for (const key of Object.keys(DOMAIN_LABELS)) {
    if (!byDom[key]) continue;
    const m = binaryMetrics(byDom[key]);
    const t = threeWayAccuracy(byDom3[key]);
    perDomain[key] = { ...m, acc3way: t.accuracy, kappa3way: t.kappa };
    macroSum += m.macroF1; c++;
  }
  return { perDomain, avgMacroF1: c ? +(macroSum / c).toFixed(1) : 0, recordsUsed: used, recordsTotal: recs.length };
}

// ---- report ---------------------------------------------------------------
function pad(s, n) { s = String(s); return s + " ".repeat(Math.max(0, n - s.length)); }

const RR = JSON.parse(readFileSync(join(DATA, "robotreviewer-baseline.json"), "utf8")).models;

console.log("\n================ allmeta /rob/ — Risk-of-Bias benchmark ================");
console.log("Engine: shared/rob-core.js (" + RobCore.VERSION + ") — deterministic, Cochrane-Handbook rules, no training on test.\n");

const h2h = runHeadToHead();
const out = { engine: RobCore.VERSION, generated_by: "benchmark/run_rob_benchmark.mjs" };

if (h2h) {
  console.log("--- HEAD-TO-HEAD vs RobotReviewer (RoBBR Table 8 subset, n=" + h2h.n + ") ---");
  console.log("Binary judgment (low vs high/unclear), metric = Macro-F1 (%). Higher is better.\n");
  console.log(pad("Domain", 22) + pad("n", 5) + pad("allmeta", 10) + pad("RobotRev", 10) + pad("GPT-4o", 9) + pad("Sonnet3.5", 10) + "Δ vs RR");
  const map = { allocation: "allocation", detection: "detection", performance: "performance", sequence: "sequence" };
  for (const key of ["allocation", "detection", "performance", "sequence"]) {
    const m = h2h.perDomain[key]; if (!m) continue;
    const rr = RR.RobotReviewer[map[key]], g4 = RR["GPT-4o"][map[key]], so = RR["Claude-Sonnet-3.5"][map[key]];
    const delta = (m.macroF1 - rr).toFixed(1);
    console.log(pad(DOMAIN_LABELS[key], 22) + pad(m.n, 5) + pad(m.macroF1, 10) + pad(rr, 10) + pad(g4, 9) + pad(so, 10) + (delta >= 0 ? "+" : "") + delta);
  }
  const rrAvg = RR.RobotReviewer.avg, g4Avg = RR["GPT-4o"].avg, soAvg = RR["Claude-Sonnet-3.5"].avg;
  const dAvg = (h2h.avgMacroF1 - rrAvg).toFixed(1);
  console.log(pad("AVERAGE", 22) + pad("", 5) + pad(h2h.avgMacroF1, 10) + pad(rrAvg, 10) + pad(g4Avg, 9) + pad(soAvg, 10) + (dAvg >= 0 ? "+" : "") + dAvg);
  const verdict = h2h.avgMacroF1 > rrAvg ? "BEATS RobotReviewer" : (h2h.avgMacroF1 >= rrAvg - RR.RobotReviewer.ci95 ? "within RobotReviewer's 95% CI" : "below RobotReviewer");
  console.log("\nVERDICT (avg Macro-F1): allmeta " + h2h.avgMacroF1 + " vs RobotReviewer " + rrAvg + " (±" + RR.RobotReviewer.ci95 + ")  ->  " + verdict + ".");
  out.head_to_head = { ...h2h, robotreviewer_avg: rrAvg, verdict };
}

const full = runFullTest();
if (full) {
  console.log("\n--- FULL Cochrane test, 6 canonical domains (n_used=" + full.recordsUsed + "/" + full.recordsTotal + ") ---");
  console.log(pad("Domain", 22) + pad("n", 5) + pad("Acc%", 7) + pad("Sens(low)", 11) + pad("Spec(low)", 11) + pad("MacroF1", 9) + pad("kappa", 8) + pad("3wayAcc", 9) + "3way-k");
  for (const key of Object.keys(DOMAIN_LABELS)) {
    const m = full.perDomain[key]; if (!m) continue;
    console.log(pad(DOMAIN_LABELS[key], 22) + pad(m.n, 5) + pad(m.accuracy, 7) + pad(m.sensitivity_low, 11) + pad(m.specificity_low, 11) + pad(m.macroF1, 9) + pad(m.kappa, 8) + pad(m.acc3way, 9) + m.kappa3way);
  }
  console.log(pad("avg Macro-F1", 22) + pad("", 5) + "= " + full.avgMacroF1);
  out.full_test = full;
} else {
  console.log("\n(Full Cochrane test not present — run `node benchmark/fetch_rob_corpus.mjs` for the 906-record evaluation.)");
}

console.log("\n========================================================================\n");

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx >= 0 && process.argv[jsonIdx + 1]) {
  writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(out, null, 2));
  console.log("Wrote " + process.argv[jsonIdx + 1]);
}
