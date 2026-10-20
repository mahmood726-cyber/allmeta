/* Component NMA feature adapter. The app remains the sole analysis engine.
 * Text reads estimates/SEs from _almLastCnma and the displayed CI endpoints
 * (the app does not expose unrounded endpoints). No prediction interval exists.
 * R objects: dc, an additive discomb/netcomb fit, used by forest.netcomb.
 */
(function (global) {
  'use strict';
  var APP = 'component-nma';
  function input() { return document.getElementById('src'); }
  function last() { return global._almLastCnma && global._almLastCnma(); }
  function validateSource(src) {
    if (typeof src !== 'string' || src.length > 200000) throw new Error('Data text missing or too long.');
    var rows = global.parse(src);
    if (rows.length < 2) throw new Error('At least two independent contrasts are required.');
    // Preflight with the app's own parser and fit, without changing inputs/results.
    global.fit(rows);
    return rows;
  }
  function load(src) {
    validateSource(src);
    global.__almCnmaLoad(src);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  }
  function apply(records) {
    if (!Array.isArray(records) || records.length < 2) throw new Error('At least two independent contrasts are required.');
    var studies = new Set();
    var src = records.map(function (r) {
      if (!r || !Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0) throw new Error('Each contrast needs a finite effect and positive SE.');
      if (typeof r.study !== 'string' || !r.study.trim() || studies.has(r.study.trim().toLowerCase())) {
        throw new Error('Use distinct study labels for independent two-arm contrasts; repeated studies require covariance.');
      }
      studies.add(r.study.trim().toLowerCase());
      [r.t1, r.t2].forEach(function (arm) {
        if (typeof arm !== 'string' || !arm.trim() || /[|\r\n]/.test(arm)) throw new Error('Each arm needs component labels separated by +.');
      });
      return [r.t1, r.t2, r.yi, r.sei].join(' | ');
    }).join('\n');
    load(src);
    return { ok: !!last(), n: records.length };
  }

  function tableRows(id, prefix, r, dom) {
    Array.from(document.querySelectorAll('#' + id + ' tr')).forEach(function (row, i) {
      var key = prefix + i, cells = row.cells;
      var name = cells[0].textContent;
      var o = (prefix === 'c' ? last().components : last().combinations)[name];
      if (!o) throw new Error('Result table does not match the fitted analysis.');
      var ci = cells[cells.length - 1].textContent.match(/^\[([^,]+),\s*([^\]]+)\]$/);
      if (!ci) throw new Error('Confidence interval is unavailable.');
      r[key + '_name'] = name;
      r[key + '_number'] = i + 1;
      // Match the app's signed-zero display convention without refitting.
      r[key + '_est'] = Math.abs(o.est) < 1e-12 ? 0 : o.est;
      r[key + '_se'] = o.se;
      r[key + '_lo'] = Number(ci[1]);
      r[key + '_hi'] = Number(ci[2]);
      dom[key + '_est'] = { text: cells[1].textContent, fmt: { kind: 'num', digits: 3 } };
      dom[key + '_lo'] = { text: ci[1], fmt: { kind: 'num', digits: 3 } };
      dom[key + '_hi'] = { text: ci[2], fmt: { kind: 'num', digits: 3 } };
      if (prefix === 'c') dom[key + '_se'] = { text: cells[2].textContent, fmt: { kind: 'num', digits: 3 } };
      r[prefix + 'Keys'].push(key);
    });
  }
  function readText() {
    var o = last();
    if (!o) return null;
    var r = { k: o.df + o.comps.length, p: o.comps.length, tau2: o.tau2, Q: o.Q, df: o.df,
      ciLevel: 95, nullEffect: 0, cKeys: [], iKeys: [] }, dom = {};
    tableRows('comp-body', 'c', r, dom);
    tableRows('int-body', 'i', r, dom);
    return { r: r, dom: dom };
  }
  function results() {
    var data = readText();
    if (!data) return null;
    var r = data.r, pt = global.__almTextPerturb;
    var state = global.AlmFeaturesState || {}, steps = state.entryLog || [];
    r.hasProvenance = Array.isArray(state.provenance) && state.provenance.length > 0;
    r.entryCI = steps.filter(function (s) { return s.method === 'SE from CI'; }).length;
    r.entryP = steps.filter(function (s) { return s.method === 'SE from p'; }).length;
    r.entryMidpoint = steps.filter(function (s) { return s.method === 'CI midpoint'; }).length;
    if (pt && typeof r[pt.key] === 'number' && Number.isFinite(pt.delta)) r[pt.key] += pt.delta;
    return r;
  }
  // Numeric treatment labels are referred to by their table row so label digits
  // cannot be mistaken for untracked statistical results by the number audit.
  function label(T, r, key) {
    return /\d/.test(r[key + '_name']) ? ['table row ', T.int(key + '_number')] : r[key + '_name'];
  }
  var templates = {
    plain: function (T, r) {
      return ['This analysis combined ', T.int('k'), ' independent contrasts to estimate ', T.int('p'),
        ' component effects. The model assumes that component effects add together on the supplied outcome scale. ',
        r.cKeys.map(function (key) {
          return [label(T, r, key), ': ', global.AlmText.cochrane.differencePhrase(r[key + '_lo'], r[key + '_hi'], r.nullEffect), '. '];
        }), 'The direction and clinical importance depend on the outcome and scale supplied; this analysis does not establish causation.'];
    },
    methods: function (T, r) {
      return ['Independent contrast effects were fitted by inverse-variance weighted least squares under an additive component model. ',
        'The design subtracts the components in intervention B from those in intervention A; control denotes the empty component set. ',
        'Component labels are case-insensitive. Effects and SEs are used on the supplied scale without transformation or back-transformation. ',
        'The generalized DerSimonian–Laird moment estimator uses the common-effect residual Q and residual degrees of freedom, ',
        'with denominator equal to the sum of weights minus the trace of the common-effect covariance times the design cross-product weighted by squared inverse sampling variances. ',
        'The between-contrast variance is truncated at zero; a numerically nonpositive denominator also gives zero. ',
        'Random-effects weights are the inverse of sampling variance plus between-contrast variance. ',
        'With zero residual degrees of freedom, heterogeneity is not estimable and sampling variances alone are used. ',
        'Normal Wald ', T.pct('ciLevel', 0), ' confidence intervals use the estimate plus or minus the standard normal critical value times its SE. ',
        'Combination effects sum the component estimates, and their variances include all component covariances. ',
        'No hypothesis tests, prediction intervals, automatic interactions or multi-arm covariance correction are computed. ',
        'Only independent two-arm contrasts are supported. ', T.software(), ' ',
        T.when(r.hasProvenance, function () { return T.entry(); }),
        T.when(!r.hasProvenance && r.entryCI > T.R.none, function () {
          return ['SEs were derived from confidence intervals for ', T.int('entryCI'), ' contrasts (', T.cite('handbookSE'), '). '];
        }),
        T.when(!r.hasProvenance && r.entryP > T.R.none, function () {
          return ['SEs were derived from exact P values for ', T.int('entryP'), ' contrasts (', T.cite('handbookSE'), '). '];
        }),
        T.when(!r.hasProvenance && r.entryMidpoint > T.R.none, function () {
          return ['Estimates were taken as interval midpoints on the analysis scale for ', T.int('entryMidpoint'), ' contrasts. '];
        }), ' ',
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return T.verify(); })];
    },
    results: function (T, r) {
      return ['The additive model included ', T.int('k'), ' contrasts and ', T.int('p'), ' components. Component effects: ',
        r.cKeys.map(function (key) {
          return [label(T, r, key), ' = ', T.num(key + '_est', 3), ' (SE ', T.num(key + '_se', 3), '; ', T.pct('ciLevel', 0),
            ' CI ', T.ci(key + '_lo', key + '_hi', 3), '). '];
        }), 'Implied intervention effects versus control: ', r.iKeys.map(function (key) {
          return [label(T, r, key), ' = ', T.num(key + '_est', 3), ' (', T.pct('ciLevel', 0), ' CI ', T.ci(key + '_lo', key + '_hi', 3), '). '];
        }), 'Common-effect residual Q = ', T.num('Q', 3), ' (df = ', T.int('df'), '). ',
        T.has('tau2') ? ['Between-contrast variance τ² = ', T.num('tau2', 3), '.'] : 'Between-contrast variance is not estimable.'];
    }
  };

  function currentState() {
    var src = input().value, rows = validateSource(src);
    document.getElementById('btn-run').click();
    if (!last()) throw new Error('Run a valid analysis first.');
    appValues({ result: last() }).forEach(function (v) { live.compare.kind[v.key] = 'rel'; });
    return { src: src, rows: rows, result: last() };
  }
  function appValues(s) {
    var out = ['tau2', 'Q', 'df'].map(function (key) { return { key: key, label: key, value: s.result[key] }; });
    ['components', 'combinations'].forEach(function (group) {
      Object.keys(s.result[group]).sort().forEach(function (name, i) {
        ['est', 'se'].forEach(function (q) {
          out.push({ key: group + '_' + i + '_' + q, label: group + ': ' + name + ' ' + q, value: s.result[group][name][q] });
        });
      });
    });
    return out;
  }
  function buildScript(s) {
    var v = function (f) { return 'c(' + s.rows.map(f).join(', ') + ')'; };
    var arm = function (a) { return JSON.stringify(a.length ? a.slice().sort().join('+') : 'control'); };
    var code = [
      'library(netmeta)',
      'TE <- ' + v(function (r) { return r.te; }),
      'seTE <- ' + v(function (r) { return r.se; }),
      'treat1 <- ' + v(function (r) { return arm(r.A); }),
      'treat2 <- ' + v(function (r) { return arm(r.B); }),
      'dc <- netmeta::discomb(TE, seTE, treat1, treat2, studlab = seq_along(TE),',
      '  inactive = "control", sep.comps = "+", common = TRUE, random = TRUE, backtransf = FALSE)',
      'z <- list(tau2 = if (dc$df.Q.additive == 0) NA_real_ else dc$tau^2, Q = dc$Q.additive, df = dc$df.Q.additive)'
    ];
    ['components', 'combinations'].forEach(function (group) {
      var field = group === 'components' ? 'Comp' : 'Comb';
      Object.keys(s.result[group]).sort().forEach(function (name, i) {
        ['est', 'se'].forEach(function (q) {
          var target = (q === 'se' ? 'se' : '') + field;
          code.push('z[[' + JSON.stringify(group + '_' + i + '_' + q) + ']] <- unname(dc$' + target + '.random[match(' + JSON.stringify(name) + ', dc$' + (group === 'components' ? 'comps' : 'trts') + ')])');
        });
      });
    });
    code.push('cat("ALMJSON:{", paste(sprintf(\'"%s":%s\', names(z), vapply(z, function(x) if(length(x) != 1L || is.na(x)) "null" else sprintf("%.17g", x), "")), collapse=","), "}\\n", sep="")');
    return code.join('\n');
  }
  var live = { packages: ['netmeta'], currentState: currentState, buildScript: buildScript, appValues: appValues,
    compare: { tolerance: { default: 1e-9, df: 0 }, kind: {} } };
  function adapter() {
    if (global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) return global.AlmLiveAdapters[APP];
    // All closed-form quantities use the existing component parity tolerance.
    var s = last();
    if (s) appValues({ result: s }).forEach(function (v) { live.compare.kind[v.key] = 'rel'; });
    return live;
  }
  var spec = { paper: 19, title: 'Component network meta-analysis',
    entry: { schema: 'contrast-nma', extras: [], apply: apply },
    text: { results: results, dom: function () { var d = readText(); return d && d.dom; }, templates: templates, verifyPackage: 'netmeta' },
    verify: { adapter: adapter, inputs: '#src', rObjects: 'dc (additive discomb/netcomb fit)',
      plots: [{ id: 'forest', title: 'Additive intervention forest plot', r: 'forest(dc, pooled = "random", reference.group = "control", backtransf = FALSE)',
        app: function () { return document.getElementById('forest'); }, width_in: 8, height_in: 6 }] },
    share: { get: function () { return { src: input().value, entryLog: (global.AlmFeaturesState || {}).entryLog || [] }; }, set: function (s) {
      if (!s || typeof s !== 'object') throw new Error('Missing analysis state.');
      if (s.entryLog !== undefined && !Array.isArray(s.entryLog)) throw new Error('Invalid conversion log.');
      load(s.src);
      if (global.AlmFeaturesState) global.AlmFeaturesState.entryLog = s.entryLog || [];
    } }
  };
  global.AlmComponentFeatures = spec;
  if (global.AlmFeatures) {
    global.AlmFeatures.register(APP, spec);
  }
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') {
    global.AlmFeatures.registerModule('text', { label: 'Report text', render: function (panel, ctx) {
      var ui = global.AlmTextUI.mount(panel, { app: APP, text: ctx.block });
      return { onShow: function () { ui.regenerate(); } };
    } });
    global.AlmFeatures.registerModule('entry', { label: 'Data entry', render: function (panel, ctx) {
      var note = document.createElement('p');
      note.textContent = 'Use study, t1, t2, effect and SE columns. Each row must be an independent two-arm contrast. Separate components with +; use control for the empty reference. Effects must share the same analysis scale.';
      panel.appendChild(note);
      return global.AlmEntryUI.mount(panel, ctx.block);
    } });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
