/* Shared features for MH/Peto. Statistical values come only from _almLastMhPeto().
 * The existing validation adapter leaves mh (rma.mh) and, for OR, pe (rma.peto)
 * in R's global environment. No second statistical or live-validation engine.
 */
(function (global) {
  'use strict';
  var APP = 'mh-peto', axisApplied = false, defaultAxisOverride = false;
  function el(id) { return document.getElementById(id); }
  function axis(edge) { return document.querySelector('#alm-axis-mount [data-edge="' + edge + '"]'); }

  function restoredLog(log) {
    function invalid() { throw new Error('Invalid conversion log.'); }
    function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
    function keys(v, allowed) { return Object.keys(v).every(function (key) { return allowed.indexOf(key) >= 0; }); }
    function bounded(v, depth) {
      if (typeof v === 'string') return v.length <= 2048;
      if (v === null || typeof v === 'boolean') return true;
      if (typeof v === 'number') return Number.isFinite(v);
      if (!v || typeof v !== 'object' || depth > 5 || Object.keys(v).length > 100) return false;
      return Object.keys(v).every(function (key) { return key.length <= 80 && bounded(v[key], depth + 1); });
    }
    if (!Array.isArray(log) || log.length > 1000) invalid();
    log.forEach(function (s) {
      if (!object(s) || !bounded(s, 0)) invalid();
      if (s.code) {
        // Code-only records cannot override the toolkit's fixed wording or carry
        // nested provenance that would take precedence over the code in T.entry().
        if (!global.AlmText || !Object.prototype.hasOwnProperty.call(global.AlmText.ENTRY_CODES, s.code) ||
            !keys(s, ['code', 'study']) || (s.study !== undefined && typeof s.study !== 'string')) invalid();
        return;
      }
      // Preserve the legacy no-conversion record used by existing share links.
      if (s.method === 'transcription' && s.text === 'Counts transcribed without conversion' &&
          keys(s, ['method', 'text'])) return;
      if (!keys(s, ['row', 'study', 'text', 'method', 'citation', 'inputs', 'flags', 'fn', 'args', 'result', 'rulesVersion']) ||
          !object(s.inputs) || !Array.isArray(s.flags) || typeof s.text !== 'string') invalid();
      if (s.method === 'user-confirmed swap' && s.text === 'User confirmed swapping source columns or CI bounds' &&
          s.citation === 'User confirmation' && Object.keys(s.inputs).length === 0 && s.flags.length === 0 &&
          keys(s, ['text', 'method', 'citation', 'inputs', 'flags'])) return;
      if (!Number.isSafeInteger(s.row) || s.row < 0 || typeof s.study !== 'string' || !s.study.trim()) invalid();
      if (s.method === 'decimal confirmed' && s.citation === 'User confirmation' && s.flags.length === 0 &&
          keys(s.inputs, ['cell']) && typeof s.inputs.cell === 'string' &&
          keys(s, ['row', 'study', 'text', 'method', 'citation', 'inputs', 'flags']) &&
          ['a decimal mark', 'a separator'].some(function (choice) {
            return s.text === s.study + ': comma interpreted as ' + choice + ' by confirmation';
          })) return;
      // Binary-arm table conversions generate percentage-to-count steps. Check
      // their wording and replay metadata against the existing shared converter.
      if (s.method !== 'events from percent' || !global.AlmEntry ||
          !keys(s.inputs, ['pct', 'n']) || !Number.isSafeInteger(s.inputs.n) || s.inputs.n <= 0 ||
          !Number.isFinite(s.inputs.pct) || s.inputs.pct < 0 || s.inputs.pct > 100) invalid();
      var out = global.AlmEntry.eventsFromPercent(s.inputs);
      if (s.citation !== out.citation || s.text !== s.study + ': Events estimated from percent (' + out.citation + ')' ||
          JSON.stringify(s.flags) !== JSON.stringify(out.flags)) invalid();
      if (['fn', 'args', 'result', 'rulesVersion'].some(function (key) { return key in s; }) &&
          (s.fn !== out.fn || s.rulesVersion !== out.rulesVersion || s.result !== out.result ||
            !object(s.args) || !keys(s.args, ['pct', 'n']) || s.args.pct !== s.inputs.pct || s.args.n !== s.inputs.n)) invalid();
    });
    var serialized = JSON.stringify(log);
    if (serialized.length > 65536) invalid();
    return JSON.parse(serialized);
  }

  function apply(records) {
    if (!Array.isArray(records) || records.length < 2) throw new Error('At least two studies are required.');
    var lines = records.map(function (r) {
      var label = String(r.study || '').trim();
      if (!label || /[,\r\n]/.test(label)) throw new Error('Study labels must be nonempty and cannot contain commas or line breaks.');
      var counts = [r.ai, r.n1i, r.ci, r.n2i];
      if (!counts.every(Number.isSafeInteger) || r.ai < 0 || r.ci < 0 ||
          r.n1i <= 0 || r.n2i <= 0 || r.ai > r.n1i || r.ci > r.n2i) {
        throw new Error('Events must be nonnegative whole counts no greater than positive arm totals.');
      }
      // Numeric labels must use the app's legacy numeric-first format.
      return Number.isFinite(Number(label)) ? counts.concat(label).join(', ') : [label].concat(counts).join(', ');
    });
    el('src').value = lines.join('\n');
    el('src').dispatchEvent(new Event('input', { bubbles: true }));
    el('btn-run').click();
    return { ok: true, n: records.length };
  }

  function results() {
    var last = typeof global._almLastMhPeto === 'function' && global._almLastMhPeto();
    if (!last) return null;
    var r = Object.assign({}, last, { ciLevel: 95, cc: 0.5, nullValue: last.measure === 'RD' ? 0 : 1 });
    // Test-only hook: planted defects must be rejected by the independent DOM audit.
    var pt = global.__almTextPerturb;
    if (pt && typeof r[pt.key] === 'number' && typeof pt.delta === 'number') r[pt.key] += pt.delta;
    return r;
  }
  function dom() {
    var out = { k: { text: global.AlmText.format(document.querySelectorAll('#per-body tr').length,
      { kind: 'int' }), fmt: { kind: 'int' } } };
    document.querySelectorAll('#pooled-body tr').forEach(function (row) {
      var cells = row.cells, prefix = cells[0].textContent.indexOf('Peto') >= 0 ? 'peto_' : 'mh_';
      var ci = cells[2].textContent.replace(/[[\]]/g, '').split(',');
      ['est', 'lo', 'hi', 'z', 'p'].forEach(function (key, i) {
        var shown = [cells[1].textContent, ci[0], ci[1], cells[3].textContent, cells[4].textContent][i];
        if (shown.trim() === '—') return; // Undefined tests are displayed as dashes, never numeric evidence.
        out[prefix + key] = { text: shown,
          fmt: { kind: 'num', digits: key === 'z' ? 2 : 3 } };
      });
    });
    var frag = /index = (\d+).*FQ = ([\d.]+)/.exec(el('fragility-note').textContent);
    if (frag) {
      out.fragility_index = { text: frag[1], fmt: { kind: 'int' } };
      out.fragility_quotient = { text: frag[2], fmt: { kind: 'num', digits: 4 } };
    }
    return out;
  }
  var templates = {
    plain: function (T, r) {
      return ['This analysis combined ', T.int('k'), ' studies comparing event counts in two groups. ',
        T.when(T.has('mh_est'), function () {
          return ['The Mantel–Haenszel ', T.pick('measure', { OR: 'odds ratio', RR: 'risk ratio', RD: 'risk difference' }),
            ' was ', T.num('mh_est', 3), ' (', T.pct('ciLevel', 0), ' confidence interval ',
            T.ci('mh_lo', 'mh_hi', 3), '). There is ',
            global.AlmText.cochrane.differencePhrase(r.mh_lo, r.mh_hi, r.nullValue), '. '];
        }),
        T.when(!T.has('mh_est'), 'The Mantel–Haenszel estimate was undefined for these counts. '),
        'These pooled results assume a single common effect across studies; this analysis does not estimate between-study variation or a prediction interval. ',
        'The event may be beneficial or harmful; these numbers alone do not establish causation or clinical importance.'];
    },
    methods: function (T, r) {
      return ['Event counts and arm totals were pooled using a fixed-effect Mantel–Haenszel ',
        T.pick('measure', { OR: 'odds ratio with Robins–Breslow–Greenland variance',
          RR: 'risk ratio with the Mantel–Haenszel log-risk-ratio variance',
          RD: 'risk difference with Greenland–Robins variance' }), '. ',
        T.when(r.measure === 'OR', 'Peto one-step odds ratios were also computed as the exponential of summed observed-minus-expected events divided by summed hypergeometric variances; the log-scale standard error is the reciprocal square root of summed variances. '),
        'Pooled estimates use the original counts without continuity correction. Double-zero-event studies contribute no information to pooled ratios; risk differences retain them. ',
        'Pooled ', T.pct('ciLevel', 0), ' confidence intervals use the estimate ± the standard-normal quantile times its standard error',
        r.measure === 'RD' ? ' on the identity scale. ' : ' on the log scale, with exponentiation of estimates and limits. ',
        'Two-sided normal z tests compare the analysis-scale estimate with zero, using the upper normal tail. No Hartung–Knapp adjustment is used. ',
        r.measure === 'RD'
          ? 'Per-study risk differences and Wald intervals use uncorrected binomial proportions and variances. '
          : ['Per-study ratios and Wald intervals add ', T.num('cc', 1), ' to every cell of a study if any cell is zero; other studies are uncorrected. '],
        'No heterogeneity statistics, between-study variance, or prediction interval are computed for MH/Peto. ',
        'The separately displayed fragility index uses greedy single-event modifications toward the null until a DerSimonian–Laird inverse-variance Wald interval includes zero on the analysis scale. This calculation drops studies with no events in both arms or all events in both arms, and corrects every cell of remaining zero-cell studies by ',
        T.num('cc', 1), '. The fragility quotient divides the index by the total participants in all input studies. Non-significant starting results have no fragility index. ',
        'The L’Abbé curve uses a separate inverse-variance fixed-effect risk ratio for the risk-ratio selection and odds ratio otherwise. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T, r) {
      return ['There were ', T.int('k'), ' studies. ',
        T.when(T.has('mh_est'), function () {
          return ['MH ', T.pick('measure', { OR: 'OR', RR: 'RR', RD: 'RD' }), ' = ', T.num('mh_est', 3),
            ' (', T.pct('ciLevel', 0), ' CI ', T.ci('mh_lo', 'mh_hi', 3), ')',
            T.when(T.has('mh_z') && T.has('mh_p'), function () { return ['; z = ', T.num('mh_z', 2), '; ', T.p('mh_p')]; }), '. '];
        }),
        T.when(T.has('mh_est') && !T.has('mh_z'), 'The MH z statistic and p value were undefined. '),
        T.when(!T.has('mh_est'), 'MH estimate and confidence interval were undefined. '),
        T.when(r.measure === 'OR' && T.has('peto_est'), function () {
          return ['Peto OR = ', T.num('peto_est', 3), ' (', T.pct('ciLevel', 0), ' CI ',
            T.ci('peto_lo', 'peto_hi', 3), '); z = ', T.num('peto_z', 2), '; ', T.p('peto_p'), '. '];
        }),
        T.when(T.has('fragility_index'), function () {
          return ['The separate DL fragility index was ', T.int('fragility_index'), ' event modifications (FQ = ',
            T.num('fragility_quotient', 4), ').'];
        }),
        T.when(!T.has('fragility_index'), 'The separate DL fragility index was not available for this analysis.')];
    },
    flags: function (T, r) {
      return ['Displayed p values are rounded; a displayed zero does not imply a zero probability.',
        'These pooled results assume a single common effect across studies; this analysis does not estimate between-study variation or a prediction interval.',
        T.when(r.measure === 'OR', 'Peto estimates require caution with unbalanced arms or large effects.'),
        T.when(T.has('mh_lo') && T.has('mh_hi') &&
          global.AlmText.cochrane.imprecise(r.mh_lo, r.mh_hi, r.nullValue),
        'The confidence interval includes no effect and effects in both directions, indicating imprecision.'),
        T.when(r.k < T.R.funnelK, ['Fewer than ', T.rule('funnelK'),
          ' studies: tests for small-study effects would be underpowered; none were performed.'])];
    }
  };
  function stale() {
    return !global.__mhValidation || !global.__mhValidation.isCurrent();
  }
  function featureAdapter() {
    var adapter = global.AlmLiveAdapters && global.AlmLiveAdapters[APP] || global.AlmValidate.adapters[APP];
    var live = adapter.live || adapter;
    // Text freshness checks also call this accessor. The original validator's
    // currentState() runs the page, clearing leave-one-out and pending edits.
    // Read only the completed analysis here; reuse its parser, full-precision
    // results and the original R script/comparison functions unchanged.
    var readOnly = Object.assign({}, live, { currentState: function () {
      if (stale()) throw new Error('Run analysis before verifying the current inputs.');
      return { rows: global.__mhValidation.parse(el('src').value),
        measure: el('measure').value, result: global._almLastMhPeto() };
    } });
    return adapter.live ? Object.assign({}, adapter, { live: readOnly }) : readOnly;
  }
  var textSpec = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates, stale: stale };
  var spec = {
    paper: 10, title: 'Mantel–Haenszel / Peto pooling',
    entry: { schema: 'binary2x2', apply: apply,
      usedAs: 'Treatment and control event counts and totals for MH pooling on the selected measure; Peto is also computed for odds ratios.' },
    text: textSpec,
    verify: {
      adapter: featureAdapter,
      inputs: '#src, #measure',
      rObjects: 'ai, bi, ci, di; mh (rma.mh); pe (rma.peto, OR only)',
      plots: [{
        id: 'forest', title: 'Forest plot', width_in: 8, height_in: 6,
        r: function (s) {
          var labels = s.rows.map(function (r) { return JSON.stringify(r.label); }).join(', ');
          if (s.measure === 'RD') {
            // The page's study RD intervals are uncorrected, while the live MH
            // fit's stored study intervals use its add=c(.5,0) convention.
            return 'plot_es <- metafor::escalc(measure="RD", ai=ai, bi=bi, ci=ci, di=di, add=0, to="none", drop00=FALSE)\n' +
              'metafor::forest(plot_es$yi, vi=plot_es$vi, slab=c(' + labels + '), refline=0, xlab="RD", ylim=c(-2, length(ai)+3))\n' +
              'metafor::addpoly(mh, row=-1, mlab="MH RD")';
          }
          return 'metafor::forest(mh, slab=c(' + labels + '), ' +
            'atransf=exp, refline=0' +
            ', xlab="' + s.measure + '", ylim=c(-2, length(ai)+3))\n' +
            (s.measure === 'OR' ? 'metafor::addpoly(pe, row=-1, atransf=exp, mlab="Peto OR")' : '');
        },
        app: function () { return el('forest'); }
      }]
    },
    share: {
      get: function () {
        return { src: el('src').value, measure: el('measure').value,
          axis: { min: axis('min').value, max: axis('max').value, log: axis('log').checked, applied: axisApplied },
          entryLog: global.AlmFeaturesState.entryLog };
      },
      set: function (s) {
        if (!s || typeof s.src !== 'string' || s.src.length > 200000 ||
            ['OR', 'RR', 'RD'].indexOf(s.measure) < 0) throw new Error('Invalid data or effect measure.');
        var a = s.axis;
        if (!a || typeof a.log !== 'boolean' || typeof a.applied !== 'boolean' ||
            ![a.min, a.max].every(function (v) { return typeof v === 'string' && (v === '' || Number.isFinite(Number(v))); }) ||
            (a.min !== '' && a.max !== '' && Number(a.min) >= Number(a.max)) ||
            !Array.isArray(s.entryLog)) throw new Error('Invalid axis options or conversion log.');
        var entryLog = restoredLog(s.entryLog);
        // The page's own row checker (index.html parseInput), before anything is changed: data the page would block
        // makes the file invalid instead of replacing the current analysis.
        if (typeof global.__almMhPetoParse !== 'function') throw new Error('The app row checker is not available.');
        var parsed = global.__almMhPetoParse(s.src);
        if (parsed.errors.length) throw new Error('Line ' + parsed.errors[0].line + ': ' + parsed.errors[0].message);
        el('src').value = s.src; el('measure').value = s.measure;
        // An untouched axis follows the measure automatically in the app. Preserve
        // that behaviour on fresh links; only emit overrides if one was used.
        if (a.applied || axisApplied || defaultAxisOverride) {
          axis('min').value = ''; axis('max').value = '';
          axis('min').dispatchEvent(new Event('change', { bubbles: true }));
          axis('max').dispatchEvent(new Event('change', { bubbles: true }));
          axis('min').value = a.min; axis('max').value = a.max;
          axis('min').dispatchEvent(new Event('change', { bubbles: true }));
          axis('max').dispatchEvent(new Event('change', { bubbles: true }));
          axis('log').checked = a.applied ? a.log : s.measure !== 'RD';
          axis('log').dispatchEvent(new Event('change', { bubbles: true }));
          defaultAxisOverride = !a.applied;
        }
        axis('log').checked = a.log; axisApplied = a.applied;
        global.AlmFeaturesState.entryLog = entryLog;
        el('btn-run').click();
      }
    }
  };
  global.AlmMhPetoFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') {
    global.AlmFeatures.registerModule('entry', {
      label: 'Data entry',
      render: function (panel, ctx) {
        var ui = global.AlmEntryUI.mount(panel, ctx.block);
        var heading = document.createElement('h3'), log = document.createElement('ul'), empty = document.createElement('p');
        heading.textContent = 'Conversion log'; panel.appendChild(heading); panel.appendChild(log); panel.appendChild(empty);
        empty.textContent = 'No numerical conversions recorded. Raw event counts and arm totals are passed to the app.';
        function refresh() {
          var steps = global.AlmFeaturesState.entryLog || [];
          log.replaceChildren();
          steps.forEach(function (s) {
            var item = document.createElement('li');
            item.textContent = s.text || (s.study ? s.study + ': ' : '') +
              (s.code && global.AlmText.ENTRY_CODES[s.code] ? global.AlmText.ENTRY_CODES[s.code].desc : s.method || '');
            log.appendChild(item);
          });
          log.hidden = !steps.length; empty.hidden = !!steps.length;
        }
        refresh();
        return { onShow: refresh, entry: ui };
      }
    });
    global.AlmFeatures.registerModule('text', {
      label: 'Report text',
      render: function (panel, ctx) {
        var ui = global.AlmTextUI.mount(panel, { app: ctx.app, text: ctx.block });
        return { onShow: ui.regenerate };
      }
    });
  }
  if (global.AlmFeatures) global.AlmFeatures.register(APP, spec);
  if (typeof document !== 'undefined') {
    // The page supplies "X axis" and the shared control appends "axis minimum"
    // / "axis maximum". Give this app's existing inputs unambiguous names.
    ['min', 'max'].forEach(function (edge) {
      var input = axis(edge);
      if (input) input.setAttribute('aria-label', 'X axis ' + (edge === 'min' ? 'minimum' : 'maximum'));
    });
    var mount = el('alm-axis-mount');
    if (mount) mount.addEventListener('change', function () { axisApplied = true; defaultAxisOverride = false; });
    var measure = el('measure');
    if (measure) measure.addEventListener('change', function () {
      if (!defaultAxisOverride) return;
      var checked = axis('log').checked;
      axis('log').checked = measure.value !== 'RD';
      axis('log').dispatchEvent(new Event('change', { bubbles: true }));
      axis('log').checked = checked; axisApplied = false; defaultAxisOverride = true;
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
