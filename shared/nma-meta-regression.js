/* shared/nma-meta-regression.js -- network meta-regression.
 * netmeta 3.7-0 netmetareg(consistency=TRUE, assumption="independent"):
 * REML (default), ML, or FE. Paule-Mandel is removed: it is not a
 * netmetareg estimator.
 *
 * yi = beta[B] - beta[A] + (x-xMean) * (gamma[B] - gamma[A]).
 * Keep only study-baseline contrasts (reference if present, otherwise
 * last label in code-unit order after replacing spaces with underscores).
 * Orient retained contrasts away from that baseline, as netmetareg does.
 * Sampling V is diagonal; random effects have variance tau2 and within-
 * study correlation 0.5 in this baseline orientation.
 *
 * loglik = -0.5 * (log|Sigma| + residual' Sigma^-1 residual), with
 * -0.5 * log|X' Sigma^-1 X| added for REML. Constants independent of
 * tau2, including normal-density constants and REML's log|X'X|, are
 * omitted. FE reports the ordinary log-likelihood at tau2 = 0.
 * Coefficients and cov use the original centred design, not a scaled one.
 */
(function (global) {
  "use strict";

  function zeros(n, m) {
    var a = [], i, j;
    for (i = 0; i < n; i++) {
      a[i] = [];
      for (j = 0; j < m; j++) a[i][j] = 0;
    }
    return a;
  }
  function unit(n) {
    var a = zeros(n, n);
    for (var i = 0; i < n; i++) a[i][i] = 1;
    return a;
  }
  function finite(x) { return typeof x === "number" && isFinite(x); }
  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function multiply(a, b) {
    var c = zeros(a.length, b[0].length), i, j, k;
    for (i = 0; i < a.length; i++)
      for (k = 0; k < b.length; k++)
        for (j = 0; j < b[0].length; j++) c[i][j] += a[i][k] * b[k][j];
    return c;
  }
  function cross(a, b) {
    var c = zeros(a[0].length, b[0].length), i, j, k;
    for (i = 0; i < a.length; i++)
      for (j = 0; j < a[0].length; j++)
        for (k = 0; k < b[0].length; k++) c[j][k] += a[i][j] * b[i][k];
    return c;
  }
  function traceProduct(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++)
      for (var j = 0; j < a.length; j++) s += a[i][j] * b[j][i];
    return s;
  }
  function cholesky(a) {
    var l = zeros(a.length, a.length), logdet = 0, i, j, k, s;
    for (i = 0; i < a.length; i++) {
      for (j = 0; j <= i; j++) {
        s = a[i][j];
        for (k = 0; k < j; k++) s -= l[i][k] * l[j][k];
        if (i === j) {
          if (!(s > 0) || !finite(s)) throw new Error("numerically unstable GLS covariance");
          l[i][j] = Math.sqrt(s);
          logdet += Math.log(s);
        } else l[i][j] = s / l[j][j];
      }
    }
    return { l: l, logdet: logdet };
  }
  function solve(chol, b) {
    var l = chol.l, n = l.length, x = zeros(n, b[0].length), i, j, k, s;
    for (j = 0; j < b[0].length; j++) {
      for (i = 0; i < n; i++) {
        s = b[i][j];
        for (k = 0; k < i; k++) s -= l[i][k] * x[k][j];
        x[i][j] = s / l[i][i];
      }
      for (i = n - 1; i >= 0; i--) {
        s = x[i][j];
        for (k = i + 1; k < n; k++) s -= l[k][i] * x[k][j];
        x[i][j] = s / l[i][i];
      }
    }
    return x;
  }

  // Symmetric complete-pivot elimination of X'X, with relative tolerance.
  function checkRank(x, treatments) {
    var a = cross(x, x), d = a.length, order = [], maxDiag = 0;
    var i, j, k, pivot, tmp;
    for (i = 0; i < d; i++) {
      order[i] = i;
      maxDiag = Math.max(maxDiag, a[i][i]);
    }
    for (k = 0; k < d; k++) {
      pivot = k;
      for (i = k + 1; i < d; i++) if (a[i][i] > a[pivot][pivot]) pivot = i;
      if (!(a[pivot][pivot] > 1e-10 * maxDiag)) {
        throw new Error("interaction (or effect) for " +
          treatments[1 + order[pivot] % (treatments.length - 1)] +
          " not identifiable from these data");
      }
      tmp = a[k]; a[k] = a[pivot]; a[pivot] = tmp;
      for (i = 0; i < d; i++) {
        tmp = a[i][k]; a[i][k] = a[i][pivot]; a[i][pivot] = tmp;
      }
      tmp = order[k]; order[k] = order[pivot]; order[pivot] = tmp;
      for (i = k + 1; i < d; i++)
        for (j = i; j < d; j++) {
          a[j][i] -= a[i][k] * a[j][k] / a[k][k];
          a[i][j] = a[j][i];
        }
    }
  }

  function prepare(rows, treatments) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("no rows");
    if (!Array.isArray(treatments) || treatments.length < 2) throw new Error("need >= 2 treatments");
    var index = Object.create(null), normalized = Object.create(null);
    var groups = [], groupIndex = Object.create(null), accepted = [], dropped = [];
    var parent = [], i, j, r, a, b, reason, key, g;
    for (i = 0; i < treatments.length; i++) {
      if (typeof treatments[i] !== "string" || index[treatments[i]] !== undefined)
        throw new Error("treatments must be distinct string labels");
      index[treatments[i]] = i;
      parent[i] = i;
    }
    function root(t) {
      while (parent[t] !== t) { parent[t] = parent[parent[t]]; t = parent[t]; }
      return t;
    }
    function drop(row, why) {
      dropped.push({ studyId: row.studyId, trtA: row.trtA, trtB: row.trtB, reason: why });
    }
    for (i = 0; i < rows.length; i++) {
      r = rows[i] || {};
      a = index[r.trtA]; b = index[r.trtB]; reason = "";
      if (!finite(r.yi) || !finite(r.sei) || !finite(r.covariate))
        reason = "non-finite yi, sei, or covariate";
      else if (r.sei <= 0) reason = "sei must be positive";
      else if (a === undefined || b === undefined) reason = "unknown treatment";
      else if (a === b) reason = "trtA equals trtB";
      if (reason) { drop(r, reason); continue; }
      accepted.push(r);
      parent[root(a)] = root(b);
    }
    var components = 0;
    for (i = 0; i < treatments.length; i++) if (root(i) === i) components++;
    if (components > 1) throw new Error("network is disconnected: " + components + " sub-networks");
    var refValue, varies = false;
    for (i = 0; i < accepted.length; i++) {
      r = accepted[i];
      if (r.trtA === treatments[0] || r.trtB === treatments[0]) {
        if (refValue === undefined) refValue = r.covariate;
        else if (refValue !== r.covariate) varies = true;
      }
    }
    if (!varies) throw new Error("Invalid reference treatment for interaction. " +
      "Insufficient variation in observed covariate values for reference treatment.");
    for (i = 0; i < treatments.length; i++) {
      key = treatments[i].replace(/ /g, "_");
      if (normalized[key] !== undefined)
        throw new Error("Number of treatments changes after replacing whitespaces with '_'.");
      normalized[key] = i;
    }
    for (i = 0; i < accepted.length; i++) {
      r = accepted[i];
      // Missing study IDs retain the old API's independent-row behaviour.
      key = r.studyId == null ? "row:" + i : "study:" + String(r.studyId);
      if (groupIndex[key] === undefined) {
        groupIndex[key] = groups.length;
        groups.push({ rows: [], labels: [] });
      }
      g = groups[groupIndex[key]];
      g.rows.push(r);
      if (g.labels.indexOf(r.trtA) < 0) g.labels.push(r.trtA);
      if (g.labels.indexOf(r.trtB) < 0) g.labels.push(r.trtB);
    }
    // netmeta requires every study with m treatments to supply all m(m-1)/2 contrasts
    // (it refuses "Study ... has a wrong number of comparisons"); do the same.
    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      var mArms = g.labels.length;
      if (g.rows.length !== mArms * (mArms - 1) / 2) {
        throw new Error("Study '" + g.rows[0].studyId + "' has a wrong number of comparisons: " + mArms +
          " treatments need " + (mArms * (mArms - 1) / 2) + " contrasts, " + g.rows.length + " supplied");
      }
    }
    var kept = [], blocks = [], xMean = 0;
    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      g.labels.sort(function (u, v) {
        u = u.replace(/ /g, "_"); v = v.replace(/ /g, "_");
        return u < v ? -1 : u > v ? 1 : 0;
      });
      var baseline = g.labels.indexOf(treatments[0]) >= 0 ? treatments[0] : g.labels[g.labels.length - 1];
      var block = [];
      for (j = 0; j < g.rows.length; j++) {
        r = g.rows[j];
        if (r.trtA !== baseline && r.trtB !== baseline) {
          drop(r, "multi-arm contrast not involving study baseline");
        } else {
          block.push(kept.length);
          kept.push({ row: r, sign: r.trtA === baseline ? 1 : -1 });
          xMean += r.covariate;
        }
      }
      if (block.length) blocks.push(block);
    }
    xMean /= kept.length;
    var p = treatments.length - 1, x = zeros(kept.length, 2 * p), y = [], v = [];
    for (i = 0; i < kept.length; i++) {
      r = kept[i].row; a = index[r.trtA]; b = index[r.trtB];
      var sign = kept[i].sign, xc = r.covariate - xMean;
      if (a > 0) { x[i][a - 1] = -sign; x[i][p + a - 1] = -sign * xc; }
      if (b > 0) { x[i][b - 1] = sign; x[i][p + b - 1] = sign * xc; }
      y.push(sign * r.yi); v.push(r.sei * r.sei);
    }
    checkRank(x, treatments);
    return { x: x, y: y, v: v, blocks: blocks, xMean: xMean, droppedRows: dropped };
  }

  // Block Cholesky solves; no full n-by-n covariance or projection inverse.
  function evaluate(x, y, v, tau2, blocks, method) {
    var n = y.length, d = x[0].length, wx = zeros(n, d), wy = [];
    var factors = [], logdet = 0, trWC = 0, trWCWC = 0, i, j, k, h, ids;
    for (h = 0; h < blocks.length; h++) {
      ids = blocks[h];
      var m = ids.length, sigma = zeros(m, m), c = zeros(m, m), rhs = zeros(m, d + 1);
      for (i = 0; i < m; i++) {
        for (j = 0; j < m; j++) {
          c[i][j] = i === j ? 1 : 0.5;
          sigma[i][j] = tau2 * c[i][j] + (i === j ? v[ids[i]] : 0);
        }
        for (j = 0; j < d; j++) rhs[i][j] = x[ids[i]][j];
        rhs[i][d] = y[ids[i]];
      }
      var chol = cholesky(sigma), solved = solve(chol, rhs), wc = solve(chol, c);
      logdet += chol.logdet;
      for (i = 0; i < m; i++) {
        for (j = 0; j < d; j++) wx[ids[i]][j] = solved[i][j];
        wy[ids[i]] = solved[i][d];
        trWC += wc[i][i];
      }
      trWCWC += traceProduct(wc, wc);
      factors.push({ chol: chol, c: c });
    }
    var normal = cross(x, wx), xy = zeros(d, 1);
    for (i = 0; i < n; i++) for (j = 0; j < d; j++) xy[j][0] += x[i][j] * wy[i];
    var normalChol = cholesky(normal), coeff = solve(normalChol, xy), cov = solve(normalChol, unit(d));
    var beta = [], q = [], residual = [], Q = 0;
    for (j = 0; j < d; j++) beta[j] = coeff[j][0];
    // Solve the residual directly to avoid cancellation in Wy - WX beta.
    for (i = 0; i < n; i++) residual[i] = y[i] - dot(x[i], beta);
    for (h = 0; h < blocks.length; h++) {
      ids = blocks[h];
      var rr = ids.map(function (id) { return [residual[id]]; });
      var wrr = solve(factors[h].chol, rr);
      for (i = 0; i < ids.length; i++) {
        q[ids[i]] = wrr[i][0]; Q += residual[ids[i]] * wrr[i][0];
      }
    }
    var aMat = zeros(d, d), bMat = zeros(d, d), u = zeros(d, 1);
    var qCq = 0, zWz = 0;
    for (h = 0; h < blocks.length; h++) {
      ids = blocks[h];
      var localWX = ids.map(function (id) { return wx[id]; });
      var cwx = multiply(factors[h].c, localWX);
      var wcwx = solve(factors[h].chol, cwx);
      var aa = cross(localWX, cwx), bb = cross(cwx, wcwx);
      var qq = ids.map(function (id) { return [q[id]]; });
      var z = multiply(factors[h].c, qq), wz = solve(factors[h].chol, z);
      for (i = 0; i < ids.length; i++) {
        qCq += qq[i][0] * z[i][0]; zWz += z[i][0] * wz[i][0];
        for (j = 0; j < d; j++) u[j][0] += localWX[i][j] * z[i][0];
      }
      for (j = 0; j < d; j++) for (k = 0; k < d; k++) {
        aMat[j][k] += aa[j][k]; bMat[j][k] += bb[j][k];
      }
    }
    var ha = multiply(cov, aMat), hu = solve(normalChol, u), uHu = 0;
    for (j = 0; j < d; j++) uHu += u[j][0] * hu[j][0];
    var reml = method === "REML";
    // With a square full-rank design REML is constant in tau2.
    var saturated = reml && n === d;
    var trPC = trWC - (reml ? traceProduct(cov, aMat) : 0);
    var trPCPC = trWCWC - (reml ? 2 * traceProduct(cov, bMat) - traceProduct(ha, ha) : 0);
    return {
      beta: beta, cov: cov, Q: Q, n: n, p: d, tau2: tau2,
      loglik: -0.5 * (logdet + Q + (reml ? normalChol.logdet : 0)),
      score: saturated ? 0 : 0.5 * (qCq - trPC),
      information: saturated ? 0 : Math.max(0, 0.5 * trPCPC),
      hessian: saturated ? 0 : 0.5 * trPCPC - (zWz - uHu)
    };
  }

  // Retain the old conditional-GLS helper; optional blocks/method permit
  // direct likelihood diagnostics without adding a fixed-tau fit option.
  function _fitGLS(x, y, v, tau2, blocks, method) {
    if (!finite(tau2) || tau2 < 0) throw new Error("tau2 must be nonnegative and finite");
    blocks = blocks || y.map(function (_, i) { return [i]; });
    return evaluate(x, y, v, tau2, blocks, method || "REML");
  }

  function optimize(at, initial, v) {
    var best = initial, scale = 0, i, trial, iterations = 0;
    for (i = 0; i < v.length; i++) scale += v[i];
    scale /= v.length;
    // Include zero and a broad coarse log grid before starting scoring.
    // Extend the upper tail if it is still climbing.
    for (i = -24; i <= 24; i += 2) {
      trial = at(scale * Math.pow(2, i));
      if (trial.loglik > best.loglik) best = trial;
    }
    var upper = scale * Math.pow(2, 24);
    for (i = 0; i < 30 && trial.score > 0; i++) {
      upper *= 4; trial = at(upper);
      if (trial.loglik > best.loglik) best = trial;
    }
    // Nonpositive score at zero: keep the exact boundary unless the grid found
    // a strictly higher likelihood elsewhere (guards against multimodality).
    if (initial.score <= 0 && !(best.loglik > initial.loglik + 1e-12 * Math.max(1, Math.abs(initial.loglik))))
      return { fit: initial, converged: true, iterations: 0 };
    if (best.tau2 === 0) best = initial;
    var converged = false;
    for (iterations = 1; iterations <= 200; iterations++) {
      var tolerance = 1e-14 * Math.max(1, best.tau2);
      // Fisher scoring first, then observed-Newton polishing.
      var curvature = iterations > 8 && best.hessian < 0 ? -best.hessian : best.information;
      if (!(curvature > 0)) break;
      var step = best.score / curvature;
      if (Math.abs(step) <= tolerance) { converged = true; break; }
      var nextTau = Math.max(0, best.tau2 + step), accepted = false;
      for (var half = 0; half < 60; half++) {
        trial = at(nextTau);
        var gain = trial.loglik - best.loglik;
        // Near machine precision, integrate the analytic score to avoid
        // subtracting almost equal log likelihoods. This still requires
        // a nonnegative likelihood gain for every accepted step.
        if (Math.abs(gain) <= 1e-12 * Math.max(1, Math.abs(best.loglik))) {
          var mid = at((nextTau + best.tau2) / 2);
          gain = (nextTau - best.tau2) * (best.score + 4 * mid.score + trial.score) / 6;
        }
        if (gain >= 0) { accepted = true; break; }
        nextTau = (nextTau + best.tau2) / 2;
      }
      if (!accepted) break;
      var delta = Math.abs(trial.tau2 - best.tau2);
      best = trial;
      if (best.tau2 === 0 && best.score <= 0) { converged = true; break; }
      if (delta <= tolerance && Math.abs(best.score / curvature) <= tolerance) {
        converged = true; break;
      }
    }
    return { fit: best, converged: converged, iterations: Math.min(iterations, 200) };
  }

  function summary(estimate, variance) {
    var se = Math.sqrt(Math.max(0, variance)), z = 1.959963984540054;
    return { estimate: estimate, se: se, ci_lo: estimate - z * se, ci_hi: estimate + z * se };
  }
  function fit(rows, treatments, opts) {
    opts = opts || {};
    var method = opts.method == null ? "REML" : opts.method;
    if (method !== "REML" && method !== "ML" && method !== "FE")
      throw new Error("method must be REML, ML, or FE");
    var data = prepare(rows, treatments), p = treatments.length - 1;
    function at(tau2) { return evaluate(data.x, data.y, data.v, tau2, data.blocks, method); }
    var fit0 = at(0);
    var result = method === "FE" ? { fit: fit0, converged: true, iterations: 0 } :
      optimize(at, fit0, data.v);
    var f = result.fit, betaSummary = Object.create(null), gammaSummary = Object.create(null);
    for (var k = 0; k < p; k++) {
      betaSummary[treatments[k + 1]] = summary(f.beta[k], f.cov[k][k]);
      gammaSummary[treatments[k + 1]] = summary(f.beta[p + k], f.cov[p + k][p + k]);
    }
    var predAt = Array.isArray(opts.predictAt) ? opts.predictAt : [data.xMean];
    var predictions = predAt.map(function (x) {
      if (!finite(x)) throw new Error("prediction covariates must be finite");
      var xc = x - data.xMean, perTreatment = Object.create(null);
      perTreatment[treatments[0]] = summary(0, 0);
      for (var j = 0; j < p; j++) {
        perTreatment[treatments[j + 1]] = summary(f.beta[j] + xc * f.beta[p + j],
          f.cov[j][j] + xc * xc * f.cov[p + j][p + j] + 2 * xc * f.cov[j][p + j]);
      }
      return { x: x, perTreatment: perTreatment };
    });
    return {
      ok: true, treatments: treatments, reference: treatments[0], method: method,
      xMean: data.xMean, xRange: { min: Math.min.apply(null, predAt), max: Math.max.apply(null, predAt) },
      beta_at_mean: betaSummary, gamma: gammaSummary, predictions: predictions, cov: f.cov,
      tau2: f.tau2, Q: f.Q, QE: fit0.Q, QEdf: data.y.length - 2 * p,
      n: data.y.length, p: 2 * p, studies: data.blocks.length, droppedRows: data.droppedRows,
      loglik: f.loglik, converged: result.converged, iterations: result.iterations
    };
  }

  var api = { fit: fit, _fitGLS: _fitGLS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmNmaMetaReg = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
