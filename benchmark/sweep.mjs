// ---------------------------------------------------------------------------
// Fast OFFLINE kaizen harness for the /screen active-learning ranker.
// It PORTS the exact shipped functions (mlBuildVocab / mlVector / mlFit /
// mlPredict / simulateActiveLearning loop) from screen/index.html, but lifts
// every hardcoded lever (tf, model, alpha, balance ratio, n-gram range, df
// thresholds, vocab size, cadence, query strategy) into a `cfg` object so a
// sweep can measure each marginal change in seconds instead of minutes.
//
// Parity contract: with cfg = SHIPPED, this must reproduce the browser
// benchmark's per-dataset WSS@95 to ~1e-9 (verified in verify_parity()).
//
// Run:  node benchmark/sweep.mjs <command> [args]
// ---------------------------------------------------------------------------
import { readFileSync, existsSync, realpathSync } from "fs";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORP = join(__dirname, "data", "corpora");

// ---------- CSV (verbatim from run_benchmark.mjs) ----------
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
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => { const o = {}; header.forEach((h, i) => (o[h] = r[i] ?? "")); return o; });
}
const loadGz = (f) => parseCSV(gunzipSync(readFileSync(join(CORP, f))).toString("utf8"));
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
const round = (x, d = 4) => { const p = 10 ** d; return Math.round(x * p) / p; };

// ===================== SHIPPED ALGORITHM (parametrised) =====================
// SHIPPED = the current screen/index.html defaults (post-2026-06-09 kaizen). Keep in
// sync with the ML_* vars + simulateActiveLearning defaults there so "baseline" here
// reflects the real shipped ranker. Pre-kaizen baseline was: alpha 3.822, ratio 1.0,
// ngramMax 2, dfMaxFrac 0.6, seedN 10, AutoTAR-growth cadence (all-19 WSS@95 ~0.392).
const SHIPPED = {
  tf: "raw",          // "raw" | "sublinear"
  mode: "nb",         // "nb" | "lr" | "ens"
  alpha: 2.0,         // MultinomialNB Laplace smoothing (ML_NB_ALPHA)
  ratio: 2.0,         // balanced sample-weight ratio (ML_BALANCE_RATIO)
  ngramMax: 1,        // 1 = unigrams (shipped); 2 = + adjacent bigrams (ML_NGRAM_MAX)
  charNgram: 0,       // 0 = off; else char n-gram size (adds to word features)
  dfMin: 2,           // min document frequency
  dfMaxFrac: 0.4,     // max document frequency as fraction of N (ML_DF_MAX_FRAC)
  vocabK: 4000,       // top-K terms by df
  idf: "log",         // "log" (log(N/df)+1) | "smooth" (log((N+1)/(df+1))+1) | "none"
  cadence: "perrecord", // "perrecord" (n_query=1, shipped) | "auto" (AutoTAR grow) | "fixed"
  batch0: 1,
  growth: 10,         // grow batch by ceil(B/growth) each round (auto)
  maxBatch: 0,        // 0 = uncapped; else cap the per-round batch (1 = per-record AL)
  batch: 100,         // fixed-cadence batch
  seedN: 20,          // initial random seed-set size
  query: "certainty", // "certainty" | "uncertainty" | "hybrid"
  epsilon: 0,         // exploration: fraction of each batch drawn at random
  epsilonDecay: 0,    // if >0, epsilon decays linearly to 0 over this fraction of the pool
  hybridSwitch: 0,    // hybrid: # relevant found before switching uncert->certainty (0=off)
};

const STOP = new Set(("a an the of and or to in for on with without via using study trial we our this that these those is are was were be been being as at by from into results methods method background conclusion conclusions objective objectives aim aims patients patient effect effects group groups versus compared comparison between among also can may use used using based both than then there their which while".split(/\s+/)));

