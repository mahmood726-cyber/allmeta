/* proportion-ma/alm-features.js — paper 9 adapter for the shared feature panel (shared/alm-features.js).
 * verify: reuses the live R adapter registered by validate/adapter.js (AlmValidate.adapters['proportion-ma']).
 *   R objects left in the global environment by its buildScript (documented here for plot code):
 *     x, n      events and totals;  es  metafor::escalc(...) on the analysis scale (PLO / PFT / PR);
 *     f         metafor::rma(es$yi, es$vi, method=<PM|DL|FE>) fit;  back  back-transform to proportions.
 *   optional(state): prediction-interval keys when k < 3 (not applicable; see shared/alm-verify-r.js).
 * share: the #src text plus every option control (#trans, #tau-est); set() validates (every #src row with row-check.js,
 *   refusing the file if any row is unusable), restores and re-runs.
 * entry: schema proportion; apply() writes "events, total, label" lines into #src and runs (AlmFeatures.register merges blocks).
 */
(function () {
  'use strict';
  var TRANS = ['ft', 'logit', 'raw'], TAU = ['PM', 'DL', 'FE'];
  function byId(id) { return document.getElementById(id); }

  // Study labels go into R as JSON string literals (valid R string syntax for the escapes JSON emits).
  function forestCode(state) {
    var labels = state.rows.map(function (r) { return JSON.stringify(String(r.label)); }).join(', ');
    return 'metafor::forest(f, transf = back, slab = c(' + labels + '), refline = NA,\n' +
      '  xlab = "Proportion", header = c("Study", "Proportion [95% CI]"))';
  }

  // entry: one "events, total, label" line per confirmed study into the app's own #src, then run.
  // Refuses (changing nothing) unless every row has integer 0 <= xi <= ni, ni > 0 and a one-line label
  // without commas (the app splits #src lines on commas).
  function apply(records) {
    if (!Array.isArray(records) || !records.length) return { ok: false, n: 0, error: 'No rows to use.' };
    var lines = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i] || {}, label = r.study === undefined || r.study === null ? '' : String(r.study).trim();
      if (!label || /[,\r\n]/.test(label)) return { ok: false, n: 0, error: 'Row ' + (i + 1) + ': the study label must be one line without commas.' };
      if (!Number.isInteger(r.xi) || !Number.isInteger(r.ni) || r.ni <= 0 || r.xi < 0 || r.xi > r.ni) {
        return { ok: false, n: 0, error: 'Row ' + (i + 1) + ': events and total must be integers with 0 <= events <= total and total > 0.' };
      }
      lines.push(r.xi + ', ' + r.ni + ', ' + label);
    }
    byId('src').value = lines.join('\n');
    byId('btn-run').click();
    return { ok: true, n: lines.length };
  }

  AlmFeatures.register('proportion-ma', {
    paper: 9,
    title: 'Proportion meta-analysis',
    entry: {
      schema: 'proportion',
      extras: [],
      usedAs: 'proportion (events / participants), analysed on the transformation chosen in the app',
      apply: apply,
    },
    verify: {
      adapter: function () { return AlmValidate.adapters['proportion-ma']; },
      rObjects: 'x, n, es (escalc), f (rma fit), back (back-transform)',
      inputs: '#src, #trans, #tau-est', // the app's analysis inputs (Verify in R stale check)
      // Prediction-interval quantities do not exist for k < 3 (the app shows none; R gives NA): listed as
      // "not applicable" only when both sides are missing. Keys are read from the adapter's appValues.
      optional: function (state) {
        if (state.rows.length >= 3) return [];
        return AlmValidate.adapters['proportion-ma'].live.appValues(state)
          .map(function (v) { return v.key; })
          .filter(function (k) { return /^(pool)?pi(Lo|Hi)$/i.test(k); });
      },
      plots: [{
        id: 'forest', title: 'Forest plot', r: forestCode, width_in: 8, height_in: 6,
        app: function () { return byId('forest'); },
      }],
    },
    share: {
      get: function () {
        var controls = byId('alm-axis-mount').querySelectorAll('input');
        return { src: byId('src').value, trans: byId('trans').value, tau: byId('tau-est').value,
          axis: { x: [controls[0].value === '' ? null : Number(controls[0].value),
            controls[1].value === '' ? null : Number(controls[1].value)], xLog: controls[2].checked } };
      },
      set: function (s) {
        // Link/file size is checked by AlmShare before restore. A separate text
        // cap here would reject states that this adapter's get() can export.
        if (!s || typeof s.src !== 'string') throw new Error('data text missing');
        if (TRANS.indexOf(s.trans) < 0) throw new Error('unknown transformation ' + String(s.trans));
        if (TAU.indexOf(s.tau) < 0) throw new Error('unknown estimator ' + String(s.tau));
        var axis = s.axis === undefined ? { x: [null, null], xLog: false } : s.axis;
        if (!axis || !Array.isArray(axis.x) || axis.x.length !== 2 ||
            axis.x.some(function (v) { return v !== null && (typeof v !== 'number' || !Number.isFinite(v)); }) ||
            typeof axis.xLog !== 'boolean' || (axis.x[0] !== null && axis.x[1] !== null && axis.x[0] >= axis.x[1])) {
          throw new Error('invalid forest plot axis options');
        }
        // The page's own row checker (row-check.js, also used by the paste path), before anything is changed:
        // a row the page would exclude (non-whole counts such as 2.5 or 40.5, events < 0 or > total, total <= 0,
        // non-numeric or missing fields) makes the file invalid instead of being dropped or truncated.
        if (typeof AlmPropRows === 'undefined' || typeof AlmPropRows.classify !== 'function') {
          throw new Error('the app row checker is not available');
        }
        var checked = AlmPropRows.classify(s.src);
        if (checked.excluded.length) {
          var bad = checked.excluded[0];
          throw new Error('line ' + bad.line + ' (' + (bad.text.length > 60 ? bad.text.slice(0, 60) + '…' : bad.text) + '): ' + bad.reason +
            (checked.excluded.length > 1 ? ' (and ' + (checked.excluded.length - 1) + ' more unusable rows)' : ''));
        }
        if (checked.rows.length < 2) throw new Error('at least two valid studies are required');
        var controls = byId('alm-axis-mount').querySelectorAll('input');
        if (controls.length !== 3) throw new Error('forest plot axis controls are unavailable');
        byId('src').value = s.src;
        byId('trans').value = s.trans;
        byId('tau-est').value = s.tau;
        controls[0].value = axis.x[0] === null ? '' : String(axis.x[0]);
        controls[1].value = axis.x[1] === null ? '' : String(axis.x[1]);
        controls[2].checked = axis.xLog;
        Array.prototype.forEach.call(controls, function (control) { control.dispatchEvent(new Event('change', { bubbles: true })); });
        byId('btn-run').click();
      },
    },
  });
})();
