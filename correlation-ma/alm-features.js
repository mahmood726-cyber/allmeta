/* Paper 17: additive entry, text, live-R verification and share adapter.
 * Statistics are read from _almLastCorrMA(), never re-estimated here.
 * Live R leaves r, n, k, e (ZCOR escalc), m (rma fit), mu, se, tau, pi.
 * The mount is outside main to preserve the validation adapter's pinned page text.
 */
(function (global) {
  'use strict';
  var APP = 'correlation-ma', METHODS = ['REML', 'PM', 'DL', 'FE'];
  function byId(id) { return document.getElementById(id); }
  function run() { byId('f-data').dispatchEvent(new Event('input', { bubbles: true })); }

  function apply(records) {
    if (!Array.isArray(records) || records.length < 2) throw new Error('At least two studies are required.');
    // Validate every row before touching the page: its parser otherwise silently skips bad rows.
    var lines = records.map(function (s) {
      if (!s || typeof s.study !== 'string' || !s.study.trim() || /[\r\n]/.test(s.study) ||
          /^\s*#/.test(s.study)) throw new Error('Study labels must be nonempty single lines and cannot start with #.');
      if (!Number.isFinite(s.ri) || s.ri <= -1 || s.ri >= 1 ||
          !Number.isFinite(s.ni) || s.ni <= 3) throw new Error('Each study needs −1 < r < 1 and n > 3.');
      return s.study.trim() + ', ' + s.ri + ', ' + s.ni;
    });
    byId('f-data').value = lines.join('\n');
    run();
    return { ok: true, n: records.length };
  }

  function results() {
    var o = typeof global._almLastCorrMA === 'function' ? global._almLastCorrMA() : null;
    if (!o) return null;
    var r = {};
    ['k', 'method', 'mu_z', 'se_z', 'tau2_z', 'I2', 'r', 'r_lo', 'r_hi', 'r_pi_lo', 'r_pi_hi'].forEach(function (key) {
      r[key] = o[key];
    });
    // Analysis conventions are exposed as audited result metadata, not literal digits in prose.
    r.level = 95;
    r.varianceOffset = 3;
    r.piMinStudies = 2;
    r.includesNull = global.AlmText.cochrane.ciIncludesNull(o.r_lo, o.r_hi, 0);
    r.imprecise = global.AlmText.cochrane.imprecise(o.r_lo, o.r_hi, 0);
    var pt = global.__almTextPerturb;
    if (pt && typeof r[pt.key] === 'number' && Number.isFinite(pt.delta)) r[pt.key] += pt.delta;
    return r;
  }

  function dom() {
    var out = {}, head = byId('headline').textContent;
    function add(key, text, kind, digits) { out[key] = { text: text, fmt: { kind: kind || 'num', digits: digits } }; }
    var m = /k = (\d+) · pooled r = ([-.\d]+) \[([-.\d]+), ([-.\d]+)\] · τ²\(z\) = ([-.\d]+) · I² = ([-.\d]+)%/.exec(head);
    if (m) {
      add('k', m[1], 'int'); add('r', m[2], 'num', 3);
      add('r_lo', m[3], 'num', 3); add('r_hi', m[4], 'num', 3);
      add('tau2_z', m[5], 'num', 4); add('I2', m[6] + '%', 'pct', 1);
    } else {
      // Fail closed if the headline is missing or malformed.
      add('r', head, 'num', 3);
    }
    var pi = /95% PI \[([-.\d]+), ([-.\d]+)\]/.exec(head);
    if (pi) { add('r_pi_lo', pi[1], 'num', 3); add('r_pi_hi', pi[2], 'num', 3); }
    else if (global._almLastCorrMA() && global._almLastCorrMA().r_pi_lo !== null) {
      add('r_pi_lo', '', 'num', 3); add('r_pi_hi', '', 'num', 3);
    }
    var pooled = document.querySelector('#res-body .pooled-row');
    add('mu_z', pooled ? pooled.cells[3].textContent : '', 'num', 3);
    return out;
  }

  var templates = {
    plain: function (T, r) {
      return [
        'This analysis combined ', T.int('k'), ' studies. The pooled correlation was ', T.num('r', 3),
        ' (', T.pct('level', 0), ' confidence interval ', T.ci('r_lo', 'r_hi', 3), '). ',
        r.imprecise ? 'The interval includes no association and associations in either direction; this is no evidence of a difference, not evidence of no difference. '
          : r.includesNull ? 'The interval includes no association; this is no evidence of a difference, not evidence of no difference. '
          : 'The confidence interval does not include zero correlation. ',
        'Variation beyond sampling error ', T.band('I2', 1), ' (I² = ', T.pct('I2', 1), '). ',
        T.when(T.has('r_pi_lo'), function () {
          return ['For a new study in a similar setting, the prediction interval for the true correlation is ',
            T.ci('r_pi_lo', 'r_pi_hi', 3), '. '];
        }),
        'Correlation does not establish causation or clinical importance.'
      ];
    },
    methods: function (T, r) {
      return [
        'Correlations were transformed with Fisher z = atanh(r), with sampling variance equal to the reciprocal of (sample size minus ',
        T.int('varianceOffset'), '), and pooled using inverse-variance weights. ',
        r.method === 'FE'
          ? 'A fixed-effect (common-effect) model fixed the between-study variance at zero. '
          : ['A random-effects model estimated between-study variance using ',
            T.pick('method', { REML: 'restricted maximum likelihood (REML)', PM: 'Paule–Mandel', DL: 'DerSimonian–Laird' }), '. '],
        'The pooled ', T.pct('level', 0), ' confidence interval used the standard normal (Wald) critical value on the Fisher-z scale, without Hartung–Knapp adjustment. ',
        'The page does not report a hypothesis-test p-value. Study confidence intervals also use the normal approximation on the Fisher-z scale. ',
        'Pooled estimates, confidence limits and prediction limits were back-transformed with tanh. ',
        r.method === 'FE'
          ? 'I² was computed from Cochran’s Q as the nonnegative part of (Q minus its degrees of freedom) divided by Q, expressed as a percentage. No prediction interval was computed for this model. '
          : ['I² was computed as between-study variance divided by the sum of between-study variance and the Higgins–Thompson typical within-study variance, expressed as a percentage (',
            T.cite('higginsThompson'), '). The typical variance is (k minus one) times the sum of fixed-effect weights divided by the squared sum of weights minus the sum of squared weights. ',
            'The ', T.pct('level', 0), ' prediction interval used pooled z ± t × √(τ² + SE²), with t degrees of freedom equal to the number of studies minus one (',
            T.cite('handbookPI'), '; ', T.cite('hts'), '). The app computes this interval from ', T.int('piMinStudies'),
            ' studies onward; estimates from few studies are uncertain. '],
        'The page accepts finite correlations strictly between minus one and one and sample sizes greater than ', T.int('varianceOffset'),
        '; invalid input rows are skipped by its parser. ',
        T.entry(), T.when(T.entry(), ' '), T.software(), T.when(T.verify(), [' ', T.verify()])
      ];
    },
    results: function (T) {
      return [
        'The analysis included ', T.int('k'), ' studies. The pooled correlation was ', T.num('r', 3),
        ' (', T.pct('level', 0), ' CI ', T.ci('r_lo', 'r_hi', 3), '); pooled Fisher z = ', T.num('mu_z', 3),
        '. Between-study variance τ²(z) = ', T.num('tau2_z', 4), '; I² = ', T.pct('I2', 1),
        ' (', T.band('I2', 1), '; ', T.cite('handbookHet'), ').',
        T.when(T.has('r_pi_lo'), function () {
          return [' The ', T.pct('level', 0), ' prediction interval on the correlation scale was ', T.ci('r_pi_lo', 'r_pi_hi', 3), '.'];
        })
      ];
    },
    flags: function (T, r) {
      return [
        T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates and prediction limits are imprecise.'),
        T.when(r.k < T.R.funnelK, 'Tests for small-study effects would be underpowered; none were performed.'),
        T.when(T.zero('I2', 1), 'An I² near zero does not establish homogeneity.'),
        T.when(r.imprecise, 'The confidence interval includes no association and associations in either direction, indicating imprecision.')
      ];
    }
  };
  var textSpec = { app: APP, verifyPackage: 'metafor', results: results, templates: templates, dom: dom };
  var spec = {
    paper: 17, title: 'Correlation meta-analysis',
    entry: { schema: 'correlation', apply: apply },
    text: textSpec,
    verify: {
      adapter: function () { return global.AlmValidate.adapters[APP]; },
      rObjects: 'r, n, k, e (ZCOR escalc), m (rma fit), mu, se, tau, pi',
      plots: [{
        id: 'forest', title: 'Forest plot', width_in: 8, height_in: 6,
        r: function (state) {
          return 'metafor::forest(m, transf=tanh, slab=c(' + state.studies.map(function (s) {
            return JSON.stringify(String(s.label));
          }).join(',') + '), refline=0, xlab="Correlation", header=c("Study","Correlation [95% CI]"))';
        },
        app: function () { return document.querySelector('#forest-host svg'); }
      }]
    },
    share: {
      get: function () { return { data: byId('f-data').value, method: byId('f-method').value }; },
      set: function (s) {
        if (!s || typeof s.data !== 'string' || s.data.length > 200000) throw new Error('Data text missing or too long.');
        if (METHODS.indexOf(s.method) < 0) throw new Error('Unknown estimator.');
        byId('f-data').value = s.data;
        byId('f-method').value = s.method;
        run();
      }
    }
  };
  global.AlmCorrelationFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures) {
    // The current entry/text modules expose mount(), while verify/share self-register.
    if (typeof global.AlmFeatures.registerModule === 'function') {
      global.AlmFeatures.registerModule('entry', { render: function (el, ctx) {
        return global.AlmEntryUI.mount(el, ctx.block);
      } });
      global.AlmFeatures.registerModule('text', { render: function (el, ctx) {
        return global.AlmTextUI.mount(el, { app: ctx.app, text: ctx.block });
      } });
    }
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
