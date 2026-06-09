// OPTIONAL scientific-text-embedding screening layer — honest measurement.
//
// Runs the IDENTICAL active-learning protocol as the shipped free-core harness
// (run_headless.mjs): CAL/AutoTAR growing-batch cadence, seed=10 (forced ≥1/≥1),
// class-weighted logistic regression (lr 0.5, L2 1e-4, 300 epochs, zero-init),
// greedy relevance sampling — the ONLY difference is the feature representation:
// dense sentence embeddings (precomputed by benchmark/_embed/embed_corpora.mjs)
// instead of sparse TF-IDF. So the WSS@95 delta isolates "embeddings vs TF-IDF".
//
// Embeddings are an OPTIONAL layer: the free in-browser core stays TF-IDF; a user
// supplies embeddings via the agent-handoff (export abstracts → embed → import) or
// a bundled small local model. This script quantifies whether that layer helps.
//
// Run:  node benchmark/run_embed_headless.mjs            (3 seeds, all embedded sets)
//       SEEDS=1234567 node benchmark/run_embed_headless.mjs
import { readFileSync, writeFileSync, existsSync } from "fs";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPORA = join(__dirname, "data", "corpora");
const EMB = join(__dirname, "data", "embeddings");

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
const loadGz = (f) => parseCSV(gunzipSync(readFileSync(join(CORPORA, f))).toString("utf8"));
function loadEmb(id) {
  const buf = gunzipSync(readFileSync(join(EMB, `${id}.f32.gz`)));
  const N = buf.readInt32LE(0), D = buf.readInt32LE(4);
  const f = new Float32Array(buf.buffer, buf.byteOffset + 8, N * D);
  const rows = []; for (let i = 0; i < N; i++) rows.push(f.subarray(i * D, i * D + D));
  return { N, D, rows };
}
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sigmoid = (z) => z >= 0 ? 1 / (1 + Math.exp(-z)) : (() => { const e = Math.exp(z); return e / (1 + e); })();

// Dense class-weighted logistic regression — same hyperparameters as the shipped
// sparse mlFit, only the input vectors are dense embeddings.
function fitDense(X, idxs, ys, D) {
  let nPos = 0; for (const i of idxs) if (ys[i] === 1) nPos++;
  const nNeg = idxs.length - nPos;
  const wPos = nPos ? idxs.length / (2 * nPos) : 1, wNeg = nNeg ? idxs.length / (2 * nNeg) : 1;
  const w = new Float64Array(D); let b = 0; const lr = 0.5, l2 = 1e-4, epochs = 300;
  for (let e = 0; e < epochs; e++) {
    for (const i of idxs) {
      const x = X[i], y = ys[i], cw = y === 1 ? wPos : wNeg;
      let dot = b; for (let j = 0; j < D; j++) dot += w[j] * x[j];
      const g = (sigmoid(dot) - y) * cw;
      for (let j = 0; j < D; j++) w[j] -= lr * (g * x[j] + l2 * w[j]);
      b -= lr * g;
    }
  }
  return { w, b };
}
function predDense(x, m, D) { let dot = m.b; for (let j = 0; j < D; j++) dot += m.w[j] * x[j]; return sigmoid(dot); }

function simulate(X, ys, D, rngSeed) {
  const N = X.length, totalPos = ys.reduce((a, y) => a + y, 0);
  if (totalPos < 2) return null;
  const rng = mulberry32(rngSeed || 1234567);
  const idx = X.map((_, i) => i);
  for (let s = idx.length - 1; s > 0; s--) { const j = Math.floor(rng() * (s + 1)); const t = idx[s]; idx[s] = idx[j]; idx[j] = t; }
  const seen = new Uint8Array(N); const labelled = []; let found = 0, screened = 0;
  const reveal = (i) => { if (seen[i]) return; seen[i] = 1; labelled.push(i); screened++; if (ys[i]) found++; };
  let cnt = 0; for (let k = 0; k < idx.length && cnt < 10; k++) { if (!seen[idx[k]]) { reveal(idx[k]); cnt++; } }
  if (!labelled.some((i) => ys[i] === 1)) { for (let k = 0; k < N; k++) if (ys[k]) { reveal(k); break; } }
  if (!labelled.some((i) => ys[i] === 0)) { for (let k = 0; k < N; k++) if (!ys[k]) { reveal(k); break; } }
  const curve = [{ screened, found }];
  let B = 1, guard = 0;
  while (screened < N && found < totalPos && guard++ < N + 10) {
    let nPos = 0; for (const i of labelled) if (ys[i] === 1) nPos++;
    const nNeg = labelled.length - nPos;
    const rest = []; for (let i = 0; i < N; i++) if (!seen[i]) rest.push(i);
    if (nPos >= 1 && nNeg >= 2) {
      const m = fitDense(X, labelled, ys, D);
      const sc = new Float64Array(N); for (const i of rest) sc[i] = predDense(X[i], m, D);
      rest.sort((a, b2) => sc[b2] - sc[a]);
    }
    const take = Math.max(1, Math.round(B));
    for (let i = 0; i < take && i < rest.length; i++) reveal(rest[i]);
    curve.push({ screened, found });
    B += Math.ceil(B / 10);
  }
  const screenedAtRecall = (rec) => { const need = Math.ceil(rec * totalPos); for (const c of curve) if (c.found >= need) return c.screened; return N; };
  const s95 = screenedAtRecall(0.95);
  const recallAt = (frac) => { const lim = Math.ceil(frac * N); let best = 0; for (const c of curve) if (c.screened <= lim) best = c.found; return totalPos ? best / totalPos : 0; };
  return { N, totalPos, prevalence: totalPos / N, wss95: 0.95 - s95 / N, recallAt10pct: recallAt(0.10), recallAt20pct: recallAt(0.20) };
}

