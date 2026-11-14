/* shared/alm-text.js — F2 in-app text: plain-language summary, Methods and Results
 * paragraphs generated ONLY from an app's own last results with fixed templates
 * (template/regex only — no AI, no network), plus a number audit.
 *
 * Contract (allmeta features DESIGN.md, "F2 In-app text"):
 *   AlmText.render(templates, results, ctx) -> {plain, methods, results, flags, provenance, labels, cites, ctxValues}
 *     templates = { plain(T, r, ctx), methods(T, r, ctx), results(T, r, ctx), flags?(T, r, ctx) -> [parts...] }
 *     Every number in the output is emitted by a T helper from `results` (or from ctx: build info,
 *     data-entry log counts, verification facts) and recorded in provenance[] in order.
 *     A missing / non-finite key makes render THROW (never prints NaN / undefined / null).
 *     T.label(key | {key, index}) prints a text label (study / treatment / outcome name, which may
 *     contain digits, e.g. "Drug 2") verbatim from results[key] (or results[key][index]) and records
 *     it in labels[] in order. Label segments are excluded from numeric tokenisation by segment type.
 *   AlmText.audit(rendered, results, {ctx, dom}) -> {ok, checks, passed, failures[], tokens}
 *     (a) the numeric tokens of each rendered paragraph equal, in order, the tokens of its typed
 *         segments (provenance texts + typed rule/cite/ctx tokens) — a literal digit in a template fails;
 *     (b) every provenance value === results[key] (or the ctx value) and its text === the formatter output;
 *         every label segment's value === results[key] (or results[key][index]), its text === that value,
 *         and it matches labels[] in order;
 *     (c) optional dom map {key: {text, fmt}}: results[key] formatted with the app's display digits
 *         equals what the page displays.
 *   AlmText.cochrane: i2Band, ciIncludesNull, imprecise, smallK — Cochrane Handbook v6.5 wording helpers.
 *   AlmTextUI.mount(el, spec): Plain-language / Methods / Results blocks with Copy, .md and .docx
 *     (AlmZip.docx, when shared/alm-zip.js is loaded) downloads, flags list, Regenerate, aria-live status.
 * Generated text is written with textContent only.
 */