function makeEngine(cfg) {
  const ML_TF = cfg.tf, MODE = cfg.mode, ALPHA = cfg.alpha, RATIO = cfg.ratio;
  function unigrams(s) {
    const m = String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [], out = [];
    for (let i = 0; i < m.length; i++) { const w = m[i]; if (w.length >= 3 && w.length <= 30 && !STOP.has(w) && !/^\d+$/.test(w)) out.push(w); }
    return out;
  }
  function tokenize(s) {
    const uni = unigrams(s), out = uni.slice();
    if (cfg.ngramMax >= 2) for (let i = 0; i + 1 < uni.length; i++) out.push(uni[i] + "_" + uni[i + 1]);
    if (cfg.ngramMax >= 3) for (let i = 0; i + 2 < uni.length; i++) out.push(uni[i] + "_" + uni[i + 1] + "_" + uni[i + 2]);
    if (cfg.charNgram >= 2) { // char n-grams over the raw lowercased alnum stream (whole text)
      const raw = String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const cn = cfg.charNgram;
      for (let i = 0; i + cn <= raw.length; i++) { const g = raw.slice(i, i + cn); if (!/^ +$/.test(g)) out.push("#" + g); }
    }
    return out;
  }
  function text(r) { return r.title + " " + r.title + " " + r.abstract + " " + (r.keywords || []).join(" "); }
  function buildVocab(recs) {
    const df = {}, N = recs.length;
    for (let i = 0; i < N; i++) {
      const seen = {}, toks = tokenize(text(recs[i]));
      for (let j = 0; j < toks.length; j++) { if (!seen[toks[j]]) { seen[toks[j]] = 1; df[toks[j]] = (df[toks[j]] || 0) + 1; } }
    }
    let terms = Object.keys(df).filter((w) => df[w] >= cfg.dfMin && df[w] <= Math.max(cfg.dfMin, N * cfg.dfMaxFrac));
    terms.sort((a, b) => (df[b] - df[a]) || (a < b ? -1 : 1));
    terms = terms.slice(0, cfg.vocabK);
    const vocab = {}, idf = new Float64Array(terms.length);
    for (let i = 0; i < terms.length; i++) {
      vocab[terms[i]] = i;
      idf[i] = cfg.idf === "none" ? 1 : cfg.idf === "smooth" ? Math.log((N + 1) / (df[terms[i]] + 1)) + 1 : Math.log(N / df[terms[i]]) + 1;
    }
    return { vocab, idf, terms };
  }
  function vector(r, V) {
    if (r._mlc && r._mlc.V === V) return r._mlc.vec;
    const tf = {}, toks = tokenize(text(r));
    for (let i = 0; i < toks.length; i++) { const idx = V.vocab[toks[i]]; if (idx == null) continue; tf[idx] = (tf[idx] || 0) + 1; }
    const vec = []; let norm = 0; const sublin = (ML_TF !== "raw");
    for (const k in tf) { const tw = sublin ? (1 + Math.log(tf[k])) : tf[k]; const v = tw * V.idf[k]; vec.push([+k, v]); norm += v * v; }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) vec[i][1] /= norm;
    Object.defineProperty(r, "_mlc", { value: { V, vec }, writable: true, configurable: true });
    return vec;
  }
  function sigmoid(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : (() => { const e = Math.exp(z); return e / (1 + e); })(); }
  function sampleWeights(ys, ratio) {
    let P = 0, Ng = 0; for (let i = 0; i < ys.length; i++) { if (ys[i] === 1) P++; else Ng++; }
    const w0 = (ratio > 0 && Ng > 0 && P > 0) ? P / (ratio * Ng) : 1.0;
    const sumRaw = P * 1.0 + Ng * w0, scale = sumRaw > 0 ? ys.length / sumRaw : 1.0;
    const sw = new Float64Array(ys.length);
    for (let i = 0; i < ys.length; i++) sw[i] = (ys[i] === 1 ? 1.0 : w0) * scale;
    return sw;
  }
  function fit(labelled, V) {
    const n = V.terms.length;
    const ys = labelled.map((p) => p[1]);
    const sw = sampleWeights(ys, RATIO);
    const X = labelled.map((p) => vector(p[0], V));
    const model = {};
    if (MODE !== "nb") {
      const w = new Float64Array(n); let b = 0; const lr = 0.5, l2 = 1e-4, epochs = 300;
      for (let e = 0; e < epochs; e++) {
        for (let s = 0; s < X.length; s++) {
          const x = X[s]; let dot = b;
          for (let j = 0; j < x.length; j++) dot += w[x[j][0]] * x[j][1];
          const g = (sigmoid(dot) - ys[s]) * sw[s];
          for (let j = 0; j < x.length; j++) { const ix = x[j][0]; w[ix] -= lr * (g * x[j][1] + l2 * w[ix]); }
          b -= lr * g;
        }
      }
      model.w = w; model.b = b;
    }
    if (MODE !== "lr") {
      const alpha = ALPHA;
      const fc1 = new Float64Array(n), fc0 = new Float64Array(n);
      let t1 = 0, t0 = 0, sw1 = 0, sw0 = 0;
      for (let s = 0; s < X.length; s++) {
        const xx = X[s], wt = sw[s];
        if (ys[s] === 1) { sw1 += wt; for (let j = 0; j < xx.length; j++) { const v1 = xx[j][1] * wt; if (v1 > 0) { fc1[xx[j][0]] += v1; t1 += v1; } } }
        else { sw0 += wt; for (let j = 0; j < xx.length; j++) { const v0 = xx[j][1] * wt; if (v0 > 0) { fc0[xx[j][0]] += v0; t0 += v0; } } }
      }
      const d1 = Math.log(t1 + alpha * n), d0 = Math.log(t0 + alpha * n), dlp = new Float64Array(n);
      for (let j = 0; j < n; j++) dlp[j] = (Math.log(fc1[j] + alpha) - d1) - (Math.log(fc0[j] + alpha) - d0);
      model.nb = { dlp, priorDiff: (sw1 > 0 && sw0 > 0) ? Math.log(sw1 / sw0) : 0 };
    }
    return model;
  }
  // returns probability of relevance (for ranking)
  function predict(r, model, V) {
    const x = vector(r, V); let lrP = null, nbP = null;
    if (MODE !== "nb" && model.w) { let dot = model.b; for (let j = 0; j < x.length; j++) dot += model.w[x[j][0]] * x[j][1]; lrP = sigmoid(dot); }
    if (MODE !== "lr" && model.nb) { let sc = model.nb.priorDiff; for (let j = 0; j < x.length; j++) sc += model.nb.dlp[x[j][0]] * x[j][1]; nbP = sigmoid(sc); }
    if (MODE === "lr") return lrP != null ? lrP : 0.5;
    if (MODE === "nb") return nbP != null ? nbP : 0.5;
    return (lrP != null && nbP != null) ? 0.5 * (lrP + nbP) : (lrP != null ? lrP : (nbP != null ? nbP : 0.5));
  }
  return { buildVocab, fit, predict };
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Active-learning simulation, parametrised by cfg + rngSeed. Mirrors the
// shipped simulateActiveLearning loop exactly when cfg = SHIPPED.
function simulate(recs0, cfg, rngSeed) {
  const eng = makeEngine(cfg);
  // clear any cached vectors (vocab object identity guards correctness, but be safe)
  const recs = recs0.map((r) => ({ title: r.title, abstract: r.abstract, keywords: r.keywords || [], _gold: r.gold ? 1 : 0 }));
  const N = recs.length;
  const totalPos = recs.reduce((a, r) => a + r._gold, 0);
  if (totalPos < 2) return null;
  const V = eng.buildVocab(recs);
  const rng = mulberry32(rngSeed || 1234567);
  const idx = recs.map((_, i) => i);
  for (let s = idx.length - 1; s > 0; s--) { const j = Math.floor(rng() * (s + 1)); const t = idx[s]; idx[s] = idx[j]; idx[j] = t; }
  const labelledSet = {}, labelled = []; let found = 0, screened = 0;
  function reveal(i) { if (labelledSet[i]) return; labelledSet[i] = 1; labelled.push([recs[i], recs[i]._gold]); screened++; if (recs[i]._gold) found++; }
  for (let k = 0; k < idx.length && Object.keys(labelledSet).length < cfg.seedN; k++) reveal(idx[k]);
  if (!labelled.some((p) => p[1] === 1)) { for (let k = 0; k < N; k++) if (recs[k]._gold) { reveal(k); break; } }
  if (!labelled.some((p) => p[1] === 0)) { for (let k = 0; k < N; k++) if (!recs[k]._gold) { reveal(k); break; } }
  const curve = [{ screened, found }];
  let guard = 0;
  // cadence: "perrecord" (n_query=1) | "auto" (AutoTAR grow) | "fixed". Matches the
  // browser simulateActiveLearning exactly. Default (undefined) = auto, as before.
  const auto = (cfg.cadence == null || cfg.cadence === "auto");
  let B = cfg.cadence === "fixed" ? (cfg.batch || 100) : (auto ? cfg.batch0 : 1);
  while (screened < N && found < totalPos && guard++ < N + 10) {
    let nPos = 0; for (let i = 0; i < labelled.length; i++) if (labelled[i][1] === 1) nPos++;
    const nNeg = labelled.length - nPos, rest = [];
    for (let i = 0; i < N; i++) if (!labelledSet[i]) rest.push(i);
    if (nPos >= 1 && nNeg >= 2) {
      const m = eng.fit(labelled, V);
      const sc = {}; for (let i = 0; i < rest.length; i++) sc[rest[i]] = eng.predict(recs[rest[i]], m, V);
      // ---- query strategy ----
      if (cfg.query === "uncertainty" || (cfg.query === "hybrid" && cfg.hybridSwitch && found < cfg.hybridSwitch)) {
        rest.sort((a, b) => Math.abs(sc[a] - 0.5) - Math.abs(sc[b] - 0.5)); // most uncertain first
      } else {
        rest.sort((a, b) => sc[b] - sc[a]); // certainty (default)
      }
    }
    let take = Math.max(1, Math.round(B));
    if (cfg.maxBatch && cfg.maxBatch > 0) take = Math.min(take, cfg.maxBatch);
    // exploration: replace a fraction of the batch with random unlabelled picks.
    // epsilonDecay>0 ⇒ epsilon decays linearly to 0 over that fraction of the pool
    // (explore-then-exploit, Singh 2018), else constant epsilon.
    let eps = cfg.epsilon || 0;
    if (eps > 0 && cfg.epsilonDecay > 0) eps = eps * Math.max(0, 1 - (screened / N) / cfg.epsilonDecay);
    if (eps > 0 && rest.length > take) {
      const nExp = Math.max(0, Math.round(take * eps)), nGreedy = take - nExp;
      for (let i = 0; i < nGreedy && i < rest.length; i++) reveal(rest[i]);
      // random from the remainder
      const remainder = []; for (let i = nGreedy; i < rest.length; i++) remainder.push(rest[i]);
      for (let s = remainder.length - 1; s > 0; s--) { const j = Math.floor(rng() * (s + 1)); const t = remainder[s]; remainder[s] = remainder[j]; remainder[j] = t; }
      for (let i = 0; i < nExp && i < remainder.length; i++) reveal(remainder[i]);
    } else {
      for (let i = 0; i < take && i < rest.length; i++) reveal(rest[i]);
    }
    curve.push({ screened, found });
    if (auto) B += Math.ceil(B / cfg.growth);
  }
  function screenedAtRecall(rec) {
    const need = Math.ceil(rec * totalPos);
    for (let c = 0; c < curve.length; c++) if (curve[c].found >= need) return curve[c].screened;
    return N;
  }
  const s95 = screenedAtRecall(0.95), s100 = screenedAtRecall(1.0);
  function recallAt(frac) {
    const lim = Math.ceil(frac * N); let best = 0;
    for (let c = 0; c < curve.length; c++) if (curve[c].screened <= lim) best = curve[c].found;
    return totalPos ? best / totalPos : 0;
  }
  return {
    N, totalPos, prevalence: totalPos / N,
    wss95: 0.95 - s95 / N, wss100: 1 - s100 / N,
    screenedAt95: s95,
    recallAt10pct: recallAt(0.10), recallAt20pct: recallAt(0.20), recallAt50pct: recallAt(0.50),
  };
}

