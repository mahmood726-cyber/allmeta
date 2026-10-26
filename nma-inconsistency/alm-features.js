/* nma-inconsistency/alm-features.js — paper 16 adapter for the shared feature panel (shared/alm-features.js).
 *
 * entry : schema 'contrast-nma' {study, t1, t2, yi, sei}. apply(records) writes one
 *         "t1, t2, effect, SE, study" line per record into the app's OWN input (#src, the format parse() reads:
 *         effect = t1 relative to t2, i.e. t1 minus t2 on the analysis scale), numbers by String() (shortest
 *         round-trip form), labels CSV-quoted only when needed. Before anything is changed the candidate text is
 *         checked with the app's own parse() + inputIssue() (>= 3 contrasts, no multi-arm / repeated study IDs,
 *         connected network); refused records leave the input untouched. Then the app is run (#btn-run).
 * text  : results() reads ONLY the app's own last result (window._almLastInco(), the object run() stores and the
 *         page renders from); nothing statistical is recomputed. Counts: k = consistency-model df + number of
 *         treatments - 1 (= number of contrasts, since df = contrasts - basic parameters); nIncon = comparisons
 *         the page labels "inconsistent" (its own rule p < 0.05). What nma-inconsistency/index.html runs:
 *           - independent two-arm contrasts; weighted least squares network (consistency) model with basic
 *             parameters against the first treatment in sorted label order; weights 1/(SE^2 + tau2);
 *           - #f-model: FE (tau2 = 0), PM (generalised Paule-Mandel: Q(tau2) of the consistency model = its df,
 *             bisection; 0 when Q <= df), DL (generalised moment estimator max(0, (Q - df)/C),
 *             C = tr(W) - tr((X'WX)^-1 X'W^2 X); netmeta method.tau = "DL"); tau2 is estimated once from the
 *             full network and held fixed in every split and in the global test;
 *           - node-split for every comparison with direct studies whose remaining studies still connect its two
 *             treatments: direct = inverse-variance mean of its studies; indirect = the same comparison from the
 *             network model fitted to all other studies; difference = direct - indirect,
 *             SE = sqrt(SEd^2 + SEi^2), z = difference/SE, two-sided p (chi-squared, 1 df); comparison "a vs b"
 *             (a, b in sorted order) is the effect of a relative to b; equals netmeta netsplit back-calculation
 *             for independent two-arm studies at a fixed tau2;
 *           - global design-by-treatment test: Q = weighted SS between the fitted values of the consistency model
 *             and of a model with one parameter per design (pair of treatments), df = difference in parameters,
 *             p from chi-squared; same tau2 in both models (decomp.design tau.preset); no loops -> not testable.
 *         Display digits (index.html run()): estimates/SEs 3 dp, z 2 dp, p 3 dp, Q 2 dp, tau2 4 dp.
 *         Treatment labels are printed as entered; a label containing a digit makes the number audit fail
 *         (fail-closed: the text is then withheld), because only T helpers may print digits.
 *         Template rule: no digit literals outside T.* calls (hub/shared/tests/unit/alm-text-lint.test.mjs).
 *         Test-only hook: window.__almTextPerturb = {key, delta} adds delta to that results() key.
 * verify: the live adapter nma-inconsistency/alm-live.js (AlmLiveAdapters['nma-inconsistency']; netmeta
 *         netsplit back-calculation + decomp.design, metafor .QE.func for PM). R objects its buildScript leaves in
 *         the global environment: A, B, te, se, study, tr (treatments, app order), model, tau, m (netmeta fit),
 *         spl (netsplit), dec (decomp.design), out (compared values).
 *         Plots: (1) netsplit = meta::forest(spl) (forest.netsplit) beside the page's own net-split SVG;
 *         (2) netgraph = netmeta::netgraph(m) — R only, the page draws no network graph.
 * share : {src: #src text, model: #f-model}; set() validates, restores and re-runs.
 */
