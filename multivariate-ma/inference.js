/* multivariate-ma/inference.js — heterogeneity, common-effect fit, fit statistics and further inference
 * for the bivariate random-effects fit of shared/multivariate-ma.js. Pure: no DOM, no state.
 *
 * compute(rows, fit, levelPct)
 *   rows: [{ y:[y1,y2], v:[v1,v2], cov }] (the rows the fit used); fit: AlmMultivariate.fit() result;
 *   levelPct: confidence level in percent, 0 < level < 100.
 * Definitions follow the R packages:
 *   common-effect (fixed) fit       mvmeta(method="fixed"): GLS with G = 0, normal CIs (summary.mvmeta)
 *   Cochran Q overall / per outcome qtest.mvmeta: Q = sum r'S^-1 r at the multivariate fixed-effect means,
 *                                   df = 2k - 2; per outcome sum (y_ij - mu_j)^2 / S_i,jj, df = k - 1
 *   I^2                             summary.mixmeta i2stat: max(0, (Q - df) / Q) * 100
 *   fit statistics (REML)           metafor fitstats(rma.mv): parms = 2 means + 3 covariance parameters,
 *                                   deviance = -2 logLik, AIC, BIC with log(N - p), AICc with max(N - p, parms + 2)
 *   omnibus Wald test               rma.mv QM (both means = 0), chi-square 2 df
 *   contrast outcome 1 - outcome 2  anova.rma(X = c(1, -1)), normal
 *   prediction interval             mu_j +- t_{k-1} * sqrt(SE_j^2 + tau2_j) (predict.rma on rma.mv with
 *                                   test = "t", dfs = k - 1; Cochrane Handbook v6.5 uses t with k - 1 df)
 */