// ---------- corpus loading ----------
function loadCorpora() {
  const manifest = JSON.parse(readFileSync(join(CORP, "manifest.json"), "utf8"));
  const out = [];
  for (const d of manifest.datasets) {
    const gzf = d.id + ".csv.gz";
    if (!existsSync(join(CORP, gzf))) continue;
    const recs = loadGz(gzf).map((r) => ({ title: r.title || "", abstract: r.abstract || "", keywords: [], gold: String(r.label_included).trim() === "1" ? 1 : 0 }));
    out.push({ id: d.id, label: d.label, suite: d.suite, recs });
  }
  return out;
}

// Run a cfg over all datasets × seeds, return per-dataset mean WSS@95 + aggregates.
function runConfig(corpora, cfg, seeds) {
  const perDataset = {};
  for (const d of corpora) {
    const w95 = [], w100 = [], r10 = [], r20 = [], r50 = [];
    for (const s of seeds) {
      const o = simulate(d.recs, cfg, s);
      if (!o) continue;
      w95.push(o.wss95); w100.push(o.wss100); r10.push(o.recallAt10pct); r20.push(o.recallAt20pct); r50.push(o.recallAt50pct);
    }
    if (!w95.length) continue;
    perDataset[d.id] = { suite: d.suite, label: d.label, wss95: mean(w95), wss95sd: sd(w95), wss100: mean(w100), seeds: w95.slice() };
  }
  const ids = Object.keys(perDataset);
  const allW95 = ids.map((i) => perDataset[i].wss95);
  const cohenW95 = ids.filter((i) => perDataset[i].suite === "Cohen 2006").map((i) => perDataset[i].wss95);
  return {
    perDataset,
    all: { n: allW95.length, mean: mean(allW95), median: median(allW95), sd: sd(allW95), min: Math.min(...allW95), max: Math.max(...allW95) },
    cohen: { n: cohenW95.length, mean: mean(cohenW95), median: median(cohenW95), sd: sd(cohenW95), min: Math.min(...cohenW95), max: Math.max(...cohenW95) },
  };
}

