/* rank-core.js - in-browser active-learning ranker for Screen (no dependencies, no network).
 *
 * Plain script: defines globalThis.ScreenRank. Used verbatim by the app and by the Node benchmark harness.
 *
 *  - tfidf(): scikit-learn TfidfVectorizer semantics (lowercase, token pattern (?u)\b\w\w+\b, word n-grams,
 *    min_df/max_df on document frequency, smooth idf = ln((1+n)/(1+df)) + 1, optional sublinear tf, L2 norm).
 *  - trainSVM(): L2-regularised squared-hinge linear SVM with an unregularised-equivalent bias feature
 *    (liblinear solver 1 / sklearn LinearSVC(loss="squared_hinge", fit_intercept=True, intercept_scaling=1)),
 *    per-sample C_i = C * w_i, solved by dual coordinate descent (Hsieh et al., ICML 2008). The dual objective is
 *    strictly convex, so the solution is unique; warm starts only change speed, not the optimum.
 *  - balancedWeights(): ASReview's Balanced sample weights.
 *  - dense blocks (embeddings) can be appended to the sparse rows with a weight.
 */
(function (root) {
  "use strict";
  var TOKEN_RE = /[\p{L}\p{N}_]{2,}/gu; // python re (?u)\b\w\w+\b on str: \w = Unicode word chars

  function tokenize(text) { return (String(text || "").toLowerCase().match(TOKEN_RE)) || []; }

  function ngrams(tokens, nmin, nmax) {
    var out = [], i, n;
    for (n = nmin; n <= nmax; n++) for (i = 0; i + n <= tokens.length; i++) out.push(n === 1 ? tokens[i] : tokens.slice(i, i + n).join(" "));
    return out;
  }

  // docs: array of strings. opts: {ngram:[1,2], minDf:1, maxDf:0.95, sublinear:true, stopWords:null|Set}
  function tfidf(docs, opts) {
    opts = opts || {};
    var ng = opts.ngram || [1, 1], minDf = opts.minDf == null ? 1 : opts.minDf, maxDf = opts.maxDf == null ? 1.0 : opts.maxDf;
    var stop = opts.stopWords || null, sub = !!opts.sublinear, n = docs.length;
    var counts = new Array(n), df = new Map(), d, t, i;
    for (d = 0; d < n; d++) {
      var toks = tokenize(docs[d]);
      if (stop) toks = toks.filter(function (w) { return !stop.has(w); });
      var c = new Map(), g = ngrams(toks, ng[0], ng[1]);
      for (i = 0; i < g.length; i++) c.set(g[i], (c.get(g[i]) || 0) + 1);
      counts[d] = c;
      c.forEach(function (_, term) { df.set(term, (df.get(term) || 0) + 1); });
    }
    var maxDoc = maxDf <= 1 && !Number.isInteger(maxDf) ? maxDf * n : (maxDf === 1 ? n : maxDf);
    var minDoc = minDf < 1 && !Number.isInteger(minDf) ? minDf * n : minDf;
    var terms = [];
    df.forEach(function (v, term) { if (v >= minDoc && v <= maxDoc) terms.push(term); });
    terms.sort(); // sklearn sorts the vocabulary; column order affects nothing but determinism
    var vocab = new Map(); for (i = 0; i < terms.length; i++) vocab.set(terms[i], i);
    var idf = new Float64Array(terms.length);
    for (i = 0; i < terms.length; i++) idf[i] = Math.log((1 + n) / (1 + df.get(terms[i]))) + 1;
    var rows = new Array(n);
    for (d = 0; d < n; d++) {
      var idx = [], val = [];
      counts[d].forEach(function (cnt, term) {
        var j = vocab.get(term); if (j === undefined) return;
        idx.push(j); val.push((sub ? 1 + Math.log(cnt) : cnt) * idf[j]);
      });
      var nrm = 0; for (i = 0; i < val.length; i++) nrm += val[i] * val[i];
      nrm = Math.sqrt(nrm);
      var o = idx.map(function (j, k) { return [j, nrm > 0 ? val[k] / nrm : 0]; }).sort(function (a, b) { return a[0] - b[0]; });
      rows[d] = { idx: Int32Array.from(o.map(function (p) { return p[0]; })), val: Float64Array.from(o.map(function (p) { return p[1]; })) };
    }
    return { rows: rows, dim: terms.length, vocabSize: terms.length };
  }

  // Append a dense block (e.g. L2-normalised embeddings, Float32Array N*k) scaled by w to sparse rows.
  function appendDense(sparse, dense, k, w) {
    var rows = sparse.rows.map(function (r, d) {
      var idx = new Int32Array(r.idx.length + k), val = new Float64Array(r.val.length + k), j;
      idx.set(r.idx); val.set(r.val);
      var nrm = 0; for (j = 0; j < k; j++) nrm += dense[d * k + j] * dense[d * k + j];
      nrm = Math.sqrt(nrm) || 1;
      for (j = 0; j < k; j++) { idx[r.idx.length + j] = sparse.dim + j; val[r.val.length + j] = w * dense[d * k + j] / nrm; }
      return { idx: idx, val: val };
    });
    return { rows: rows, dim: sparse.dim + k, vocabSize: sparse.vocabSize };
  }

  function balancedWeights(y, ratio) {
    var n1 = 0, n0 = 0, i; for (i = 0; i < y.length; i++) y[i] ? n1++ : n0++;
    var w = new Float64Array(y.length), s = 0;
    for (i = 0; i < y.length; i++) { w[i] = y[i] ? 1 : n1 / (ratio * n0); s += w[i]; }
    for (i = 0; i < y.length; i++) w[i] *= y.length / s;
    return w;
  }

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // X: {rows, dim}; ids: indices of labelled rows; y: 0/1 per labelled row; sw: sample weights.
  // state (optional): {alpha: Map id->alpha} for warm start. Returns {w: Float64Array(dim+1) (last = bias), alpha}.
  function trainSVM(X, ids, y, sw, C, opts) {
    opts = opts || {};
    var tol = opts.tol || 1e-4, maxIter = opts.maxIter || 1000, rng = mulberry32(opts.seed || 1);
    var l = ids.length, dim = X.dim, w = new Float64Array(dim + 1), i, k, s;
    var alpha = new Float64Array(l), QD = new Float64Array(l), Dii = new Float64Array(l), yy = new Int8Array(l);
    var warm = opts.warm || null;
    for (i = 0; i < l; i++) {
      var r = X.rows[ids[i]], q = 1; // bias feature value 1
      for (k = 0; k < r.val.length; k++) q += r.val[k] * r.val[k];
      yy[i] = y[i] ? 1 : -1; Dii[i] = 1 / (2 * C * sw[i]); QD[i] = q + Dii[i];
      alpha[i] = warm && warm.has(ids[i]) ? warm.get(ids[i]) : 0;
      if (alpha[i]) { s = alpha[i] * yy[i]; for (k = 0; k < r.idx.length; k++) w[r.idx[k]] += s * r.val[k]; w[dim] += s; }
    }
    var index = new Int32Array(l); for (i = 0; i < l; i++) index[i] = i;
    var active = l, PGmaxOld = Infinity, PGminOld = -Infinity, iter = 0;
    while (iter < maxIter) {
      var PGmax = -Infinity, PGmin = Infinity;
      for (i = 0; i < active; i++) { var j = i + Math.floor(rng() * (active - i)); var t = index[i]; index[i] = index[j]; index[j] = t; }
      for (s = 0; s < active; s++) {
        i = index[s];
        var row = X.rows[ids[i]], G = w[dim];
        for (k = 0; k < row.idx.length; k++) G += w[row.idx[k]] * row.val[k];
        G = G * yy[i] - 1 + alpha[i] * Dii[i];
        var PG = 0;
        if (alpha[i] === 0) {
          if (G > PGmaxOld) { active--; var tmp = index[s]; index[s] = index[active]; index[active] = tmp; s--; continue; }
          else if (G < 0) PG = G;
        } else PG = G;
        if (PG > PGmax) PGmax = PG; if (PG < PGmin) PGmin = PG;
        if (Math.abs(PG) > 1e-12) {
          var old = alpha[i]; alpha[i] = Math.max(old - G / QD[i], 0);
          var dlt = (alpha[i] - old) * yy[i];
          for (k = 0; k < row.idx.length; k++) w[row.idx[k]] += dlt * row.val[k];
          w[dim] += dlt;
        }
      }
      iter++;
      if (PGmax - PGmin <= tol) {
        if (active === l) break;
        active = l; PGmaxOld = Infinity; PGminOld = -Infinity; continue;
      }
      PGmaxOld = PGmax <= 0 ? Infinity : PGmax; PGminOld = PGmin >= 0 ? -Infinity : PGmin;
    }
    var am = new Map(); for (i = 0; i < l; i++) if (alpha[i] > 0) am.set(ids[i], alpha[i]);
    return { w: w, alpha: am, iter: iter };
  }

  function score(X, model, d) {
    var r = X.rows[d], s = model.w[X.dim], k;
    for (k = 0; k < r.idx.length; k++) s += model.w[r.idx[k]] * r.val[k];
    return s;
  }

  // Full per-record active-learning simulation (Max querier, retrain after every record, stop at last relevant).
  // labels: Int8Array of gold labels (simulation only); prior: start record indices.
  function simulate(X, labels, prior, cfg) {
    var N = labels.length, R = 0, i; for (i = 0; i < N; i++) R += labels[i];
    var order = prior.slice(), inL = new Uint8Array(N), found = 0, warm = null;
    for (i = 0; i < order.length; i++) { inL[order[i]] = 1; found += labels[order[i]]; }
    var every = cfg.retrainEvery || 1, m = null, sinceFit = 0;
    while (found < R) {
      if (!m || sinceFit >= every) { // retrain after every `every` screened records (1 = after each record)
        var y = order.map(function (d) { return labels[d]; });
        m = trainSVM(X, order, y, balancedWeights(y, cfg.ratio), cfg.C, { warm: cfg.warm === false ? null : warm, seed: cfg.seed || 1 });
        warm = m.alpha; sinceFit = 0;
      }
      var best = -1, bs = -Infinity;
      for (i = 0; i < N; i++) if (!inL[i]) { var sc = score(X, m, i); if (sc > bs) { bs = sc; best = i; } }
      order.push(best); inL[best] = 1; found += labels[best]; sinceFit++;
    }
    return order;
  }

  root.ScreenRank = { tokenize: tokenize, tfidf: tfidf, appendDense: appendDense, balancedWeights: balancedWeights,
    trainSVM: trainSVM, score: score, simulate: simulate, mulberry32: mulberry32,
    ELAS_U4: { ngram: [1, 2], minDf: 1, maxDf: 0.95, sublinear: true, C: 0.11, ratio: 9.8 } };
})(typeof globalThis !== "undefined" ? globalThis : this);
