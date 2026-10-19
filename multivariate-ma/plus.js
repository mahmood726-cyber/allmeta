/* multivariate-ma plus: pure calculations for the comparison/sensitivity panel.
 * No DOM. Uses window.AlmMultivariate (shared/multivariate-ma.js) only.
 *   compute(parsed)       bivariate REML fit + univariate REML per outcome on the same rows,
 *                         z/p per pooled mean, variance ratio (multivariate/univariate).
 *   sweep(parsed, grid)   refit with ONE common within-study correlation rho_w per grid value.
 *   makeGrid(from,to,step), rScript(parsed, grid), texts(parsed, result, sweep), formatters.
 * parsed = { mode:'cov'|'r'|'rhoW', rhoW, outcomes:[o1,o2], rows:[{line,label,y:[2],v:[2],cov,r}], omitted:[{line,label,reason}] }
 */
(function (g) {
  'use strict';
  var Z = 1.959963984540054;
  function eng() { if (!g.AlmMultivariate) throw new Error('engine unavailable'); return g.AlmMultivariate; }
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function f3(x) { return finite(x) ? x.toFixed(3) : '\u2014'; }
  function f4(x) { return finite(x) ? x.toFixed(4) : '\u2014'; }
  function sig4(x) { return finite(x) ? (x === 0 ? '0' : x.toPrecision(4)) : '\u2014'; }
  function fz(x) { return finite(x) ? x.toFixed(2) : '\u2014'; }
  function fp(p) { return finite(p) ? (p < 0.0001 ? '<0.0001' : p.toFixed(4)) : '\u2014'; }
  function ci(mu, se) { return f3(mu) + ' [' + f3(mu - Z * se) + ', ' + f3(mu + Z * se) + ']'; }
  var fmt = { f3: f3, f4: f4, sig4: sig4, z: fz, p: fp, ci: ci };

  function studies(parsed) { return parsed.rows.map(function (r) { return { y: r.y.slice(), S: [[r.v[0], r.cov], [r.cov, r.v[1]]] }; }); }
  function tests(mu, se) { return mu.map(function (m, j) { var t = eng().zTest(m, se[j]); return t.status === 'ok' ? { z: t.z, p: t.p } : { z: null, p: null, reason: t.reason }; }); }
  function boundaryNote(f) {
    if (!f) return null;
    var G = f.G, b = f.optimizer && f.optimizer.boundary;
    if (G[0][0] === 0 && G[1][1] === 0) return 'zero';
    if (G[0][0] === 0 || G[1][1] === 0 || f.rho === null) return 'undefined-rho';
    if (b === 'rank-one' || b === 'two-study-exact' || Math.abs(f.rho) >= 1 - 1e-9) return 'rho-boundary';
    return null;
  }

  function compute(parsed) {
    var out = { k: parsed.rows.length, omitted: parsed.omitted.length };
    if (parsed.rows.length < 2) { out.status = 'refused'; out.reason = 'At least two complete studies are required.'; return out; }
    // Univariate fits need only the variances, so they are reported even when the supplied
    // within-study covariance makes the bivariate model invalid.
    out.univariate = [0, 1].map(function (j) {
      try {
        var u = eng().fitUnivariate(parsed.rows.map(function (r) { return r.y[j]; }), parsed.rows.map(function (r) { return r.v[j]; }));
        var t = eng().zTest(u.mu, u.se);
        return { status: 'ok', k: u.k, mu: u.mu, se: u.se, tau2: u.tau2, logLik: u.logLik, z: t.z, p: t.p, boundary: u.optimizer.boundary };
      } catch (e) { return { status: 'refused', reason: e.message }; }
    });
    var f;
    try { f = eng().fit(studies(parsed)); } catch (e) { out.status = 'refused'; out.reason = e.message; out.varRatio = [null, null]; return out; }
    out.status = 'ok'; out.fit = f; out.tests = tests(f.mu, f.muSE); out.boundary = boundaryNote(f);
    out.varRatio = [0, 1].map(function (j) { var u = out.univariate[j]; return u.status === 'ok' && u.se > 0 ? (f.muSE[j] * f.muSE[j]) / (u.se * u.se) : null; });
    return out;
  }

  function sweep(parsed, grid) {
    var rows = parsed.rows.map(function (r) { return { y: r.y.slice(), v: r.v.slice() }; });
    if (rows.length < 2) return grid.map(function (rw) { return { rhoW: rw, status: 'refused', reason: 'At least two complete studies are required.' }; });
    return eng().sweepRho(rows, grid).map(function (s) {
      if (s.status !== 'ok') return s;
      return { rhoW: s.rhoW, status: 'ok', fit: s.fit, tests: tests(s.fit.mu, s.fit.muSE), boundary: boundaryNote(s.fit) };
    });
  }

  function decimals(x) { var s = String(x); if (/e/i.test(s)) return 12; var i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  // Grid from..to by step; values rounded to the inputs' decimal places so that the default
  // -0.9..0.9 by 0.1 gives exactly (-9..9)/10. Values with |rho|>=1 are kept and refused by sweep().
  function makeGrid(from, to, step) {
    if (![from, to, step].every(finite)) return { grid: [], error: 'From, to and step must be numbers.' };
    if (!(step > 0)) return { grid: [], error: 'Step must be positive.' };
    if (to < from) return { grid: [], error: '"To" must not be below "from".' };
    var n = Math.floor((to - from) / step + 1e-9);
    if (n > 400) return { grid: [], error: 'At most 401 grid values.' };
    var d = Math.min(12, Math.max(decimals(from), decimals(step))), s = Math.pow(10, d), grid = [];
    for (var i = 0; i <= n; i++) grid.push(Math.round((from + i * step) * s) / s);
    return { grid: grid, error: null };
  }

  // ---------- plain-language interpretation and auto methods/results text ----------
  function modeSentence(parsed) {
    if (parsed.mode === 'r') return 'Within-study covariances were computed from per-study within-study correlations r_i as r_i\u00b7sqrt(v1_i\u00b7v2_i).';
    if (parsed.mode === 'rhoW') return 'Within-study correlations were not available; a common within-study correlation of \u03c1w = ' + parsed.rhoW + ' was assumed for every study (covariance \u03c1w\u00b7sqrt(v1_i\u00b7v2_i)).';
    return 'Within-study variances and covariances were supplied for each study.';
  }
  function omittedSentence(parsed) {
    if (!parsed.omitted.length) return '';
    return ' ' + parsed.omitted.length + ' input row' + (parsed.omitted.length === 1 ? ' was' : 's were') + ' omitted (' + parsed.omitted.map(function (o) { return 'line ' + o.line + ': ' + o.reason; }).join('; ') + ').';
  }
  function sweepSummary(parsed, sw) {
    if (!sw || !sw.length) return null;
    var ok = sw.filter(function (s) { return s.status === 'ok'; });
    if (!ok.length) return 'The \u03c1w sensitivity analysis produced no fits (' + sw[0].reason + ').';
    var lo = ok[0].rhoW, hi = ok[ok.length - 1].rhoW;
    return parsed.outcomes.map(function (o, j) {
      var mus = ok.map(function (s) { return s.fit.mu[j]; });
      var excl = ok.filter(function (s) { var a = s.fit.mu[j] - Z * s.fit.muSE[j], b = s.fit.mu[j] + Z * s.fit.muSE[j]; return a > 0 || b < 0; }).length;
      return 'Across \u03c1w from ' + lo + ' to ' + hi + ' (' + ok.length + ' fits), the pooled ' + o + ' ranged from ' + f3(Math.min.apply(null, mus)) + ' to ' + f3(Math.max.apply(null, mus)) +
        '; its 95% CI excluded 0 at ' + (excl === ok.length ? 'every' : excl === 0 ? 'no' : excl + ' of ' + ok.length) + ' \u03c1w value' + (excl === 1 && ok.length !== 1 ? '' : 's') + '.';
    }).join(' ') + (ok.length < sw.length ? ' ' + (sw.length - ok.length) + ' grid value(s) were refused.' : '');
  }
  function texts(parsed, res, sw) {
    var o = parsed.outcomes, k = parsed.rows.length, interp = [], methods, results;
    if (res.status !== 'ok') {
      interp.push('No model was fitted: ' + res.reason);
      if (k < 2) interp.push('A bivariate random-effects model needs at least two studies with both outcomes.');
      interp.push(omittedSentence(parsed).trim());
      return { interpretation: interp.filter(Boolean).join(' '), methods: '', results: '' };
    }
    var f = res.fit;
    interp.push('The two outcomes were pooled jointly from the same ' + k + ' studies.');
    o.forEach(function (name, j) {
      var lo = f.mu[j] - Z * f.muSE[j], hi = f.mu[j] + Z * f.muSE[j];
      interp.push('Pooled ' + name + ': ' + f3(f.mu[j]) + ' (95% CI ' + f3(lo) + ' to ' + f3(hi) + '); the interval ' + (lo > 0 || hi < 0 ? 'excludes' : 'includes') + ' 0.');
    });
    if (k === 2) interp.push('With only two studies the REML between-study covariance has a closed form: it is either zero or rank one (correlation \u00b11). Between-study quantities are very imprecise and should not be interpreted.');
    if (res.boundary === 'zero') interp.push('Both between-study variances are estimated as zero, so the between-study correlation is undefined (it is not zero; it cannot be estimated).');
    else if (res.boundary === 'undefined-rho') interp.push('The between-study variance of ' + (f.G[0][0] === 0 ? o[0] : o[1]) + ' is estimated as zero, so the between-study correlation is undefined (not estimable), not zero.');
    else if (res.boundary === 'rho-boundary') interp.push('The between-study correlation is estimated at the boundary (' + f3(f.rho) + '): the between-study covariance matrix is rank-deficient. This is common with few studies and is poorly identified; do not read it as a true correlation of \u00b11.');
    res.varRatio.forEach(function (r, j) {
      if (r !== null) interp.push('For ' + o[j] + ', the variance of the jointly pooled mean is ' + f3(r) + ' times that of a separate (univariate) analysis of the same studies' + (r < 1 ? '.' : r > 1 ? ' (the joint model is less precise here, e.g. because it estimates a different between-study variance).' : '.'));
    });
    if (parsed.mode === 'rhoW') interp.push('The within-study correlation was assumed (\u03c1w = ' + parsed.rhoW + '); use the \u03c1w sweep to see how much the results depend on it.');
    var ss = sweepSummary(parsed, sw); if (ss) interp.push(ss);
    var om = omittedSentence(parsed).trim(); if (om) interp.push(om);

    methods = 'A bivariate random-effects meta-analysis of ' + o[0] + ' and ' + o[1] + ' was fitted by restricted maximum likelihood (REML) with an unstructured between-study covariance matrix (the model of mvmeta::mvmeta(method = "reml", bscov = "unstr") and metafor::rma.mv(struct = "UN")), using the allmeta multivariate-ma page. ' +
      modeSentence(parsed) + ' Pooled means are reported with Wald 95% confidence intervals and two-sided z tests (normal distribution). Separate univariate REML meta-analyses of each outcome on the same ' + k + ' studies are reported for comparison.' +
      (sw && sw.length ? ' Sensitivity to the within-study correlation was examined by refitting the model with a common within-study correlation \u03c1w for every study over ' + sw.length + ' values from ' + sw[0].rhoW + ' to ' + sw[sw.length - 1].rhoW + '.' : '') +
      omittedSentence(parsed);
    var bs = res.boundary === 'zero' ? 'Both between-study variances were estimated as zero; the between-study correlation is undefined.' :
      res.boundary === 'undefined-rho' ? 'The between-study variance of ' + (f.G[0][0] === 0 ? o[0] : o[1]) + ' was estimated as zero; the between-study correlation is undefined.' :
      'The between-study SDs were ' + f4(Math.sqrt(f.G[0][0])) + ' (' + o[0] + ') and ' + f4(Math.sqrt(f.G[1][1])) + ' (' + o[1] + '), with between-study correlation ' + f3(f.rho) + (res.boundary === 'rho-boundary' ? ' (at the boundary; rank-deficient between-study covariance)' : '') + '.';
    results = 'Across k = ' + k + ' studies, the pooled ' + o[0] + ' was ' + f3(f.mu[0]) + ' (95% CI ' + f3(f.mu[0] - Z * f.muSE[0]) + ' to ' + f3(f.mu[0] + Z * f.muSE[0]) + '; z = ' + fz(res.tests[0].z) + ', p ' + (res.tests[0].p < 0.0001 ? '< 0.0001' : '= ' + fp(res.tests[0].p)) + ') and the pooled ' + o[1] + ' was ' + f3(f.mu[1]) + ' (95% CI ' + f3(f.mu[1] - Z * f.muSE[1]) + ' to ' + f3(f.mu[1] + Z * f.muSE[1]) + '; z = ' + fz(res.tests[1].z) + ', p ' + (res.tests[1].p < 0.0001 ? '< 0.0001' : '= ' + fp(res.tests[1].p)) + '). ' + bs +
      ' REML log-likelihood ' + f3(f.logLik) + '.' + (k === 2 ? ' With two studies, between-study estimates are not interpretable.' : '') + (ss ? ' ' + ss : '');
    return { interpretation: interp.join(' '), methods: methods, results: results };
  }

  // ---------- runnable R script ----------
  function rnum(x) { return String(x); }   // shortest round-trip decimal; R reads it back to the same double
  function rstr(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\u0000-\u001f]/g, ' ') + '"'; }
  function rScript(parsed, grid, meta) {
    meta = meta || {};
    var rows = parsed.rows, L = [];
    L.push('# Generated by the allmeta multivariate-ma page' + (meta.build ? ' (build ' + meta.build + ')' : '') + '.');
    L.push('# Re-fits the page analysis in R: mvmeta (REML, unstructured), metafor::rma.mv cross-check,');
    L.push('# univariate metafor::rma per outcome on the same rows, and the within-study correlation sweep.');
    L.push('# Requires: mvmeta, metafor, jsonlite. Writes multivariate-ma-results.json to the working directory.');
    L.push('# Note: with k = 2, or a between-study variance on its boundary, mvmeta returns an optimizer');
    L.push('# approximation of a flat likelihood; the page reports the exact constrained REML solution there.');
    L.push('# Compare such fits by their REML log-likelihood, not by the parameter values.');
    L.push('suppressPackageStartupMessages({ library(mvmeta); library(metafor); library(jsonlite) })');
    L.push('cat(R.version.string, "\\n"); for (p in c("mvmeta", "metafor", "jsonlite")) cat(p, as.character(packageVersion(p)), "\\n")');
    L.push('# Input mode on the page: ' + ({ cov: 'supplied covariances', r: 'per-study within-study correlation r', rhoW: 'one assumed within-study correlation rho_w = ' + parsed.rhoW }[parsed.mode]));
    L.push('outcomes <- c(' + rstr(parsed.outcomes[0]) + ', ' + rstr(parsed.outcomes[1]) + ')');
    L.push('dat <- data.frame(');
    L.push('  label = c(' + rows.map(function (r) { return rstr(r.label); }).join(', ') + '),');
    L.push('  y1 = c(' + rows.map(function (r) { return rnum(r.y[0]); }).join(', ') + '),');
    L.push('  v1 = c(' + rows.map(function (r) { return rnum(r.v[0]); }).join(', ') + '),');
    L.push('  y2 = c(' + rows.map(function (r) { return rnum(r.y[1]); }).join(', ') + '),');
    L.push('  v2 = c(' + rows.map(function (r) { return rnum(r.v[1]); }).join(', ') + '),');
    if (parsed.mode === 'cov') L.push('  cov = c(' + rows.map(function (r) { return rnum(r.cov); }).join(', ') + '),');
    else if (parsed.mode === 'r') L.push('  r = c(' + rows.map(function (r) { return rnum(r.r); }).join(', ') + '),');
    L.push('  stringsAsFactors = FALSE)');
    if (parsed.mode === 'r') L.push('dat$cov <- dat$r * sqrt(dat$v1 * dat$v2)');
    if (parsed.mode === 'rhoW') L.push('rho_w <- ' + rnum(parsed.rhoW) + '; dat$cov <- rho_w * sqrt(dat$v1 * dat$v2)');
    if (parsed.omitted.length) L.push('# Rows omitted by the page: ' + parsed.omitted.map(function (o) { return 'line ' + o.line + ' (' + o.reason + ')'; }).join('; ').replace(/[\r\n]/g, ' '));
    L.push('k <- nrow(dat); Y <- cbind(dat$y1, dat$y2)');
    L.push('mkS <- function(cv) lapply(seq_len(k), function(i) matrix(c(dat$v1[i], cv[i], cv[i], dat$v2[i]), 2))');
    L.push('ctl <- list(maxiter = 10000, reltol = 1e-13, optim = list(maxit = 10000, reltol = 1e-13))');
    L.push('rows_of <- function(M) lapply(seq_len(nrow(M)), function(i) unname(M[i, ]))');
    L.push('fit_mv <- function(S) {');
    L.push('  # The page refuses a within-study covariance that is not positive definite; mvmeta does not check.');
    L.push('  if (any(vapply(S, function(s) min(eigen(s, symmetric = TRUE, only.values = TRUE)$values) <= 0, TRUE))) stop("Within-study covariance must be positive definite.")');
    L.push('  f <- mvmeta(Y ~ 1, S = S, method = "reml", bscov = "unstr", control = ctl)');
    L.push('  mu <- unname(as.numeric(coef(f))); V <- unname(vcov(f)); se <- sqrt(diag(V)); G <- unname(f$Psi); z <- mu / se');
    L.push('  list(mu = mu, se = se, muVcov = rows_of(V), G = rows_of(G), rho = if (all(diag(G) > 0)) G[1, 2] / sqrt(G[1, 1] * G[2, 2]) else NULL,');
    L.push('       logLik = as.numeric(logLik(f)) + log(k),  # + 0.5*log|X\'X| (metafor REML normalisation)');
    L.push('       z = z, p = 2 * pnorm(-abs(z)), converged = f$converged)');
    L.push('}');
    L.push('main <- tryCatch(fit_mv(mkS(dat$cov)), error = function(e) list(error = conditionMessage(e)))');
    L.push('d <- data.frame(yi = c(t(Y)), outcome = factor(rep(1:2, k)), study = rep(seq_len(k), each = 2))');
    L.push('mv <- tryCatch(rma.mv(yi, bldiag(mkS(dat$cov)), mods = ~ outcome - 1, random = ~ outcome | study, struct = "UN", method = "REML", data = d,');
    L.push('             control = list(rel.tol = 1e-10, x.tol = 1e-10, iter.max = 10000, eval.max = 20000)), error = function(e) e)');
    L.push('rmamv <- if (inherits(mv, "error")) list(error = conditionMessage(mv)) else list(mu = unname(as.numeric(coef(mv))), se = unname(mv$se), G = rows_of(unname(mv$G)), logLik = as.numeric(logLik(mv)))');
    L.push('uni <- lapply(1:2, function(j) { u <- rma(yi = Y[, j], vi = if (j == 1) dat$v1 else dat$v2, method = "REML", test = "z", control = list(threshold = 1e-12, maxiter = 10000))');
    L.push('  list(k = u$k, mu = as.numeric(u$beta), se = u$se, tau2 = u$tau2, logLik = as.numeric(logLik(u)), z = u$zval, p = u$pval) })');
    L.push('grid <- c(' + grid.map(rnum).join(', ') + ')');
    L.push('sweep <- lapply(grid, function(rw) {');
    L.push('  if (!(abs(rw) < 1)) return(list(rhoW = rw, error = "within-study correlation must satisfy |rho| < 1"))');
    L.push('  x <- tryCatch(fit_mv(mkS(rw * sqrt(dat$v1 * dat$v2))), error = function(e) list(error = conditionMessage(e))); x$rhoW <- rw; x })');
    L.push('out <- list(k = k, outcomes = outcomes, main = main, rma.mv = rmamv, univariate = uni, sweep = sweep,');
    L.push('            versions = list(R = R.version.string, mvmeta = as.character(packageVersion("mvmeta")), metafor = as.character(packageVersion("metafor"))))');
    L.push('writeLines(toJSON(out, auto_unbox = TRUE, digits = I(17), null = "null", na = "null"), "multivariate-ma-results.json")');
    L.push('cat("wrote multivariate-ma-results.json\\n")');
    return L.join('\n') + '\n';
  }

  var api = { compute: compute, sweep: sweep, makeGrid: makeGrid, texts: texts, rScript: rScript, fmt: fmt, boundaryNote: boundaryNote, Z: Z };
  g.AlmMvPlus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
