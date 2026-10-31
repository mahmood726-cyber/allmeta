/* P19 current-result adapter: additive component NMA against netmeta::discomb(inactive = "control").
 * No fit is run by this module; it reads the page's displayed result (_almLastCnma) and the input it was fitted on. */
(function (global) {
  'use strict';
  const app = 'component-nma';
  const input = () => document.getElementById('src').value;
  let observed, fittedInput;
  function observe() {
    const result = global._almLastCnma && global._almLastCnma();
    if (result !== observed) { observed = result; fittedInput = input(); }
    return result;
  }
  function currentState() {
    const result = observe();
    // A refused fit clears the page's result (index.html clearResults), so a stale success cannot be read.
    if (!result) throw Error('Run the component analysis first; no result is available.');
    if (input() !== fittedInput) throw Error('Results are out of date; press Fit first.');
    const rows = global.parse(fittedInput);
    if (rows.some(r => r.A.includes('control') || r.B.includes('control'))) {
      throw Error('A component named control inside a combination cannot be translated to R: rename that component. Use control alone only for the empty reference.');
    }
    const state = { rows, result: structuredClone(result) };
    adapter.compare = { tolerance: { default: 1e-9, df: 0 }, kind: {} };
    // hub/shared/tests/component-nma-parity.spec.mjs (P19 validation archive): closed-form estimators
    // 1e-9 relative to max(1, |R|); the residual degrees of freedom must be equal (relative difference 0).
    for (const v of appValues(state)) adapter.compare.kind[v.key] = 'rel';
    return state;
  }
  function appValues(s) {
    const r = s.result, z = global.Z975;
    const values = [
      { key: 'tau2', label: 'Between-contrast variance (tau²; null when df = 0)', value: r.tau2 },
      { key: 'Q', label: 'Additive-model residual Q', value: r.Q },
      { key: 'df', label: 'Additive-model residual degrees of freedom', value: r.df }
    ];
    const labels = { est: 'estimate', se: 'standard error', lo: 'lower 95% limit', hi: 'upper 95% limit' };
    for (const group of ['components', 'combinations']) {
      Object.keys(r[group]).sort().forEach((name, i) => {
        const o = r[group][name];
        // Normal 95% limits from the displayed estimate and SE, exactly as the page computes its table.
        const q = { est: o.est, se: o.se, lo: o.est - z * o.se, hi: o.est + z * o.se };
        for (const key of Object.keys(labels)) values.push({ key: `${group}_${i}_${key}`,
          label: `${group === 'components' ? 'Component' : 'Intervention vs control'} ${name}: ${labels[key]}`, value: q[key] });
      });
    }
    return values;
  }
  function buildScript(s) {
    const v = f => 'c(' + s.rows.map(f).join(', ') + ')';
    // Each row is an independent two-arm contrast; an arm is its sorted component set, "control" when empty.
    const arm = a => JSON.stringify(a.length ? a.slice().sort().join('+') : 'control');
    const code = [
      '# P19 reference recipe: additive component NMA (Welton 2009), generalized DerSimonian-Laird random effects.',
      'library(netmeta)',
      'TE <- ' + v(r => r.te),
      'seTE <- ' + v(r => r.se),
      'treat1 <- ' + v(r => arm(r.A)),
      'treat2 <- ' + v(r => arm(r.B)),
      'dc <- netmeta::discomb(TE, seTE, treat1, treat2, studlab = seq_along(TE),',
      '  inactive = "control", sep.comps = "+", common = TRUE, random = TRUE, backtransf = FALSE)',
      '# tau2 is R\'s own value: NA (exported as null) when the additive model has zero residual df.',
      'z <- list(tau2 = dc$tau^2, Q = dc$Q.additive, df = dc$df.Q.additive)'
    ];
    for (const group of ['components', 'combinations']) {
      const field = group === 'components' ? 'Comp' : 'Comb', names = group === 'components' ? 'comps' : 'trts';
      Object.keys(s.result[group]).sort().forEach((name, i) => {
        for (const [q, prefix] of [['est', ''], ['se', 'se'], ['lo', 'lower.'], ['hi', 'upper.']]) {
          // Looked up by name; a name R does not report gives NA, which never matches an app value.
          code.push(`z[[${JSON.stringify(group + '_' + i + '_' + q)}]] <- unname(dc$${prefix}${field}.random[match(${JSON.stringify(name)}, dc$${names})])`);
        }
      });
    }
    code.push('cat("ALMJSON:{", paste(sprintf(\'"%s":%s\', names(z), vapply(z, function(x) if (length(x) != 1L || is.na(x)) "null" else sprintf("%.17g", x), "")), collapse = ","), "}\\n", sep = "")');
    return code.join('\n') + '\n';
  }
  const adapter = { app, packages: ['netmeta'], currentState, buildScript, appValues,
    compare: { tolerance: { default: 1e-9, df: 0 }, kind: {} }, rObjects: 'dc (additive discomb/netcomb fit)',
    plots: [{ id: 'forest', title: 'Additive intervention forest plot',
      r: 'forest(dc, pooled = "random", reference.group = "control", backtransf = FALSE)' }] };
  global.AlmLiveAdapters = global.AlmLiveAdapters || {};
  global.AlmLiveAdapters[app] = adapter;
  if (typeof module !== 'undefined') module.exports = adapter;
  if (typeof document !== 'undefined') {
    observe();
    document.addEventListener('click', observe);
    new MutationObserver(observe).observe(document.getElementById('comp-body'), { childList: true, subtree: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
