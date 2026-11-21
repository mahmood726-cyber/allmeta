/* shared/alm-straight.js — F6 "Straight path": deterministic, input-triggered methods guidance (pure engine).
 *
 *   AlmStraight.RULES        the rule table (STRAIGHT_PATH_RULES_v1.md: 8 rules + 2 uncertainty statements). Each rule
 *                            is DATA: {id, version, apps, part, requires, trigger(ctx) -> {fired, facts}, message(facts),
 *                            handbook:[{label, url}], evidence:[{kind, citation, doi, note}]}. Drop or edit a rule by
 *                            changing its entry only. part: 'recommend' | 'pitfall' | 'uncertainty'.
 *   AlmStraight.THRESHOLDS   every number a rule compares against, with its source. Message templates contain no
 *                            digit literals: numbers come from facts (the app's own values) or from THRESHOLDS.
 *   AlmStraight.evaluate(app, ctx) -> {recommend:[], pitfalls:[], uncertainty:[], checked:[]}; fired items are
 *                            {id: 'ID@version', message, handbook, evidence, facts}; checked lists every rule placed in
 *                            the app with {id, fired, reason?, missing?}. Never throws: a rule whose required ctx fields
 *                            are absent reports {fired:false, reason:'not applicable'}.
 *   AlmStraight.check(rule, ctx)  one rule (same guard).
 *
 * ctx fields (filled by <app>/alm-straight.js from the app's CURRENT inputs/choices/last results; nothing recomputed):
 *   k                 studies in the analysis            randomEffects  boolean (false for fixed effect)
 *   estimator         'DL' | 'PM' | 'REML' | ...         hksj           boolean: Hartung–Knapp CI for the main result
 *   i2                I² in percent                      analysisType   'pairwise' | 'network' | 'multivariate'
 *   estimates         [{label, lo, hi, piLo?, piHi?, nullValue}]  main estimate(s); nullValue = the no-effect value or
 *                     null when the scale has none (single-group proportion)
 *   provenance        AlmFeaturesState.provenance records (flags[].code), [] when none were entered
 *   poolingModel      'bivariate' | 'separate' | 'moses'  thresholdVaries boolean, thresholdRho number (DTA)
 *   smallStudyTest    {name, shown, p}                   inconsistencyTests [{label, p}]
 *   minPerComparison  fewest studies in any comparison (network)
 *   withinCorrelation 'reported' | 'assumed', assumedCorrelation number (multivariate)
 *
 * Plain IIFE: window.AlmStraight + module.exports. No DOM, no network.
 */
