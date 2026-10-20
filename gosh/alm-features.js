/* GOSH features. Statistics come only from _almLastGosh().
 * The existing live adapter leaves base (rma), g (gosh, enumeration only),
 * yi, vi and captured subset memberships in R. No second statistical engine.
 */
(function (global) {
  'use strict';
  var APP = 'gosh';
  function byId(id) { return document.getElementById(id); }
  function axes() { return Array.from(document.querySelectorAll('#alm-axis-mount input')); }
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
    if (p && typeof r[p.key] === 'number' && typeof p.delta === 'number') r[p.key] += p.delta;
    return r;
  }
  function dom() {
    return {
      n_subsets: { text: byId('m-n').textContent, fmt: { kind: 'int' } },
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
  var text = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates };
  var spec = {
    paper: 13, title: 'GOSH subset exploration',
    entry: { schema: 'generic', apply: apply, provenance: true, usedAs: 'effect and standard error on the supplied analysis scale' },
    text: text,
    verify: {
      adapter: function () { return (global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) || global.AlmGoshValidationAdapter; },
      inputs: '#src, #model, #n-sample, #alm-axis-mount input',
      rObjects: 'base (rma), g (gosh for enumerated subsets), yi, vi, members',
      plots: [{ id: 'gosh', title: 'GOSH scatter', width_in: 8, height_in: 6,
        r: 'if (length(yi) <= 15) { plot(g, het="I2") } else { plot(mus, i2s, xlab="Pooled effect", ylab="I squared (%)", main="Captured app subsets") }',
        app: function () { return byId('plot'); } }]
    },
    share: {
      get: function () {
        return { src: byId('src').value, model: byId('model').value, draws: byId('n-sample').value,
          axes: axes().map(function (e) { return e.type === 'checkbox' ? e.checked : e.value; }),
          entryLog: global.AlmFeaturesState.entryLog };
      },
      set: function (s) {
        if (!s || typeof s.src !== 'string' || s.src.length > 200000) throw new Error('Missing or oversized data.');
        var records = s.src.trim().split(/\n/).map(function (line, i) {
          var p = line.split(',');
          if (p.length < 2 || p.length > 3 || !p[0].trim() || !p[1].trim()) throw new Error('Invalid data row.');
          return { yi: Number(p[0]), sei: Number(p[1]), study: (p[2] || 'S' + (i + 1)).trim() };
        });
        validRecords(records);
        if (['FE', 'DL'].indexOf(s.model) < 0) throw new Error('Unknown pooling model.');
        if (typeof s.draws !== 'string' || !Number.isInteger(Number(s.draws)) || Number(s.draws) < 1 || Number(s.draws) > 100000) throw new Error('Invalid draw count.');
        if (!Array.isArray(s.axes) || s.axes.length !== 6) throw new Error('Missing axis settings.');
        s.axes.forEach(function (v, i) {
          if (i % 3 === 2 ? typeof v !== 'boolean' : typeof v !== 'string' || (v !== '' && !Number.isFinite(Number(v)))) throw new Error('Invalid axis setting.');
        });
        [0, 3].forEach(function (i) { if (s.axes[i] !== '' && s.axes[i + 1] !== '' && Number(s.axes[i]) >= Number(s.axes[i + 1])) throw new Error('Invalid axis range.'); });
        if (s.entryLog !== undefined && !Array.isArray(s.entryLog)) throw new Error('Invalid conversion log.');
        byId('src').value = s.src; byId('model').value = s.model; byId('n-sample').value = s.draws;
        axes().forEach(function (e, i) {
          if (e.type === 'checkbox') e.checked = s.axes[i]; else e.value = s.axes[i];
          e.dispatchEvent(new Event('change', { bubbles: true }));
        });
        global.AlmFeaturesState.entryLog = s.entryLog || [];
        byId('btn-run').click();
      }
    }
  };
  global.AlmGoshFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = text;
  if (global.AlmFeatures) {
    if (typeof global.AlmFeatures.registerModule === 'function') {
      global.AlmFeatures.registerModule('entry', { render: function (el, ctx) { return global.AlmEntryUI.mount(el, ctx.block); } });
      global.AlmFeatures.registerModule('text', { render: function (el) {
        var ui = global.AlmTextUI.mount(el, { app: APP, text: text });
        return { onShow: ui.regenerate };
      } });
    }
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
