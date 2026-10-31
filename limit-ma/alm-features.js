/* Shared features for paper 12. Reads _almLastLimit; never refits statistical formulas.
 * Live R adapter: validate/adapter.js. Its globals are m (meta::metagen),
 * l (metasens::limitmeta, beta0), te, se, out. funnel(l) dispatches to funnel.limitmeta.
 * Primary table uses three decimals throughout. Optional sensitivity fits are separate.
 */
(function (global) {
  'use strict';
  var APP = 'limit-ma';
  var OPTIONS = ['plus-alpha', 'plus-binary-measure', 'plus-binary-counts',
    'plus-limit-toggle', 'plus-fill-toggle', 'plus-reg-toggle', 'plus-contour-toggle'];
  function el(id) { return document.getElementById(id); }
  function axes() { return Array.from(document.querySelectorAll('#alm-axis-mount input[type=number]')); }
  // index.html axisControls mounts x and y, each with a minimum and maximum: share state carries exactly four bounds.
  // If page setup stopped before the axis controls mounted (e.g. a script failed to load), refuse instead of writing
  // a link set() rejects or skipping the axes on restore.
  var AXIS_BOUNDS = 4;
  function shareAxes() {
    var list = axes();
    if (list.length !== AXIS_BOUNDS) throw new Error('Axis controls did not load; reload the page.');
    return list;
  }

  function validateRows(rows) {
    if (!Array.isArray(rows) || rows.length < 3) throw new Error('At least three studies are required.');
    rows.forEach(function (r) {
      if (!r || !Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0) {
        throw new Error('Every row needs a finite effect and a positive standard error.');
      }
    });
    if (rows.every(function (r) { return r.sei === rows[0].sei; })) {
      throw new Error('Limit meta-analysis requires variation in study SEs.');
    }
  }
  function validateSource(src) {
    if (typeof src !== 'string' || !src.trim() || src.length > 200000) throw new Error('Missing or oversized study data.');
    var rows = global.AlmLimitEngine.parse(src).map(function (row) {
      return { yi: row.te, sei: row.se };
    });
    validateRows(rows);
  }
  function run() {
    el('btn-run').click();
    if (!global._almLastLimit()) throw new Error(el('limit-error').textContent || 'The app could not fit these studies.');
  }
  function apply(records) {
    validateRows(records);
    var lines = records.map(function (r) {
      var label = String(r.study || '').trim();
      // The app's CSV parser does not support quoted labels. Refuse rather than truncate them.
      if (/[\r\n,]/.test(label)) throw new Error('Study labels cannot contain commas or line breaks in this app.');
      return r.yi + ', ' + r.sei + (label ? ', ' + label : '');
    });
    var before = global.__almLimitValidationSnapshot(), plus = global.AlmLimitPlusUI.snapshot();
    var plusStatus = el('plus-status').textContent;
    try {
      el('src').value = lines.join('\n'); run();
      global.AlmLimitPlusUI.restore(null);
    } catch (e) {
      global.__almLimitValidationRestore(before); global.AlmLimitPlusUI.restore(plus);
      el('plus-status').textContent = plusStatus;
      throw e;
    }
    return { ok: true, n: records.length };
  }

  function results() {
    if (!global.__almLimitResultsCurrent()) return null;
    var last = typeof global._almLastLimit === 'function' && global._almLastLimit();
    if (!last) return null;
    var r = Object.assign({}, last);
    var p = global.__almTextPerturb;
    if (p && typeof r[p.key] === 'number' && Number.isFinite(p.delta)) r[p.key] += p.delta;
    return r;
  }
  function dom() {
    var out = {}, rows = document.querySelectorAll('#body tr');
    ['fe', 're', 'limit'].forEach(function (prefix, i) {
      if (!rows[i] || rows[i].cells.length !== 4) return;
      var cells = rows[i].cells, ci = cells[3].textContent.trim().slice(1, -1).split(',');
      ['est', 'se', 'ci_lo', 'ci_hi'].forEach(function (key, j) {
        out[prefix + '_' + key] = { text: [cells[1].textContent, cells[2].textContent, ci[0], ci[1]][j], fmt: { kind: 'num', digits: 3 } };
      });
    });
    return out;
  }
  var templates = {
    plain: function (T, r) {
      return ['This analysis combined ', T.int('k'), ' studies on the entered effect scale. The average effect from the random-effects model was ',
        T.num('re_est', 3), '. Extrapolation towards studies with no sampling error gave a limit estimate of ', T.num('limit_est', 3),
        ' (', T.rule('ciLevel'), ' confidence interval ', T.ci('limit_ci_lo', 'limit_ci_hi', 3), '). ',
        global.AlmText.cochrane.ciIncludesNull(r.limit_ci_lo, r.limit_ci_hi, T.R.none)
          ? 'The interval includes no effect: there is no evidence of a difference, which is not evidence of no difference. '
          : 'The interval excludes no effect on this analysis scale. ',
        'Differences between the estimates may reflect small-study effects; they do not establish publication bias, causation or clinical importance.'];
    },
    methods: function (T) {
      return ['Study effects and their standard errors were analysed on the entered scale, without transformation or continuity correction; ratio effects must already be entered on the log scale. ',
        'Fixed-effect inverse-variance and random-effects inverse-variance estimates were calculated, with non-negative DerSimonian–Laird between-study variance (', T.cite('dersimonianLaird'), '). ',
        'The tau-inflated standard error was the square root of the study variance plus tau-squared. The Rücker limit model used ordinary least squares radial regression of effect divided by the tau-inflated standard error on its reciprocal, including an intercept. ',
        'The adjusted estimate was the radial slope plus tau times the radial intercept (the beta-zero adjustment). ',
        'Its standard error was the square root of Var(slope) plus tau-squared times Var(intercept) plus twice tau times their covariance, using the closed-form inverse-variance design covariance without residual-scale inflation. ',
        'All pooled ', T.rule('ciLevel'), ' confidence intervals used the normal Wald formula, estimate plus or minus the normal critical value times its standard error, without Hartung–Knapp adjustment. ',
        'The primary analysis computes no p-values, I-squared statistic or prediction interval. ',
        'Cochran’s Q used fixed-effect weights; the small-study component was Q minus the raw-SE radial regression residual sum of squares. ',
        'The residual component was that residual sum of squares; G-squared was one minus the squared correlation from the shrunken-study radial regression, and was unavailable when its total sum of squares was zero. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T) {
      return ['There were ', T.int('k'), ' studies. Fixed effect: ', T.num('fe_est', 3), ' (SE ', T.num('fe_se', 3),
        '; ', T.rule('ciLevel'), ' CI ', T.ci('fe_ci_lo', 'fe_ci_hi', 3), '). Random effects (DL): ', T.num('re_est', 3),
        ' (SE ', T.num('re_se', 3), '; ', T.rule('ciLevel'), ' CI ', T.ci('re_ci_lo', 're_ci_hi', 3), '). Limit (Rücker): ',
        T.num('limit_est', 3), ' (SE ', T.num('limit_se', 3), '; ', T.rule('ciLevel'), ' CI ', T.ci('limit_ci_lo', 'limit_ci_hi', 3),
        '). Between-study variance tau-squared was ', T.num('tau2_dl', 4), '. No prediction interval was computed by the app.'];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.k < T.R.funnelK, 'With few studies, tests for small-study effects would be underpowered.'),
        T.when(global.AlmText.cochrane.imprecise(r.limit_ci_lo, r.limit_ci_hi, T.R.none),
          'The limit confidence interval includes no effect and effects in both directions; the estimate is imprecise.'),
        'This report covers the primary fixed-effect, random-effects and limit analysis. Optional bias sensitivity comparisons are reported separately on the page.'];
    }
  };
  var text = { app: APP, verifyPackage: 'metasens', results: results, dom: dom, templates: templates,
    stale: function () { return !global.__almLimitResultsCurrent(); } };

  // The archived adapter's currentState() deliberately reruns the page. The v2
  // host also calls it for report fingerprints and quantity counts, including
  // while LOO is yielding. Give those readers the completed primary fit instead.
  // Keep the pinned R script, packages and tolerances; this is only field mapping
  // from validate/adapter.js, with optional leave_one_out kept out of its schema.
  var PRIMARY = ['k', 'fe_est', 'fe_se', 'fe_ci_lo', 'fe_ci_hi', 're_est', 're_se',
    're_ci_lo', 're_ci_hi', 'tau2_dl', 'tau_dl', 'limit_est', 'limit_se',
    'limit_ci_lo', 'limit_ci_hi', 'slope', 'alpha_r', 'beta_r', 'Q', 'Q_small', 'Q_resid', 'G_squared'];
  var adapterSource, readAdapter;
  function featureAdapter() {
    var source = global.AlmLiveAdapters && global.AlmLiveAdapters[APP] || global.AlmLimitValidationAdapter;
    if (!source || !source.live) return source;
    if (source === adapterSource) return readAdapter;
    adapterSource = source;
    var live = Object.assign({}, source.live, { compare: Object.assign({}, source.live.compare) });
    live.currentState = function () {
      if (!global.__almLimitResultsCurrent()) throw new Error('Run analysis before checking the current inputs.');
      var rows = global.AlmLimitEngine.parse(el('src').value), r = global._almLastLimit();
      if (r.k !== rows.length || !Array.isArray(r.te_limit) || r.te_limit.length !== r.k) throw new Error('Invalid primary result dimensions.');
      var values = PRIMARY.map(function (key) {
        if (!Number.isFinite(r[key]) && !(key === 'G_squared' && r[key] === null)) throw new Error('Invalid primary quantity ' + key);
        return { key: key, label: key, value: r[key] };
      }).concat(r.te_limit.map(function (value, i) {
        if (!Number.isFinite(value)) throw new Error('Invalid shrunken study effect.');
        return { key: 'te_limit.' + i, label: 'te_limit.' + i, value: value };
      }));
      live.compare.kind = Object.fromEntries(values.map(function (v) { return [v.key, 'rel']; }));
      return { te: rows.map(function (r) { return r.te; }), se: rows.map(function (r) { return r.se; }), values: values,
        note: 'DL + beta0; all exported estimates, SEs, CIs, heterogeneity, Q decomposition and shrunken studies. Live meta 8.3-0 / metasens 1.5-3; paper meta 8.5-0 / metasens 1.5-3. R refusal is not a pass.' };
    };
    readAdapter = Object.assign({}, source, { live: live });
    return readAdapter;
  }

  // AlmEntry.convert steps also have flags[], which AlmText otherwise interprets
  // as a per-report provenance record, dropping the step's method and citation.
  // Adapt only this app's text context; keep the stored, replayable log intact.
  // Full provenance records retain flags and take precedence in AlmText.context.
  if (global.AlmText) {
    var sharedContext = global.AlmText.context;
    global.AlmText.context = function (app, textSpec) {
      var ctx = sharedContext(app, textSpec);
      if (app === APP) {
        ctx.entryLog = ctx.entryLog.map(function (step) {
          if (!step || typeof step !== 'object' || typeof step.method !== 'string' ||
              Array.isArray(step.conversions) || step.reference != null || step.location != null) return step;
          var copy = Object.assign({}, step);
          delete copy.flags;
          return copy;
        });
      }
      return ctx;
    };
  }

  function get() {
    var options = {};
    OPTIONS.forEach(function (id) { var n = el(id); options[id] = n.type === 'checkbox' ? n.checked : n.value; });
    return { src: el('src').value, options: options, axes: shareAxes().map(function (n) { return n.value; }),
      sensitivityRun: !!(global.AlmLimitPlusUI && global.AlmLimitPlusUI.snapshot()),
      entryLog: global.AlmFeaturesState.entryLog || [] };
  }
  function validateState(s) {
    if (!s || typeof s !== 'object') throw new Error('Invalid analysis state.');
    validateSource(s.src);
    if (!s.options || !Array.isArray(s.axes) || s.axes.length !== AXIS_BOUNDS || typeof s.sensitivityRun !== 'boolean' || !Array.isArray(s.entryLog)) throw new Error('Missing options.');
    OPTIONS.forEach(function (id) {
      if (typeof s.options[id] !== (el(id).type === 'checkbox' ? 'boolean' : 'string')) throw new Error('Invalid option: ' + id);
    });
    var alpha = Number(s.options['plus-alpha']);
    if (!(alpha >= .001 && alpha <= .999) || !['', 'OR', 'RR'].includes(s.options['plus-binary-measure']) || s.options['plus-binary-counts'].length > 200000) throw new Error('Invalid sensitivity options.');
    s.axes.forEach(function (v) { if (typeof v !== 'string' || (v !== '' && (!v.trim() || !Number.isFinite(Number(v))))) throw new Error('Invalid axis bound.'); });
    [0, 2].forEach(function (i) { if (s.axes[i] !== '' && s.axes[i + 1] !== '' && Number(s.axes[i]) >= Number(s.axes[i + 1])) throw new Error('Axis minimum must be below maximum.'); });
  }
  function write(s) {
    el('src').value = s.src;
    OPTIONS.forEach(function (id) { var n = el(id); if (n.type === 'checkbox') n.checked = s.options[id]; else n.value = s.options[id]; });
    // Reset the axis module's private ranges before installing a new interval.
    var controls = shareAxes();
    controls.forEach(function (n) { n.value = ''; n.dispatchEvent(new Event('change', { bubbles: true })); });
    controls.forEach(function (n, i) { n.value = s.axes[i]; n.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  function set(s) {
    validateState(s);
    var before = get(), main = global.__almLimitValidationSnapshot(), plus = global.AlmLimitPlusUI.snapshot();
    try {
      write(s); run();
      if (s.sensitivityRun) global.AlmLimitPlusUI.run(); else global.AlmLimitPlusUI.restore(null);
      global.AlmFeaturesState.entryLog = s.entryLog.slice();
    } catch (e) {
      write(before); global.__almLimitValidationRestore(main); global.AlmLimitPlusUI.restore(plus); throw e;
    }
  }

  var spec = {
    paper: 12, title: 'Limit meta-analysis',
    entry: { schema: 'generic', usedAs: 'effect on the entered analysis scale and its standard error', apply: apply },
    text: text,
    verify: {
      adapter: featureAdapter,
      inputs: '#src', rObjects: 'm (metagen), l (limitmeta), te, se, out',
      plots: [{ id: 'funnel', title: 'Limit funnel plot', r: 'meta::funnel(l)', width_in: 8, height_in: 6, app: function () { return el('plot'); } }]
    },
    share: { get: get, set: set }
  };
  global.AlmLimitFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = text;
  if (global.AlmFeatures) {
    global.AlmFeatures.register(APP, spec);
    // v2-core supplies lazy Data entry and Report text modules.
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