const SEEDS = process.env.SEEDS ? process.env.SEEDS.split(",").map(Number) : [1234567, 24681012, 1357911];
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const manifest = JSON.parse(readFileSync(join(CORPORA, "manifest.json"), "utf8"));
const results = { generatedNote: "OPTIONAL embedding layer (dense logreg) — same AutoTAR protocol as the free-core TF-IDF harness.", seeds: SEEDS, model: process.env.EMB_MODEL || "Xenova/all-MiniLM-L6-v2", perDataset: {}, aggregate: {} };
const cohen = [], synergy = [], all = [];
console.log(`Embedding AL run — ${SEEDS.length} seed(s) — features=dense embeddings`);
for (const d of manifest.datasets) {
  if (ONLY && !ONLY.has(d.id)) continue;
  if (!existsSync(join(EMB, `${d.id}.f32.gz`))) { console.log(`  (skip ${d.id}: no embeddings)`); continue; }
  const recs = loadGz(d.id + ".csv.gz");
  const E = loadEmb(d.id);
  if (E.N !== recs.length) { console.log(`  (skip ${d.id}: emb N ${E.N} != recs ${recs.length})`); continue; }
  const ys = recs.map((r) => String(r.label_included).trim() === "1" ? 1 : 0);
  const wss = [];
  for (const s of SEEDS) { const o = simulate(E.rows, ys, E.D, s); if (o) wss.push(o.wss95); }
  if (!wss.length) continue;
  const row = { label: d.label, suite: d.suite, N: E.N, relevant: ys.reduce((a, y) => a + y, 0), prevalence: round(ys.reduce((a, y) => a + y, 0) / E.N), WSS_at_95: round(mean(wss)), WSS_at_95_sd: round(sd(wss)) };
  results.perDataset[d.id] = row; all.push(row.WSS_at_95);
  if (d.suite === "Cohen 2006") cohen.push(row.WSS_at_95); else synergy.push(row.WSS_at_95);
  console.log(`[${d.suite === "Cohen 2006" ? "cohen" : "syn  "}] ${d.label.padEnd(34)} N=${String(E.N).padStart(6)} prev=${(row.prevalence * 100).toFixed(1).padStart(4)}%  WSS@95 ${row.WSS_at_95.toFixed(3)} (±${row.WSS_at_95_sd.toFixed(3)})`);
}
const agg = (a) => ({ n: a.length, mean: round(mean(a)), median: round(median(a)), min: round(Math.min(...a)), max: round(Math.max(...a)), sd: round(sd(a)) });
results.aggregate = { all_datasets: agg(all), cohen_15: agg(cohen), synergy: synergy.length ? agg(synergy) : null };
if (cohen.length) console.log(`\n[AGG] Cohen-15  WSS@95 mean ${results.aggregate.cohen_15.mean}  median ${results.aggregate.cohen_15.median}  (n=${results.aggregate.cohen_15.n})`);
if (synergy.length) console.log(`[AGG] SYNERGY   WSS@95 mean ${results.aggregate.synergy.mean}  (n=${results.aggregate.synergy.n})`);
console.log(`[AGG] ALL ${all.length}   WSS@95 mean ${results.aggregate.all_datasets.mean}`);
writeFileSync(join(__dirname, process.env.OUT || "results_embed_headless.json"), JSON.stringify(results, null, 2));
