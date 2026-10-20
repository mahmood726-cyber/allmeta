/* P18: observation of the page's last fit; independent mvmeta R reference. */
(function (global) {
  'use strict';
  const app = 'multivariate-ma';
  const libraryImage = typeof document !== 'undefined' && document.currentScript ?
    new URL('../r-shiny/shinylive/webr/library.data.gz', document.currentScript.src).href : null;
  const inputs = () => ['f-data', 'f-o1', 'f-o2'].map(id => document.getElementById(id).value);
  let observed, fittedInputs;
  function observe() {
    const result = global._almLastMultivariate && global._almLastMultivariate();
    if (result !== observed) { observed = result; fittedInputs = inputs(); }
    return result;
  }
  function currentState() {
    const result = observe();
    if (!result) throw Error('Run the multivariate analysis first; no result is available.');
    if (JSON.stringify(inputs()) !== JSON.stringify(fittedInputs)) throw Error('Results are out of date; update the study input first.');
    // Same row acceptance grammar as index.html:104-118; parsing only, no fit.
    const rows = [];
    fittedInputs[0].split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const parts = t.split(/\s*,\s*/);
      if (parts.length < 6) return;
      const numbers = parts.slice(-5).map(x => x.trim() ? Number(x) : NaN);
      if (!numbers.every(Number.isFinite) || numbers[1] <= 0 || numbers[3] <= 0) return;
      rows.push(numbers);
    });
    if (rows.length !== result.k) throw Error('Input membership differs from the displayed result.');
    // P18 multivariate-ma-reproducible/bench/compare.py:67-69:
    // iterative 1e-6 relative, exact two-study 1e-9. Stricter than the
    // rounded rma.mv check in hub/shared/tests/multivariate-ma-parity.spec.mjs:29-36.
    adapter.compare.tolerance.default = result.k === 2 ? 1e-9 : 1e-6;
    return { rows, names: fittedInputs.slice(1), result: structuredClone(result) };
  }
  function appValues(s) {
    const r = s.result;
    return [
      ['k', 'Number of studies', r.k],
      ['mu1', s.names[0] + ' pooled estimate', r.mu[0]], ['mu2', s.names[1] + ' pooled estimate', r.mu[1]],
      ['se1', s.names[0] + ' standard error', r.muSE[0]], ['se2', s.names[1] + ' standard error', r.muSE[1]],
      ['variance1', s.names[0] + ' between-study variance', r.G[0][0]],
      ['variance2', s.names[1] + ' between-study variance', r.G[1][1]],
      ['covariance', 'Between-study covariance', r.G[0][1]],
      ['rho', 'Between-study correlation', r.rho], ['logLik', 'Restricted log likelihood', r.logLik]
    ].map(([key, label, value]) => ({ key, label, value }));
  }
  function buildScript(s) {
    return `# P18 primary oracle: mvmeta REML, unstructured between-study covariance.
# jsonlite is shipped in the same-origin webR library image, not its tarball
# manifest. Mount that existing image only in webR; desktop R uses its library.
if (grepl('emscripten', R.version$os) && !requireNamespace('jsonlite', quietly=TRUE)) {
  webr::mount('/tmp/alm-bundled-library', ${libraryImage ? JSON.stringify(libraryImage) : 'NULL'})
  .libPaths(c(.libPaths(), '/tmp/alm-bundled-library'))
}
stopifnot(requireNamespace('jsonlite', quietly=TRUE))
cat('SERIALIZER jsonlite', as.character(utils::packageVersion('jsonlite')), '\\n')
d <- matrix(c(${s.rows.flat().join(',')}), ncol=5, byrow=TRUE)
Y <- d[, c(1,3), drop=FALSE]; k <- nrow(Y)
S <- lapply(seq_len(k), function(i) matrix(c(d[i,2],d[i,5],d[i,5],d[i,4]),2,2))
stopifnot(k >= 2, all(vapply(S, function(x) min(eigen(x, symmetric=TRUE, only.values=TRUE)$values)>0, TRUE)))
# Independent starts and optimizer controls from P18 bench/reference.R:16-23.
start <- diag(pmax(apply(Y,2,var)-colMeans(t(vapply(S,diag,numeric(2)))),1e-4))
fits <- list()
for (g in list(NULL, start, start*.1, start*10)) {
  candidate <- tryCatch(mvmeta::mvmeta(Y~1, S=S, method='reml', bscov='unstr',
    control=list(maxiter=10000,reltol=1e-13,initPsi=g,optim=list(maxit=10000,reltol=1e-13))), error=function(e) NULL)
  if (!is.null(candidate) && isTRUE(candidate$converged)) fits[[length(fits)+1L]] <- candidate
}
if (!length(fits)) stop('mvmeta did not converge')
f <- fits[[which.max(vapply(fits, function(x) as.numeric(logLik(x)), 0))]]
mu <- as.numeric(coef(f)); CV <- vcov(f); G <- f$Psi
# mvmeta omits metafor's +.5 log|X'X| normalization: add log(k).
ll <- as.numeric(logLik(f)) + log(k)
Xlist <- rep(list(diag(2)),k); ylist <- lapply(seq_len(k),function(i)Y[i,])
nalist <- rep(list(c(FALSE,FALSE)),k)
reml_at <- function(g) get('remlprof.fn',asNamespace('mvmeta'))(
  numeric(),Xlist,ylist,S,nalist,2,k,1,2*k,'fixed',list(Psifix=g))
# P18 boundary adjudication uses the installed package GLS and likelihood.
zero <- matrix(0,2,2); f0 <- mvmeta::mvmeta(Y~1,S=S,method='fixed')
mu0 <- as.numeric(coef(f0)); C0 <- vcov(f0); W <- lapply(S,solve)
score <- Reduce('+',lapply(seq_len(k),function(i) {
  w<-W[[i]]; wr<-w%*%(Y[i,]-mu0); w-w%*%C0%*%w-tcrossprod(wr)
}))
boundary <- min(eigen(score,symmetric=TRUE)$values)>=0 &&
  reml_at(zero)>=as.numeric(logLik(f))-1e-12*max(1,abs(as.numeric(logLik(f))))
if (boundary) G <- zero
if (k==2) {
  delta <- Y[1,]-Y[2,]
  q <- as.numeric(crossprod(delta,solve(S[[1]]+S[[2]],delta)))
  G <- if(q>1) .5*(1-1/q)*tcrossprod(delta) else zero
}
if (boundary || k==2) {
  f <- mvmeta::mvmeta(Y~1,S=lapply(S,function(x)x+G),method='fixed')
  mu <- as.numeric(coef(f)); CV <- vcov(f); ll <- reml_at(G)+log(k)
}
se <- sqrt(diag(CV))
out <- list(k=k,mu1=mu[1],mu2=mu[2],se1=se[1],se2=se[2],
  variance1=G[1,1],variance2=G[2,2],covariance=G[1,2],
  rho=if(all(diag(G)>0)) G[1,2]/sqrt(prod(diag(G))) else NA_real_,logLik=ll)
cat('ALMJSON:',jsonlite::toJSON(out,digits=NA,auto_unbox=TRUE,na='null'),'\\n',sep='')
`;
  }
  // jsonlite remains a script dependency, supplied by the bundled image above.
  const adapter = { app, packages: ['mvmeta'], currentState, buildScript, appValues,
    compare: { tolerance: { default: 1e-6 }, kind: Object.fromEntries(['mu1','mu2','se1','se2','variance1','variance2','covariance','rho','logLik'].map(k => [k, 'rel']).concat([['k','exact']])) },
    rObjects: 'f, Y, S, G, mu, CV',
    plots: [{ id: 'joint', title: 'Joint outcome estimates', r: "plot(Y, xlab='Outcome 1', ylab='Outcome 2'); points(mu[1],mu[2],pch=18,col=2)" }] };
  global.AlmLiveAdapters = global.AlmLiveAdapters || {};
  global.AlmLiveAdapters[app] = adapter;
  if (typeof module !== 'undefined') module.exports = adapter;
  if (typeof document !== 'undefined') {
    observe();
    document.addEventListener('input', observe);
    new MutationObserver(observe).observe(document.getElementById('stats'), { childList: true, subtree: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
