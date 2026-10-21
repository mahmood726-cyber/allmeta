/* P15: CORR + CR2, checked separately against robumeta and clubSandwich. */
(function (global) {
  'use strict';
  const app = 'rve-meta';
  const centreBox = () => document.getElementById('f-centre');
  const inputs = () => ['src', 'f-rho', 'f-names'].map(id => document.getElementById(id).value).concat(centreBox() ? [centreBox().checked] : []);
  let observed, fittedInputs;
  function observe() {
    const result = global.__almLastRVE && global.__almLastRVE();
    if (result && result.fit !== observed) { observed = result.fit; fittedInputs = inputs(); }
    return result;
  }
  function currentState() {
    const result = observe();
    // The original page retains its accessor after a refused fit; the empty
    // coefficient table is therefore part of the result-availability check.
    if (!result || !document.querySelector('#coef-body tr')) throw Error('Run the RVE analysis first; no successful result is displayed.');
    if (JSON.stringify(inputs()) !== JSON.stringify(fittedInputs)) throw Error('Results are out of date; fit the RVE model first.');
    // The page's own parsed rows (header-mapped columns, vi from an SE column, quoted labels) before any
    // centring, as recorded in its result object; centring is redone in R from the same raw values.
    const inp = result.inputs;
    if (!inp || !Array.isArray(inp.rows)) throw Error('The displayed result does not record its inputs.');
    const rows = inp.rows.map(r => ({ cluster: String(r.cluster), yi: r.yi, vi: r.vi, X: [1, ...r.x] }));
    if (rows.length !== result.fit.k_total || rows.some(r => r.X.length !== result.fit.p)) throw Error('Input dimensions differ from the displayed fit.');
    const names = ['Intercept', ...(inp.predictor_names || []).map(String)];
    while (names.length < result.fit.p) names.push('Predictor ' + names.length);
    const state = { rows, names, rho: result.fit.rho, centred: !!inp.centred, result: structuredClone(result) };
    adapter.compare = { tolerance: { default: 1e-9 }, kind: {} };
    // P15 rve-reproducible/bench/compare_engine.py:6-13,35-40:
    // 1e-9 relative for estimate/SE/t/df/tau2, absolute for p and CI limits.
    // Stricter than hub/shared/tests/rve-meta-cr2-parity.spec.mjs:54-58.
    for (const v of appValues(state)) adapter.compare.kind[v.key] =
      ['k', 'clusters', 'coefficients'].includes(v.key) ? 'exact' :
        /\.(p|ci_lo|ci_hi)$/.test(v.key) ? 'abs' : 'rel';
    return state;
  }
  function appValues(s) {
    const f = s.result.fit;
    const values = [['k','Number of effects',f.k_total],['clusters','Number of clusters',f.m_clusters],
      ['coefficients','Number of coefficients',f.p],['tau2','Between-study variance',f.tau2]]
      .map(([key,label,value]) => ({key,label,value}));
    const labels = { estimate: 'Estimate', se: 'Robust standard error', t: 't statistic', df: 'Satterthwaite degrees of freedom',
      p: 'p-value', ci_lo: 'Lower confidence limit', ci_hi: 'Upper confidence limit' };
    s.result.summary.forEach((r,i) => {
      for (const key of Object.keys(labels)) values.push({key:`coef.${i}.${key}`,label:`${s.names[i]}: ${labels[key]}`,value:r[key]});
      for (const key of ['estimate','se','t','df','p']) values.push({key:`club.${i}.${key}`,label:`${s.names[i]}: ${labels[key]} (clubSandwich)`,value:r[key]});
    });
    return values;
  }
  function buildScript(s) {
    const vector = key => 'c(' + s.rows.map(r => JSON.stringify(r[key])).join(',') + ')';
    const predictors = s.rows[0].X.length - 1;
    return `# P15 reference recipe: robumeta CORR, small=TRUE; independent CR2 check.
d <- data.frame(yi=${vector('yi')}, vi=${vector('vi')}, cl=${vector('cluster')})
${Array.from({length: predictors}, (_,j) => `d$x${j+1} <- c(${s.rows.map(r => r.X[j+1]).join(',')})`).join('\n')}
${s.centred ? '# The app centred every predictor at its mean.\n' + Array.from({length: predictors}, (_,j) => `d$x${j+1} <- d$x${j+1} - mean(d$x${j+1})`).join('\n') + '\n' : ''}f <- robumeta::robu(yi ~ ${predictors ? Array.from({length: predictors},(_,j)=>'x'+(j+1)).join(' + ') : '1'},
  data=d, studynum=cl, var.eff.size=vi, modelweights='CORR', rho=${s.rho}, small=TRUE)
tab <- f$reg_table
cr2 <- as.data.frame(clubSandwich::coef_test(f, vcov='CR2', test='Satterthwaite'))
out <- list(k=nrow(d),clusters=length(unique(d$cl)),coefficients=nrow(tab),tau2=as.numeric(f$mod_info$tau.sq))
columns <- c(estimate='b.r',se='SE',t='t',df='dfs',p='prob',ci_lo='CI.L',ci_hi='CI.U')
club_columns <- c(estimate='beta',se='SE',t='tstat',df='df_Satt',p='p_Satt')
for (i in seq_len(nrow(tab))) {
  for (key in names(columns)) out[[paste('coef',i-1L,key,sep='.')]] <- tab[[columns[[key]]]][i]
  for (key in names(club_columns)) out[[paste('club',i-1L,key,sep='.')]] <- cr2[[club_columns[[key]]]][i]
}
cat('ALMJSON:',jsonlite::toJSON(out,digits=NA,auto_unbox=TRUE,na='null'),'\\n',sep='')
`;
  }
  const adapter = { app, packages: ['robumeta', 'clubSandwich', 'jsonlite'], currentState, buildScript, appValues,
    compare: { tolerance: { default: 1e-9 }, kind: {} }, rObjects: 'f, tab, cr2',
    plots: [{ id: 'coefficients', title: 'Robust coefficient intervals',
      r: "plot(tab$b.r,seq_len(nrow(tab)),xlim=range(c(tab$CI.L,tab$CI.U)),xlab='Estimate and 95% confidence interval',ylab='Coefficient'); segments(tab$CI.L,seq_len(nrow(tab)),tab$CI.U,seq_len(nrow(tab)))" }] };
  global.AlmLiveAdapters = global.AlmLiveAdapters || {};
  global.AlmLiveAdapters[app] = adapter;
  if (typeof module !== 'undefined') module.exports = adapter;
  if (typeof document !== 'undefined') {
    observe();
    document.addEventListener('click', observe);
    new MutationObserver(observe).observe(document.getElementById('coef-body'), { childList: true, subtree: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
