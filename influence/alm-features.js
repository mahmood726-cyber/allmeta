/* Shared features for paper 11. All statistics come from the page's last fit.
 * The existing live adapter leaves res (REML), inf (influence), loo, bj and fe in R.
 * Native input is unquoted effect, SE, label: refuse labels it cannot preserve.
 */
(function (global) {
  'use strict';
  // Number settings go into type=number inputs. A value must be a complete decimal number: Number() also reads
  // 0x10 / 0b1 / ' ', and the input then silently clears such text to '' (automatic or zero). Valid forms the input
  // itself cannot hold ('+1', ' 0.5', '5.') are written as the same number.
  var DECIMAL_SETTING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function decimalSetting(v) { return typeof v === 'string' && DECIMAL_SETTING.test(v.trim()) && Number.isFinite(Number(v)); }
  function axisBoundOk(v) { return v === '' || decimalSetting(v); }
  function writeNumberSetting(el, v) {
    var t = String(v).trim();
    el.value = t;
    if (el.value === '' && t !== '') el.value = String(Number(t));
  }
  var APP = 'influence';
  function byId(id) { return document.getElementById(id); }
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function nativeRows(src) {
    if (typeof src !== 'string' || src.length > 200000) throw new Error('Data text missing or too long.');
    if (typeof global.__almInfluenceParse !== 'function') throw new Error('The native input parser is unavailable.');
    var parsed = global.__almInfluenceParse(src);
    if (!parsed || !Array.isArray(parsed.rows) || !Array.isArray(parsed.errors)) throw new Error('Invalid native parser response.');
    if (parsed.errors.length) throw new Error('Input refused: ' + parsed.errors.map(function (e) {
      return 'line ' + e.line + ': ' + e.reason;
    }).join('; '));
    var rows = parsed.rows;
    if (rows.length < 3) throw new Error('Influence diagnostics require at least three studies.');
    return rows;
  }
  function apply(records) {
    if (!Array.isArray(records) || records.length < 3) throw new Error('Influence diagnostics require at least three studies.');
    var src = records.map(function (r, i) {
      if (!r || !finite(r.yi) || !finite(r.sei) || r.sei <= 0) throw new Error('Every row needs a finite effect and a positive SE.');
      if (typeof r.study !== 'string' || !r.study.trim() || /[,\r\n]/.test(r.study)) {
        throw new Error('Row ' + (i + 1) + ' (study ' + JSON.stringify(r.study) + '): study labels must be nonempty and contain no commas or line breaks in this app.');
      }
      return r.yi + ', ' + r.sei + ', ' + r.study.trim();
    }).join('\n');
    nativeRows(src);
    if (global.alm && global.alm.resetUndo && typeof global.alm.resetUndo.snapshot === 'function') global.alm.resetUndo.snapshot();
    byId('src').value = src;
    byId('src').dispatchEvent(new Event('input', { bubbles: true }));
    byId('btn-run').click();
    return { ok: true, n: records.length };
  }
  function results() {
    var f = global._almLastInfluence && global._almLastInfluence();
    var ds = global._almLastDiag && global._almLastDiag();
    var studies = global._almStudies && global._almStudies();
    if (!f || !ds || !studies || ds.length < 3 || ds.length !== studies.length) return null;
    // Refuse pending edits before AlmText.context can ask the live adapter for a revision.
    try { if (JSON.stringify(nativeRows(byId('src').value)) !== JSON.stringify(studies)) return null; }
    catch (e) { return null; }
    var r = { k: ds.length, mu: f.mu, seMu: f.seMu, tau2: f.tau2, Q: f.Q, df: f.df,
      ciLevel: 95, rows: [], flagged: ds.filter(function (d) { return d.influential; }).length };
    ds.forEach(function (d, i) {
      var prefix = 'study' + i + '_';
      r.rows.push(prefix);
      r[prefix + 'row'] = i + 1;
      ['te', 'resid', 'hat', 'cooksD', 'dffits', 'covRatio', 'loo_mu', 'loo_seMu'].forEach(function (key) { r[prefix + key] = d[key]; });
    });
    // TEST-ONLY HOOK: browser gates opt in explicitly; user pages ignore perturbations.
    var pt = document.documentElement.hasAttribute('data-alm-test') && global.__almTextPerturb;
    if (pt && finite(r[pt.key]) && finite(pt.delta)) r[pt.key] += pt.delta;
    return r;
  }
  function dom() {
    var out = {}, rows = Array.prototype.slice.call(document.querySelectorAll('#body tr'));
    var ds = global._almLastDiag && global._almLastDiag();
    if (!ds || rows.length !== ds.length + 1 || rows.some(function (row) { return row.cells.length !== 18; })) {
      throw new Error('The diagnostics table does not match the current analysis.');
    }
    function add(key, text, digits) { out[key] = { text: text.trim(), fmt: { kind: 'num', digits: digits } }; }
    function pair(prefix, cell, a, b) {
      var m = /^\s*([^()]+)\s*\(([^()]+)\)\s*$/.exec(cell.textContent);
      if (!m) throw new Error('The diagnostics table is missing a pooled estimate or standard error.');
      add(prefix + a, m[1], 3); add(prefix + b, m[2], 3);
    }
    var full = rows.pop();
    pair('', full.cells[10], 'mu', 'seMu');
    rows.forEach(function (row, i) {
      var prefix = 'study' + i + '_';
      [['te', 2], ['resid', 4], ['hat', 5], ['cooksD', 6], ['dffits', 7], ['covRatio', 9]].forEach(function (field) {
        add(prefix + field[0], row.cells[field[1]].textContent, field[0] === 'resid' ? 2 : 3);
      });
      pair(prefix, row.cells[10], 'loo_mu', 'loo_seMu');
    });
    return out;
  }
  var templates = {
    plain: function (T) {
      return ['This analysis checked how much each of ', T.int('k'), ' studies affected the combined result. The pooled effect was ',
        T.num('mu', 3), ' (standard error ', T.num('seMu', 3), ') on the supplied effect scale. ', T.int('flagged'),
        T.plural('flagged', ' study met', ' studies met'), ' at least one influence flag. These flags identify studies to investigate; they are not reasons to exclude a study automatically. ',
        'The analysis does not establish causation or clinical importance.'];
    },
    methods: function (T) {
      return ['An intercept-only inverse-variance random-effects meta-analysis used restricted maximum likelihood (REML) for the between-study variance. ',
        'Within-study variances were the squared supplied standard errors. Effects were analysed on the supplied scale without transformation or back-transformation; ratio effects must already be on a log scale. ',
        'Each leave-one-out analysis refitted the model and re-estimated the between-study variance. The forest plot uses ', T.pct('ciLevel', 0),
        ' normal Wald confidence limits: the leave-one-out mean plus or minus the standard normal critical value times its standard error, without Hartung–Knapp adjustment. ',
        'Pooled significance tests and I² are shown in the model summary; no prediction interval is computed by this app. ',
        'Deleted studentized residuals use the omitted study variance, deleted-fit between-study variance and deleted mean variance. Hat values are random-effects weights divided by their sum. ',
        'Cook’s distance is the squared change in the mean divided by the full-fit mean variance. DFFITS divides the change by the square root of the hat value times the sum of the omitted study variance and deleted-fit between-study variance. ',
        'The covariance ratio is the deleted mean variance divided by the full-fit mean variance. DFBETAS scales the change by the square root of the full-design weight sum evaluated at the deleted-fit between-study variance. ',
        'A study is flagged when absolute DFFITS exceeds three divided by the square root of the number of studies minus one, Cook’s distance exceeds the median chi-squared quantile with one degree of freedom, hat exceeds three divided by the number of studies, or absolute DFBETAS exceeds one. ',
        'The Baujat plot uses squared Pearson residuals from the REML fit and influence on the pooled estimate; the radial plot uses the fixed-effect slope and a plus-or-minus-two reference band. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T, r) {
      var parts = ['Across ', T.int('k'), ' studies, the full-sample pooled effect was ', T.num('mu', 3), ' (SE ', T.num('seMu', 3),
        '). Between-study variance τ² = ', T.num('tau2', 4), '; Cochran’s Q = ', T.num('Q', 2), ' (df = ', T.int('df'), '). ',
        T.int('flagged'), T.plural('flagged', ' study was', ' studies were'), ' flagged. Study rows below follow the order in the diagnostics table.'];
      r.rows.forEach(function (p) {
        parts.push(' Study row ', T.int(p + 'row'), ': effect ', T.num(p + 'te', 3), '; deleted residual ', T.num(p + 'resid', 2),
          '; hat ', T.num(p + 'hat', 3), '; Cook’s D ', T.num(p + 'cooksD', 3), '; DFFITS ', T.num(p + 'dffits', 3),
          '; covariance ratio ', T.num(p + 'covRatio', 3), '; leave-one-out pooled effect ', T.num(p + 'loo_mu', 3),
          ' (SE ', T.num(p + 'loo_seMu', 3), ').');
      });
      return parts;
    },
    flags: function (T, r) {
      var small = global.AlmText.cochrane.smallK(r.k);
      return [T.when(small.indexOf('fewK') >= T.R.none, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(small.indexOf('funnelK') >= T.R.none, 'Tests for small-study effects would be underpowered; this app does not perform them.'),
        'This report describes the full-sample fit. Additional diagnostics and exclusion refits are available in the diagnostics panel; no prediction interval is computed. Influence flags require investigation of study methods and data.'];
    }
  };
  var textSpec = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, domMin: 26, templates: templates };
  function axis(edge) { return document.querySelector('#alm-axis-mount [data-edge="' + edge + '"]'); }
  // Share state carries the axis minimum, maximum and log mounted by index.html axisControls. If page setup stopped
  // before the axis controls mounted (e.g. a script failed to load), refuse with an actionable message, changing nothing.
  function shareAxes() {
    if (!axis('min') || !axis('max') || !axis('log')) throw new Error('Axis controls did not load; reload the page.');
  }
  var spec = {
    paper: 11, title: 'Influence diagnostics',
    entry: { schema: 'generic', usedAs: 'effect and standard error on the supplied analysis scale; REML influence diagnostics', apply: apply },
    text: textSpec,
    verify: {
      adapter: function () { return (global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) || global.AlmValidate.adapters[APP]; },
      inputs: '#src', rObjects: 'res (REML fit), inf (influence diagnostics), loo, bj, fe (fixed-effect fit)',
      plots: [{ id: 'influence', title: 'Influence diagnostics (R panels; app Cook’s D versus hat)',
        r: 'plot(influence(res), plotdfbs = FALSE)', width_in: 8, height_in: 8,
        app: function () { return byId('influence-plot'); } }]
    },
    share: {
      get: function () { shareAxes(); return { src: byId('src').value, axis: { min: axis('min').value, max: axis('max').value, log: axis('log').checked } }; },
      set: function (s) {
        shareAxes();
        nativeRows(s && s.src);
        var a = s.axis;
        if (!a || a.log !== false || ['min', 'max'].some(function (k) {
          return !axisBoundOk(a[k]);
        }) || (a.min !== '' && a.max !== '' && Number(a.min) >= Number(a.max))) throw new Error('Invalid axis settings.');
        byId('src').value = s.src;
        ['min', 'max', 'log'].forEach(function (key) {
          var el = axis(key);
          if (key === 'log') el.checked = a.log; else writeNumberSetting(el, a[key]);
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        byId('src').dispatchEvent(new Event('input', { bubbles: true }));
        byId('btn-run').click();
      }
    }
  };
  global.AlmInfluenceFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures) {
    global.AlmFeatures.register(APP, spec);
    if (typeof global.AlmFeatures.registerModule === 'function') {
      global.AlmFeatures.registerModule('entry', { render: function (el, ctx) { return global.AlmEntryUI.mount(el, ctx.block); } });
      global.AlmFeatures.registerModule('text', { render: function (el, ctx) {
        var ui = global.AlmTextUI.mount(el, { app: ctx.app, text: ctx.block });
        var scope = document.createElement('p');
        scope.className = 'alm-influence-audit-scope';
        scope.textContent = 'Only values displayed in the diagnostics table are cross-checked against the page. Other reported values, including the between-study variance and heterogeneity statistic, are read from the app’s last results.';
        ui.root.appendChild(scope);
        return { onShow: function () { ui.regenerate(); } };
      } });
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
