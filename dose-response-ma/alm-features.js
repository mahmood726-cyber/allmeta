/* Shared features for paper 2. The fit and live R adapter remain owned by the app.
 * Report values are read from _almLastDoseResponse and the rendered result tables.
 * In particular, SEs, z tests, transformed intervals and significant-digit strings
 * already calculated by render() are read from the DOM, never recalculated here.
 * R plot objects: d, f, b, V, basis() from validate/adapter.js buildScript().
 */
(function (global) {
  'use strict';
  var APP = 'dose-response-ma';
  var IDS = ['f-data', 'f-shape', 'f-knots', 'f-cov', 'f-proc', 'f-method',
    'f-mod', 'f-xref', 'f-modval', 'f-pdoses'];
  var CHOICES = {
    'f-shape': ['linear', 'quadratic', 'spline3', 'spline4', 'spline5', 'splinec'],
    'f-cov': ['gl', 'h', 'indep'], 'f-proc': ['2stage', '1stage'],
    'f-method': ['REML', 'ML', 'MM', 'FE', 'PM', 'DL']
  };
  function byId(id) { return document.getElementById(id); }
  function getState() {
    var s = {};
    IDS.forEach(function (id) { s[id] = id === 'f-mod' ? byId(id).checked : byId(id).value; });
    return s;
  }
  function validateState(s) {
    if (!s || typeof s !== 'object') throw new Error('Missing analysis state');
    IDS.forEach(function (id) {
      if (id === 'f-mod') {
        if (typeof s[id] !== 'boolean') throw new Error('Invalid moderator option');
      } else if (typeof s[id] !== 'string' || s[id].length > 200000) {
        throw new Error('Missing or invalid input: ' + id);
      }
      if (CHOICES[id] && CHOICES[id].indexOf(s[id]) < 0) throw new Error('Unknown option: ' + id);
    });
    if (s['f-proc'] === '1stage' && (s['f-mod'] || s['f-method'] === 'MM')) throw new Error('Incompatible one-stage options');
    if (['PM', 'DL'].indexOf(s['f-method']) >= 0 &&
        (s['f-shape'] !== 'linear' || s['f-proc'] !== '2stage' || s['f-cov'] !== 'gl' || s['f-mod'])) {
      throw new Error('Incompatible pooling options');
    }
    if (s.entryLog !== undefined && !Array.isArray(s.entryLog)) throw new Error('Invalid conversion log');
  }
  function writeState(s) {
    IDS.forEach(function (id) { if (id === 'f-mod') byId(id).checked = s[id]; else byId(id).value = s[id]; });
    byId('btn-run').click();
  }
  function setState(s) {
    validateState(s);
    var before = getState();
    writeState(s);
    if (!global._almLastDoseResponse()) {
      writeState(before);
      throw new Error('The shared data cannot be fitted with these options; nothing was changed');
    }
    if (global.AlmFeaturesState) global.AlmFeaturesState.entryLog = JSON.parse(JSON.stringify(s.entryLog || []));
  }
  function apply(records) {
    if (!Array.isArray(records) || !records.length) throw new Error('No dose rows supplied');
    var groups = Object.create(null);
    var lines = records.map(function (r) {
      var study = String(r.study == null ? '' : r.study).trim();
      if (!study || /[,\r\n]/.test(study) || study.charAt(0) === '#') throw new Error('Study labels must not contain commas or line breaks, or start with #');
      ['dose', 'cases', 'n', 'yi'].forEach(function (key) {
        if (!Number.isFinite(r[key])) throw new Error(study + ': ' + key + ' must be numeric');
      });
      if (r.n <= 0 || r.cases < 0 || r.cases > r.n) throw new Error(study + ': cases must be between zero and n');
      if (['cc', 'ci'].indexOf(r.type) < 0) throw new Error('Supply type cc or ci explicitly. Incidence-rate data should use the main input (n is person-time).');
      // Explicit SE=0 is the table-entry reference marker, not a precision estimate.
      var reference = r.sei == null || r.sei === '' || r.sei === 0;
      if (reference && r.yi !== 0) throw new Error(study + ': a reference row must have log RR zero');
      if (!reference && (!Number.isFinite(r.sei) || r.sei <= 0)) throw new Error(study + ': SE must be positive');
      var g = groups[study] || (groups[study] = { refs: 0, other: 0, type: r.type, doses: new Set() });
      if (g.type !== r.type || g.doses.has(r.dose)) throw new Error(study + ': inconsistent type or duplicate dose');
      g.doses.add(r.dose); if (reference) g.refs++; else g.other++;
      var cov = r.covariate == null ? '' : String(r.covariate).trim();
      // Same strict token rule as the page's row checker: Number() would read 0x10 as 16 and accept 0b1/0o7.
      if (cov) global._almDoseNumber(cov, study + ': covariate');
      var label = study.indexOf('"') >= 0 ? '"' + study.replace(/"/g, '""') + '"' : study;
      return [label, r.dose, r.cases, r.n, r.yi, reference ? '' : r.sei, r.type, cov].join(', ');
    });
    var labels = Object.keys(groups);
    if (labels.length < 2 || labels.some(function (id) { return groups[id].refs !== 1 || !groups[id].other; })) {
      throw new Error('Supply at least two studies, each with exactly one reference row and non-reference doses');
    }
    var state = getState();
    state['f-data'] = '# study, dose, cases, n, logRR, SE, type, covariate\n' + lines.join('\n');
    setState(state);
    if (global.AlmFeaturesState) global.AlmFeaturesState.provenance = [];
    return { ok: true, n: records.length };
  }

  // Capture displayed numbers and punctuation separately. This preserves the app's
  // significant digits, scientific notation, threshold p-values and rounded CIs.
  // Every numeric fragment is a results() value emitted through a T helper.
  function capture(text, prefix, r, dom) {
    var re = /[+-]?\d+(?:\.\d+)?/g, parts = [], pos = 0, n = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > pos) parts.push(text.slice(pos, m.index));
      var key = prefix + '_' + n++, raw = m[0], digits = (raw.split('.')[1] || '').length;
      // toFixed displays magnitudes >= 1e21 in scientific notation. Keep those
      // values whole: their mantissas may exceed the text helper's digit limit,
      // and prediction keys must still identify the RR and the two CI bounds.
      var exponent = text.slice(re.lastIndex).match(/^e[+-]?\d+/i);
      if (exponent && Math.abs(Number(raw + exponent[0])) >= 1e21) {
        raw += exponent[0]; digits = 0; re.lastIndex += exponent[0].length;
      }
      // Exponent signs/leading zeros are presentation, not separate statistics.
      var leading = /^[+-]?0+\d/.test(raw) ? raw.replace(/^[+-]?/, '').match(/^0+/)[0] : '';
      if (raw.charAt(0) === '+') parts.push('+');
      if (leading) parts.push(leading);
      var pct = text.charAt(re.lastIndex) === '%';
      if (pct) re.lastIndex++;
      r[key] = Number(raw);
      parts.push({ key: key, digits: digits, pct: pct });
      dom[key] = { text: Number(raw).toFixed(digits) + (pct ? '%' : ''), fmt: { kind: pct ? 'pct' : 'num', digits: digits } };
      pos = re.lastIndex;
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return parts;
  }
  function display(r, dom) {
    r.headline = capture((byId('headline').innerText || byId('headline').textContent)
      .replace(/\s+/g, ' ').replace(/\.$/, ''), 'headline', r, dom);
    r.tables = [];
    [
      ['coef-body', 'Coefficients (log relative risk): ', ['Term', 'estimate', 'SE', 'z', 'p', 'confidence interval']],
      ['tests-body', 'Heterogeneity, tests and fit: ', null],
      ['pred-body', 'Predicted relative risks: ', ['Dose', 'RR', 'confidence interval', 'log RR', 'SE']]
    ].forEach(function (item) {
      var rows = [];
      Array.prototype.forEach.call(byId(item[0]).rows, function (row, i) {
        var cells = [];
        Array.prototype.forEach.call(row.cells, function (cell, j) {
          if (j) cells.push('; ');
          if (item[2]) cells.push(item[2][j] + ': ');
          cells.push(capture(cell.textContent, item[0].replace('-body', '') + '_' + i + '_' + j, r, dom));
        });
        rows.push(cells, '. ');
      });
      r.tables.push([item[1], rows]);
    });
    r.warnings = capture(byId('msgs').textContent, 'warning', r, dom);
  }
  function results() {
    var last = typeof global._almDoseValidationResult === 'function' ? global._almDoseValidationResult() : null;
    if (!last) return null;
    var r = {
      k: last.k, nobs: last.nobs, model: last.model, method: last.method,
      approach: last.approach === '2stage' ? 'two' : 'one', covariance: last.covariance, metaRegression: last.metaRegression,
      i2: last.I2, converged: last.converged, ciLevel: 95
    };
    display(r, {});
    // Independent full-precision sources where their page formatting is decimal.
    // Scientific-notation fragments remain the display's mantissa and exponent.
    last.beta.forEach(function (b, i) {
      var cell = byId('coef-body').rows[i].cells[1].textContent;
      if (!/e/i.test(cell)) r['coef_' + i + '_1_0'] = b;
    });
    if (last.model === 'linear' && !last.metaRegression && global.AlmText) {
      var bounds = byId('coef-body').rows[0].cells[5].textContent.split(' to ').map(Number);
      r.effectWording = global.AlmText.cochrane.differencePhrase(bounds[0], bounds[1], 0);
    }
    last.predictions.forEach(function (p, i) {
      r['pred_' + (i + 1) + '_1_0'] = p.rr;
      r['pred_' + (i + 1) + '_2_0'] = p.lo;
      r['pred_' + (i + 1) + '_2_1'] = p.hi;
    });
    var p = global.__almTextPerturb;
    if (p && typeof r[p.key] === 'number' && Number.isFinite(p.delta)) r[p.key] += p.delta;
    return r;
  }
  function dom() { var out = {}; display({}, out); return out; }
  function emit(T, parts) {
    if (Array.isArray(parts)) return parts.map(function (p) { return emit(T, p); });
    return parts && typeof parts === 'object' ? (parts.pct ? T.pct(parts.key, parts.digits) : T.num(parts.key, parts.digits)) : parts;
  }
  var templates = {
    plain: function (T, r) {
      return ['This analysis combined ', T.int('k'), ' studies with ', T.int('nobs'),
        ' non-reference dose levels to estimate how relative risk varies with dose. ',
        emit(T, r.headline), '. ',
        T.when(r.effectWording, ['For the linear trend there is ', r.effectWording, '. ']),
        T.when(T.has('i2'), function () { return ['Variation beyond chance ', T.band('i2', 1), ' (I² = ', T.pct('i2', 1), '). ']; }),
        'The shaded band describes uncertainty in the average curve, not the range of effects in a new study. ',
        'These associations do not establish causation or clinical importance.'];
    },
    methods: function (T, r) {
      return ['Dose-response meta-analysis used a ',
        T.pick('model', { linear: 'linear trend', quadratic: 'quadratic curve', rcs: 'restricted cubic spline' }), ' on the log relative risk scale. ',
        T.pick('approach', {
          two: 'The two-stage approach fitted study coefficients by generalised least squares, then pooled the coefficient vectors. ',
          one: 'The one-stage approach fitted all dose points together using the within-study and between-study covariance structure. '
        }),
        'Pooling used ', T.pick('method', { REML: 'restricted maximum likelihood', ML: 'maximum likelihood',
          MM: 'the multivariate method of moments', FE: 'fixed effects with zero between-study variance',
          PM: 'Paule–Mandel pooling of the study slopes', DL: 'DerSimonian–Laird pooling of the study slopes' }), '. ',
        'Within-study covariance used ', T.pick('covariance', { gl: 'Greenland–Longnecker reconstruction',
          h: 'Hamling reconstruction', indep: 'independent estimates (the shared-reference correlations were ignored)' }),
        '. The supplied study design, counts, log relative risks and standard errors were retained; reference rows have blank standard errors. ',
        'Dose bases were centred at each study’s reference for fitting and at the chosen reference for prediction. ',
        T.when(r.model === 'rcs', 'Default spline knots use Harrell percentile locations with R type-seven quantiles of all doses; custom knots use the entered doses. '),
        T.when(r.metaRegression, 'Study coefficient vectors depended linearly on the supplied study covariate, with predictions at the selected covariate value. '),
        'Coefficient tests used normal z statistics, and joint dose tests used Wald chi-squared statistics. ',
        T.when(r.model !== 'linear' && !r.metaRegression, 'A Wald chi-squared test assessed the terms after the first for non-linearity. '),
        'The ', T.pct('ciLevel', 0), ' coefficient and curve confidence intervals used the normal quantile times the standard error; ',
        'curve variance was the centred design vector times the coefficient covariance matrix times its transpose. ',
        'Log relative risks and their confidence limits were exponentiated to report relative risks. No Hartung–Knapp adjustment or prediction interval was computed. ',
        T.when(r.approach === 'two', 'Heterogeneity Q used fixed-effect GLS of the study coefficients; I² was the non-negative part of the excess of Q over its degrees of freedom divided by Q, expressed as a percentage. '),
        T.when(r.approach === 'one', 'Q and I² are not defined for the one-stage approach. '),
        'Goodness-of-fit deviance and coefficients of determination used the fixed-effect fit to all non-reference points. ',
        T.when(r.method === 'PM' || r.method === 'DL',
          'For this pooling choice, the page retains goodness-of-fit and heterogeneity tests from its initial fixed-effect fit; likelihood and AIC are not reported. '),
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T, r) {
      return [emit(T, r.headline), '. ', emit(T, r.tables),
        T.when(r.warnings.length, ['App notices: ', emit(T, r.warnings)])];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.k < T.R.funnelK, 'Tests for small-study effects would be underpowered; none were performed.'),
        T.when(r.converged === false, 'The optimiser did not converge; interpret the displayed fit with caution.'),
        'No prediction interval is available from this app. Confidence intervals describe the mean curve.'];
    }
  };
  function curveCode(state) {
    var r = state.result;
    return 'dose_grid <- seq(min(c(d$dose,' + r.referenceDose + ')), max(c(d$dose,' + r.referenceDose + ')), length.out=81)\n' +
      'Xp <- sweep(basis(dose_grid), 2, as.numeric(basis(' + r.referenceDose + ')), "-")\n' +
      (r.metaRegression ? 'Xp <- cbind(Xp, Xp * ' + r.covariateValue + ')\n' : '') +
      'lp <- as.numeric(Xp %*% b)\nsp <- sqrt(pmax(0,rowSums((Xp %*% V)*Xp)))\n' +
      'lower <- exp(lp-qnorm(.975)*sp); upper <- exp(lp+qnorm(.975)*sp)\n' +
      'plot(dose_grid, exp(lp), type="n", log="y", ylim=range(lower,upper,exp(d$logrr)), xlab="Dose", ylab="Relative risk")\n' +
      'polygon(c(dose_grid,rev(dose_grid)), c(lower,rev(upper)), col=adjustcolor("steelblue",alpha.f=.2), border=NA)\n' +
      'lines(dose_grid,exp(lp),col="steelblue",lwd=2)\nabline(h=1,lty=2)\n' +
      'points(d$dose[!is.na(d$se)],exp(d$logrr[!is.na(d$se)]),pch=1,col="grey50")';
  }
  var textSpec = { app: APP, results: results, dom: dom, templates: templates, verifyPackage: 'dosresmeta' };
  var spec = {
    paper: 2, title: 'Dose-response meta-analysis',
    entry: { schema: 'dose', extras: ['type', 'covariate'], apply: apply },
    text: textSpec,
    verify: {
      adapter: function () { return global.AlmLiveAdapters && global.AlmLiveAdapters[APP] || global.AlmDoseValidate; },
      inputs: IDS.map(function (id) { return '#' + id; }).join(','),
      rObjects: 'd, f (dosresmeta fit), b, V, basis',
      plots: [{ id: 'curve', title: 'Dose-response curve with confidence band', r: curveCode,
        width_in: 8, height_in: 6, app: function () { return document.querySelector('#curve-host svg'); } }]
    },
    share: {
      get: function () {
        var s = getState();
        s.entryLog = JSON.parse(JSON.stringify(global.AlmFeaturesState && global.AlmFeaturesState.entryLog || []));
        return s;
      },
      set: setState
    }
  };
  global.AlmDoseFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') {
    global.AlmFeatures.registerModule('entry', { render: function (panel, ctx) {
      var note = document.createElement('p');
      note.textContent = 'Paste dose rows with study, dose, cases, n, log RR, SE, type (cc or ci) and optional covariate. In this table converter, explicitly enter SE = 0 and log RR = 0 for each reference row; applying rows writes the blank SE required by the app. Preserve study type. Repeated study labels are expected for dose levels. Incidence-rate data with person-time denominators should use the main input.';
      panel.appendChild(note);
      return global.AlmEntryUI.mount(panel, ctx.block);
    } });
    global.AlmFeatures.registerModule('text', { render: function (panel, ctx) {
      var ui = global.AlmTextUI.mount(panel, { app: ctx.app, text: ctx.block });
      return { onShow: function () { ui.regenerate(); } };
    } });
  }
  if (global.AlmFeatures) global.AlmFeatures.register(APP, spec);
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
