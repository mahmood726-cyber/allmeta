/* GOSH features. Statistics come only from _almLastGosh().
 * The existing live adapter leaves base (rma), g (gosh, enumeration only),
 * yi, vi, mus, i2s and captured subset memberships in R. No second statistical engine.
 * __almTextPerturb is a planted-defect test hook, restricted to DOM-audited keys.
 */
(function (global) {
  'use strict';
  var APP = 'gosh';
  function byId(id) { return document.getElementById(id); }
  function axes() { return Array.from(document.querySelectorAll('#alm-axis-mount input')); }
  // Share state carries exactly six axis values. If page setup stopped before the axis controls mounted
  // (e.g. a script failed to load), refuse instead of writing a link set() rejects or skipping the axes on restore.
  function shareAxes() {
    var list = axes();
    if (list.length !== 6) throw new Error('Axis controls did not load; reload the page.');
    return list;
  }
  function verificationAdapter() {
    var adapter = (global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) || global.AlmGoshValidationAdapter;
    if (!adapter || !adapter.live) return adapter;
    return Object.assign({}, adapter, { live: Object.assign({}, adapter.live, {
      currentState: function () {
        var last = global._almLastGosh();
        if (!last || !byId('analysis-stale').hidden) throw new Error('Run analysis before verifying the current inputs.');
        if ((last.k > 15 && !last.sampled) || (byId('exact-progress') && !byId('exact-progress').hidden)) {
          throw new Error('The live R adapter verifies sampled subsets, not streamed exact enumeration. Select Random sampling only and run analysis to verify that result.');
        }
        return global.__almGoshFeatureCapture(function () { return adapter.live.currentState(); });
      }
    }) });
  }
  function validRecords(records) {
    if (!Array.isArray(records) || records.length < 3 || records.length > 100) throw new Error('Provide three through one hundred studies.');
    records.forEach(function (r) {
      if (!r || !Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0) throw new Error('Each effect must be finite and each SE positive.');
      if (typeof r.study !== 'string' || !r.study.trim() || /[,\r\n]/.test(r.study)) throw new Error('Study labels must be nonempty and contain no commas or line breaks.');
    });
  }
  function apply(records) {
    validRecords(records);
    global.__almGoshLoad(records);
    return { ok: !!global._almLastGosh(), n: records.length };
  }
  function results() {
    var last = typeof global._almLastGosh === 'function' ? global._almLastGosh() : null;
    if (!last) return null;
    var r = Object.assign({}, last);
    var p = global.__almTextPerturb;
    if (p && Object.prototype.hasOwnProperty.call(dom(), p.key) && typeof r[p.key] === 'number' && typeof p.delta === 'number') r[p.key] += p.delta;
    return r;
  }
  function localeInteger(text) {
    // The engine uses the browser locale; the text auditor uses ASCII integers.
    // Translate only that locale's grouping and digits, preserving wrong counts.
    var format = new Intl.NumberFormat();
    format.formatToParts(10000).forEach(function (part) {
      if (part.type === 'group') text = text.split(part.value).join('');
    });
    for (var digit = 0; digit < 10; digit++) text = text.split(format.format(digit)).join(String(digit));
    return text;
  }
  function dom() {
    return {
      n_subsets: { text: localeInteger(byId('m-n').textContent), fmt: { kind: 'int' } },
      median_est: { text: byId('m-est').textContent, fmt: { kind: 'num', digits: 3 } },
      median_i2: { text: byId('m-i2').textContent, fmt: { kind: 'pct', digits: 1 } }
    };
  }
  var templates = {
    plain: function (T, r) {
      return ['This exploratory analysis examined ', T.int('n_subsets'), ' subsets of ', T.int('k'),
        ' studies. The median of the subset estimates was ', T.num('median_est', 3),
        ' on the supplied effect scale. Median subset I² was ', T.pct('median_i2', 1),
        '. The plot helps explore how results change with study selection; it does not establish distinct populations, causation or clinical importance.',
        T.when(r.sampled, ' Subsets were sampled with replacement, so repeated subsets can occur.')];
    },
    methods: function (T, r) {
      return ['GOSH pooled the supplied effects using ',
        T.pick('model', { FE: 'fixed-effect inverse-variance weighting', DL: 'random-effects inverse-variance weighting with DerSimonian–Laird between-study variance truncated at zero' }),
        '. Within-study variances were squared standard errors. No transformation or back-transformation was applied. ',
        'Subset I² was the positive part of (Q minus degrees of freedom) divided by Q, expressed as a percentage; Q used fixed-effect weights and degrees of freedom equalled subset size minus one. Single-study subsets had I² set to zero and used the study effect. ',
        r.sampled
          ? ['The app drew ', T.int('n_subsets'), ' subsets with replacement using its fixed-seed generator: subset size was uniform from two through the study count and members were selected by partial Fisher–Yates shuffling. This sampling scheme differs from the default in metafor::gosh. ']
          : 'Every nonempty subset was enumerated, including single-study subsets. ',
        'Medians used linear interpolation between ordered observations. The app computes no confidence intervals, hypothesis tests or prediction intervals, and does not export subset variance estimates. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T) {
      return ['Across ', T.int('k'), ' studies, ', T.int('n_subsets'), ' subsets were computed. Median estimate = ',
        T.num('median_est', 3), '; median I² = ', T.pct('median_i2', 1),
        '. Applied descriptively to this median, the overlapping Cochrane heterogeneity bands suggest that heterogeneity ',
        T.band('median_i2', 1), ' (', T.cite('handbookHet'), '). This is a median across subsets, not a full-data pooled estimate or full-data heterogeneity statistic.'];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(T.zero('median_i2', 1), 'A median subset I² of zero does not establish homogeneous evidence.')];
    }
  };
  var text = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates,
    // Text's currency check must not call the live adapter (which re-runs GOSH)
    // while the user is editing inputs for the next analysis.
    stale: function () { return !byId('analysis-stale').hidden; } };
  var spec = {
    paper: 13, title: 'GOSH subset exploration',
    entry: { schema: 'generic', apply: apply, provenance: true, usedAs: 'effect and standard error on the supplied analysis scale' },
    text: text,
    verify: {
      adapter: verificationAdapter,
      inputs: '#src, #model, #n-sample, #enum-mode, #alm-axis-mount input',
      rObjects: 'base (rma), g (gosh for enumerated subsets), yi, vi, members, mus, i2s',
      plots: [{ id: 'gosh', title: 'GOSH scatter', width_in: 8, height_in: 6,
        r: 'if (length(yi) <= 15) { plot(g, het="I2") } else { plot(mus, i2s, xlab="Pooled effect", ylab="I squared (%)", main="Captured app subsets") }',
        app: function () { return byId('plot'); } }]
    },
    share: {
      get: function () {
        // Match textarea assignment on restore without editing the live input.
        // Otherwise pasted CRLF data changes the serialized state on round-trip.
        var last = global._almLastGosh();
        return { src: byId('src').value.replace(/\r\n/g, '\n'), model: byId('model').value, draws: byId('n-sample').value,
          enumeration: byId('enum-mode').value || 'auto',
          // The separate exact button does not change the enumeration selector.
          exactResult: !!(last && last.k > 15 && !last.sampled && byId('analysis-stale').hidden),
          axes: shareAxes().map(function (e) { return e.type === 'checkbox' ? e.checked : e.value; }),
          entryLog: global.AlmFeaturesState.entryLog };
      },
      set: function (s) {
        if (!s || typeof s.src !== 'string' || s.src.length > 200000) throw new Error('Missing or oversized data.');
        // Validate every line before mutating controls, results or conversion logs.
        // Reuse the app parser so share links cannot silently discard bad rows or
        // accept numeric prefixes/extra columns that Run analysis refuses.
        var records = global.__almGoshParse(s.src).map(function (r) {
          return { yi: r.te, sei: r.se, study: r.label };
        });
        validRecords(records);
        if (['FE', 'DL'].indexOf(s.model) < 0) throw new Error('Unknown pooling model.');
        var enumeration = s.enumeration === undefined ? 'auto' : s.enumeration;
        if (['auto', 'exact', 'sample'].indexOf(enumeration) < 0) throw new Error('Unknown enumeration mode.');
        if (s.exactResult !== undefined && typeof s.exactResult !== 'boolean') throw new Error('Invalid exact-result setting.');
        if (typeof s.draws !== 'string' || !Number.isInteger(Number(s.draws)) || Number(s.draws) < 1 || Number(s.draws) > 100000) throw new Error('Invalid draw count.');
        if (!Array.isArray(s.axes) || s.axes.length !== 6) throw new Error('Missing axis settings.');
        s.axes.forEach(function (v, i) {
          if (i % 3 === 2 ? typeof v !== 'boolean' : typeof v !== 'string' || (v !== '' && !Number.isFinite(Number(v)))) throw new Error('Invalid axis setting.');
        });
        [0, 3].forEach(function (i) { if (s.axes[i] !== '' && s.axes[i + 1] !== '' && Number(s.axes[i]) >= Number(s.axes[i + 1])) throw new Error('Invalid axis range.'); });
        if (s.entryLog !== undefined && !Array.isArray(s.entryLog)) throw new Error('Invalid conversion log.');
        var axisInputs = shareAxes();
        byId('src').value = s.src; byId('model').value = s.model; byId('n-sample').value = s.draws;
        byId('enum-mode').value = enumeration;
        axisInputs.forEach(function (e, i) {
          if (e.type === 'checkbox') e.checked = s.axes[i]; else e.value = s.axes[i];
          e.dispatchEvent(new Event('change', { bubbles: true }));
        });
        global.AlmFeaturesState.entryLog = s.entryLog || [];
        byId('btn-run').click();
        if (s.exactResult && byId('exact-progress').hidden && global._almLastGosh().sampled) byId('exact-run').click();
      }
    }
  };
  global.AlmGoshFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = text;
  if (global.AlmFeatures) {
    // The core's built-in entry/text modules mount on first use and refresh text
    // on show. Eager app overrides install hidden text listeners that can refit.
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
