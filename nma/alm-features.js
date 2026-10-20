/* Shared features for the contrast-based NMA page.
 * Text reads the page's completed, displayed results: the private _lastAnalysis is not exported.
 * No statistical calculation is repeated for prose. Display precision is retained, including p bounds.
 * Verify reuses validate/adapter.js; its global R objects are p, fit (netmeta), rank (netrank).
 * The page has a network SVG only. The R forest is offered without inventing an app forest.
 */
(function (global) {
  'use strict';
  var APP = 'nma';
  var fields = { data: 'f-data', ref: 'f-ref', model: 'f-model', ci: 'f-ci',
    dir: 'f-dir', scale: 'f-scale', title: 'f-title', example: 'f-example' };
  var choices = { model: ['fe', 're'], ci: ['classic', 't-dist'],
    dir: ['desirable', 'undesirable'], scale: ['log', 'exp'] };
  function el(id) { return document.getElementById(id); }
  function controls() {
    var s = {};
    Object.keys(fields).forEach(function (k) { s[k] = el(fields[k]).value; });
    return s;
  }
  function label(value) {
    return typeof value === 'string' && value.trim() && !/[,\t\r\n]/.test(value) && !/^\s*#/.test(value);
  }
  function rowsText(records) {
    if (!Array.isArray(records) || !records.length) throw new Error('No contrast rows supplied.');
    return records.map(function (r) {
      if (!label(r.study) || !label(r.t1) || !label(r.t2) || r.t1.trim() === r.t2.trim() ||
          !Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0) {
        throw new Error('Each contrast needs study and distinct treatment labels, a finite effect and a positive SE. Labels cannot contain commas, tabs or newlines, or start with #.');
      }
      return [r.study.trim(), r.t1.trim(), r.t2.trim(), r.yi, r.sei].join(', ');
    }).join('\n');
  }
  function checkData(data, ci, ref) {
    var records = [];
    data.split(/\r?\n/).forEach(function (line) {
      if (!line.trim() || /^\s*#/.test(line)) return;
      var p = line.trim().split(/\s*[,\t]\s*/);
      if (!records.length && /^(estimate|effect|TE|est)$/i.test(p[3] || '')) return;
      if (p.length !== 5 || !p[3].trim() || !p[4].trim()) throw new Error('Each data row must contain five columns.');
      records.push({ study: p[0], t1: p[1], t2: p[2], yi: Number(p[3]), sei: Number(p[4]) });
    });
    var canonical = rowsText(records);
    var result = global.__almNmaCompute(canonical, undefined, { randomCi: ci });
    if (result.error) throw new Error(result.error);
    if (ref !== undefined && result.treatments.indexOf(ref) < 0) throw new Error('Reference treatment is absent from the data.');
    return result;
  }
  function run() { el('btn-run').click(); capture(); }
  function apply(records) {
    var data = rowsText(records);
    checkData(data, el('f-ci').value);
    el('f-data').value = data;
    // The shared entry UI records the newly accepted log/provenance after apply returns.
    // Do not carry an earlier import's source claims into replacement rows.
    if (global.AlmFeaturesState) {
      global.AlmFeaturesState.entryLog = [];
      global.AlmFeaturesState.provenance = [];
    }
    run();
    return { ok: !!saved, n: records.length };
  }

  // Each displayed number has a separate audit key. No private result getter is available in this app.
  function displayed() {
    var refs = document.querySelectorAll('#ref-host tbody tr');
    if (!refs.length) return null;
    var r = controls(), dom = {};
    r.digits = r.scale === 'exp' ? 2 : 3;
    r.nullEffect = r.scale === 'exp' ? 1 : 0;
    r.ciLevel = 95; r.piMinDf = 2; r.mcDraws = 10000;
    r.references = []; r.ranks = []; r.league = []; r.heterogeneity = [];
    function put(key, text, digits, kind) {
      if (typeof text !== 'string') return;
      var value = Number(text.replace(/%/g, '').trim());
      if (!Number.isFinite(value)) return;
      r[key] = value;
      dom[key] = { text: text, fmt: { kind: kind || 'num', digits: digits } };
    }
    function nums(text) { return text.match(/-?\d+(?:\.\d+)?/g) || []; }
    function named(key, text) {
      // Numeric tokens in labels must also pass AlmText's provenance audit.
      r[key] = String(text).split(/(-?\d+(?:\.\d+)?)/).map(function (part, i) {
        if (!/^-?\d+(?:\.\d+)?$/.test(part)) return { text: part };
        var id = key + '_number_' + i, digits = (part.split('.')[1] || '').length;
        r[id] = Number(part);
        if (!Number.isFinite(r[id]) || digits > 10 || r[id].toFixed(digits) !== part) {
          r.labelIssue = 'Report text cannot preserve this numeric treatment label with the shared number formatter: ' + text + '. Use the displayed tables and exports.';
        }
        return { key: id, digits: digits };
      });
    }
    named('referenceName', r.ref);
    var cards = document.querySelectorAll('#stats-wrap .stat .v');
    ['k', 'contrasts', 'treatments'].forEach(function (key, i) { put(key, cards[i].textContent, 0, 'int'); });
    var het = document.querySelectorAll('#het-host tbody tr');
    var tau = nums(het[0].cells[1].textContent), i2 = nums(het[1].cells[1].textContent);
    if (tau.length === 2) { put('tau2', tau[0], 4); put('tau', tau[1], 4); }
    if (i2.length === 3) ['i2', 'i2Lo', 'i2Hi'].forEach(function (key, i) { put(key, i2[i] + '%', 1, 'pct'); });
    Array.from(het).slice(2).forEach(function (row, i) {
      var key = 'het_' + i, text = row.cells[1].textContent, n = nums(text);
      r.heterogeneity.push(key); r[key + '_label'] = row.cells[0].textContent;
      put(key + '_Q', n[0], 2); put(key + '_df', n[1], 0, 'int');
      if (n[2]) put(key + '_p', n[2], 4);
      r[key + '_bounded'] = /p\s*</.test(text);
    });
    r.df = r.het_0_df;
    Array.from(refs).forEach(function (row, i) {
      var key = 'ref_' + i, n = nums(row.cells[1].textContent);
      r.references.push(key); named(key + '_name', row.cells[0].textContent);
      ['est', 'lo', 'hi'].forEach(function (suffix, j) { put(key + '_' + suffix, n[j], r.digits); });
      var p = row.cells[row.cells.length - 1].textContent;
      put(key + '_p', nums(p)[0], 4); r[key + '_bounded'] = /</.test(p);
      if (r.model === 're') {
        var pi = nums(row.cells[2].textContent);
        if (pi.length === 2) { put(key + '_piLo', pi[0], r.digits); put(key + '_piHi', pi[1], r.digits); }
      }
    });
    Array.from(document.querySelectorAll('#sucra-host .sucra-row')).slice(1).forEach(function (row, i) {
      var key = 'rank_' + i;
      r.ranks.push(key); named(key + '_name', row.children[0].textContent);
      put(key + '_pscore', row.children[2].textContent, 1, 'pct');
      if (row.children[3].textContent !== '--') put(key + '_best', row.children[3].textContent, 1, 'pct');
    });
    var heads = Array.from(document.querySelectorAll('#league-host thead th')).slice(1);
    Array.from(document.querySelectorAll('#league-host tbody tr')).forEach(function (row, i) {
      Array.from(row.querySelectorAll('td')).forEach(function (cell, j) {
        if (i >= j) return; // One direction per pair; the table supplies the reverse direction too.
        var key = 'league_' + i + '_' + j, n = nums(cell.innerText);
        r.league.push(key);
        named(key + '_row', row.querySelector('th').textContent); named(key + '_col', heads[j].textContent);
        ['est', 'lo', 'hi'].forEach(function (suffix, ix) { put(key + '_' + suffix, n[ix], r.digits); });
      });
    });
    return { r: r, dom: dom, state: JSON.stringify(controls()) };
  }
  var saved = null;
  function capture() { saved = displayed(); }
  function results() {
    if (!saved || saved.state !== JSON.stringify(controls())) return null;
    if (saved.r.labelIssue) throw new Error(saved.r.labelIssue);
    var r = JSON.parse(JSON.stringify(saved.r));
    var p = global.__almTextPerturb;
    if (p && typeof r[p.key] === 'number' && Number.isFinite(p.delta)) r[p.key] += p.delta;
    return r;
  }
  function name(T, r, key) {
    return r[key].map(function (part) { return part.key ? T.num(part.key, part.digits) : part.text; });
  }
  function pvalue(T, r, key) {
    return T.has(key + '_p') ? ['p ', r[key + '_bounded'] ? '< ' : '= ', T.num(key + '_p', 4)] : 'p not estimable';
  }
  var templates = {
    plain: function (T, r) {
      return ['The network included ', T.int('k'), ' studies comparing ', T.int('treatments'),
        ' treatments. Effects below compare each treatment with ', name(T, r, 'referenceName'),
        '. ', r.references.map(function (key) {
          var includes = global.AlmText.cochrane.ciIncludesNull(r[key + '_lo'], r[key + '_hi'], r.nullEffect);
          return [name(T, r, key + '_name'), ': ', T.num(key + '_est', r.digits), ' (',
            T.pct('ciLevel', 0), ' confidence interval ', T.ci(key + '_lo', key + '_hi', r.digits), '). ',
            includes ? 'The interval includes no effect; there is no evidence of a difference, which is not evidence of no difference. ' :
              'The confidence interval excludes no effect. ',
            T.when(global.AlmText.cochrane.imprecise(r[key + '_lo'], r[key + '_hi'], r.nullEffect),
              'This estimate is imprecise: the interval also allows effects in either direction. ')];
        }),
        T.when(T.has('i2'), function () { return ['Variation beyond chance ', T.band('i2', 1), '. ']; }),
        'These results assume consistency of direct and indirect evidence and comparable effect modifiers across comparisons. Rankings do not establish clinical importance or causation.'];
    },
    methods: function (T, r) {
      return ['Contrast-based network meta-analysis used generalised least squares with ',
        r.model === 're' ? 'random effects and a common between-study variance estimated by the generalised DerSimonian–Laird method. ' :
          'a common-effect inverse-variance model. ',
        'Entered effects represent the second treatment minus the first, already on the analysis scale; no arm-count conversion or continuity correction is performed. Complete multi-arm comparisons are grouped by study and correlated contrasts use arm variances; the random-effects covariance adds half the between-study variance to shared contrasts. Invalid or inconsistent multi-arm designs are refused. ',
        'Effects and ', T.pct('ciLevel', 0), ' confidence limits ',
        r.scale === 'exp' ? 'were exponentiated for display. ' : 'are displayed on the entered analysis scale. ',
        r.model === 're' && r.ci === 't-dist' && r.df > T.R.none ?
          'Confidence intervals and two-sided tests use a t distribution with the degrees of freedom of Q. ' :
          'Confidence intervals and two-sided tests use the normal Wald approximation. ',
        'No Hartung–Knapp adjustment is applied. Heterogeneity is reported as Q with chi-squared tests, the DerSimonian–Laird between-study variance and its square root, and I² with a Higgins–Thompson interval through H. I² is the nonnegative Q-based proportion of excess variation. Q is decomposed into within-design heterogeneity and between-design inconsistency. ',
        r.model === 're' ? ['Prediction intervals are the random-effects estimate plus or minus a t quantile times the square root of the sum of between-study variance and squared standard error, on the analysis scale, using the degrees of freedom of Q; they require at least ',
          T.int('piMinDf'), ' such degrees of freedom and are transformed like the confidence limits. '] :
          'Prediction intervals are not displayed for the common-effect model. ',
        'P-scores average pairwise certainty derived from the selected model’s two-sided tests; ',
        r.dir === 'desirable' ? 'smaller' : 'larger', ' estimates rank better. P(best) uses ',
        T.int('mcDraws'), ' multivariate-normal draws of the fitted effects with their covariance and a fixed random seed. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T, r) {
      return ['There were ', T.int('k'), ' studies, ', T.int('contrasts'), ' contrasts and ', T.int('treatments'),
        ' treatments. Reference: ', name(T, r, 'referenceName'), '. ',
        r.references.map(function (key) {
          return [name(T, r, key + '_name'), ' versus reference: ', T.num(key + '_est', r.digits),
            ' (', T.pct('ciLevel', 0), ' CI ', T.ci(key + '_lo', key + '_hi', r.digits), '); ', pvalue(T, r, key), '. ',
            T.when(T.has(key + '_piLo'), function () { return ['Prediction interval: ', T.ci(key + '_piLo', key + '_piHi', r.digits), '. ']; })];
        }),
        T.has('tau2') ? ['Between-study variance τ² = ', T.num('tau2', 4), '; τ = ', T.num('tau', 4), '. '] :
          'Between-study variance is not estimable. ',
        T.has('i2') ? ['I² = ', T.pct('i2', 1), ' (', T.pct('ciLevel', 0), ' CI ', T.ci('i2Lo', 'i2Hi', 1, 'pct'), '); ',
          T.band('i2', 1), ' (', T.cite('handbookHet'), '). '] : 'I² is not estimable. ',
        r.heterogeneity.map(function (key) {
          return [r[key + '_label'], ': Q = ', T.num(key + '_Q', 2), ', df = ', T.int(key + '_df'), ', ', pvalue(T, r, key), '. '];
        }),
        'Rankings: ', r.ranks.map(function (key) {
          return [name(T, r, key + '_name'), ', P-score ', T.pct(key + '_pscore', 1),
            T.when(T.has(key + '_best'), function () { return [', P(best) ', T.pct(key + '_best', 1)]; }), '; '];
        }),
        'League comparisons (one direction per pair, row versus column): ',
        r.league.map(function (key) {
          return [name(T, r, key + '_row'), ' versus ', name(T, r, key + '_col'), ': ', T.num(key + '_est', r.digits),
            ' (', T.ci(key + '_lo', key + '_hi', r.digits), '); '];
        })];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.k < T.R.funnelK, 'Tests for small-study effects would be underpowered; none were performed.'),
        T.when(r.model === 're' && r.df < r.piMinDf, 'Prediction intervals are not estimable with these heterogeneity degrees of freedom.'),
        'Text uses the completed results at the precision displayed by the page. Confidence intervals alone do not establish clinical importance.',
        'Assess consistency and transitivity before interpreting network estimates or rankings.'];
    }
  };
  var textSpec = { app: APP, verifyPackage: 'netmeta', results: results, templates: templates,
    dom: function () { var d = displayed(); return d ? d.dom : {}; } };
  var spec = {
    paper: 4, title: 'Network meta-analysis',
    entry: { schema: 'contrast-nma', extras: [], apply: apply },
    text: textSpec,
    verify: {
      adapter: function () { return global.AlmLiveAdapters && global.AlmLiveAdapters[APP] || global.AlmNmaValidateAdapter; },
      inputs: '#f-data, #f-ref, #f-model, #f-ci, #f-dir, #f-scale, #f-title',
      rObjects: 'p (contrast data), fit (netmeta), rank (netrank)',
      plots: [
        { id: 'forest', title: 'Forest versus reference (R only; no app forest SVG)',
          r: function (s) {
            var axis = s.scale === 'exp' ? 'Exponentiated effect' : 'Effect on analysis scale';
            return 'plotfit <- fit\n' + (s.scale === 'exp' ?
              '# sm controls exponentiation only; the effect measure was not specified by the app.\nplotfit$sm <- "OR"\n' : '') +
              'forest(plotfit, reference.group=' + JSON.stringify(s.result.ref) +
              ', pooled=' + JSON.stringify(s.model === 're' ? 'random' : 'common') +
              ', backtransf=' + (s.scale === 'exp' ? 'TRUE' : 'FALSE') +
              ', smlab=' + JSON.stringify(axis) + ', xlab=' + JSON.stringify(axis) + ')';
          } },
        { id: 'network', title: 'Network graph', r: 'netgraph(fit)', app: function () { return document.querySelector('#svg-host svg'); } }
      ]
    },
    share: {
      get: function () {
        var s = controls();
        s.entryLog = (global.AlmFeaturesState && global.AlmFeaturesState.entryLog) || [];
        return s;
      },
      set: function (s) {
        if (!s || typeof s.data !== 'string' || s.data.length > 200000 ||
            typeof s.title !== 'string' || s.title.length > 10000 || typeof s.ref !== 'string') throw new Error('Invalid NMA state.');
        Object.keys(choices).forEach(function (k) { if (choices[k].indexOf(s[k]) < 0) throw new Error('Unknown option: ' + k); });
        if (!Array.from(el('f-example').options).some(function (o) { return o.value === s.example; })) throw new Error('Unknown example.');
        if (s.entryLog !== undefined && !Array.isArray(s.entryLog)) throw new Error('Invalid conversion log.');
        checkData(s.data, s.ci, s.ref); // Entire payload validated before any control changes.
        Object.keys(fields).forEach(function (k) { if (k !== 'ref') el(fields[k]).value = s[k]; });
        // Populate the new data's reference choices before selecting the requested reference.
        run(); el('f-ref').value = s.ref; run();
        global.AlmFeaturesState.entryLog = s.entryLog || [];
      }
    }
  };
  global.AlmNmaFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {}; global.AlmTextSpecs[APP] = textSpec;
  if (global.AlmFeatures) {
    // The shared entry UI has no host module of its own in this base branch.
    global.AlmFeatures.registerModule && global.AlmFeatures.registerModule('entry', {
      label: 'Data entry',
      render: function (panel, ctx) {
        var note = document.createElement('p');
        note.textContent = 'Use contrast data with study, t1, t2, effect and SE, or effect with confidence limits. Effects must be treatment two minus treatment one on the analysis scale. Arm-count exports require conversion in the app’s existing extraction workflow.';
        panel.appendChild(note);
        return global.AlmEntryUI.mount(panel, ctx.block);
      }
    });
    // AlmText exposes its UI but does not register a feature-host module.
    global.AlmFeatures.registerModule && global.AlmFeatures.registerModule('text', {
      label: 'Report text',
      render: function (panel, ctx) {
        var ui = global.AlmTextUI.mount(panel, { app: ctx.app, text: ctx.block });
        // Refresh after analysis edits or an R check while this tab was hidden.
        return { onShow: function () { ui.regenerate(); } };
      }
    });
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof document !== 'undefined' && typeof global.MutationObserver === 'function') {
    capture();
    new global.MutationObserver(capture).observe(el('ref-host'), { childList: true });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