// ===================== commands =====================
const SEEDS_DEFAULT = [1234567, 24681012, 1357911, 99887766, 55512345];

function fmt(agg) { return `mean ${round(agg.mean)} (median ${round(agg.median)}, sd ${round(agg.sd)}, range ${round(agg.min)}–${round(agg.max)}, n=${agg.n})`; }

// Wilcoxon signed-rank (two-sided, exact-ish normal approx with continuity
// correction + tie handling) over paired differences a[i]-b[i]. Returns the
// statistic and a normal-approx p-value. For n=19 the normal approx is adequate
// for a defensible "is allmeta != ASReview" call; we also report the sign count.
function wilcoxonSignedRank(a, b) {
  const diffs = [];
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; if (d !== 0) diffs.push(d); }
  const n = diffs.length;
  if (n === 0) return { n: 0, W: 0, z: 0, p: 1, nPos: 0, nNeg: 0 };
  const absSorted = diffs.map((d, i) => ({ a: Math.abs(d), s: Math.sign(d) })).sort((x, y) => x.a - y.a);
  // average ranks for ties
  const ranks = new Array(n); let i = 0; let tieCorrection = 0;
  while (i < n) {
    let j = i; while (j + 1 < n && absSorted[j + 1].a === absSorted[i].a) j++;
    const avg = (i + j) / 2 + 1; const t = j - i + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    if (t > 1) tieCorrection += t * t * t - t;
    i = j + 1;
  }
  let Wpos = 0, Wneg = 0, nPos = 0, nNeg = 0;
  for (let k = 0; k < n; k++) { if (absSorted[k].s > 0) { Wpos += ranks[k]; nPos++; } else { Wneg += ranks[k]; nNeg++; } }
  const W = Math.min(Wpos, Wneg);
  const mu = n * (n + 1) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1) - tieCorrection / 2) / 24);
  const z = sigma > 0 ? (W - mu + 0.5 * Math.sign(mu - W)) / sigma : 0;
  // two-sided normal p
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { n, W, Wpos, Wneg, z, p: Math.min(1, p), nPos, nNeg };
}
function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }

// Main-guard: only run the CLI dispatch when sweep.mjs is the entry module.
// When imported (e.g. by levers.mjs), cmd stays null so none of the command
// blocks fire — importing this file must have no side effects.
let _isMain = false;
try { _isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { _isMain = false; }
const cmd = _isMain ? (process.argv[2] || "baseline") : null;

if (cmd === "baseline") {
  const seeds = process.argv[3] ? process.argv[3].split(",").map(Number) : SEEDS_DEFAULT;
  const corpora = loadCorpora();
  console.log(`Loaded ${corpora.length} datasets, ${seeds.length} seeds.`);
  const t0 = process.hrtime.bigint();
  const res = runConfig(corpora, SHIPPED, seeds);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\nSHIPPED config: ${JSON.stringify(SHIPPED)}`);
  for (const id of Object.keys(res.perDataset)) {
    const p = res.perDataset[id];
    console.log(`  ${id.padEnd(34)} WSS@95 ${round(p.wss95).toFixed(4)} (±${round(p.wss95sd).toFixed(3)})  [${p.suite}]`);
  }
  console.log(`\nCohen-15: ${fmt(res.cohen)}`);
  console.log(`All-${res.all.n}:  ${fmt(res.all)}`);
  console.log(`(${Math.round(ms)} ms)`);
}

// ---- grid sweep: try named config variants, rank by Cohen-15 & all-19 ----
if (cmd === "grid") {
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(",").map(Number) : SEEDS_DEFAULT;
  const gridFile = process.argv[3];
  const variants = JSON.parse(readFileSync(gridFile, "utf8")); // [{name, cfg:{...overrides}}]
  const corpora = loadCorpora();
  const base = runConfig(corpora, SHIPPED, seeds);
  console.log(`Grid over ${corpora.length} datasets × ${seeds.length} seeds. Baseline (SHIPPED): Cohen-15 ${round(base.cohen.mean)}, all-19 ${round(base.all.mean)}`);
  const rows = [{ name: "SHIPPED(baseline)", cohen: base.cohen.mean, all: base.all.mean, cohenSd: base.cohen.sd, allSd: base.all.sd, res: base }];
  for (const v of variants) {
    const cfg = Object.assign({}, SHIPPED, v.cfg);
    const t0 = process.hrtime.bigint();
    const res = runConfig(corpora, cfg, seeds);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    rows.push({ name: v.name, cohen: res.cohen.mean, all: res.all.mean, cohenSd: res.cohen.sd, allSd: res.all.sd, res });
    console.log(`  ${v.name.padEnd(40)} Cohen-15 ${round(res.cohen.mean).toFixed(4)} (Δ${(res.cohen.mean - base.cohen.mean >= 0 ? "+" : "")}${round(res.cohen.mean - base.cohen.mean).toFixed(4)})  all-19 ${round(res.all.mean).toFixed(4)} (Δ${(res.all.mean - base.all.mean >= 0 ? "+" : "")}${round(res.all.mean - base.all.mean).toFixed(4)})  [${Math.round(ms)}ms]`);
  }
  console.log("\n=== ranked by all-19 ===");
  rows.slice().sort((a, b) => b.all - a.all).forEach((r) => console.log(`  ${r.name.padEnd(40)} all-19 ${round(r.all).toFixed(4)}  Cohen-15 ${round(r.cohen).toFixed(4)}`));
  if (process.env.OUT) {
    const fs = require("fs");
  }
}

// ---- paired comparison vs ASReview ground truth ----
if (cmd === "paired") {
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(",").map(Number) : SEEDS_DEFAULT;
  const cfgFile = process.argv[3];
  const cfg = cfgFile ? Object.assign({}, SHIPPED, JSON.parse(readFileSync(cfgFile, "utf8"))) : SHIPPED;
  const corpora = loadCorpora();
  const asr = JSON.parse(readFileSync(join(__dirname, "results_asreview_groundtruth.json"), "utf8")).perDataset;
  const res = runConfig(corpora, cfg, seeds);
  const ids = Object.keys(res.perDataset).filter((id) => asr[id] && asr[id].nb_wss95 != null);
  const alm = ids.map((id) => res.perDataset[id].wss95);
  const asv = ids.map((id) => asr[id].nb_wss95);
  console.log(`\nConfig: ${JSON.stringify(cfg)}`);
  console.log(`Seeds: ${seeds.join(",")} (${seeds.length})\n`);
  console.log("dataset".padEnd(34), "allmeta", "ASReview", "  Δ(alm-asr)");
  let win = 0, loss = 0;
  for (let i = 0; i < ids.length; i++) {
    const d = alm[i] - asv[i]; if (d > 0) win++; else if (d < 0) loss++;
    console.log(ids[i].padEnd(34), round(alm[i]).toFixed(4).padStart(7), round(asv[i]).toFixed(4).padStart(8), "  " + (d >= 0 ? "+" : "") + round(d).toFixed(4));
  }
  const cohenIds = ids.filter((id) => res.perDataset[id].suite === "Cohen 2006");
  const cohenAlm = mean(cohenIds.map((id) => res.perDataset[id].wss95));
  const cohenAsr = mean(cohenIds.map((id) => asr[id].nb_wss95));
  const w = wilcoxonSignedRank(alm, asv);
  console.log("\n--- aggregates ---");
  console.log(`allmeta  Cohen-15 ${round(cohenAlm).toFixed(4)}  all-19 ${round(mean(alm)).toFixed(4)} (sd over datasets ${round(sd(alm)).toFixed(3)})`);
  console.log(`ASReview Cohen-15 ${round(cohenAsr).toFixed(4)}  all-19 ${round(mean(asv)).toFixed(4)} (sd over datasets ${round(sd(asv)).toFixed(3)})`);
  console.log(`allmeta wins on ${win}/${ids.length} datasets, loses on ${loss}`);
  console.log(`Wilcoxon signed-rank (paired, n=${w.n} non-tied): W=${w.W}, z=${round(w.z,3)}, p=${round(w.p,4)} (W+=${w.Wpos}, W-=${w.Wneg})`);
  console.log(`Mean paired Δ (allmeta - ASReview) = ${round(mean(alm.map((a,i)=>a-asv[i])),4)}`);
}

// ---- paired test directly from a browser results_*.json (authoritative: driving
// the shipped code) vs ASReview ground truth. Usage: node sweep.mjs pairedjson <file>
if (cmd === "pairedjson") {
  const f = process.argv[3];
  const j = JSON.parse(readFileSync(join(__dirname, f), "utf8"));
  const suite = j.classifierSuite || {};
  const asr = JSON.parse(readFileSync(join(__dirname, "results_asreview_groundtruth.json"), "utf8")).perDataset;
  const ids = Object.keys(suite).filter((id) => asr[id] && asr[id].nb_wss95 != null);
  const alm = ids.map((id) => suite[id].WSS_at_95);
  const asv = ids.map((id) => asr[id].nb_wss95);
  console.log(`Source: ${f} (browser, drives shipped code). Seeds: ${(j.classifierAggregate||{}).seeds || "?"}\n`);
  console.log("dataset".padEnd(34), "allmeta", "ASReview", "  Δ");
  let win = 0, loss = 0;
  for (let i = 0; i < ids.length; i++) {
    const d = alm[i] - asv[i]; if (d > 0) win++; else if (d < 0) loss++;
    console.log(ids[i].padEnd(34), round(alm[i]).toFixed(4).padStart(7), round(asv[i]).toFixed(4).padStart(8), "  " + (d >= 0 ? "+" : "") + round(d).toFixed(4));
  }
  const cohenIds = ids.filter((id) => suite[id].suite === "Cohen 2006");
  const cohenAlm = mean(cohenIds.map((id) => suite[id].WSS_at_95));
  const cohenAsr = mean(cohenIds.map((id) => asr[id].nb_wss95));
  const w = wilcoxonSignedRank(alm, asv);
  console.log("\n--- aggregates ---");
  console.log(`allmeta  Cohen-15 ${round(cohenAlm).toFixed(4)}  all-19 ${round(mean(alm)).toFixed(4)} (sd over datasets ${round(sd(alm)).toFixed(3)})`);
  console.log(`ASReview Cohen-15 ${round(cohenAsr).toFixed(4)}  all-19 ${round(mean(asv)).toFixed(4)}`);
  console.log(`allmeta wins on ${win}/${ids.length} datasets, loses on ${loss}`);
  console.log(`Wilcoxon signed-rank (paired, n=${w.n}): W=${w.W}, z=${round(w.z,3)}, p=${round(w.p,4)} (W+=${w.Wpos}, W-=${w.Wneg})`);
  console.log(`Mean paired Δ (allmeta - ASReview) = ${round(mean(alm.map((a,i)=>a-asv[i])),4)}`);
}

export { makeEngine, simulate, loadCorpora, runConfig, SHIPPED, SEEDS_DEFAULT, mean, sd, median, round, fmt, wilcoxonSignedRank };