(function (global) {
  "use strict";
  function req(name, path) {
    if (global[name]) return global[name];
    if (typeof require === "function") return require(path);
    throw new Error(name + " is not loaded");
  }
  function inv2(M) {
    var d = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    if (!(Number.isFinite(d) && d !== 0)) return null;
    return [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]];
  }
  function quad(a, M, b) { return a[0] * (M[0][0] * b[0] + M[0][1] * b[1]) + a[1] * (M[1][0] * b[0] + M[1][1] * b[1]); }

  function compute(rows, fit, levelPct) {
    var mv = req("AlmMultivariate", "../shared/multivariate-ma.js"), st = req("AlmStats", "../shared/stats-qt.js");
    var L = typeof levelPct === "string" && levelPct.trim() !== "" ? Number(levelPct) : levelPct;
    if (typeof L !== "number" || !Number.isFinite(L) || !(L > 0 && L < 100)) return { status: "refused", reason: "Confidence level must be a number strictly between 0 and 100 (percent)." };
    if (!Array.isArray(rows) || rows.length < 2 || !fit || !fit.mu || rows.length !== fit.k) return { status: "refused", reason: "At least two complete studies and a fitted model are required." };
    var k = rows.length, a = 1 - L / 100, zc = st.qnorm(1 - a / 2);
    // ---- common-effect (fixed) fit: GLS with G = 0 ----
    var W = [], sumW = [[0, 0], [0, 0]], sumWy = [0, 0];
    for (var i = 0; i < k; i++) {
      var r = rows[i], Wi = inv2([[r.v[0], r.cov], [r.cov, r.v[1]]]);
      if (!Wi) return { status: "refused", reason: "Within-study covariance must be positive definite." };
      W.push(Wi);
      for (var p = 0; p < 2; p++) { sumWy[p] += Wi[p][0] * r.y[0] + Wi[p][1] * r.y[1]; for (var q = 0; q < 2; q++) sumW[p][q] += Wi[p][q]; }
    }
    var Vfe = inv2(sumW);
    if (!Vfe) return { status: "refused", reason: "Fixed-effect information matrix is singular." };
    var muFE = [Vfe[0][0] * sumWy[0] + Vfe[0][1] * sumWy[1], Vfe[1][0] * sumWy[0] + Vfe[1][1] * sumWy[1]];
    function means(mu, V) {
      var se = [Math.sqrt(V[0][0]), Math.sqrt(V[1][1])], t = [mv.zTest(mu[0], se[0]), mv.zTest(mu[1], se[1])];
      return { mu: mu.slice(), se: se, vcov: [V[0].slice(), V[1].slice()], z: t.map(function (x) { return x.status === "ok" ? x.z : null; }), p: t.map(function (x) { return x.status === "ok" ? x.p : null; }),
        lo: [mu[0] - zc * se[0], mu[1] - zc * se[1]], hi: [mu[0] + zc * se[0], mu[1] + zc * se[1]], cor: V[0][1] / (se[0] * se[1]) };
    }
    var fe = means(muFE, Vfe);
    // ---- Cochran Q (qtest.mvmeta) and I^2 ----
    var Q = [0, 0, 0];
    for (i = 0; i < k; i++) {
      var e = [rows[i].y[0] - muFE[0], rows[i].y[1] - muFE[1]];
      Q[0] += quad(e, W[i], e); Q[1] += e[0] * e[0] / rows[i].v[0]; Q[2] += e[1] * e[1] / rows[i].v[1];
    }
    var df = [2 * k - 2, k - 1, k - 1];
    var het = { Q: Q, df: df, p: Q.map(function (x, j) { return mv.chisqSF(Math.max(0, x), df[j]); }),
      I2: Q.map(function (x, j) { return x > 0 ? Math.max(0, (x - df[j]) / x) * 100 : 0; }) };
    // ---- random-effects means at the chosen level ----
    var re = means(fit.mu, fit.muVcov);
    // ---- omnibus Wald test of both means ----
    var Vinv = inv2(fit.muVcov), QM = Vinv ? quad(fit.mu, Vinv, fit.mu) : NaN;
    var omnibus = { QM: QM, df: 2, p: Number.isFinite(QM) ? mv.chisqSF(Math.max(0, QM), 2) : null };
    // ---- contrast outcome 1 - outcome 2 ----
    var cEst = fit.mu[0] - fit.mu[1], cSE = Math.sqrt(Math.max(0, fit.muVcov[0][0] + fit.muVcov[1][1] - 2 * fit.muVcov[0][1])), ct = mv.zTest(cEst, cSE);
    var contrast = { est: cEst, se: cSE, z: ct.status === "ok" ? ct.z : null, p: ct.status === "ok" ? ct.p : null, lo: cEst - zc * cSE, hi: cEst + zc * cSE };
    // ---- prediction interval per outcome, t with k - 1 df ----
    var tc = st.qt(1 - a / 2, k - 1), pi = { df: k - 1, crit: tc, lo: [], hi: [] };
    for (p = 0; p < 2; p++) { var h = tc * Math.sqrt(re.se[p] * re.se[p] + fit.G[p][p]); pi.lo.push(fit.mu[p] - h); pi.hi.push(fit.mu[p] + h); }
    // ---- fit statistics of the REML fit (metafor fitstats) ----
    var parms = 5, n = 2 * k - 2, ll = fit.logLik, mx = Math.max(n, parms + 2);
    var fitstats = { logLik: ll, deviance: -2 * ll, AIC: -2 * ll + 2 * parms, BIC: -2 * ll + parms * Math.log(n), AICc: -2 * ll + 2 * parms * mx / (mx - parms - 1), parms: parms, dfRes: n };
    return { status: "ok", level: L, k: k, fe: fe, het: het, re: re, omnibus: omnibus, contrast: contrast, pi: pi, fitstats: fitstats };
  }

  // R script reproducing every number of the panel (data literal; mvmeta, mixmeta, metafor).
  function rScript(rows, level, labels) {
    function num(x) { return String(Number(x)); }
    function col(f) { return "c(" + rows.map(f).join(", ") + ")"; }
    var L = Number(level);
    return [
      "# multivariate-ma: heterogeneity, common-effect fit, fit statistics and further inference",
      "# R >= 4.6 with mvmeta, mixmeta, metafor. Confidence level " + num(L) + "%.",
      "library(mvmeta); library(mixmeta); library(metafor)",
      "y1 <- " + col(function (r) { return num(r.y[0]); }), "v1 <- " + col(function (r) { return num(r.v[0]); }),
      "y2 <- " + col(function (r) { return num(r.y[1]); }), "v2 <- " + col(function (r) { return num(r.v[1]); }),
      "cv <- " + col(function (r) { return num(r.cov); }),
      "k <- length(y1); level <- " + num(L) + "",
      "Y <- cbind(o1 = y1, o2 = y2); Svech <- cbind(v1, cv, v2)",
      "S <- lapply(seq_len(k), function(i) matrix(c(v1[i], cv[i], cv[i], v2[i]), 2))",
      "re <- mvmeta(Y ~ 1, S = S, method = \"reml\", bscov = \"unstr\")",
      "fe <- mvmeta(Y ~ 1, S = S, method = \"fixed\")",
      "print(summary(fe, ci.level = level / 100))          # common-effect fit",
      "print(summary(re, ci.level = level / 100))          # random-effects means, correlation of pooled means",
      "sm <- summary(mixmeta(Y, Svech, method = \"fixed\")); print(sm$qstat[c(\"Q\", \"df\", \"pvalue\")]); print(sm$i2stat)",
      "G <- re$Psi; rho <- if (all(diag(G) > 0)) G[1, 2] / sqrt(prod(diag(G))) else 0",
      "long <- data.frame(study = rep(seq_len(k), each = 2), outcome = factor(rep(c(\"o1\", \"o2\"), k)), yi = as.vector(t(Y)))",
      "V <- bldiag(S)",
      "m1 <- rma.mv(yi, V, mods = ~ outcome - 1, random = ~ outcome | study, struct = \"UN\", data = long, tau2 = diag(G), rho = rho, level = level)",
      "print(c(QM = m1$QM, df = m1$QMdf[1], p = m1$QMp))  # omnibus Wald test",
      "print(anova(m1, X = c(1, -1))); print(predict(m1, newmods = c(1, -1)))  # contrast outcome 1 - outcome 2",
      "m2 <- rma.mv(yi, V, mods = ~ outcome - 1, random = ~ outcome | study, struct = \"UN\", data = long, tau2 = diag(G), rho = rho, test = \"t\", dfs = k - 1, level = level)",
      "print(predict(m2, newmods = diag(2), tau2.levels = c(1, 2)))  # prediction intervals, t with k - 1 df",
      "m3 <- rma.mv(yi, V, mods = ~ outcome - 1, random = ~ outcome | study, struct = \"UN\", data = long, method = \"REML\")",
      "print(fitstats(m3)); print(c(parms = m3$parms, df.residual = df.residual(m3)))",
      "# Note: m3 is a free metafor fit; if its logLik differs from the page, the page's REML optimum is in re$Psi.",
      ""
    ].join("\n");
  }

  var api = { compute: compute, rScript: rScript };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmMvInference = api;
})(typeof window !== "undefined" ? window : globalThis);
