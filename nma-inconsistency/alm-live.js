/* P16 current-result adapter. No fit is run by this module. */
(function (global) {
  'use strict';
  const app = 'nma-inconsistency';
  const libraryImage = typeof document !== 'undefined' && document.currentScript ?
    new URL('../r-shiny/shinylive/webr/library.data.gz', document.currentScript.src).href : null;
  const inputs = () => ['src', 'f-model'].map(id => document.getElementById(id).value);
  let observed, fittedInputs;
  function observe() {
    const result = global._almLastInco && global._almLastInco();
    if (result !== observed) { observed = result; fittedInputs = inputs(); }
    return result;
  }
  function currentState() {
    const result = observe();
    if (!result || result.status === 'refused') throw Error(result?.reason || 'Run the network analysis first; no result is available.');
    if (JSON.stringify(inputs()) !== JSON.stringify(fittedInputs)) throw Error('Results are out of date; run tests first.');
    const rows = global.parse(fittedInputs[0]);
    const reason = global.inputIssue(rows);
    if (reason) throw Error(reason);
    if (!['FE', 'DL', 'PM'].includes(result.model)) throw Error('Unsupported network model.');
    const state = { rows, result: structuredClone(result), inputs: fittedInputs.slice() };
    adapter.compare = { tolerance: { default: 1e-9 }, kind: {} };
    // nma-inconsistency/validate/adapter.js:120-122 and validate/README.md:11.
    // P-values stay absolute 1e-9 even for PM. Degrees of freedom are exact.
    for (const v of appValues(state)) {
      adapter.compare.kind[v.key] = v.key === 'dbt.df' ? 'exact' : v.key.endsWith('.p') ? 'abs' : 'rel';
      if (result.model === 'PM' && !v.key.endsWith('.p') && v.key !== 'dbt.df') adapter.compare.tolerance[v.key] = 1e-6;
    }
    return state;
  }
  function appValues(s) {
    const r = s.result;
    const values = [
      { key: 'tau2', label: 'Between-study variance', value: r.tau2 },
      { key: 'dbt.Q', label: 'Global inconsistency statistic', value: r.dbt.Q },
      { key: 'dbt.df', label: 'Global degrees of freedom', value: r.dbt.df },
      { key: 'dbt.p', label: 'Global inconsistency p-value', value: r.dbt.p }
    ];
    r.nodeSplit.forEach((x, i) => {
      for (const [field, label, value] of [
        ['direct', 'Direct estimate', x.direct.mean], ['directSE', 'Direct standard error', x.direct.se],
        ['indirect', 'Indirect estimate', x.indirect.mean], ['indirectSE', 'Indirect standard error', x.indirect.se],
        ['difference', 'Direct minus indirect estimate', x.diff], ['differenceSE', 'Difference standard error', x.seDiff],
        ['z', 'Inconsistency z statistic', x.z], ['p', 'Inconsistency p-value', x.p]
      ]) values.push({ key: `split.${i}.${field}`, label: `${x.comparison}: ${label}`, value });
    });
    return values;
  }
  function buildScript(s) {
    const vector = key => 'c(' + s.rows.map(r => JSON.stringify(r[key])).join(',') + ')';
    const tr = 'c(' + s.result.trts.map(t => JSON.stringify(t)).join(',') + ')';
    return `# P16: independent two-arm contrasts; signed back-calculation splits.
# jsonlite is shipped in the same-origin webR library image, not its tarball
# manifest. Mount that existing image only in webR; desktop R uses its library.
if (grepl('emscripten', R.version$os) && !requireNamespace('jsonlite', quietly=TRUE)) {
  webr::mount('/tmp/alm-bundled-library', ${libraryImage ? JSON.stringify(libraryImage) : 'NULL'})
  .libPaths(c(.libPaths(), '/tmp/alm-bundled-library'))
}
stopifnot(requireNamespace('jsonlite', quietly=TRUE))
cat('SERIALIZER jsonlite', as.character(utils::packageVersion('jsonlite')), '\\n')
# PM uses the archived uncentred metafor QE equation, not centred rma(PM).
A <- ${vector('A')}; B <- ${vector('B')}
te <- ${vector('te')}; se <- ${vector('se')}; study <- ${vector('study')}
tr <- ${tr}; model <- ${JSON.stringify(s.result.model)}
tau <- 0
if (model == 'PM') {
  X <- as.matrix(sapply(tr[-1], function(t) as.numeric(A == t) - as.numeric(B == t)))
  if (length(te) > ncol(X)) {
    qe <- get('.QE.func', asNamespace('metafor'))
    objective <- function(t2) qe(t2, Y=as.matrix(te), vi=se^2, X=X, k=length(te), objective=length(te)-ncol(X))
    if (objective(0) > 0) {
      upper <- max(1, var(te))
      while (objective(upper) > 0) upper <- upper * 2
      tau <- sqrt(uniroot(objective, c(0, upper), tol=.Machine$double.eps^0.75, maxiter=1000)$root)
    }
  }
}
sep <- ' ~~ '
while (any(grepl(sep, tr, fixed=TRUE))) sep <- paste0(sep, '~')
m <- netmeta::netmeta(TE=te, seTE=se, treat1=A, treat2=B, studlab=study,
  sm='MD', reference.group=tr[1], common=TRUE, random=TRUE, method.tau='DL',
  tau.preset=if (model == 'DL') NULL else tau, sep.trts=sep, warn=FALSE)
tau <- if (model == 'FE') 0 else m$tau
spl <- netmeta::netsplit(m, method='Back-calculation', tol.direct=0)
suffix <- if (model == 'FE') 'common' else 'random'
direct <- spl[[paste0('direct.', suffix)]]
indirect <- spl[[paste0('indirect.', suffix)]]
cmp <- spl[[paste0('compare.', suffix)]]
# The global random-effects test uses the SAME consistency-model tau.
dec <- netmeta::decomp.design(m, tau.preset=tau, warn=FALSE)
q <- if (model == 'FE') dec$Q.decomp else dec$Q.inc.random.preset
g <- list(Q=0, df=0, p=NA_real_)
if (!is.null(q)) {
  j <- match('Between designs', rownames(q))
  g <- list(Q=q$Q[j], df=q$df[j], p=q$pval[j])
  if (g$df == 0) { g$Q <- 0; g$p <- NA_real_ }
}
out <- list(tau2=tau^2, dbt.Q=g$Q, dbt.df=g$df, dbt.p=g$p)
path <- function(a,b) {
  keep <- !((A==a & B==b) | (A==b & B==a)); reach <- a
  repeat {
    nextset <- unique(c(reach, B[keep & A %in% reach], A[keep & B %in% reach]))
    if (length(nextset) == length(reach)) break
    reach <- nextset
  }
  b %in% reach
}
splits <- list()
for (j in seq_len(nrow(cmp))) {
  pair <- strsplit(cmp$comparison[j], sep, fixed=TRUE)[[1]]
  ord <- pair[order(match(pair, tr))]
  sign <- if (pair[1] == ord[1]) 1 else -1
  if (!is.finite(direct$TE[j]) || !path(ord[1], ord[2])) next
  name <- paste(ord, collapse=' vs ')
  splits[[name]] <- list(direct=sign*direct$TE[j], directSE=direct$seTE[j],
    indirect=sign*indirect$TE[j], indirectSE=indirect$seTE[j],
    difference=sign*cmp$TE[j], differenceSE=cmp$seTE[j], z=sign*cmp$statistic[j], p=cmp$p[j])
}
# App ordering is only an output mapping; R independently checks membership.
order_app <- ${s.result.nodeSplit.length ? 'c(' + s.result.nodeSplit.map(x => JSON.stringify(x.comparison)).join(',') + ')' : 'character(0)'}
stopifnot(setequal(order_app, names(splits)), !anyDuplicated(order_app))
for (i in seq_along(order_app)) for (key in names(splits[[order_app[i]]]))
  out[[paste('split', i-1L, key, sep='.')]] <- splits[[order_app[i]]][[key]]
cat('ALMJSON:', jsonlite::toJSON(out, digits=NA, auto_unbox=TRUE, na='null'), '\\n', sep='')
`;
  }
  // packages lists archives for AlmWebR's pinned installer. jsonlite is supplied
  // separately by the bundled image above; it remains required by the script.
  const adapter = { app, packages: ['netmeta', 'metafor'], currentState, buildScript, appValues,
    compare: { tolerance: { default: 1e-9 }, kind: {} }, rObjects: 'm, spl, dec',
    plots: [{ id: 'split', title: 'Direct and indirect evidence', r: 'netmeta::forest(spl)' }] };
  global.AlmLiveAdapters = global.AlmLiveAdapters || {};
  global.AlmLiveAdapters[app] = adapter;
  if (typeof module !== 'undefined') module.exports = adapter;
  if (typeof document !== 'undefined') {
    observe();
    document.addEventListener('click', observe);
    new MutationObserver(observe).observe(document.getElementById('dbt'), { childList: true, subtree: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
