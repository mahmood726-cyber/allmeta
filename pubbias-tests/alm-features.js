/* App 6: additive shared features. No statistical calculations are performed here.
 * R reuses the existing validation adapter, which leaves y, v, m (REML rma),
 * e (regtest), b (ranktest), t (trimfill), and, for binary data, mb (metabin).
 * Thompson-Sharp and the experimental selection model are outside that comparison.
 */
(function (global) {
  'use strict';
  var APP = 'pubbias-tests';
  function byId(id) { return document.getElementById(id); }
  function tableRow(name) {
    return Array.from(document.querySelectorAll('#body tr')).find(function (row) {
      var code = row.querySelector('code');
      return code && code.textContent === name;
    });
  }
  function cellNumber(name, cell, pattern) {
    var row = tableRow(name);
    var match = row && pattern.exec(row.cells[cell].textContent);
    return match ? Number(match[1]) : null;
  }
  var NUMBER = /(-?\d+(?:\.\d+)?)/;
  var TESTS = [
    ['Egger (generic)', 'egger_t', 'egger_p'],
    ['Begg-Mazumdar', 'begg_tau', 'begg_p'],
    ['Thompson-Sharp', 'thompson_z', 'thompson_p'],
    ['Peters (binary)', 'peters_t', 'peters_p'],
    ['Harbord (binary)', 'harbord_t', 'harbord_p']
  ];
  function results() {
    var last = typeof global._almLastPubbias === 'function' ? global._almLastPubbias() : null;
    if (!last) return null;
    var r = Object.assign({}, last);
    // These quantities are displayed but not included in the engine's export object.
    TESTS.slice(2).forEach(function (test) {
      r[test[1]] = cellNumber(test[0], 1, NUMBER);
      r[test[2]] = cellNumber(test[0], 2, NUMBER);
    });
    r.sel_unadjusted = cellNumber('Selection model (Vevea-Hedges, ML)', 3, /unadj (-?\d+(?:\.\d+)?)/);
    r.selectionCutpoint = 0.025; // fixed setting passed by runAnalysis(), not an estimated result
    r.cc = 0.5; // fixed boundary correction in parseBinary()
    r.verified = !!(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP));
    // The live comparator reads current inputs even when Run analysis was not
    // pressed. Its receipt must also match the last results being described.
    if (r.verified) {
      var live = global.AlmFeatures.liveAdapter(spec), state = live.currentState();
      r.verified = (state.binary ? 'binary' : 'te-se') === last.format &&
        state.rows.length === last.studies.length && state.rows.every(function (row, i) {
          return row.te === last.studies[i].te && row.se === last.studies[i].se;
        });
    }
    var perturb = global.__almTextPerturb;
    if (perturb && typeof r[perturb.key] === 'number' && typeof perturb.delta === 'number') r[perturb.key] += perturb.delta;
    return r;
  }
  function dom() {
    var out = {};
    function add(key, text, digits) { out[key] = { text: text, fmt: { kind: 'num', digits: digits } }; }
    TESTS.forEach(function (test) {
      var row = tableRow(test[0]);
      if (row) { add(test[1], row.cells[1].textContent, 3); add(test[2], row.cells[2].textContent, 3); }
    });
    var tf = tableRow('Trim-and-fill');
    if (tf) {
      add('tf_k0', tf.cells[1].textContent.replace('k0=', ''), 0);
      add('tf_est', tf.cells[3].textContent.replace('adjusted est=', ''), 3);
    }
    var sel = tableRow('Selection model (Vevea-Hedges, ML)');
    if (sel) {
      add('sel_delta2', sel.cells[1].textContent.split('=')[1], 3);
      add('sel_LRTp', sel.cells[2].textContent, 3);
      var match = /adjusted μ=(-?\d+\.\d+) \(unadj (-?\d+\.\d+)\)/.exec(sel.cells[3].textContent);
      if (match) { add('sel_mu', match[1], 3); add('sel_unadjusted', match[2], 3); }
    }
    return out;
  }
  function selectionBoundary(r) {
    // The optimiser's logistic weight is bounded by zero and one hundred.
    // Match the displayed precision, including near-boundary rounded values.
    return Number.isFinite(r.sel_delta2) &&
      (Number(r.sel_delta2.toFixed(3)) <= 0 || Number(r.sel_delta2.toFixed(3)) >= 100);
  }
  var templates = {
    plain: function (T, r) {
      return ['This analysis examined small-study effects in ', T.int('k'), ' studies. ',
        T.when(r.format === 'te-se', function () { return [
          'Egger’s test gave t = ', T.num('egger_t', 3), ' and ', T.p('egger_p')]; }),
        T.when(r.format === 'binary', function () { return [
          'Peters: t = ', T.num('peters_t', 3), ', ', T.p('peters_p'),
          '; Harbord: t = ', T.num('harbord_t', 3), ', ', T.p('harbord_p'),
          '. Egger is not recommended for binary log odds ratios']; }),
        '. Funnel asymmetry can have several explanations and does not establish publication bias. ',
        'A lack of evidence of asymmetry does not establish its absence. ',
        T.when(r.k < T.R.funnelK, ['With fewer than ', T.rule('funnelK'),
          ' studies, tests for small-study effects are underpowered. ']),
        'The adjusted estimates are sensitivity analyses, not corrections known to remove bias.'];
    },
    methods: function (T, r) {
      return [
        T.pick('format', {
          'te-se': 'Effects and positive standard errors were analysed on the supplied scale, without transformation. ',
          binary: 'Binary counts were converted to log odds ratios with standard errors from the sum of reciprocal cell counts. '
        }),
        T.when(r.format === 'binary', ['For a study with any empty event or non-event cell, ', T.num('cc', 1),
          ' was added to every cell. Peters regressed log odds ratios on inverse total sample size, weighted by the reciprocal of the sum of inverse pooled event and non-event counts. Harbord regressed the efficient score divided by the square root of its information on the square root of that information. Both exclude studies with no events or no non-events across both arms and use two-sided t tests with informative-study count minus two degrees of freedom. ']),
        'Egger regressed the standardised effect on precision using unweighted least squares with multiplicative residual dispersion; the intercept used a two-sided t test with study count minus two degrees of freedom. ',
        'Begg–Mazumdar correlated fixed-effect-centred, studentised effects with their variances using Kendall’s tau-b; its two-sided test uses the exact permutation distribution without ties and a tie-corrected normal approximation without continuity correction otherwise. ',
        'Thompson–Sharp regressed the effect on standard error in a random-effects meta-regression, estimating residual heterogeneity by REML. The standard-error slope used a two-sided z test for funnel asymmetry. ',
        'Trim-and-fill uses the L-zero estimator, chooses the filling side from the sign of a REML meta-regression slope on standard error, and uses REML for the trimmed and augmented fits; absolute residual ranks break ties by sorted order. ',
        'The experimental Vevea–Hedges selection model uses maximum likelihood with Nelder–Mead optimisation and REML starting values, a one-sided normal p-value cutpoint of ',
        T.num('selectionCutpoint', 3),
        ', and a chi-squared likelihood-ratio test against an unselected maximum-likelihood model with one degree of freedom. It is not validated against metafor. ',
        'The page reports no confidence intervals, prediction intervals or heterogeneity summaries; none are inferred here. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(r.verified && T.verify(), function () { return [' ', T.verify(),
          T.when(r.format === 'binary', ' Peters and Harbord were compared using meta; its version is recorded in Verify in R.'),
          ' This comparison covers Egger, Begg and trim-and-fill, plus Peters and Harbord for binary data; it excludes Thompson–Sharp and the experimental selection model.']; })
      ];
    },
    results: function (T, r) {
      return ['There were ', T.int('k'), ' studies. Egger: t = ', T.num('egger_t', 3), ', ', T.p('egger_p'),
        T.when(r.format === 'binary', ' (Egger is not recommended for binary log odds ratios)'),
        '; Begg–Mazumdar: tau-b = ', T.num('begg_tau', 3), ', ', T.p('begg_p'), '. ',
        'Thompson–Sharp: z = ',
        T.num('thompson_z', 3), ', ', T.p('thompson_p'), '. ',
        T.when(r.format === 'binary', function () { return [
          'Peters: t = ', T.num('peters_t', 3), ', ', T.p('peters_p'),
          '; Harbord: t = ', T.num('harbord_t', 3), ', ', T.p('harbord_p'), '. '
        ]; }),
        'Trim-and-fill imputed ', T.int('tf_k0'), ' ', T.plural('tf_k0', 'study', 'studies'),
        ', with adjusted estimate ', T.num('tf_est', 3), '. ',
        T.when(T.has('sel_mu') && T.has('sel_unadjusted'), function () { return [
          'The experimental selection model gave relative selection weight δ₂ = ', T.num('sel_delta2', 3),
          ', likelihood-ratio ', T.p('sel_LRTp'), ', adjusted mean ', T.num('sel_mu', 3),
          ' and unadjusted mean ', T.num('sel_unadjusted', 3), '. ',
          T.when(selectionBoundary(r),
            'The selection weight reached its boundary; the model is not informative. ')
        ]; }),
        'All effects remain on the analysis scale. P-values below the reporting threshold are shown as bounds; other p-values retain the page’s rounding.'];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.funnelK, ['Fewer than ', T.rule('funnelK'),
        ' studies: small-study-effect tests are underpowered.']),
        T.when(r.format === 'binary', 'Ordinary Egger regression is unreliable for binary log odds ratios because effects and their precision are intrinsically correlated.'),
        'Thompson–Sharp is outside the live R comparison. The selection model is experimental and not validated against metafor.'];
    }
  };
  var textSpec = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates };

  function axisControls() { return Array.from(document.querySelectorAll('#alm-axis-mount input')); }
  function shareGet() {
    return { src: byId('src').value, format: byId('format').value,
      axes: axisControls().map(function (el) { return el.type === 'checkbox' ? el.checked : el.value; }),
      entryLog: JSON.parse(JSON.stringify(global.AlmFeaturesState.entryLog)) };
  }
  function shareSet(state) {
    if (!state || typeof state.src !== 'string' || state.src.length > 200000 ||
        ['te-se', 'binary'].indexOf(state.format) < 0) throw new Error('Invalid data or input format');
    var controls = axisControls();
    if (!Array.isArray(state.axes) || state.axes.length !== controls.length ||
        state.axes.some(function (value, i) {
          return controls[i].type === 'checkbox' ? typeof value !== 'boolean'
            : typeof value !== 'string' || (value !== '' && !Number.isFinite(Number(value)));
        }) || !Array.isArray(state.entryLog)) throw new Error('Invalid axis options or conversion log');
    for (var i = 0; i < state.axes.length; i += 3) {
      if (state.axes[i] !== '' && state.axes[i + 1] !== '' && Number(state.axes[i]) >= Number(state.axes[i + 1])) throw new Error('Axis minimum must be below maximum');
    }
    // The page's own strict parser (index.html parseTESE / parseBinary, exposed on __almPubBiasEngine): it throws
    // with the line number for any row the paste path refuses, so such a file is refused before anything changes.
    var engine = global.__almPubBiasEngine;
    if (!engine || typeof engine.parseTESE !== 'function' || typeof engine.parseBinary !== 'function') throw new Error('The app row checker is not available.');
    if (state.format === 'te-se') engine.parseTESE(state.src); else engine.parseBinary(state.src);
    // Validate the complete state before changing any controls.
    byId('src').value = state.src;
    byId('format').value = state.format;
    controls.forEach(function (el, i) {
      if (el.type === 'checkbox') el.checked = state.axes[i]; else el.value = state.axes[i];
    });
    controls.forEach(function (el) { el.dispatchEvent(new Event('change', { bubbles: true })); });
    global.AlmFeaturesState.entryLog = JSON.parse(JSON.stringify(state.entryLog));
    byId('btn-run').click();
  }
  function apply(records) {
    if (!Array.isArray(records) || records.length < 5 || records.some(function (r) {
      return !r || !Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0;
    })) throw new Error('Need at least five finite effects with positive standard errors');
    // Labels and extraction provenance stay in the shared provenance record: this
    // app's parser accepts numeric effect/SE pairs, not study labels.
    var previousSrc = byId('src').value, previousFormat = byId('format').value, ok = false;
    try {
      byId('src').value = records.map(function (r) { return r.yi + ', ' + r.sei; }).join('\n');
      byId('format').value = 'te-se';
      byId('btn-run').click();
      var last = global._almLastPubbias();
      ok = !!last && last.format === 'te-se' && last.k === records.length &&
        last.studies.every(function (row, i) { return row.te === records[i].yi && row.se === records[i].sei; });
      return { ok: ok, n: records.length };
    } finally {
      if (!ok) { byId('src').value = previousSrc; byId('format').value = previousFormat; }
    }
  }
  var spec = {
    paper: 6, title: 'Small-study-effect tests',
    entry: { schema: 'generic', usedAs: 'effect and standard error on the supplied analysis scale', apply: apply },
    text: textSpec,
    verify: {
      adapter: function () { return (global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) || global.AlmPubbiasValidationAdapter; },
      inputs: '#src, #format',
      rObjects: 'y, v, m (REML rma), e (regtest), b (ranktest), t (trimfill); mb (metabin) for binary data',
      plots: [{ id: 'funnel', title: 'Funnel plot', width_in: 8, height_in: 6,
        r: 'metafor::funnel(m, xlab="Effect", yaxis="sei")',
        app: function () { return byId('funnel'); } }]
    },
    share: { get: shareGet, set: shareSet }
  };
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  global.AlmPubbiasFeatures = spec;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') {
    global.AlmFeatures.registerModule('entry', { render: function (el, ctx) {
      return global.AlmEntryUI.mount(el, ctx.block);
    } });
    global.AlmFeatures.registerModule('text', { render: function (el, ctx) {
      var ui = global.AlmTextUI.mount(el, { app: ctx.app, text: ctx.block });
      return { onShow: function () { ui.regenerate(); } };
    } });
    if (global.AlmVerifyR) global.AlmFeatures.registerModule('verify', { label: 'Verify in R', render: function (el, ctx) {
      var note = document.createElement('p');
      note.textContent = 'Comparison scope: Egger, Begg and trim-and-fill; also Peters and Harbord for binary input. ' +
        'Thompson–Sharp is excluded. The selection model is experimental and not validated against metafor. ' +
        'The R funnel uses the REML centre; the app funnel shows its regression overlay.';
      el.appendChild(note);
      return global.AlmVerifyR.module.render(el, ctx);
    } });
  }
  if (global.AlmFeatures) global.AlmFeatures.register(APP, spec);
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
