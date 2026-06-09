// ---------------------------------------------------------------------------
// LEVER ABLATION harness for the /screen ranker (2026-06-09 pass 2).
//
// Mirrors benchmark/sweep.mjs's feature pipeline + active-learning simulate loop
// EXACTLY for the shipped modes (verified by `node benchmark/levers.mjs parity`),
// but adds new base learners / query refinements requested for this pass:
//
//   mode "svm"     linear SVM (hinge / squared-hinge), balanced weights, C/lambda.
//                  (ASReview ELAS u4 default is squared_hinge C=0.11 ratio=9.8.)
//   mode "cnb"     ComplementNB (sklearn semantics) — built for imbalanced text.
//   mode "nbsvm"   probability blend of NB and a sigmoid-squashed SVM margin.
//   mode "rocchio" Rocchio relevance-feedback centroid, cosine ranking.
//   cfg.chi2K      chi-squared feature selection on the current labelled set.
//   cfg.syntheticNeg  AutoTAR-faithful: random unlabelled drawn as pseudo-negatives.
//
// All new knobs default OFF so SHIPPED behaviour is byte-identical to sweep.mjs.
// This file NEVER edits the shipped screen/index.html — it only measures.
// ---------------------------------------------------------------------------
import { readFileSync, existsSync } from "fs";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  loadCorpora, runConfig as sweepRunConfig, simulate as sweepSimulate,
  SHIPPED, wilcoxonSignedRank, mean, sd, median, round, fmt,
} from "./sweep.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// STOP list — copied verbatim from sweep.mjs / screen/index.html ML_STOP.
const STOP = new Set(("a an the of and or to in for on with without via using study trial we our this that these those is are was were be been being as at by from into results methods method background conclusion conclusions objective objectives aim aims patients patient effect effects group groups versus compared comparison between among also can may use used using based both than then there their which while".split(/\s+/)));

