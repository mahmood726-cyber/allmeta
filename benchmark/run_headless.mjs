// allmeta HEADLESS active-learning benchmark — no browser, no web server.
//
// Drives the SHIPPED Screen classifier (TF-IDF unigram+bigram + class-weighted
// logistic regression, relevance-sampling active learning) over the labelled SR
// corpora and reports per-dataset WSS@95 + recall@k, plus aggregates.
//
// "No re-implementation": the classifier functions are extracted VERBATIM from
// screen/index.html by brace-matching and evaluated in a Node vm. The exact
// shipped source runs — we just supply a CSV loader and seed loop instead of a
// reviewer clicking i/e in the UI. Pure node, no port, no Playwright.
//
// Run:  node benchmark/run_headless.mjs           (all corpora, 3 seeds)
//       SEEDS=1234567 node benchmark/run_headless.mjs   (1 seed, fast)
// Writes benchmark/results_headless.json and prints the head-to-head table.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import vm from "vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = readFileSync(join(ROOT, "screen", "index.html"), "utf8");

// ---------- verbatim extraction of shipped functions ----------
// Find `function NAME` (or `var NAME =`) and brace/paren-match to the close so
// we copy the exact shipped body, no transcription.
function extractFunction(src, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(", "g");
  const m = re.exec(src);
  if (!m) throw new Error("function not found: " + name);
  const start = m.index;
  // walk to the opening brace of the body, then balance braces
  let i = src.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error("unbalanced braces for " + name);
}
function extractVarStmt(src, name) {
  // matches `var NAME = ...;` where the RHS may contain () and ""; balance parens, stop at top-level ;
  const re = new RegExp("var\\s+" + name + "\\s*=", "g");
  const m = re.exec(src);
  if (!m) throw new Error("var not found: " + name);
  const start = m.index;
  let depth = 0, inStr = false, q = "";
  for (let j = src.indexOf("=", start) + 1; j < src.length; j++) {
    const c = src[j];
    if (inStr) { if (c === q && src[j - 1] !== "\\") inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("no statement end for " + name);
}

const FUNCS = [
  "clean", "splitAuthors", "freshId", "normalizeImported",
  "mlUnigrams", "mlTokenize", "mlText", "mlBuildVocab", "mlVector",
  "sigmoid", "mlSampleWeights", "mlFit", "mlPredict",
  "_lgamma", "_logChoose", "_phyper", "mlBuscarP",
  "mulberry32", "simulateActiveLearning",
];
const VARS = ["_autoId", "ML_STOP", "ML_TF", "ML_MODEL_MODE", "ML_NB_ALPHA", "ML_BALANCE_RATIO"];

let assembled = "'use strict';\n";
for (const v of VARS) assembled += extractVarStmt(SRC, v) + "\n";
for (const f of FUNCS) assembled += extractFunction(SRC, f) + "\n";
assembled += "\nmodule.exports = { simulateActiveLearning: simulateActiveLearning };\n";

const sandbox = { module: { exports: {} }, performance: { now: () => 0 }, Math, Object, Array, String, Number, JSON, Float64Array, isFinite, parseInt, parseFloat };
vm.createContext(sandbox);
vm.runInContext(assembled, sandbox, { filename: "alm_screen_extracted.js" });
const { simulateActiveLearning } = sandbox.module.exports;
if (typeof simulateActiveLearning !== "function") throw new Error("extraction failed: simulateActiveLearning not a function");
// Ablation overrides of the shipped ranker config (defaults: sublinear tf-idf + LR/NB ensemble).
//   TF=raw       → plain term counts (pre-upgrade features)
//   MODEL=lr|nb  → single ranker instead of the ensemble
if (process.env.TF) sandbox.ML_TF = process.env.TF;
if (process.env.MODEL) sandbox.ML_MODEL_MODE = process.env.MODEL;
if (process.env.ALPHA) sandbox.ML_NB_ALPHA = Number(process.env.ALPHA);
if (process.env.RATIO) sandbox.ML_BALANCE_RATIO = Number(process.env.RATIO);

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => { const o = {}; header.forEach((h, i) => (o[h] = r[i] ?? "")); return o; });
}
const loadGz = (f) => parseCSV(gunzipSync(readFileSync(join(__dirname, "data", "corpora", f))).toString("utf8"));

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
function round(x, n = 4) { return Math.round(x * 10 ** n) / 10 ** n; }

// ---------- run ----------
const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(",").map(Number) : [1234567, 24681012, 1357911];
// Default batch policy matches the original browser harness (coarse, fast). Set
// BATCH=<n> to force a fixed finer active-learning cadence for a like-for-like
// sensitivity pass against ASReview's per-record (batch≈1) retraining protocol.
const FIXED_BATCH = process.env.BATCH ? Number(process.env.BATCH) : null;
// Cadence (default = continuous, n_query=1 — the headline protocol, matching
// ASReview). CADENCE=auto = CAL/AutoTAR growing batch; CADENCE=coarse (or BATCH=n)
// = a fixed batch each round, reproducing the pre-upgrade coarse baseline for ablation.
const CADENCE = process.env.CADENCE || (FIXED_BATCH != null ? "fixed" : "continuous");
const batchFor = (n) => CADENCE === "continuous" ? 1
  : (FIXED_BATCH != null ? FIXED_BATCH : (n >= 4000 ? 200 : n >= 1000 ? 100 : 50));

const manifest = JSON.parse(readFileSync(join(__dirname, "data", "corpora", "manifest.json"), "utf8"));
const results = {
  generatedNote: "HEADLESS (no browser/server). Shipped Screen classifier extracted verbatim from screen/index.html and run in a Node vm.",
  extractedFunctions: FUNCS, seeds: SEEDS,
  config: { cadence: CADENCE, tf: sandbox.ML_TF, model: sandbox.ML_MODEL_MODE, fixedBatch: FIXED_BATCH },
  perDataset: {}, aggregate: {},
};
const suiteWss95 = [], cohenWss95 = [], synergyWss95 = [];

// ONLY=id1,id2 restricts the run to a subset of datasets (fast spot-checks).
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const CAD_LABEL = CADENCE === "continuous" ? "continuous(nq=1)" : CADENCE === "auto" ? "autotar" : `${CADENCE}${FIXED_BATCH != null ? "(" + FIXED_BATCH + ")" : ""}`;
console.log(`Headless run — ${SEEDS.length} seed(s): ${SEEDS.join(", ")} | cadence=${CAD_LABEL} tf=${sandbox.ML_TF} model=${sandbox.ML_MODEL_MODE} alpha=${sandbox.ML_NB_ALPHA} ratio=${sandbox.ML_BALANCE_RATIO}`);
for (const d of manifest.datasets) {
  if (ONLY && !ONLY.has(d.id)) continue;
  const gzf = d.id + ".csv.gz";
  if (!existsSync(join(__dirname, "data", "corpora", gzf))) { console.log(`  (skip ${d.id}: not fetched)`); continue; }
  const recs = loadGz(gzf).map((r, i) => ({
    id: "r" + i, title: r.title || "", abstract: r.abstract || "", keywords: [],
    gold: String(r.label_included).trim() === "1" ? 1 : 0,
  }));
  const batch = batchFor(recs.length);
  const runs = [];
  for (const rngSeed of SEEDS) {
    const out = simulateActiveLearning({ records: recs, batch, rngSeed, cadence: CADENCE, buscar: !!process.env.BUSCAR });
    if (out && out.ok) runs.push(out);
  }
  if (!runs.length) { console.log(`  (skip ${d.id}: no usable run)`); continue; }
  const pick = (k) => runs.map((o) => o[k]);
  const recAvg = (k) => round(mean(pick(k)));
  const wss95s = pick("wss95");
  const row = {
    label: d.label, suite: d.suite, topic: d.topic, N: runs[0].N, relevant: runs[0].totalPos,
    prevalence: round(runs[0].prevalence), batch, seeds: SEEDS.length,
    WSS_at_95: round(mean(wss95s)), WSS_at_95_sd: round(sd(wss95s)),
    WSS_at_95_min: round(Math.min(...wss95s)), WSS_at_95_max: round(Math.max(...wss95s)),
    WSS_at_100: round(mean(pick("wss100"))),
    recall_at_10pct: recAvg("recallAt10pct"), recall_at_20pct: recAvg("recallAt20pct"), recall_at_50pct: recAvg("recallAt50pct"),
    screened_to_95pct_recall: Math.round(mean(pick("screenedAt95"))),
  };
  if (process.env.BUSCAR) {
    // buscar stopping rule: where p<0.05 (95% confidence) "≥95% recall reached" fires,
    // and the TRUE recall already attained there — the real cost of a defensible stop.
    row.buscar_stop_at = Math.round(mean(pick("buscarStopAt")));
    row.buscar_recall = round(mean(pick("buscarRecall")));
    row.buscar_wss = round(mean(pick("buscarWss")));
  }
  results.perDataset[d.id] = row;
  suiteWss95.push(row.WSS_at_95);
  if (d.suite === "Cohen 2006") cohenWss95.push(row.WSS_at_95);
  else synergyWss95.push(row.WSS_at_95);
  console.log(`[${d.suite === "Cohen 2006" ? "cohen" : "syn  "}] ${d.label.padEnd(34)} N=${String(row.N).padStart(6)} prev=${(row.prevalence * 100).toFixed(1).padStart(4)}%  WSS@95 ${row.WSS_at_95.toFixed(3)} (±${row.WSS_at_95_sd.toFixed(3)})`);
}

const agg = (arr) => ({ n: arr.length, mean: round(mean(arr)), median: round(median(arr)), min: round(Math.min(...arr)), max: round(Math.max(...arr)), sd: round(sd(arr)) });
results.aggregate = {
  note: "Per-dataset WSS@95 averaged over seeds, then aggregated across datasets. WSS@95 = workload saved at 95% recall vs reading every record; 0 = no better than random screening order.",
  all_datasets: agg(suiteWss95), cohen_15: agg(cohenWss95), synergy: synergyWss95.length ? agg(synergyWss95) : null,
};
if (process.env.BUSCAR) {
  const br = Object.values(results.perDataset).map((r) => r.buscar_recall).filter((x) => x != null);
  const bw = Object.values(results.perDataset).map((r) => r.buscar_wss).filter((x) => x != null);
  results.aggregate.buscar = { mean_recall_at_stop: round(mean(br)), min_recall_at_stop: round(Math.min(...br)), mean_wss_at_stop: round(mean(bw)),
    note: "bias=1 (exact urn, conservative). Recall actually achieved when the rule first certifies ≥95% recall at 95% confidence; mean_wss_at_stop is workload saved at that defensible stop." };
  console.log(`[AGG] BUSCAR    mean recall@stop ${results.aggregate.buscar.mean_recall_at_stop} (min ${results.aggregate.buscar.min_recall_at_stop}), mean WSS@stop ${results.aggregate.buscar.mean_wss_at_stop}`);
}
console.log(`\n[AGG] Cohen-15  WSS@95 mean ${results.aggregate.cohen_15.mean}  median ${results.aggregate.cohen_15.median}  range ${results.aggregate.cohen_15.min}–${results.aggregate.cohen_15.max}  (n=${results.aggregate.cohen_15.n})`);
if (results.aggregate.synergy) console.log(`[AGG] SYNERGY   WSS@95 mean ${results.aggregate.synergy.mean}  median ${results.aggregate.synergy.median}  range ${results.aggregate.synergy.min}–${results.aggregate.synergy.max}  (n=${results.aggregate.synergy.n})`);
console.log(`[AGG] ALL ${suiteWss95.length}   WSS@95 mean ${results.aggregate.all_datasets.mean}  median ${results.aggregate.all_datasets.median}  range ${results.aggregate.all_datasets.min}–${results.aggregate.all_datasets.max}`);

writeFileSync(join(__dirname, process.env.OUT || "results_headless.json"), JSON.stringify(results, null, 2));
console.log(`\nWrote ${join(__dirname, "results_headless.json")}`);