(function (global) {
  'use strict';

  var MINUS = '−';

  // Rule constants: typed tokens a template may print (never literal digits in templates).
  var RULES = {
    ciLevel:    { value: 95,    text: '95%',   about: 'confidence / prediction level used by the app' },
    pThreshold: { value: 0.001, text: '0.001', about: 'p-values below this are printed as "p < 0.001"' },
    piMinK:     { value: 3,     text: '3',     about: 'a prediction interval is reported only when k >= 3 (Cochrane Handbook v6.5 §10.10.4.3)' },
    fewK:       { value: 5,     text: '5',     about: 'below this k, heterogeneity estimates are imprecise' },
    funnelK:    { value: 10,    text: '10',    about: 'below this k, small-study (funnel plot) tests are underpowered (Cochrane Handbook v6.5 §13.3.5.4)' },
    dlMinK:     { value: 10,    text: '10',    about: 'below this k the DerSimonian-Laird tau2 estimator is biased low' },
    ccAdd:      { value: 0.5,   text: '0.5',   about: 'continuity correction added to boundary studies' },
    none:       { value: 0,     text: '0',     about: 'zero, for count conditions in templates (e.g. no boundary studies)' }
  };
  var R = {};
  Object.keys(RULES).forEach(function (k) { R[k] = RULES[k].value; });
  Object.freeze(R);

  // Fixed citation table. Ids are normally digit-free; dias2010 / higgins2012 keep their agreed
  // ids. Ids only ever appear inside T.cite(...), which the no-digit-literal lint strips.
  var CITES = {
    handbook:         { short: 'Cochrane Handbook v6.5', full: 'Higgins JPT, Thomas J, Chandler J, Cumpston M, Li T, Page MJ, Welch VA (eds). Cochrane Handbook for Systematic Reviews of Interventions, version 6.5. Cochrane, 2024.' },
    handbookHet:      { short: 'Cochrane Handbook v6.5, §10.10.2', full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, section 10.10.2 (Identifying and measuring heterogeneity).' },
    handbookPI:       { short: 'Cochrane Handbook v6.5, §10.10.4.3', full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, section 10.10.4.3 (Prediction intervals in random-effects meta-analysis).' },
    handbookSE:       { short: 'Cochrane Handbook v6.5, §6.3.1', full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, section 6.3.1 (Obtaining standard errors from confidence intervals and P values).' },
    handbookSD:       { short: 'Cochrane Handbook v6.5, §6.5.2.2', full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, section 6.5.2.2 (Obtaining standard deviations from standard errors and confidence intervals).' },
    handbookCluster:  { short: 'Cochrane Handbook v6.5, §23.1', full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, chapter 23 (Including variants on randomized trials), section 23.1 (Cluster-randomized trials).' },
    handbookCrossover: { short: 'Cochrane Handbook v6.5, §23.2', full: 'Cochrane Handbook for Systematic Reviews of Interventions, version 6.5, chapter 23 (Including variants on randomized trials), section 23.2 (Crossover trials).' },
    dersimonianLaird: { short: 'DerSimonian and Laird 1986', full: 'DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials 1986;7:177-188.' },
    pauleMandel:      { short: 'Paule and Mandel 1982', full: 'Paule RC, Mandel J. Consensus values and weighting factors. J Res Natl Bur Stand 1982;87:377-385.' },
    viechtbauer:      { short: 'Viechtbauer 2005', full: 'Viechtbauer W. Bias and efficiency of meta-analytic variance estimators in the random-effects model. J Educ Behav Stat 2005;30:261-293.' },
    viechtbauerQProfile: { short: 'Viechtbauer 2007', full: 'Viechtbauer W. Confidence intervals for the amount of heterogeneity in meta-analysis. Stat Med 2007;26:37-52.' },
    sidikJonkman:     { short: 'Sidik and Jonkman 2005', full: 'Sidik K, Jonkman JN. Simple heterogeneity variance estimation for meta-analysis. J R Stat Soc Ser C Appl Stat 2005;54:367-384.' },
    sidikJonkmanComparison: { short: 'Sidik and Jonkman 2007', full: 'Sidik K, Jonkman JN. A comparison of heterogeneity variance estimators in combining results of studies. Stat Med 2007;26:1964-1981.' },
    dias2010:         { short: 'Dias et al. 2010', full: 'Dias S, Welton NJ, Caldwell DM, Ades AE. Checking consistency in mixed treatment comparison meta-analysis. Stat Med 2010;29:932-944.' },
    higgins2012:      { short: 'Higgins et al. 2012', full: 'Higgins JPT, Jackson D, Barrett JK, Lu G, Ades AE, White IR. Consistency and inconsistency in network meta-analysis: concepts and models for multi-arm studies. Res Synth Methods 2012;3:98-110.' },
    morris:           { short: 'Morris 1983', full: 'Morris CN. Parametric empirical Bayes inference: theory and applications. J Am Stat Assoc 1983;78:47-55.' },
    hartungKnapp:     { short: 'Hartung and Knapp 2001', full: 'Hartung J, Knapp G. A refined method for the meta-analysis of controlled clinical trials with binary outcome. Stat Med 2001;20:3875-3889.' },
    higginsThompson:  { short: 'Higgins and Thompson 2002', full: 'Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med 2002;21:1539-1558.' },
    higginsBMJ:       { short: 'Higgins et al. 2003', full: 'Higgins JPT, Thompson SG, Deeks JJ, Altman DG. Measuring inconsistency in meta-analyses. BMJ 2003;327:557-560.' },
    hts:              { short: 'Higgins, Thompson and Spiegelhalter 2009', full: 'Higgins JPT, Thompson SG, Spiegelhalter DJ. A re-evaluation of random-effects meta-analysis. J R Stat Soc Ser A 2009;172:137-159.' },
    inthout:          { short: 'IntHout et al. 2016', full: 'IntHout J, Ioannidis JPA, Rovers MM, Goeman JJ. Plea for routinely presenting prediction intervals in meta-analysis. BMJ Open 2016;6:e010247.' },
    freemanTukey:     { short: 'Freeman and Tukey 1950', full: 'Freeman MF, Tukey JW. Transformations related to the angular and the square root. Ann Math Stat 1950;21:607-611.' },
    miller:           { short: 'Miller 1978', full: 'Miller JJ. The inverse of the Freeman-Tukey double arcsine transformation. Am Stat 1978;32:138.' },
    schwarzer:        { short: 'Schwarzer et al. 2019', full: 'Schwarzer G, Chemaitelly H, Abu-Raddad LJ, Rücker G. Seriously misleading results using inverse of Freeman-Tukey double arcsine transformation in meta-analysis of single proportions. Res Synth Methods 2019;10:476-483.' },
    sweeting:         { short: 'Sweeting et al. 2004', full: 'Sweeting MJ, Sutton AJ, Lambert PC. What to add to nothing? Use and avoidance of continuity corrections in meta-analysis of sparse data. Stat Med 2004;23:1351-1375.' },
    clopperPearson:   { short: 'Clopper and Pearson 1934', full: 'Clopper CJ, Pearson ES. The use of confidence or fiducial limits illustrated in the case of the binomial. Biometrika 1934;26:404-413.' },
    wan:              { short: 'Wan et al. 2014', full: 'Wan X, Wang W, Liu J, Tong T. Estimating the sample mean and standard deviation from the sample size, median, range and/or interquartile range. BMC Med Res Methodol 2014;14:135.' },
    luo:              { short: 'Luo et al. 2018', full: 'Luo D, Wan X, Liu J, Tong T. Optimally estimating the sample mean from the sample size, median, mid-range, and/or mid-quartile range. Stat Methods Med Res 2018;27:1785-1805.' },
    shi:              { short: 'Shi et al. 2020', full: 'Shi J, Luo D, Weng H, Zeng XT, Lin L, Chu H, Tong T. Optimally estimating the sample standard deviation from the five-number summary. Res Synth Methods 2020;11:641-654.' }
  };

  // ---------------------------------------------------------------- formatting

  function checkDigits(d) {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 10) {
      throw new Error('AlmText: digits must be an integer 0..10 (got ' + String(d) + ')');
    }
  }

  function fixed(v, d) {
    var s = v.toFixed(d);
    return s.charAt(0) === '-' ? MINUS + s.slice(1) : s;
  }

  function groupInt(v) {
    var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? MINUS : '') + s;
  }

  // fmt = {kind: 'num'|'pct'|'prop'|'int'|'text', digits}
  //   num : v.toFixed(digits)                (unicode minus for negatives)
  //   pct : v.toFixed(digits) + '%'          (value already in percent)
  //   prop: (100 * v).toFixed(digits) + '%'  (value is a proportion; identical to the apps' fmtPct)
  //   int : integer with thousands separators
  //   text: String(v)
  function format(v, fmt) {
    var kind = fmt && fmt.kind;
    if (kind === 'text') {
      if (typeof v !== 'string' || !v) throw new Error('AlmText: text value must be a non-empty string');
      return v;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error('AlmText: cannot format non-finite value ' + String(v));
    }
    if (kind === 'int') {
      if (!Number.isInteger(v)) throw new Error('AlmText: integer expected, got ' + v);
      return groupInt(v);
    }
    checkDigits(fmt.digits);
    if (kind === 'num') return fixed(v, fmt.digits);
    if (kind === 'pct') return fixed(v, fmt.digits) + '%';
    if (kind === 'prop') return fixed(100 * v, fmt.digits) + '%';
    throw new Error('AlmText: unknown format kind ' + String(kind));
  }

  // Number tokens in rendered text: unicode minus or hyphen, thousands groups, decimals, percent.
  var NUM_RE = /[−-]?(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?%?/g;
  function tokens(s) { return String(s).match(NUM_RE) || []; }

  // ------------------------------------------------- Cochrane interpretation helpers

  // Cochrane Handbook v6.5 §10.10.2 — overlapping bands, deliberately not mutually exclusive.
  var I2_BANDS = [
    { id: 'low',          lo: 0,  hi: 40,  phrase: 'might not be important' },
    { id: 'moderate',     lo: 30, hi: 60,  phrase: 'may represent moderate heterogeneity' },
    { id: 'substantial',  lo: 50, hi: 90,  phrase: 'may represent substantial heterogeneity' },
    { id: 'considerable', lo: 75, hi: 100, phrase: 'may represent considerable heterogeneity' }
  ];

  function i2Band(i2) {
    if (typeof i2 !== 'number' || !Number.isFinite(i2) || i2 < 0 || i2 > 100) {
      throw new Error('AlmText: I2 must be a finite percentage in [0, 100] (got ' + String(i2) + ')');
    }
    var hits = I2_BANDS.filter(function (b) { return i2 >= b.lo && i2 <= b.hi; });
    return { bands: hits.map(function (b) { return b.id; }), phrase: hits.map(function (b) { return b.phrase; }).join(' or ') };
  }

  function finite3(lo, hi, nul) {
    if (![lo, hi, nul].every(function (x) { return typeof x === 'number' && Number.isFinite(x); })) {
      throw new Error('AlmText: interval bounds and null value must be finite numbers');
    }
    if (lo > hi) throw new Error('AlmText: lower bound exceeds upper bound');
  }
  // Interval contains the no-effect value (inclusive).
  function ciIncludesNull(lo, hi, nul) { finite3(lo, hi, nul); return lo <= nul && nul <= hi; }
  // Imprecision: the interval includes no effect AND effects in either direction.
  function imprecise(lo, hi, nul) { finite3(lo, hi, nul); return lo < nul && nul < hi; }
  // Wording for a comparative effect: never "no difference" / "evidence of no difference".
  function differencePhrase(lo, hi, nul) {
    return ciIncludesNull(lo, hi, nul)
      ? 'no clear evidence of a difference (the confidence interval includes no effect)'
      : 'evidence of a difference (the confidence interval excludes no effect)';
  }
  function smallK(k) {
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 0) throw new Error('AlmText: k must be a non-negative integer');
    var out = [];
    if (k < RULES.fewK.value) out.push('fewK');
    if (k < RULES.funnelK.value) out.push('funnelK');
    if (k < RULES.piMinK.value) out.push('noPI');
    return out;
  }

  // ------------------------------------------------------------- context values

  // Known F1 conversion / flag codes -> fixed wording + typed citation id (cited once per method).
  var ENTRY_CODES = {
    SD_FROM_IQR:               { desc: 'SDs were estimated from interquartile ranges', cite: 'wan' },
    SD_FROM_RANGE:             { desc: 'SDs were estimated from ranges', cite: 'wan' },
    SD_FROM_FIVENUM:           { desc: 'SDs were estimated from five-number summaries', cite: 'shi' },
    MEAN_FROM_MEDIAN:          { desc: 'means were estimated from medians', cite: 'luo' },
    SD_FROM_SE:                { desc: 'SDs were obtained from standard errors', cite: 'handbookSD' },
    SD_FROM_CI:                { desc: 'SDs were obtained from confidence intervals', cite: 'handbookSD' },
    SE_FROM_CI:                { desc: 'the standard error was derived from the confidence interval', cite: 'handbookSE' },
    SE_FROM_P:                 { desc: 'the standard error was derived from the P value', cite: 'handbookSE' },
    ESTIMATE_FROM_CI_MIDPOINT: { desc: 'the estimate was taken as the midpoint of the confidence interval', cite: null },
    EVENTS_FROM_PERCENT:       { desc: 'event counts were derived from reported percentages', cite: null },
    // F1 design flags and design-effect conversions (unit of randomisation, N1).
    CLUSTER_ADJUSTED:          { desc: 'counts or standard errors from cluster-randomised trials were adjusted with a design effect', cite: 'handbookCluster' },
    CLUSTER_NOT_ADJUSTED:      { desc: 'cluster-randomised trials were not adjusted for clustering (flag CLUSTER_NOT_ADJUSTED; their confidence intervals are too narrow)', cite: 'handbookCluster' },
    CLUSTER_ANALYSIS_REPORTED: { desc: 'the reported analysis of cluster-randomised trials accounted for clustering (extractor’s statement)', cite: 'handbookCluster' },
    CROSSOVER_DESIGN:          { desc: 'crossover trials were entered as parallel-group data (no paired analysis)', cite: 'handbookCrossover' },
    NOT_RANDOMISED:            { desc: 'data were not from a randomised comparison', cite: null },
    NOT_STATED_RANDOMISATION:  { desc: 'the unit of randomisation was not stated', cite: null }
  };
  // F1 conversion functions that map to a code above.
  var ENTRY_FNS = { clusterCounts: 'CLUSTER_ADJUSTED', clusterSE: 'CLUSTER_ADJUSTED' };

  // Summarise F1 provenance records (AlmFeaturesState.provenance) or legacy entryLog steps.
  // Groups by conversion/flag code; counts are numbers of distinct studies.
  // Distinct reports are counted by F1 itself (AlmEntry.provenance.summary: rows sharing a DOI, PMID or normalised
  // reference are one report), so two arms of one trial read "1 report (2 arms)", never "2 reports".
  function entryRecords(log) {
    if (!Array.isArray(log)) return { groups: [], reports: 0, rows: 0, arms: 0, detail: null, allLocated: false };
    var map = {}, order = [], reports = 0, located = 0, f1 = [];
    function add(key, info, who) {
      if (!map[key]) { map[key] = { desc: info.desc, cite: info.cite || null, citeText: info.citeText || null, seen: {}, n: 0 }; order.push(key); }
      var g = map[key];
      if (who != null && who !== '') {
        if (!g.seen[who]) { g.seen[who] = true; g.n++; }
      } else {
        g.n++;
      }
    }
    function addText(desc, citeText, who) {
      desc = String(desc || '').replace(/\s+/g, ' ').trim();
      citeText = citeText ? String(citeText).replace(/\s+/g, ' ').trim() : null;
      if (!desc) return;
      add('text:' + desc + '|' + (citeText || ''), { desc: desc, citeText: citeText }, who);
    }
    function addCode(code, who) {
      var known = ENTRY_CODES[code];
      if (!known) return false;
      add('code:' + code, known, who);
      return true;
    }
    log.forEach(function (s, idx) {
      // F1 requires every row to be confirmed before use: a record that carries a `confirmed` field
      // counts only when it is exactly true (review of PR #178).
      if (s && typeof s === 'object' && Object.prototype.hasOwnProperty.call(s, 'confirmed') && s.confirmed !== true) return;
      if (typeof s === 'string') {
        var m = /^\s*([^:]{1,80}):\s*(.+)$/.exec(s);
        if (m) addText(m[2], null, m[1].trim()); else addText(s, null, null);
      } else if (s && typeof s === 'object') {
        if (Array.isArray(s.conversions) || Array.isArray(s.flags) || s.reference != null || s.location != null) {
          // F1 provenance record: one row (an arm or a comparison) of a study report.
          reports++;
          f1.push(s);
          if (s.location != null && String(s.location).trim()) located++;
          var who = s.id != null ? String(s.id) : (s.label != null ? String(s.label) : 'record-' + idx);
          var codes = {};
          (Array.isArray(s.conversions) ? s.conversions : []).forEach(function (c) {
            if (!c || typeof c !== 'object') return;
            if (c.code && addCode(c.code, who)) { codes[c.code] = true; return; }
            if (ENTRY_FNS[c.fn]) { codes[ENTRY_FNS[c.fn]] = true; addCode(ENTRY_FNS[c.fn], who); return; }
            addText(c.method || c.text || c.description || (c.field ? c.field + ' converted' : ''), c.citation, who);
          });
          (Array.isArray(s.flags) ? s.flags : []).forEach(function (f) {
            if (f && f.code && !codes[f.code] && ENTRY_CODES[f.code]) { codes[f.code] = true; addCode(f.code, who); }
          });
        } else if (s.code && ENTRY_CODES[s.code]) {
          addCode(s.code, s.study != null ? String(s.study) : null);
        } else {
          addText(s.method || s.text || s.step || '', s.citation, s.study != null ? String(s.study) : null);
        }
      }
    });
    var rows = reports, arms = 0, detail = null, E = global.AlmEntry;
    if (f1.length && E && E.provenance && typeof E.provenance.summary === 'function') {
      var sm = E.provenance.summary(f1);
      reports = sm.reports; arms = sm.arms;
      // Same wording rule as AlmEntry.provenance.summarySentence: arms when every row is one printed arm, else rows.
      if (reports !== rows) detail = arms && f1.every(function (r) { return r.choice && r.choice.armIndex !== undefined; }) ? 'arms' : 'rows';
    }
    return {
      groups: order.map(function (k) { var g = map[k]; return { desc: g.desc, count: g.n, cite: g.cite, citeText: g.citeText }; }),
      reports: reports,
      rows: rows,
      arms: arms,
      detail: detail,
      allLocated: rows > 0 && located === rows
    };
  }

  function packageVersion(v, preferred) {
    var list = [];
    var pk = v.packages, vs = v.versions || {};
    if (Array.isArray(pk)) {
      pk.forEach(function (p) {
        if (typeof p === 'string') list.push({ name: p, version: vs[p] });
        else if (p && typeof p === 'object') list.push({ name: p.name || p.package, version: p.version || vs[p.name || p.package] });
      });
    } else if (pk && typeof pk === 'object') {
      Object.keys(pk).forEach(function (n) { list.push({ name: n, version: pk[n] }); });
    }
    list = list.filter(function (p) { return p.name && (typeof p.version === 'string' || typeof p.version === 'number') && String(p.version); });
    if (preferred) {
      var hit = list.filter(function (p) { return p.name === preferred; })[0];
      if (hit) return hit;
    }
    return list[0] || null;
  }

  // The verification sentence is allowed ONLY when Verify-in-R ran for the CURRENT state
  // revision in this session and every compared row passed. Anything else -> null (sentence omitted).
  // The gate is POSITIVE (review of PR #178): verify.passed === true, every row has row.pass === true
  // (F3 row format: rows from AlmValidate.compare -> {pass: true|false}); a row with no pass field,
  // pass: null / 0 / 'yes', or status: 'error' never counts as passed. When the host provides
  // AlmFeatures.verifiedCurrent(app), context() records it and anything but true withholds the sentence.
  function verifyFacts(ctx) {
    var v = ctx && ctx.verify;
    if (!v || typeof v !== 'object' || v.passed !== true) return null;
    if (ctx.verifiedCurrent != null && ctx.verifiedCurrent !== true) return null;
    if (ctx.revision == null || v.revision == null || v.revision !== ctx.revision) return null;
    if (!Array.isArray(v.rows) || !v.rows.length) return null;
    for (var i = 0; i < v.rows.length; i++) {
      var row = v.rows[i];
      if (!row || typeof row !== 'object' || row.pass !== true) return null;
    }
    var pkg = packageVersion(v, ctx.verifyPackage);
    var vs = v.versions || {};
    var webr = vs.webr != null ? vs.webr : (vs.webR != null ? vs.webR : vs.WebR);
    if (!pkg || webr == null || !String(webr)) return null;
    return { pkg: String(pkg.name), pkgVersion: String(pkg.version), webr: String(webr), n: v.rows.length };
  }

  function ctxValues(ctx) {
    var out = {};
    if (!ctx || typeof ctx !== 'object') return out;
    if (typeof ctx.app === 'string' && ctx.app) out.app = ctx.app;
    var b = ctx.build;
    if (b && typeof b === 'object') {
      if (typeof b.version === 'string' && b.version) out['build.version'] = b.version;
      if (typeof b.shortSha === 'string' && b.shortSha) out['build.shortSha'] = b.shortSha;
      else if (typeof b.sha === 'string' && b.sha.length >= 7) out['build.shortSha'] = b.sha.slice(0, 7);
    }
    var e = entryRecords(Array.isArray(ctx.provenance) && ctx.provenance.length ? ctx.provenance : ctx.entryLog);
    out['entry.groups'] = e.groups.length;
    if (e.reports) out['entry.reports'] = e.reports;
    if (e.reports && e.detail) { out['entry.' + e.detail] = e[e.detail]; out.__entryDetail = e.detail; }
    e.groups.forEach(function (g, i) {
      out['entry.' + i + '.desc'] = g.desc;
      out['entry.' + i + '.count'] = g.count;
      if (g.citeText) out['entry.' + i + '.cite'] = g.citeText;
      if (g.cite) out['__entry.' + i + '.citeId'] = g.cite;
    });
    var vf = verifyFacts(ctx);
    if (vf) {
      out['verify.pkg'] = vf.pkg;
      out['verify.pkgVersion'] = vf.pkgVersion;
      out['verify.webr'] = vf.webr;
      out['verify.n'] = vf.n;
    }
    out.__entryAllLocated = e.allLocated;
    return out;
  }

  function ctxFmt(value) { return typeof value === 'number' ? { kind: 'int' } : { kind: 'text' }; }

  // -------------------------------------------------------------------- toolkit

  function seg(type, props) { props.type = type; return props; }
  function txt(s) { return seg('text', { text: String(s) }); }

  function makeToolkit(results, ctx, cv) {
    function val(key) {
      if (!results || !Object.prototype.hasOwnProperty.call(results, key)) {
        throw new Error('AlmText: missing result "' + key + '"');
      }
      var v = results[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error('AlmText: result "' + key + '" is not a finite number (' + String(v) + ')');
      }
      return v;
    }
    function numSeg(key, fmt) {
      var v = val(key);
      return seg('num', { key: key, value: v, fmt: fmt, text: format(v, fmt), source: 'results' });
    }
    function ctxSeg(key) {
      if (!Object.prototype.hasOwnProperty.call(cv, key) || key.indexOf('__') === 0) {
        throw new Error('AlmText: missing context value "' + key + '"');
      }
      var v = cv[key];
      var fmt = ctxFmt(v);
      return seg('ctx', { key: key, value: v, fmt: fmt, text: format(v, fmt), source: 'ctx' });
    }
    function labelSeg(spec) {
      var key = spec, index;
      if (spec && typeof spec === 'object') { key = spec.key; index = spec.index; }
      if (typeof key !== 'string' || !key) throw new Error('AlmText: label needs a key or {key, index}');
      var v = labelValue(results, key, index);
      if (v.error) throw new Error('AlmText: ' + v.error);
      var props = { key: key, value: v.value, text: v.value, source: 'results' };
      if (index !== undefined) props.index = index;
      return seg('label', props);
    }
    var T = {
      R: R,
      label: labelSeg,
      num: function (key, digits) { return numSeg(key, { kind: 'num', digits: digits }); },
      est: function (key, digits) { return numSeg(key, { kind: 'num', digits: digits }); },
      int: function (key) { return numSeg(key, { kind: 'int' }); },
      pct: function (key, digits) { return numSeg(key, { kind: 'pct', digits: digits }); },
      prop: function (key, digits) { return numSeg(key, { kind: 'prop', digits: digits }); },
      ci: function (loKey, hiKey, digits, kind) {
        var k = kind || 'num';
        if (['num', 'pct', 'prop'].indexOf(k) < 0) throw new Error('AlmText: ci kind must be num, pct or prop');
        return [numSeg(loKey, { kind: k, digits: digits }), txt(' to '), numSeg(hiKey, { kind: k, digits: digits })];
      },
      p: function (key, digits) {
        var v = val(key);
        if (v < 0 || v > 1) throw new Error('AlmText: p-value "' + key + '" outside [0, 1]');
        if (v < RULES.pThreshold.value) return [txt('p < '), T.rule('pThreshold')];
        return [txt('p = '), numSeg(key, { kind: 'num', digits: digits == null ? 3 : digits })];
      },
      rule: function (id) {
        if (!Object.prototype.hasOwnProperty.call(RULES, id)) throw new Error('AlmText: unknown rule "' + id + '"');
        return seg('rule', { id: id, text: RULES[id].text });
      },
      cite: function (id) {
        if (!Object.prototype.hasOwnProperty.call(CITES, id)) throw new Error('AlmText: unknown citation "' + id + '"');
        return seg('cite', { id: id, text: CITES[id].short });
      },
      // parts may be a function: it is then only evaluated when cond holds, so guarded
      // helpers (e.g. a prediction interval that is null for k < 3) are never read.
      when: function (cond, parts) { return cond ? (typeof parts === 'function' ? parts() : parts) : null; },
      pick: function (key, map) {
        if (!results || !Object.prototype.hasOwnProperty.call(results, key)) throw new Error('AlmText: missing result "' + key + '"');
        var v = results[key];
        if (!map || !Object.prototype.hasOwnProperty.call(map, v)) throw new Error('AlmText: no wording for ' + key + ' = ' + String(v));
        return map[v];
      },
      has: function (key) {
        return !!results && Object.prototype.hasOwnProperty.call(results, key) &&
          typeof results[key] === 'number' && Number.isFinite(results[key]);
      },
      // Value as displayed at `digits` decimals (for decisions that must agree with the printed number).
      shown: function (key, digits) { checkDigits(digits); return Number(val(key).toFixed(digits)); },
      zero: function (key, digits) { return T.shown(key, digits) === 0; },
      band: function (key, digits) { return txt(i2Band(T.shown(key, digits)).phrase); },
      plural: function (key, one, many) { return val(key) === 1 ? one : many; },
      ctx: ctxSeg,
      hasCtx: function (key) { return Object.prototype.hasOwnProperty.call(cv, key) && key.indexOf('__') !== 0; },
      // Shared sentences (built only from typed ctx tokens).
      software: function () {
        if (!T.hasCtx('app') || !T.hasCtx('build.version') || !T.hasCtx('build.shortSha')) return null;
        var v = cv['build.version'];
        return ['Analyses were run in allmeta ', ctxSeg('app'), ' ', (/^v/i.test(v) ? '' : 'v'), ctxSeg('build.version'),
          ' (commit ', ctxSeg('build.shortSha'), ').'];
      },
      // Data-entry provenance sentence; omitted entirely when there is no provenance.
      entry: function () {
        var n = cv['entry.groups'] || 0;
        var hasReports = T.hasCtx('entry.reports');
        if (!hasReports && !n) return null;
        var parts = [];
        if (hasReports) {
          parts.push('Data were extracted from ', ctxSeg('entry.reports'), cv['entry.reports'] === 1 ? ' report' : ' reports');
          var d = cv.__entryDetail;
          if (d) {
            // "1 report (2 arms; source location recorded for each)".
            var unit = d === 'arms' ? ' arm' : ' row';
            parts.push(' (', ctxSeg('entry.' + d), cv['entry.' + d] === 1 ? unit : unit + 's',
              cv.__entryAllLocated ? '; source location recorded for each)' : ')');
          } else if (cv.__entryAllLocated) {
            parts.push(' (source location recorded for each study)');
          }
        } else {
          parts.push('Data-entry conversions');
        }
        var cited = {};
        for (var i = 0; i < n; i++) {
          var c = cv['entry.' + i + '.count'];
          parts.push(i || hasReports ? '; ' : ': ', ctxSeg('entry.' + i + '.desc'), ' for ', ctxSeg('entry.' + i + '.count'),
            c === 1 ? ' study' : ' studies');
          var cid = cv['__entry.' + i + '.citeId'];
          if (cid && !cited[cid]) { cited[cid] = true; parts.push(' (', T.cite(cid), ')'); }
          else if (T.hasCtx('entry.' + i + '.cite')) parts.push(' (', ctxSeg('entry.' + i + '.cite'), ')');
        }
        parts.push('.');
        return parts;
      },
      verify: function () {
        if (!T.hasCtx('verify.n')) return null;
        return ['Results were independently verified in R (', ctxSeg('verify.pkg'), ' ', ctxSeg('verify.pkgVersion'),
          '; webR ', ctxSeg('verify.webr'), '), with all ', ctxSeg('verify.n'), ' compared quantities within tolerance.'];
      }
    };
    return T;
  }

  // Label lookup shared by T.label (render) and audit: results[key] (a string), or
  // results[key][index] when an index is given (results[key] must then be an array).
  function labelValue(results, key, index) {
    var name = index === undefined ? key : key + '[' + String(index) + ']';
    if (!results || !Object.prototype.hasOwnProperty.call(results, key)) return { error: 'missing label "' + name + '"' };
    var v = results[key];
    if (index !== undefined) {
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return { error: 'label index for "' + key + '" must be a non-negative integer' };
      if (!Array.isArray(v) || index >= v.length) return { error: 'missing label "' + name + '"' };
      v = v[index];
    }
    if (typeof v !== 'string' || !v.trim()) return { error: 'label "' + name + '" is not a non-empty string (' + String(v) + ')' };
    return { value: v };
  }

  function flatten(parts, out) {
    if (parts == null || parts === false) return out;
    if (typeof parts === 'string') { if (parts) out.push(txt(parts)); return out; }
    if (Array.isArray(parts)) { parts.forEach(function (p) { flatten(p, out); }); return out; }
    if (typeof parts === 'object' && typeof parts.type === 'string' && typeof parts.text === 'string') { out.push(parts); return out; }
    throw new Error('AlmText: templates may only return strings and T helper output (got ' + typeof parts +
      (typeof parts === 'number' ? ' ' + parts + ': numbers must come from T helpers' : '') + ')');
  }

  function para(name, fn, T, results, ctx, provenance, cites, labels) {
    if (typeof fn !== 'function') throw new Error('AlmText: template "' + name + '" is not a function');
    var segments = flatten(fn(T, results, ctx), []);
    segments.forEach(function (s) {
      if (s.type === 'num' || s.type === 'ctx') {
        provenance.push({ key: s.key, value: s.value, text: s.text, para: name, fmt: s.fmt, source: s.source });
      } else if (s.type === 'label') {
        var l = { key: s.key, value: s.value, text: s.text, para: name, source: s.source };
        if (s.index !== undefined) l.index = s.index;
        labels.push(l);
      } else if (s.type === 'cite' && cites.indexOf(s.id) < 0) {
        cites.push(s.id);
      }
    });
    return { segments: segments, text: segments.map(function (s) { return s.text; }).join('') };
  }

  function render(templates, results, ctx) {
    if (!templates || typeof templates !== 'object') throw new Error('AlmText: templates required');
    if (!results || typeof results !== 'object') throw new Error('AlmText: no results (run the analysis first)');
    var cv = ctxValues(ctx || {});
    var T = makeToolkit(results, ctx || {}, cv);
    var provenance = [], cites = [], labels = [];
    var out = {
      plain: para('plain', templates.plain, T, results, ctx, provenance, cites, labels),
      methods: para('methods', templates.methods, T, results, ctx, provenance, cites, labels),
      results: para('results', templates.results, T, results, ctx, provenance, cites, labels),
      flags: []
    };
    if (typeof templates.flags === 'function') {
      var list = templates.flags(T, results, ctx);
      if (!Array.isArray(list)) throw new Error('AlmText: flags template must return an array');
      // Paragraph names follow the index in out.flags (what audit() iterates), not the index in the
      // template list: skipped (null) flags must not shift the provenance paragraph labels.
      list.forEach(function (f) {
        if (f == null || f === false) return;
        var mark = provenance.length, lmark = labels.length;
        var p = para('flags.' + out.flags.length, function () { return f; }, T, results, ctx, provenance, cites, labels);
        if (p.text) out.flags.push(p);
        else { provenance.length = mark; labels.length = lmark; }
      });
    }
    out.provenance = provenance;
    out.labels = labels;
    out.cites = cites.map(function (id) { return { id: id, short: CITES[id].short, full: CITES[id].full }; });
    out.ctxValues = cv;
    return out;
  }

  // ---------------------------------------------------------------------- audit

  function paragraphs(rendered) {
    var list = [['plain', rendered.plain], ['methods', rendered.methods], ['results', rendered.results]];
    (rendered.flags || []).forEach(function (f, i) { list.push(['flags.' + i, f]); });
    return list;
  }

  function normDisplay(s, fmt) {
    var t = String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim().replace(/−/g, '-');
    if (fmt && fmt.kind === 'int') t = t.replace(/,/g, '');
    return t;
  }

  function audit(rendered, results, opts) {
    opts = opts || {};
    var failures = [], checks = 0, nTokens = 0;
    function check(ok, name, detail) {
      checks++;
      if (!ok) failures.push({ check: name, detail: detail });
    }
    if (!rendered || !rendered.plain || !rendered.methods || !rendered.results || !Array.isArray(rendered.provenance)) {
      return { ok: false, checks: 1, passed: 0, failures: [{ check: 'shape', detail: 'not a rendered AlmText object' }], tokens: 0 };
    }
    var cv = opts.ctx ? ctxValues(opts.ctx) : (rendered.ctxValues || {});
    var prov = rendered.provenance, pi = 0;
    var labs = Array.isArray(rendered.labels) ? rendered.labels : [], li = 0;

    paragraphs(rendered).forEach(function (pair) {
      var name = pair[0], p = pair[1];
      if (!p || !Array.isArray(p.segments)) { check(false, name + ':shape', 'missing segments'); return; }
      var joined = p.segments.map(function (s) { return s.text; }).join('');
      check(joined === p.text, name + ':text', 'rendered text differs from its segments');
      var expected = [];
      // Numeric tokens of the text are taken with label segments masked out (by segment type):
      // a label like "Drug 2" is a name, not a number, and is checked against results() below.
      var masked = p.segments.map(function (s) { return s.type === 'label' ? ' ' : s.text; }).join('');
      p.segments.forEach(function (s) {
        if (s.type === 'label') {
          var lname = name + ':label:' + s.key + (s.index !== undefined ? '[' + String(s.index) + ']' : '');
          var truth = labelValue(results, s.key, s.index);
          check(!truth.error && truth.value === s.value && s.text === s.value, lname,
            truth.error ? truth.error : 'label text ' + JSON.stringify(s.text) + ' / value ' + JSON.stringify(s.value) + ' != results ' + JSON.stringify(truth.value));
          var le = labs[li++];
          check(!!le && le.key === s.key && le.index === s.index && le.para === name && le.value === s.value && le.text === s.text,
            lname + ':provenance', 'label segment has no matching labels[] entry in order');
        } else if (s.type === 'num' || s.type === 'ctx') {
          var e = prov[pi++];
          if (!e || e.key !== s.key || e.para !== name) {
            check(false, name + ':provenance-order', 'segment ' + s.key + ' has no matching provenance entry in order');
            expected = expected.concat(tokens(s.text));
          } else {
            expected = expected.concat(tokens(e.text));
          }
        } else if (s.type === 'rule') {
          check(Object.prototype.hasOwnProperty.call(RULES, s.id) && RULES[s.id].text === s.text, name + ':rule:' + s.id, 'rule token text changed');
          expected = expected.concat(tokens(s.text));
        } else if (s.type === 'cite') {
          check(Object.prototype.hasOwnProperty.call(CITES, s.id) && CITES[s.id].short === s.text, name + ':cite:' + s.id, 'citation token text changed');
          expected = expected.concat(tokens(s.text));
        }
      });
      var got = tokens(masked);
      nTokens += got.length;
      var same = got.length === expected.length && got.every(function (t, i) { return t === expected[i]; });
      var where = '';
      if (!same) {
        for (var i = 0; i < Math.max(got.length, expected.length); i++) {
          if (got[i] !== expected[i]) { where = ' (first difference at token ' + i + ': text has ' + JSON.stringify(got[i]) + ', provenance/typed has ' + JSON.stringify(expected[i]) + ')'; break; }
        }
      }
      check(same, name + ':tokens', 'numeric tokens in the text do not match provenance + typed tokens' + where);
    });
    check(pi === prov.length, 'provenance:count', 'provenance has ' + prov.length + ' entries but the text uses ' + pi);
    check(li === labs.length, 'labels:count', 'labels has ' + labs.length + ' entries but the text uses ' + li);

    prov.forEach(function (e, i) {
      var label = 'provenance[' + i + ']:' + e.key;
      var truth;
      if (e.source === 'ctx') {
        truth = cv[e.key];
        check(Object.prototype.hasOwnProperty.call(cv, e.key) && truth === e.value, label + ':value', 'value ' + String(e.value) + ' != context ' + String(truth));
      } else {
        truth = results ? results[e.key] : undefined;
        check(typeof e.value === 'number' && Number.isFinite(e.value) && truth === e.value, label + ':value', 'value ' + String(e.value) + ' != results ' + String(truth));
      }
      var expectText;
      try { expectText = format(e.value, e.fmt); } catch (err) { expectText = '<' + err.message + '>'; }
      check(expectText === e.text, label + ':text', 'text ' + JSON.stringify(e.text) + ' != formatter ' + JSON.stringify(expectText));
    });

    var dom = opts.dom;
    var domChecked = 0;
    if (dom && typeof dom === 'object') {
      Object.keys(dom).forEach(function (key) {
        var d = dom[key];
        var v = results ? results[key] : undefined;
        var mine;
        try { mine = format(v, d.fmt); } catch (err) { mine = '<' + err.message + '>'; }
        domChecked++;
        check(normDisplay(mine, d.fmt) === normDisplay(d.text, d.fmt), 'dom:' + key,
          'results() ' + key + ' formats as ' + JSON.stringify(mine) + ' but the page displays ' + JSON.stringify(d.text));
      });
    }
    // The DOM cross-check is the only check independent of results() inside the UI, so a spec can declare
    // how many keys it must reach; fewer (a layout change, dom() finding nothing) FAILS instead of a silent zero.
    if (typeof opts.domMin === 'number' && opts.domMin > 0) {
      check(domChecked >= opts.domMin, 'dom:min', 'only ' + domChecked + ' value(s) cross-checked against the page display; the app declares at least ' + opts.domMin);
    }
    return { ok: failures.length === 0, checks: checks, passed: checks - failures.length, failures: failures, tokens: nTokens, domChecked: domChecked };
  }

  // ------------------------------------------------------------------- context

  function context(app, textSpec) {
    var st = global.AlmFeaturesState || {};
    var rev;
    try {
      if (global.AlmFeatures && typeof global.AlmFeatures.revision === 'function') rev = global.AlmFeatures.revision(app);
    } catch (e) { rev = undefined; }
    var verifiedCurrent = null; // null = host has no verifiedCurrent(); otherwise exactly true or false
    if (global.AlmFeatures && typeof global.AlmFeatures.verifiedCurrent === 'function') {
      try { verifiedCurrent = global.AlmFeatures.verifiedCurrent(app) === true; } catch (e) { verifiedCurrent = false; }
    }
    return {
      app: app,
      build: global.AlmBuildInfo || null,
      entryLog: Array.isArray(st.provenance) && st.provenance.length ? st.provenance.slice()
        : (Array.isArray(st.entryLog) ? st.entryLog.slice() : []),
      verify: st.verify || null,
      revision: rev,
      verifiedCurrent: verifiedCurrent,
      verifyPackage: textSpec && textSpec.verifyPackage
    };
  }

  // Fingerprint of everything the text is generated from: the results, the host state revision, the
  // context values the templates print (app, build, entry provenance counts) and whether the verification
  // sentence would be printed. The UI records it at generate time and recomputes it before every Copy /
  // download: if it differs, the text is regenerated and re-audited first (review of PR #178).
  function fingerprint(results, ctx) {
    return JSON.stringify({
      results: results == null ? null : results,
      revision: ctx && ctx.revision != null ? ctx.revision : null,
      ctx: ctxValues(ctx),
      verify: verifyFacts(ctx)
    });
  }

  // ------------------------------------------------------------------- exports

  function toMarkdown(rendered, title) {
    var lines = ['# ' + (title || 'Report text'), '',
      '## Plain-language summary', '', rendered.plain.text, '',
      '## Methods', '', rendered.methods.text, '',
      '## Results', '', rendered.results.text, ''];
    if (rendered.flags.length) {
      lines.push('### Notes', '');
      rendered.flags.forEach(function (f) { lines.push('- ' + f.text); });
      lines.push('');
    }
    if (rendered.cites.length) {
      lines.push('### References', '');
      rendered.cites.forEach(function (c) { lines.push('- ' + c.full); });
      lines.push('');
    }
    lines.push('_Generated by allmeta from the app’s own results with fixed templates (no AI); every number was checked by the number audit._', '');
    return lines.join('\n');
  }

  function docxParagraphs(rendered) {
    var out = [
      { heading: 'Plain-language summary', text: rendered.plain.text },
      { heading: 'Methods', text: rendered.methods.text },
      { heading: 'Results', text: rendered.results.text }
    ];
    if (rendered.flags.length) {
      out.push({ heading: 'Notes', text: rendered.flags[0].text });
      rendered.flags.slice(1).forEach(function (f) { out.push({ text: f.text }); });
    }
    if (rendered.cites.length) {
      out.push({ heading: 'References', text: rendered.cites[0].full });
      rendered.cites.slice(1).forEach(function (c) { out.push({ text: c.full }); });
    }
    return out;
  }

  var AlmText = {
    version: '1.0.0',
    RULES: RULES,
    R: R,
    CITES: CITES,
    format: format,
    tokens: tokens,
    render: render,
    audit: audit,
    context: context,
    fingerprint: fingerprint,
    ctxValues: ctxValues,
    verifyFacts: verifyFacts,
    entrySummary: entryRecords,
    ENTRY_CODES: ENTRY_CODES,
    toMarkdown: toMarkdown,
    docxParagraphs: docxParagraphs,
    cochrane: {
      i2Band: i2Band,
      I2_BANDS: I2_BANDS,
      ciIncludesNull: ciIncludesNull,
      imprecise: imprecise,
      differencePhrase: differencePhrase,
      smallK: smallK
    }
  };

  // ------------------------------------------------------------------------ UI

  var AlmTextUI = (function () {
    if (typeof document === 'undefined') return { mount: function () { return null; } };

    function el(tag, attrs, text) {
      var n = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      return n;
    }

    function copyText(s) {
      if (global.navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return fallbackCopy(s); });
      }
      return Promise.resolve(fallbackCopy(s));
    }
    function fallbackCopy(s) {
      var ta = el('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    function download(name, blob) {
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: name });
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
    }

    var BLOCKS = [['plain', 'Plain-language summary'], ['methods', 'Methods'], ['results', 'Results']];

    function mount(host, spec) {
      if (!host) return null;
      var textSpec = spec && spec.text ? spec.text : spec;
      var app = (spec && spec.app) || (textSpec && textSpec.app) || '';
      if (!textSpec || typeof textSpec.results !== 'function' || !textSpec.templates) {
        throw new Error('AlmTextUI.mount: spec needs text.results() and text.templates');
      }
      while (host.firstChild) host.removeChild(host.firstChild);
      var root = el('div', { 'class': 'alm-text', 'data-app': app });
      root.appendChild(el('p', { 'class': 'alm-text-intro' },
        'These paragraphs are generated from this app’s own last results with fixed templates (no AI). ' +
        'Every number is checked against the results before the text is shown. Edit the wording for your report as needed.'));
      var bar = el('div', { 'class': 'alm-text-bar' });
      var regen = el('button', { type: 'button', 'class': 'alm-text-regenerate' }, 'Regenerate');
      bar.appendChild(regen);
      root.appendChild(bar);
      var status = el('p', { 'class': 'alm-text-status', role: 'status', 'aria-live': 'polite' });
      root.appendChild(status);
      var body = el('div', { 'class': 'alm-text-body' });
      var bodies = {};
      BLOCKS.forEach(function (b) {
        var sec = el('section', { 'class': 'alm-text-block', 'data-block': b[0], 'aria-label': b[1] });
        sec.appendChild(el('h3', null, b[1]));
        var p = el('p', { 'class': 'alm-text-para', 'data-para': b[0] });
        sec.appendChild(p);
        var cp = el('button', { type: 'button', 'class': 'alm-text-copy', 'data-copy': b[0], 'aria-label': 'Copy ' + b[1] }, 'Copy');
        cp.addEventListener('click', function () {
          var cur = ensureCurrent();
          if (!cur) return;
          copyText(p.textContent).then(function (ok) {
            status.textContent = ok ? b[1] + ' copied to the clipboard.' + (cur === 'regenerated' ? REGEN_NOTE : '')
              : 'Copy failed: select the text and copy it manually.';
          });
        });
        sec.appendChild(cp);
        body.appendChild(sec);
        bodies[b[0]] = p;
      });
      var notesH = el('h4', null, 'Notes');
      var notes = el('ul', { 'class': 'alm-text-flags' });
      var refsH = el('h4', null, 'References');
      var refs = el('ol', { 'class': 'alm-text-refs' });
      body.appendChild(notesH);
      body.appendChild(notes);
      body.appendChild(refsH);
      body.appendChild(refs);
      var dl = el('div', { 'class': 'alm-text-downloads' });
      var mdBtn = el('button', { type: 'button', 'class': 'alm-text-md' }, 'Download .md');
      var docxBtn = el('button', { type: 'button', 'class': 'alm-text-docx' }, 'Download .docx');
      dl.appendChild(mdBtn);
      dl.appendChild(docxBtn);
      body.appendChild(dl);
      var auditLine = el('p', { 'class': 'alm-text-audit' });
      body.appendChild(auditLine);
      root.appendChild(body);
      host.appendChild(root);

      var state = { rendered: null, audit: null, error: null, fp: null };
      var REGEN_NOTE = ' The results had changed since the text was generated, so it was regenerated and re-audited first.';
      var MSG_CHANGED = 'Results changed since this text was generated — Regenerate. (Copy and downloads regenerate and re-audit automatically.)';
      var MSG_INPUTS = 'Results changed: the inputs were edited after the last run, so this text may not match them — press Run analysis, then Regenerate.';

      // Is the shown text still what the app's current results would produce?
      //   'current' | 'changed' (results / revision / context differ) | 'inputs' (app reports its results out of date)
      //   | 'none' (no results) | 'error'
      function currency() {
        if (typeof textSpec.stale === 'function') {
          var st;
          try { st = textSpec.stale(); } catch (e) { st = true; }
          if (st) return 'inputs';
        }
        var r;
        try { r = textSpec.results(); } catch (e) { return 'error'; }
        if (!r) return 'none';
        var fp;
        try { fp = AlmText.fingerprint(r, AlmText.context(app, textSpec)); } catch (e) { return 'error'; }
        return fp === state.fp ? 'current' : 'changed';
      }
      function markStale(on, msg) {
        if (on) { root.setAttribute('data-stale', 'true'); status.textContent = msg; }
        else root.removeAttribute('data-stale');
      }
      // Gate for every export. Returns 'current' / 'regenerated' (export allowed: the text is current and
      // audited) or null (refused; the status line says why). Never exports text generated from other results.
      function ensureCurrent() {
        var c = currency();
        if (c === 'inputs') { markStale(true, MSG_INPUTS); return null; }
        if (c !== 'current') {
          generate();
          if (!(state.rendered && state.audit && state.audit.ok)) return null;
          if (currency() !== 'current') { markStale(true, MSG_CHANGED); return null; }
          return 'regenerated';
        }
        return state.rendered && state.audit && state.audit.ok ? 'current' : null;
      }
      function checkStale() {
        if (!root.isConnected) { detach(); return; }
        if (!(state.rendered && state.audit && state.audit.ok)) return;
        var c = currency();
        if (c === 'inputs') markStale(true, MSG_INPUTS);
        else if (c !== 'current') markStale(true, MSG_CHANGED);
      }
      // The app re-runs on a click (Run analysis) and marks its inputs stale on input/change; check after the
      // app's own handlers have run. Exports are gated by ensureCurrent() regardless of these hints.
      var deferred = null;
      function onAppEvent(ev) {
        if (ev && ev.target && root.contains(ev.target)) return;
        if (deferred) return;
        deferred = setTimeout(function () { deferred = null; checkStale(); }, 0);
      }
      var EVENTS = ['input', 'change', 'click', 'keyup'];
      EVENTS.forEach(function (t) { document.addEventListener(t, onAppEvent, true); });
      function detach() { EVENTS.forEach(function (t) { document.removeEventListener(t, onAppEvent, true); }); }
      var title = 'allmeta ' + app + ' — report text';
      var base = (app || 'allmeta') + '-report-text';

      function setDocxAvailability() {
        var ok = !!(global.AlmZip && typeof global.AlmZip.docx === 'function');
        docxBtn.disabled = !ok;
        if (ok) docxBtn.removeAttribute('title');
        else docxBtn.setAttribute('title', 'Word export needs shared/alm-zip.js, which is not loaded on this page.');
      }

      function generate() {
        state.rendered = null; state.audit = null; state.error = null; state.fp = null;
        markStale(false);
        setDocxAvailability();
        var r;
        try { r = textSpec.results(); } catch (e) { r = null; state.error = e.message; }
        if (!r) {
          body.hidden = true;
          status.textContent = state.error ? 'Text could not be generated: ' + state.error : 'Run the analysis first.';
          return state;
        }
        try {
          var ctx = AlmText.context(app, textSpec);
          var rendered = render(textSpec.templates, r, ctx);
          var dom = typeof textSpec.dom === 'function' ? textSpec.dom() : null;
          var a = audit(rendered, r, { ctx: ctx, dom: dom, domMin: textSpec.domMin });
          state.rendered = rendered; state.audit = a;
          state.fp = AlmText.fingerprint(r, ctx);
          if (!a.ok) {
            body.hidden = true;
            status.textContent = 'Number audit failed (' + a.passed + ' of ' + a.checks + ' checks passed), so the text is withheld: ' +
              a.failures[0].check + ' — ' + a.failures[0].detail;
            return state;
          }
          BLOCKS.forEach(function (b) { bodies[b[0]].textContent = rendered[b[0]].text; });
          while (notes.firstChild) notes.removeChild(notes.firstChild);
          rendered.flags.forEach(function (f) { notes.appendChild(el('li', null, f.text)); });
          notesH.hidden = notes.hidden = !rendered.flags.length;
          while (refs.firstChild) refs.removeChild(refs.firstChild);
          rendered.cites.forEach(function (c) { refs.appendChild(el('li', null, c.full)); });
          refsH.hidden = refs.hidden = !rendered.cites.length;
          auditLine.textContent = 'Number audit: ' + a.passed + ' of ' + a.checks + ' checks passed (' + a.tokens +
            ' numbers in the text, each traced to the app’s results' + (a.domChecked ? '; ' + a.domChecked + ' values matched to the page display' : '') + ').';
          body.hidden = false;
          status.textContent = 'Text generated from the current results.';
        } catch (e) {
          state.error = e.message;
          body.hidden = true;
          status.textContent = 'Text could not be generated: ' + e.message;
        }
        return state;
      }

      regen.addEventListener('click', generate);
      mdBtn.addEventListener('click', function () {
        var cur = ensureCurrent();
        if (!cur) return;
        download(base + '.md', new Blob([toMarkdown(state.rendered, title)], { type: 'text/markdown;charset=utf-8' }));
        status.textContent = 'Markdown file downloaded.' + (cur === 'regenerated' ? REGEN_NOTE : '');
      });
      docxBtn.addEventListener('click', function () {
        if (!(global.AlmZip && typeof global.AlmZip.docx === 'function')) { setDocxAvailability(); return; }
        var cur = ensureCurrent();
        if (!cur) return;
        var bytes = global.AlmZip.docx({ title: title, paragraphs: docxParagraphs(state.rendered) });
        download(base + '.docx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        status.textContent = 'Word file downloaded.' + (cur === 'regenerated' ? REGEN_NOTE : '');
      });

      generate();
      var api = { regenerate: generate, state: state, root: root, check: checkStale, detach: detach };
      host.almText = api;
      return api;
    }

    return { mount: mount };
  })();

  global.AlmText = AlmText;
  global.AlmTextUI = AlmTextUI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlmText;
    module.exports.AlmTextUI = AlmTextUI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