(function (global) {
  'use strict';

  var HB = 'Cochrane Handbook v6.5';
  function hb(section) {
    var ch = section.split('.')[0];
    return { label: HB + ' §' + section, url: 'https://training.cochrane.org/handbook/current/chapter-' + ch + '#section-' + section.split('.').join('-') };
  }

  // Every comparison value used by a trigger or quoted in a message, with where it comes from.
  var THRESHOLDS = {
    SMALL_K: { value: 10, source: 'STRAIGHT_PATH_RULES_v1 SP-REC-SMALLK (k < 10); Cochrane Handbook v6.5 §10.10.4.4' },
    FEW_K_ISQ: { value: 5, source: 'STRAIGHT_PATH_RULES_v1 SP-PIT-I2ZERO (k < 5)' },
    ISQ_ZERO_BELOW: { value: 0.05, source: 'I² that the apps display as 0.0% (one decimal place)' },
    FUNNEL_MIN_K: { value: 10, source: 'STRAIGHT_PATH_RULES_v1 SP-PIT-FUNNELSMALLK (k < 10); Cochrane Handbook v6.5 §13.3.4.4' },
    ALPHA: { value: 0.05, source: 'two-sided 5% level used by the apps to label tests (e.g. nma-inconsistency/index.html:516, :530)' },
    THRESHOLD_RHO: { value: 0.6, source: "dta-sroc/index.html:596, :608 (the app's own threshold-effect flag: |Spearman rho| > 0.6)" },
    UNC_PAIRWISE_K: { value: 5, source: 'STRAIGHT_PATH_RULES_v1 SP-UNC-SMALLK (k < 5 pairwise/proportion/correlation)' },
    UNC_NETWORK_PER_COMPARISON: { value: 5, source: 'STRAIGHT_PATH_RULES_v1 SP-UNC-SMALLK (< 5 studies per comparison)' },
    UNC_MULTIVARIATE_K: { value: 10, source: 'STRAIGHT_PATH_RULES_v1 SP-UNC-SMALLK (< 10 for multivariate)' },
    PI_MIN_K: { value: 3, source: 'STRAIGHT_PATH_RULES_v1 SP-UNC-WIDEPI (k >= 3); Cochrane Handbook v6.5 §10.10.4.3' },
  };
  function T(name) { return THRESHOLDS[name].value; }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function fmt(x) {
    if (!isNum(x)) return String(x);
    var a = Math.abs(x);
    return a !== 0 && (a < 0.001 || a >= 1e5) ? x.toPrecision(3) : String(Math.round(x * 1000) / 1000);
  }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function list(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  function includes(lo, hi, v) { return isNum(lo) && isNum(hi) && isNum(v) && lo <= v && v <= hi; }
  function validEstimates(ctx, keys) {
    if (!Array.isArray(ctx.estimates)) return [];
    return ctx.estimates.filter(function (e) { return e && keys.every(function (k) { return isNum(e[k]); }); });
  }
  var NA = function (why) { return { fired: false, reason: 'not applicable', detail: why }; };
  var EST_NAME = { DL: 'DerSimonian–Laird', PM: 'Paule–Mandel', REML: 'REML', ML: 'maximum likelihood' };

  var RULES = [
    {
      id: 'SP-REC-SMALLK', version: 1, apps: ['proportion-ma', 'correlation-ma'], part: 'recommend',
      requires: ['k', 'randomEffects', 'estimator', 'hksj'],
      trigger: function (c) {
        if (!c.randomEffects) return { fired: false, reason: 'fixed-effect model' };
        var dl = c.estimator === 'DL';
        return { fired: c.k < T('SMALL_K') && (dl || !c.hksj), facts: { k: c.k, dl: dl, hksj: c.hksj, estimator: EST_NAME[c.estimator] || String(c.estimator) } };
      },
      message: function (f) {
        return 'With k = ' + f.k + ' studies, this analysis uses ' + (f.dl ? 'the DerSimonian–Laird estimator' : 'the ' + f.estimator + ' estimator') +
          (f.hksj ? '' : ' with normal (Wald) intervals and no Hartung–Knapp adjustment') +
          '. Prefer REML or Paule–Mandel with Hartung–Knapp intervals: DerSimonian–Laird normal intervals are too narrow when there are fewer than ' +
          T('SMALL_K') + ' studies.';
      },
      handbook: [hb('10.10.4.4'), hb('10.10.4.5')],
      evidence: [
        { kind: 'named', citation: 'Cornell et al. 2014 Ann Intern Med', doi: '10.7326/M13-2886',
          note: 'Reanalysis of the meta-analysis by Collins et al. 1985 (BMJ): DerSimonian–Laird gave p = 0.011; alternative random-effects methods gave p ≥ 0.07.' },
        { kind: 'named', citation: 'Collins et al. 1985 BMJ (the meta-analysis reanalysed)', doi: '10.1136/bmj.290.6461.17',
          note: 'The original meta-analysis whose DerSimonian–Laird result was reanalysed by Cornell et al. 2014.' },
        { kind: 'survey', citation: 'IntHout et al. 2014 BMC Med Res Methodol', doi: '10.1186/1471-2288-14-25',
          note: 'A published audit of 689 Cochrane meta-analyses found that 25% of results significant with DerSimonian–Laird were not significant with Hartung–Knapp–Sidik–Jonkman.' },
      ],
    },
    {
      id: 'SP-PIT-I2ZERO', version: 1, apps: ['proportion-ma', 'correlation-ma'], part: 'pitfall',
      requires: ['k', 'i2'],
      trigger: function (c) {
        return { fired: c.i2 < T('ISQ_ZERO_BELOW') && c.k < T('FEW_K_ISQ'), facts: { k: c.k, isq: (Math.round(c.i2 * 10) / 10).toFixed(1) } };
      },
      message: function (f) {
        return 'I² = ' + f.isq + '% with only ' + f.k + ' ' + plural(f.k, 'study', 'studies') +
          ' does not show that the studies agree: with fewer than ' + T('FEW_K_ISQ') + ' studies I² is very imprecise and its confidence interval can reach large values.';
      },
      handbook: [hb('10.10.2')],
      evidence: [
        { kind: 'survey', citation: 'Ioannidis, Patsopoulos & Evangelou 2007 BMJ', doi: '10.1136/bmj.39343.408449.80',
          note: 'A published audit found that in all 385 meta-analyses with I² = 0 the upper 95% confidence limit for I² was above 33%.' },
      ],
    },
    {
      id: 'SP-PIT-NONSIG', version: 1, apps: ['correlation-ma', 'multivariate-ma'], part: 'pitfall',
      requires: ['estimates'],
      trigger: function (c) {
        var es = validEstimates(c, ['lo', 'hi', 'nullValue']);
        if (!es.length) return NA('no confidence interval with a no-effect value');
        var hit = es.filter(function (e) { return includes(e.lo, e.hi, e.nullValue); });
        return { fired: hit.length > 0, facts: { items: hit.map(function (e) { return { label: String(e.label), lo: fmt(e.lo), hi: fmt(e.hi), nul: fmt(e.nullValue) }; }) } };
      },
      message: function (f) {
        var parts = f.items.map(function (e) { return e.label + ' (' + e.lo + ' to ' + e.hi + ', which includes ' + e.nul + ')'; });
        return 'The confidence interval for ' + list(parts) + ' includes no effect. A confidence interval that includes no effect is not evidence of no effect: ' +
          'report "no clear difference" together with the interval, not "no effect".';
      },
      handbook: [hb('15.3.2'), hb('15.6.4')],
      evidence: [
        { kind: 'survey', citation: 'Alderson & Chalmers 2003 BMJ', doi: '10.1136/bmj.326.7387.475',
          note: 'A published audit found unqualified "no effect" claims in 22.5% of the Cochrane review abstracts it surveyed.' },
        { kind: 'survey', citation: 'Repeat survey 2020 BMJ Evid Based Med', doi: '10.1136/bmjebm-2019-111257',
          note: 'A repeat audit (2020) still found such claims in 7.8% of Cochrane reviews.' },
      ],
    },
    {
      id: 'SP-PIT-CLUSTER', version: 1, apps: ['proportion-ma'], part: 'pitfall',
      requires: ['provenance'],
      trigger: function (c) {
        if (!Array.isArray(c.provenance)) return NA('no data-entry provenance');
        var rows = c.provenance.filter(function (r) {
          return r && Array.isArray(r.flags) && r.flags.some(function (fl) { return fl && fl.code === 'CLUSTER_NOT_ADJUSTED'; });
        });
        return { fired: rows.length > 0, facts: { n: rows.length, labels: rows.map(function (r) { return String(r.label || r.id || 'unlabelled row'); }) } };
      },
      message: function (f) {
        return 'Unit-of-analysis error: ' + f.n + ' ' + plural(f.n, 'row comes', 'rows come') + ' from a cluster-randomised trial entered as if individually randomised (' +
          list(f.labels) + '). Adjust for clustering (design effect or ICC) or ' + plural(f.n, 'its', 'their') + ' confidence ' + plural(f.n, 'interval is', 'intervals are') + ' too narrow.';
      },
      handbook: [hb('23.1.1'), hb('23.1.4')],
      evidence: [
        { kind: 'named', citation: 'Thomas et al. 2003 BMJ (letter)', doi: '10.1136/bmj.326.7385.397',
          note: 'Letter on Weingarten et al. 2002: 22 cluster trials, handling of the unit of analysis not reported.' },
        { kind: 'named', citation: 'Weingarten et al. 2002 BMJ (the meta-analysis criticised)', doi: '10.1136/bmj.325.7370.925',
          note: 'The meta-analysis discussed in the Thomas et al. 2003 letter.' },
      ],
    },
    {
      id: 'SP-REC-DTA-SROC', version: 1, apps: ['dta-sroc'], part: 'recommend',
      requires: ['poolingModel'],
      trigger: function (c) {
        var varies = typeof c.thresholdVaries === 'boolean' ? c.thresholdVaries : (isNum(c.thresholdRho) ? Math.abs(c.thresholdRho) > T('THRESHOLD_RHO') : false);
        var separate = c.poolingModel === 'separate' || c.poolingModel === 'moses';
        return { fired: separate || varies, facts: { model: c.poolingModel, separate: separate, varies: varies, rho: isNum(c.thresholdRho) ? fmt(c.thresholdRho) : null } };
      },
      message: function (f) {
        var why = f.separate
          ? (f.model === 'moses' ? 'The summary shown comes from the Moses–Littenberg SROC, which ignores between-study heterogeneity. ' : 'The summary shown pools sensitivity and specificity separately. ')
          : '';
        var thr = f.varies ? 'Thresholds appear to vary across studies' + (f.rho !== null ? ' (Spearman correlation ' + f.rho + ', beyond ±' + T('THRESHOLD_RHO') + ')' : '') + '. ' : '';
        return why + thr + 'Use the bivariate/HSROC model and report the SROC curve when thresholds vary, not separately pooled sensitivity and specificity.';
      },
      handbook: [{ label: 'Cochrane Handbook for Systematic Reviews of Diagnostic Test Accuracy v2, chapter 10', url: 'https://doi.org/10.1002/9781119756194.ch10' }],
      evidence: [
        { kind: 'survey', citation: 'Willis & Quigley 2011 BMC Med Res Methodol', doi: '10.1186/1471-2288-11-27',
          note: 'A published audit found that 70% of 236 diagnostic accuracy meta-analyses used separate pooling or the Moses–Littenberg SROC; 22% used a bivariate model.' },
      ],
    },
    {
      id: 'SP-PIT-FUNNELSMALLK', version: 1, apps: ['dta-sroc'], part: 'pitfall',
      requires: ['k', 'smallStudyTest'],
      trigger: function (c) {
        var t = c.smallStudyTest;
        if (!t || typeof t.shown !== 'boolean') return NA('no small-study test information');
        return { fired: t.shown && c.k < T('FUNNEL_MIN_K'), facts: { k: c.k, name: String(t.name || 'funnel-plot asymmetry test'), p: isNum(t.p) ? fmt(t.p) : null } };
      },
      message: function (f) {
        return f.name + (f.p !== null ? ' (p = ' + f.p + ')' : '') + ' is shown with only ' + f.k + ' studies. Funnel-plot asymmetry tests are underpowered with fewer than ' +
          T('FUNNEL_MIN_K') + ' studies: a non-significant result does not rule out small-study effects, and a significant one needs caution.';
      },
      handbook: [hb('13.3.4.4')],
      evidence: [
        { kind: 'survey', citation: 'Ioannidis & Trikalinos 2007 CMAJ', doi: '10.1503/cmaj.060410',
          note: 'A published audit of 60 meta-analyses using asymmetry tests found that all 11 claims of publication bias were made in meta-analyses that did not meet the conditions for the test.' },
      ],
    },
    {
      id: 'SP-PIT-NMACONSIST', version: 1, apps: ['nma-inconsistency'], part: 'pitfall',
      requires: ['inconsistencyTests'],
      trigger: function (c) {
        var tests = Array.isArray(c.inconsistencyTests) ? c.inconsistencyTests.filter(function (t) { return t && isNum(t.p); }) : [];
        if (!tests.length) return NA('no inconsistency test with a p-value');
        var ns = tests.filter(function (t) { return t.p >= T('ALPHA'); });
        return { fired: ns.length > 0, facts: { n: ns.length, of: tests.length, labels: ns.map(function (t) { return String(t.label); }) } };
      },
      message: function (f) {
        return f.n + ' of ' + f.of + ' inconsistency ' + plural(f.of, 'test is', 'tests are') + ' not statistically significant (p ≥ ' + T('ALPHA') + ': ' +
          list(f.labels) + '). A non-significant inconsistency test does not show consistency: these tests have low power, so check transitivity on clinical and design grounds.';
      },
      handbook: [hb('11.4.4.2')],
      evidence: [
        { kind: 'survey', citation: 'Song et al. 2009 BMJ', doi: '10.1136/bmj.b1147',
          note: 'A published audit found that the consistency assumption was not made explicit in 18 of 30 reviews (60%).' },
        { kind: 'survey', citation: 'Veroniki et al. 2013 Int J Epidemiol', doi: '10.1093/ije/dys222',
          note: 'A published audit of 40 networks found inconsistency in about 1 in 8 of them.' },
      ],
    },
    {
      id: 'SP-UNC-SMALLK', version: 1, apps: ['dta-sroc', 'proportion-ma', 'nma-inconsistency', 'correlation-ma', 'multivariate-ma'], part: 'uncertainty',
      requires: ['analysisType'],
      trigger: function (c) {
        if (c.analysisType === 'network') {
          if (!isNum(c.minPerComparison)) return NA('studies per comparison unknown');
          return { fired: c.minPerComparison < T('UNC_NETWORK_PER_COMPARISON'), facts: { type: 'network', m: c.minPerComparison } };
        }
        if (!isNum(c.k)) return NA('k unknown');
        var limit = c.analysisType === 'multivariate' ? T('UNC_MULTIVARIATE_K') : T('UNC_PAIRWISE_K');
        return { fired: c.k < limit, facts: { type: c.analysisType, k: c.k } };
      },
      message: function (f) {
        if (f.type === 'network') {
          return 'At least one comparison has only ' + f.m + ' ' + plural(f.m, 'study', 'studies') + ' (fewer than ' + T('UNC_NETWORK_PER_COMPARISON') +
            ' per comparison): between-study variance and the inconsistency estimates are very imprecise.';
        }
        if (f.type === 'multivariate') {
          return 'With ' + f.k + ' studies (fewer than ' + T('UNC_MULTIVARIATE_K') + '), the between-study variances and correlation are very imprecise.';
        }
        return 'With ' + f.k + ' ' + plural(f.k, 'study', 'studies') + ', between-study variance (τ²) and I² are very imprecise.';
      },
      handbook: [hb('10.10.2'), hb('10.10.4.5')],
      evidence: [],
    },
    {
      id: 'SP-UNC-WIDEPI', version: 1, apps: ['proportion-ma', 'correlation-ma'], part: 'uncertainty',
      requires: ['k', 'estimates'],
      trigger: function (c) {
        if (c.k < T('PI_MIN_K')) return NA('prediction interval needs k >= ' + T('PI_MIN_K'));
        var es = validEstimates(c, ['lo', 'hi', 'piLo', 'piHi', 'nullValue']);
        if (!es.length) return NA('no prediction interval with a no-effect value');
        var hit = es.filter(function (e) { return includes(e.piLo, e.piHi, e.nullValue) && !includes(e.lo, e.hi, e.nullValue); });
        return { fired: hit.length > 0, facts: { nul: hit.length ? fmt(hit[0].nullValue) : null, items: hit.map(function (e) { return { label: String(e.label), piLo: fmt(e.piLo), piHi: fmt(e.piHi) }; }) } };
      },
      message: function (f) {
        var parts = f.items.map(function (e) { return e.label + ': ' + e.piLo + ' to ' + e.piHi; });
        return 'The effect in a new setting is uncertain: the prediction interval (' + list(parts) + ') includes no effect (' + f.nul +
          '), although the confidence interval excludes it.';
      },
      handbook: [hb('10.10.4.3')],
      evidence: [],
    },
  ];

  var PART_KEY = { recommend: 'recommend', pitfall: 'pitfalls', uncertainty: 'uncertainty' };

  function missingFields(rule, ctx) {
    return (rule.requires || []).filter(function (k) {
      var v = ctx[k];
      return v === undefined || v === null || (typeof v === 'number' && !isFinite(v));
    });
  }

  function check(rule, ctx) {
    ctx = ctx && typeof ctx === 'object' ? ctx : {};
    var miss = missingFields(rule, ctx);
    if (miss.length) return { fired: false, reason: 'not applicable', missing: miss };
    var r;
    try { r = rule.trigger(ctx); } catch (e) { return { fired: false, reason: 'not applicable', detail: 'trigger error: ' + (e && e.message ? e.message : String(e)) }; }
    if (!r || typeof r !== 'object') return { fired: false, reason: 'not applicable' };
    if (!r.fired) return r;
    var msg;
    try { msg = rule.message(r.facts || {}); } catch (e) { return { fired: false, reason: 'not applicable', detail: 'message error: ' + (e && e.message ? e.message : String(e)) }; }
    return { fired: true, facts: r.facts || {}, message: msg };
  }

  function evaluate(app, ctx) {
    var out = { recommend: [], pitfalls: [], uncertainty: [], checked: [] };
    RULES.forEach(function (rule) {
      if (rule.apps.indexOf(app) < 0) return;
      var id = rule.id + '@' + rule.version, r = check(rule, ctx);
      var row = { id: id, part: rule.part, fired: !!r.fired };
      if (!r.fired) { row.reason = r.reason || 'not triggered'; if (r.missing) row.missing = r.missing; if (r.detail) row.detail = r.detail; }
      out.checked.push(row);
      if (r.fired) {
        out[PART_KEY[rule.part]].push({ id: id, message: r.message, handbook: rule.handbook.slice(), evidence: rule.evidence.slice(), facts: r.facts });
      }
    });
    return out;
  }

  function fired(result) {
    return [].concat(result.recommend, result.pitfalls, result.uncertainty).map(function (x) { return x.id; });
  }

  var api = { RULES: RULES, THRESHOLDS: THRESHOLDS, evaluate: evaluate, check: check, fired: fired, version: 'STRAIGHT_PATH_RULES_v1' };
  global.AlmStraight = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