(function (global) {
  'use strict';
  var APP = 'nma-inconsistency';
  var MODELS = ['FE', 'PM', 'DL'];
  var FIELDS = ['direct', 'directSE', 'indirect', 'indirectSE', 'diff', 'diffSE', 'z', 'p'];

  function byId(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }

  // ------------------------------------------------------------------ entry (F1)

  function refuse(msg) { return { ok: false, n: 0, error: msg }; }
  function csvField(s) { return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function label(v) { return v === undefined || v === null ? '' : String(v).trim(); }

  function apply(records) {
    if (!Array.isArray(records) || !records.length) return refuse('No rows to use.');
    var lines = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i] || {}, row = 'Row ' + (i + 1) + ': ';
      var study = label(r.study), t1 = label(r.t1), t2 = label(r.t2);
      if (!study) return refuse(row + 'a study label is required.');
      if (!t1 || !t2) return refuse(row + 'both treatment labels (t1 and t2) are required.');
      if (t1 === t2) return refuse(row + 'the two treatments must differ.');
      if ([study, t1, t2].some(function (s) { return /[\r\n]/.test(s); })) return refuse(row + 'labels must be one line.');
      if (typeof r.yi !== 'number' || !isFinite(r.yi)) return refuse(row + 'a finite effect estimate (t1 versus t2) is required.');
      var se = r.sei;
      if (typeof se !== 'number' || !isFinite(se) || !(se > 0) || !isFinite(se * se) || !isFinite(1 / (se * se))) {
        return refuse(row + 'a positive, numerically representable standard error is required.');
      }
      lines.push([csvField(t1), csvField(t2), String(r.yi), String(se), csvField(study)].join(', '));
    }
    var ta = byId('src'), run = byId('btn-run');
    if (!ta || !run || typeof global.parse !== 'function' || typeof global.inputIssue !== 'function') return refuse('The app input is not available.');
    var text = lines.join('\n');
    // The app's own parser and input rules, before anything is changed.
    var parsed = global.parse(text);
    if (parsed.length !== records.length) return refuse('The app could not read every row (' + parsed.length + ' of ' + records.length + ').');
    var issue = global.inputIssue(parsed);
    if (issue) return refuse('The app refuses these rows: ' + issue);
    ta.value = text;
    run.click();
    var res = typeof global._almLastInco === 'function' ? global._almLastInco() : null;
    if (!res || res.status === 'refused' || !Array.isArray(res.nodeSplit)) {
      return { ok: false, n: 0, error: 'The app did not accept the rows' + (res && res.reason ? ': ' + res.reason : '.') };
    }
    return { ok: true, n: parsed.length };
  }

  // ------------------------------------------------------------------- text (F2)

  function stale() {
    var live = global.AlmLiveAdapters && global.AlmLiveAdapters[APP];
    if (!live || typeof live.currentState !== 'function') return false;
    try { live.currentState(); return false; }
    catch (e) { return true; }
  }

  function results() {
    if (stale()) return null;
    var s = typeof global._almLastInco === 'function' ? global._almLastInco() : null;
    if (!s || s.status === 'refused' || !Array.isArray(s.nodeSplit) || !Array.isArray(s.trts) || !s.dbt) return null;
    var r = {
      model: s.model,
      k: s.df + s.trts.length - 1,
      nTrt: s.trts.length,
      nSplit: s.nodeSplit.length,
      nIncon: s.nodeSplit.filter(function (x) { return x.p < 0.05; }).length,
      tau2: s.tau2,
      dbtQ: s.dbt.Q,
      dbtDf: s.dbt.df,
      dbtAvailable: typeof s.dbt.p === 'number' && isFinite(s.dbt.p),
      dbtLoops: s.dbt.df > 0,
      labels: s.nodeSplit.map(function (x) { return x.comparison; })
    };
    if (r.dbtAvailable) { r.dbtP = s.dbt.p; r.dbtIncon = s.dbt.p < 0.05; }
    s.nodeSplit.forEach(function (x, i) {
      var v = [x.direct.mean, x.direct.se, x.indirect.mean, x.indirect.se, x.diff, x.seDiff, x.z, x.p];
      FIELDS.forEach(function (f, j) { r['split.' + i + '.' + f] = v[j]; });
    });
    var pt = global.__almTextPerturb;
    if (pt && typeof pt.key === 'string' && typeof r[pt.key] === 'number' && typeof pt.delta === 'number') {
      r[pt.key] = r[pt.key] + pt.delta;
    }
    return r;
  }

  // What the page DISPLAYS (#ns-body table, #dbt), with the digits the app uses, for the audit's DOM cross-check.
  function dom() {
    if (typeof document === 'undefined') return null;
    var out = {}, num = function (d) { return { kind: 'num', digits: d }; };
    var fmts = [num(3), num(3), num(3), num(3), num(3), num(3), num(2), num(3)];
    var rows = document.querySelectorAll('#ns-body tr');
    Array.prototype.forEach.call(rows, function (tr, i) {
      var td = Array.prototype.map.call(tr.querySelectorAll('td'), function (c) { return c.textContent.trim(); });
      if (td.length < 6) return;
      var pairs = [td[1], td[2], td[3]].map(function (c) { return /^(\S+) \((\S+)\)$/.exec(c) || []; });
      var texts = [pairs[0][1], pairs[0][2], pairs[1][1], pairs[1][2], pairs[2][1], pairs[2][2], td[4], td[5]];
      FIELDS.forEach(function (f, j) { if (texts[j] !== undefined) out['split.' + i + '.' + f] = { text: texts[j], fmt: fmts[j] }; });
    });
    var g = byId('dbt') ? byId('dbt').textContent.replace(/\s+/g, ' ') : '';
    var m = /Q = (-?\d+(?:\.\d+)?), df = (\d+), p = (\S+?)\.(?:\s|$)/.exec(g);
    if (m) {
      out.dbtQ = { text: m[1], fmt: num(2) };
      out.dbtDf = { text: m[2], fmt: { kind: 'int' } };
      if (/^-?\d/.test(m[3])) out.dbtP = { text: m[3], fmt: num(3) };
    }
    var t = /(?:PM|DL) τ² = (-?\d+(?:\.\d+)?)/.exec(g);
    if (t) out.tau2 = { text: t[1], fmt: num(4) };
    return out;
  }

  var MODEL_PLAIN = { FE: 'fixed-effect model', PM: 'random-effects model', DL: 'random-effects model' };
  var TAU_NAME = { PM: 'Paule–Mandel', DL: 'DerSimonian–Laird' };

  // Per-comparison Results fragments (keys are built from the index; no digit literals).
  function splitParts(T, r) {
    var parts = [];
    r.labels.forEach(function (lab, i) {
      var k = function (f) { return 'split.' + i + '.' + f; };
      if (parts.length) parts.push('; ');
      parts.push(lab, ': direct ', T.num(k('direct'), 3), ' (SE ', T.num(k('directSE'), 3), '), indirect ',
        T.num(k('indirect'), 3), ' (SE ', T.num(k('indirectSE'), 3), '), difference ', T.num(k('diff'), 3),
        ' (SE ', T.num(k('diffSE'), 3), '), z = ', T.num(k('z'), 2), ', ', T.p(k('p')));
    });
    return parts;
  }
  function inconLabels(r) {
    return r.labels.filter(function (lab, i) { return r['split.' + i + '.p'] < 0.05; }).join(', ');
  }
  function verified() {
    try { return !!(global.AlmFeatures && typeof global.AlmFeatures.verifiedCurrent === 'function' && global.AlmFeatures.verifiedCurrent(APP)); }
    catch (e) { return false; }
  }

  var templates = {
    plain: function (T, r) {
      return [
        'This analysis checked whether direct and indirect evidence agree in a network of ', T.int('k'),
        ' two-arm studies comparing ', T.int('nTrt'), ' treatments, using a ', T.pick('model', MODEL_PLAIN), '. ',
        r.nSplit === T.R.none
          ? 'No comparison had both direct evidence and an independent indirect route, so node-splitting was not possible. '
          : ['Direct and indirect evidence could be compared for ', T.int('nSplit'), T.plural('nSplit', ' comparison', ' comparisons'), '; ',
            r.nIncon === T.R.none
              ? 'for none of them did the two sources disagree by more than chance would readily explain (all P values at or above five per cent). '
              : [T.int('nIncon'), ' of them (', inconLabels(r), ') showed a disagreement larger than chance would readily explain (P below five per cent). ']],
        r.dbtAvailable
          ? ['The test of the network as a whole ',
            r.dbtIncon ? ['found evidence of inconsistency (', T.p('dbtP'), '). ']
              : ['found no clear evidence of inconsistency (', T.p('dbtP'), '); this does not show that the network is consistent. ']]
          : 'The test of the network as a whole could not be carried out. ',
        'Tests for inconsistency have low power, especially when comparisons rest on few studies, so they cannot rule inconsistency out. ',
        'This summary describes agreement between sources of evidence; it does not show which treatment is better or whether any difference matters to patients.'
      ];
    },

    methods: function (T, r) {
      return [
        'Each study contributed one contrast (the effect of one treatment relative to another, on the scale on which it was entered, with its standard error); only independent two-arm studies were accepted, and the network had to be connected. ',
        'A network (consistency) model was fitted by weighted least squares with the basic parameters expressed against the first treatment in sorted label order, with weights equal to one over the sum of the squared standard error and the between-study variance τ². ',
        r.model === 'FE'
          ? 'A fixed-effect model was used (τ² set to zero). '
          : ['A random-effects model was used with one τ² shared by all comparisons, estimated from the residuals of the consistency model with the ',
            T.pick('model', TAU_NAME), ' approach generalised to the network (',
            r.model === 'PM'
              ? ['the value at which the generalised Q statistic equals its degrees of freedom, found by bisection, and zero when Q does not exceed its degrees of freedom; ', T.cite('pauleMandel')]
              : ['the moment estimator max(zero, (Q − df)/C) with C = tr(W) − tr((XᵀWX)⁻¹XᵀW²X), as in netmeta with method.tau = "DL"; ', T.cite('dersimonianLaird')],
            '); this τ² was held fixed in every split and in the global test. '],
        'Inconsistency was assessed by node-splitting (the approach of Dias and colleagues) for every comparison with direct evidence whose remaining studies still connect its two treatments: the direct estimate is the inverse-variance weighted mean of the studies of that comparison, and the indirect estimate is the same comparison estimated by the network model fitted to all other studies. ',
        'The difference (direct minus indirect) has standard error √(SE²(direct) + SE²(indirect)) and was tested with a z statistic and a two-sided P value from the normal distribution. ',
        'For independent two-arm studies this split is identical to the back-calculation method of netmeta (netsplit) at the same τ². ',
        'A comparison labelled “A vs B” is the effect of A relative to B, with A and B in sorted label order; the app labels a comparison “inconsistent” when its P value is below five per cent. ',
        'Global inconsistency was assessed with the design-by-treatment interaction test (the approach of Higgins and colleagues): the weighted sum of squares between the fitted values of the consistency model and of a model with one parameter for each design (each pair of treatments, as all studies have two arms), referred to a chi-squared distribution with degrees of freedom equal to the difference in the number of parameters',
        r.model === 'FE' ? '. ' : ', using the same τ² in both models (as netmeta decomp.design with tau.preset, not its default within-design τ²). ',
        'The plot shows ', T.rule('ciLevel'), ' confidence intervals (estimate ± z × SE) for the direct and indirect estimates. ',
        'No prediction intervals, treatment rankings or pooled network estimates are reported by this app. ',
        T.entry(),
        T.when(T.entry(), ' '),
        T.software(),
        T.when(verified() && T.verify(), function () { return [' ', T.verify()]; })
      ];
    },

    results: function (T, r) {
      return [
        'The network included ', T.int('k'), ' two-arm studies of ', T.int('nTrt'), ' treatments. ',
        r.model === 'FE'
          ? 'The fixed-effect model was used. '
          : ['The random-effects model used τ² = ', T.num('tau2', 4), ' (', T.pick('model', TAU_NAME), '). '],
        r.nSplit === T.R.none
          ? 'No comparison could be split into direct and indirect evidence. '
          : ['Node-splitting (', T.int('nSplit'), T.plural('nSplit', ' comparison', ' comparisons'),
            '; estimate with standard error, difference = direct minus indirect): ', splitParts(T, r), '. ',
            r.nIncon === T.R.none
              ? 'No comparison had a P value below five per cent. '
              : [T.int('nIncon'), T.plural('nIncon', ' comparison had', ' comparisons had'), ' a P value below five per cent (', inconLabels(r), '). ']],
        r.dbtAvailable
          ? ['The design-by-treatment interaction test gave Q = ', T.num('dbtQ', 2), ' (df = ', T.int('dbtDf'), ', ', T.p('dbtP'), ').']
          : (r.dbtLoops
            ? 'The design-by-treatment interaction test could not be computed (the inconsistency model was singular).'
            : 'The design-by-treatment interaction test was not available because the network has no closed loops.')
      ];
    },

    flags: function (T, r) {
      return [
        'Tests for inconsistency have low power: a P value at or above five per cent is no clear evidence of inconsistency, not evidence of consistency.',
        T.when(r.nSplit > T.R.none, 'Each comparison is tested separately; with several comparisons, some small P values are expected by chance alone.'),
        T.when(r.model === 'FE', 'The fixed-effect model ignores between-study heterogeneity, which can make inconsistency tests too liberal; the random-effects options estimate a shared τ² first.'),
        T.when(r.k < T.R.fewK, ['Few studies (', T.int('k'), ', fewer than ', T.rule('fewK'), '): direct and indirect estimates are imprecise.'])
      ];
    }
  };

  var textSpec = {
    app: APP,
    verifyPackage: 'netmeta',
    results: results,
    stale: stale,
    templates: templates,
    dom: dom,
    mount: function (el) { return global.AlmTextUI ? global.AlmTextUI.mount(el, { app: APP, text: textSpec }) : null; }
  };

  // ------------------------------------------------------------ verify (F3)

  // The page's own net-split SVG, without its id (the panel shows a copy beside the R plot).
  function appSplit() {
    var svg = byId('ns-plot');
    if (!svg) return null;
    var clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    return clone;
  }

  // -------------------------------------------------------------- share (F5)

  function shareGet() {
    return { src: byId('src').value, model: byId('f-model').value };
  }
  function shareSet(s) {
    if (!s || typeof s.src !== 'string' || s.src.length > 200000) throw new Error('data text missing or too long');
    if (MODELS.indexOf(s.model) < 0) throw new Error('unknown model ' + String(s.model));
    byId('src').value = s.src;
    byId('f-model').value = s.model;
    byId('btn-run').click();
  }

  var spec = {
    paper: 16,
    title: 'NMA inconsistency',
    entry: {
      schema: 'contrast-nma',
      extras: [],
      usedAs: 'effect of treatment 1 relative to treatment 2 (t1 minus t2 on the analysis scale, as entered) with its standard error; one independent two-arm study per row',
      apply: apply
    },
    text: textSpec,
    verify: {
      adapter: function () { return global.AlmLiveAdapters ? global.AlmLiveAdapters[APP] : null; },
      inputs: '#src, #f-model',
      rObjects: 'A, B, te, se, study, tr, model, tau; m (netmeta fit); spl (netsplit, back-calculation); dec (decomp.design); out (compared values)',
      plots: [
        { id: 'netsplit', title: 'Net-split forest plot', r: 'meta::forest(spl)', width_in: 8, height_in: 8, app: appSplit },
        { id: 'netgraph', title: 'Network graph (R only; the app draws none)', r: 'netmeta::netgraph(m)', width_in: 7, height_in: 7, app: function () { return null; } }
      ]
    },
    share: { get: shareGet, set: shareSet }
  };

  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures && typeof global.AlmFeatures.register === 'function') global.AlmFeatures.register(APP, spec);

  if (typeof module !== 'undefined' && module.exports) module.exports = { app: APP, spec: spec };
})(typeof window !== 'undefined' ? window : globalThis);