// ===================== engine (sweep.mjs + new modes) =====================
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

  // chi-squared feature selection on the labelled set: keep top-K features by
  // chi2(feature present? , class). Returns a Set of kept feature indices (or null).
  function chi2Mask(labelled, V) {
    const K = cfg.chi2K | 0; if (!K || K >= V.terms.length) return null;
    const n = V.terms.length;
    // presence counts per class (binarised on tf>0)
    const a = new Float64Array(n), b = new Float64Array(n); // a=present&pos, b=present&neg
    let nPos = 0, nNeg = 0;
    for (let s = 0; s < labelled.length; s++) {
      const y = labelled[s][1], x = vector(labelled[s][0], V);
      if (y === 1) nPos++; else nNeg++;
      for (let j = 0; j < x.length; j++) { if (x[j][1] > 0) { if (y === 1) a[x[j][0]]++; else b[x[j][0]]++; } }
    }
    const Ntot = nPos + nNeg;
    const chi = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const A = a[j], B = b[j], C = nPos - A, D = nNeg - B;
      const denom = (A + B) * (C + D) * (A + C) * (B + D);
      chi[j] = denom > 0 ? (Ntot * Math.pow(A * D - B * C, 2)) / denom : 0;
    }
    const order = Array.from({ length: n }, (_, j) => j).sort((x, y) => chi[y] - chi[x]);
    const keep = new Set(); for (let i = 0; i < K && i < order.length; i++) keep.add(order[i]);
    return keep;
  }

  function fit(labelled, V) {
    const n = V.terms.length;
    let ys = labelled.map((p) => p[1]);
    const mask = chi2Mask(labelled, V);
    // AutoTAR-faithful synthetic negatives: add random unlabelled docs as pseudo-neg.
    let train = labelled;
    if (cfg.syntheticNeg && cfg._pool && cfg._rng) {
      const extra = [];
      const want = Math.min(cfg.syntheticNeg, cfg._pool.length);
      for (let i = 0; i < want; i++) { const k = Math.floor(cfg._rng() * cfg._pool.length); extra.push([cfg._pool[k], 0]); }
      train = labelled.concat(extra);
      ys = train.map((p) => p[1]);
    }
    const sw = sampleWeights(ys, RATIO);
    const X = train.map((p) => vector(p[0], V));
    const model = { mask };

    if (MODE === "lr" || MODE === "nbsvm" && false) { /* lr handled below */ }

    if (MODE === "lr") {
      const w = new Float64Array(n); let bb = 0; const lr = 0.5, l2 = 1e-4, epochs = 300;
      for (let e = 0; e < epochs; e++) for (let s = 0; s < X.length; s++) {
        const x = X[s]; let dot = bb;
        for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; dot += w[ix] * x[j][1]; }
        const g = (sigmoid(dot) - ys[s]) * sw[s];
        for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; w[ix] -= lr * (g * x[j][1] + l2 * w[ix]); }
        bb -= lr * g;
      }
      model.w = w; model.b = bb;
    }

    if (MODE === "svm" || MODE === "nbsvm") {
      // Linear SVM via SGD (Pegasos-ish). loss: hinge | squared_hinge. y in {-1,+1}.
      // lambda ~ 1/(C*n); C from cfg.C (default 1). balanced sw applied to hinge term.
      const w = new Float64Array(n); let bb = 0;
      const C = cfg.C != null ? cfg.C : 1.0;
      const lambda = cfg.svmLambda != null ? cfg.svmLambda : 1 / Math.max(1, C * X.length);
      const epochs = cfg.svmEpochs || 25;
      const sq = (cfg.svmLoss || "squared_hinge") === "squared_hinge";
      let t = 1;
      for (let e = 0; e < epochs; e++) {
        for (let s = 0; s < X.length; s++) {
          const x = X[s], yy = ys[s] === 1 ? 1 : -1, eta = 1 / (lambda * t); t++;
          let dot = bb; for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; dot += w[ix] * x[j][1]; }
          // regularise
          const shrink = 1 - eta * lambda;
          for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; w[ix] *= shrink; }
          const margin = yy * dot;
          if (sq ? (margin < 1) : (margin < 1)) {
            const grad = sq ? 2 * (margin - 1) : -1; // d/d(margin) of loss, sign folded below
            const coef = eta * C * sw[s] * (sq ? -grad : 1) * yy; // squared: -2(margin-1); hinge: 1
            for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; w[ix] += coef * x[j][1]; }
            bb += coef;
          }
        }
      }
      model.svmW = w; model.svmB = bb;
    }

    if (MODE === "nb" || MODE === "nbsvm") {
      const alpha = ALPHA;
      const fc1 = new Float64Array(n), fc0 = new Float64Array(n);
      let t1 = 0, t0 = 0, sw1 = 0, sw0 = 0;
      for (let s = 0; s < X.length; s++) {
        const xx = X[s], wt = sw[s];
        if (ys[s] === 1) { sw1 += wt; for (let j = 0; j < xx.length; j++) { const ix = xx[j][0]; if (mask && !mask.has(ix)) continue; const v1 = xx[j][1] * wt; if (v1 > 0) { fc1[ix] += v1; t1 += v1; } } }
        else { sw0 += wt; for (let j = 0; j < xx.length; j++) { const ix = xx[j][0]; if (mask && !mask.has(ix)) continue; const v0 = xx[j][1] * wt; if (v0 > 0) { fc0[ix] += v0; t0 += v0; } } }
      }
      const d1 = Math.log(t1 + alpha * n), d0 = Math.log(t0 + alpha * n), dlp = new Float64Array(n);
      for (let j = 0; j < n; j++) dlp[j] = (Math.log(fc1[j] + alpha) - d1) - (Math.log(fc0[j] + alpha) - d0);
      model.nb = { dlp, priorDiff: (sw1 > 0 && sw0 > 0) ? Math.log(sw1 / sw0) : 0 };
    }

    if (MODE === "cnb") {
      // ComplementNB (Rennie 2003): for class c, weight uses the COMPLEMENT of c.
      // For binary, w_rel uses negatives' stats, w_irr uses positives'. Decision
      // assigns to the class with SMALLEST complement match; rank score = w_irr·x - w_rel·x.
      const alpha = ALPHA;
      const comp1 = new Float64Array(n), comp0 = new Float64Array(n); // comp1 = sum over NEG docs (complement of rel)
      let tc1 = 0, tc0 = 0;
      for (let s = 0; s < X.length; s++) {
        const xx = X[s], wt = sw[s];
        if (ys[s] === 1) { for (let j = 0; j < xx.length; j++) { const ix = xx[j][0]; if (mask && !mask.has(ix)) continue; const v = xx[j][1] * wt; if (v > 0) { comp0[ix] += v; tc0 += v; } } } // pos doc → complement of IRR
        else { for (let j = 0; j < xx.length; j++) { const ix = xx[j][0]; if (mask && !mask.has(ix)) continue; const v = xx[j][1] * wt; if (v > 0) { comp1[ix] += v; tc1 += v; } } } // neg doc → complement of REL
      }
      const wRel = new Float64Array(n), wIrr = new Float64Array(n);
      // log weights, then L1-normalised (sklearn 'weight normalization', WCNB-ish)
      let s1 = 0, s0 = 0;
      for (let j = 0; j < n; j++) { wRel[j] = Math.log((comp1[j] + alpha) / (tc1 + alpha * n)); wIrr[j] = Math.log((comp0[j] + alpha) / (tc0 + alpha * n)); s1 += Math.abs(wRel[j]); s0 += Math.abs(wIrr[j]); }
      if (s1 > 0) for (let j = 0; j < n; j++) wRel[j] /= s1;
      if (s0 > 0) for (let j = 0; j < n; j++) wIrr[j] /= s0;
      model.cnb = { wRel, wIrr };
    }

    if (MODE === "rocchio") {
      // Rocchio relevance feedback: q = beta·centroid(rel) - gamma·centroid(nonrel).
      const beta = cfg.rocchioBeta != null ? cfg.rocchioBeta : 1.0;
      const gamma = cfg.rocchioGamma != null ? cfg.rocchioGamma : 0.25;
      const cen1 = new Float64Array(n), cen0 = new Float64Array(n); let np = 0, nn = 0;
      for (let s = 0; s < X.length; s++) {
        const xx = X[s];
        if (ys[s] === 1) { np++; for (let j = 0; j < xx.length; j++) { const ix = xx[j][0]; if (mask && !mask.has(ix)) continue; cen1[ix] += xx[j][1]; } }
        else { nn++; for (let j = 0; j < xx.length; j++) { const ix = xx[j][0]; if (mask && !mask.has(ix)) continue; cen0[ix] += xx[j][1]; } }
      }
      const q = new Float64Array(n);
      for (let j = 0; j < n; j++) q[j] = beta * (np ? cen1[j] / np : 0) - gamma * (nn ? cen0[j] / nn : 0);
      model.rocchio = { q };
    }
    return model;
  }

  function predict(r, model, V) {
    const x = vector(r, V), mask = model.mask;
    const dotMasked = (vecField) => { let s = 0; for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; s += vecField[ix] * x[j][1]; } return s; };
    if (MODE === "lr") { let dot = model.b; for (let j = 0; j < x.length; j++) { const ix = x[j][0]; if (mask && !mask.has(ix)) continue; dot += model.w[ix] * x[j][1]; } return sigmoid(dot); }
    if (MODE === "svm") { return model.svmB + dotMasked(model.svmW); } // margin; monotonic ranking
    if (MODE === "cnb") { return dotMasked(model.cnb.wIrr) - dotMasked(model.cnb.wRel); } // higher = more relevant
    if (MODE === "rocchio") { return dotMasked(model.rocchio.q); }
    if (MODE === "nb") { let sc = model.nb.priorDiff; sc += dotMasked(model.nb.dlp); return sigmoid(sc); }
    if (MODE === "nbsvm") {
      let sc = model.nb.priorDiff + dotMasked(model.nb.dlp); const nbP = sigmoid(sc);
      const margin = model.svmB + dotMasked(model.svmW); const svmP = sigmoid(margin);
      const wt = cfg.blendW != null ? cfg.blendW : 0.5; // weight on NB
      return wt * nbP + (1 - wt) * svmP;
    }
    return 0.5;
  }
  return { buildVocab, fit, predict };
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// simulate() — copied from sweep.mjs (same seed-set, forcing, WSS@95). Engine swapped.
function simulate(recs0, cfg, rngSeed) {
  const eng = makeEngine(cfg);
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
  const auto = (cfg.cadence == null || cfg.cadence === "auto");
  let B = cfg.cadence === "fixed" ? (cfg.batch || 100) : (auto ? cfg.batch0 : 1);
  // expose pool + rng for synthetic-negative sampling
  cfg._rng = rng;
  while (screened < N && found < totalPos && guard++ < N + 10) {
    let nPos = 0; for (let i = 0; i < labelled.length; i++) if (labelled[i][1] === 1) nPos++;
    const nNeg = labelled.length - nPos, rest = [];
    for (let i = 0; i < N; i++) if (!labelledSet[i]) rest.push(i);
    if (nPos >= 1 && nNeg >= 2) {
      if (cfg.syntheticNeg) cfg._pool = rest.map((i) => recs[i]);
      const m = eng.fit(labelled, V);
      const sc = {}; for (let i = 0; i < rest.length; i++) sc[rest[i]] = eng.predict(recs[rest[i]], m, V);
      if (cfg.query === "uncertainty" || (cfg.query === "hybrid" && cfg.hybridSwitch && found < cfg.hybridSwitch)) {
        rest.sort((a, b) => Math.abs(sc[a] - 0.5) - Math.abs(sc[b] - 0.5));
      } else {
        rest.sort((a, b) => sc[b] - sc[a]);
      }
    }
    let take = Math.max(1, Math.round(B));
    if (cfg.maxBatch && cfg.maxBatch > 0) take = Math.min(take, cfg.maxBatch);
    for (let i = 0; i < take && i < rest.length; i++) reveal(rest[i]);
    curve.push({ screened, found });
    if (auto) B += Math.ceil(B / cfg.growth);
  }
  function screenedAtRecall(rec) {
    const need = Math.ceil(rec * totalPos);
    for (let c = 0; c < curve.length; c++) if (curve[c].found >= need) return curve[c].screened;
    return N;
  }
  const s95 = screenedAtRecall(0.95), s100 = screenedAtRecall(1.0);
  return { N, totalPos, prevalence: totalPos / N, wss95: 0.95 - s95 / N, wss100: 1 - s100 / N, screenedAt95: s95 };
}

function runConfig(corpora, cfg, seeds) {
  const perDataset = {};
  for (const d of corpora) {
    const w95 = [];
    for (const s of seeds) { const o = simulate(d.recs, cfg, s); if (o) w95.push(o.wss95); }
    if (!w95.length) continue;
    perDataset[d.id] = { suite: d.suite, label: d.label, wss95: mean(w95), wss95sd: sd(w95), seeds: w95.slice() };
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
const SEL_SEEDS = [1234567, 24681012, 1357911];                 // selection (≤3, disjoint from validation)
const VAL_SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010]; // validation (10 fresh, disjoint)

function pairedReport(res, label) {
  const asr = JSON.parse(readFileSync(join(__dirname, "results_asreview_groundtruth.json"), "utf8")).perDataset;
  const ids = Object.keys(res.perDataset).filter((id) => asr[id] && asr[id].nb_wss95 != null);
  const alm = ids.map((id) => res.perDataset[id].wss95);
  const asv = ids.map((id) => asr[id].nb_wss95);
  let win = 0, loss = 0; for (let i = 0; i < ids.length; i++) { const d = alm[i] - asv[i]; if (d > 0) win++; else if (d < 0) loss++; }
  const cohenIds = ids.filter((id) => res.perDataset[id].suite === "Cohen 2006");
  const cohenAlm = mean(cohenIds.map((id) => res.perDataset[id].wss95));
  const w = wilcoxonSignedRank(alm, asv);
  console.log(`\n[${label}]  allmeta Cohen-15 ${round(cohenAlm).toFixed(4)}  all-19 ${round(mean(alm)).toFixed(4)}  vs ASReview all-19 ${round(mean(asv)).toFixed(4)}`);
  console.log(`         wins ${win}/${ids.length}, mean Δ ${round(mean(alm.map((a, i) => a - asv[i])), 4)}, Wilcoxon p=${round(w.p, 4)} (z=${round(w.z, 3)})`);
  return { cohen: round(cohenAlm, 4), all: round(mean(alm), 4), win, n: ids.length, p: round(w.p, 4), meanD: round(mean(alm.map((a, i) => a - asv[i])), 4) };
}

// Main-guard: only dispatch a command when levers.mjs is the entry module, so
// importing it (e.g. from a parity check) has no side effects.
import { realpathSync } from "fs";
let _isMain = false;
try { _isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { _isMain = false; }
const cmd = _isMain ? (process.argv[2] || "parity") : null;

if (cmd === "parity") {
  // Verify levers.mjs reproduces sweep.mjs for the shipped modes on a few datasets.
  const corpora = loadCorpora();
  const seeds = SEL_SEEDS;
  let maxDiff = 0, checks = 0;
  for (const d of corpora) for (const s of seeds) {
    const a = simulate(d.recs, SHIPPED, s), b = sweepSimulate(d.recs, SHIPPED, s);
    if (a && b) { maxDiff = Math.max(maxDiff, Math.abs(a.wss95 - b.wss95)); checks++; }
  }
  console.log(`Parity check (SHIPPED, ${checks} dataset×seed): max |Δwss95| = ${maxDiff.toExponential(3)} ${maxDiff < 1e-9 ? "OK" : "*** MISMATCH ***"}`);
  // also LR parity (sweep supports lr)
  let lrDiff = 0; const lrCfg = Object.assign({}, SHIPPED, { mode: "lr" });
  for (const d of corpora.slice(0, 5)) for (const s of seeds) { const a = simulate(d.recs, lrCfg, s), b = sweepSimulate(d.recs, lrCfg, s); if (a && b) lrDiff = Math.max(lrDiff, Math.abs(a.wss95 - b.wss95)); }
  console.log(`Parity check (LR, 5 datasets): max |Δwss95| = ${lrDiff.toExponential(3)} ${lrDiff < 1e-9 ? "OK" : "*** MISMATCH ***"}`);
}

if (cmd === "grid") {
  const gridFile = process.argv[3];
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(",").map(Number) : SEL_SEEDS;
  const variants = JSON.parse(readFileSync(gridFile, "utf8"));
  const corpora = loadCorpora();
  const base = runConfig(corpora, SHIPPED, seeds);
  const baseRep = pairedReport(base, "SHIPPED");
  console.log(`\nGrid over ${corpora.length} datasets × ${seeds.length} seeds (selection). SHIPPED: Cohen-15 ${round(base.cohen.mean)}, all-19 ${round(base.all.mean)}\n`);
  const rows = [{ name: "SHIPPED", ...baseRep }];
  for (const v of variants) {
    const cfg = Object.assign({}, SHIPPED, v.cfg);
    const t0 = process.hrtime.bigint();
    const res = runConfig(corpora, cfg, seeds);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const rep = pairedReport(res, v.name);
    console.log(`         [${Math.round(ms)}ms]  Δall vs SHIPPED ${(res.all.mean - base.all.mean >= 0 ? "+" : "")}${round(res.all.mean - base.all.mean, 4)}`);
    rows.push({ name: v.name, ...rep });
  }
  console.log("\n=== ranked by all-19 ===");
  rows.slice().sort((a, b) => b.all - a.all).forEach((r) => console.log(`  ${r.name.padEnd(32)} all-19 ${r.all.toFixed(4)}  Cohen-15 ${r.cohen.toFixed(4)}  wins ${r.win}/${r.n}  p=${r.p}`));
}

if (cmd === "validate") {
  // Full validation of a single config on the 10 fresh seeds, paired vs ASReview.
  const cfgFile = process.argv[3];
  const cfg = cfgFile ? Object.assign({}, SHIPPED, JSON.parse(readFileSync(cfgFile, "utf8"))) : SHIPPED;
  const corpora = loadCorpora();
  console.log(`VALIDATE config: ${JSON.stringify(cfg)}`);
  console.log(`Validation seeds (10 fresh, disjoint from selection): ${VAL_SEEDS.join(",")}`);
  const res = runConfig(corpora, cfg, VAL_SEEDS);
  pairedReport(res, "VALIDATION (10 seeds)");
}

export { makeEngine, simulate, runConfig, SEL_SEEDS, VAL_SEEDS, pairedReport };
