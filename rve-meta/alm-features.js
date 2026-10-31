/* App 15: additive wiring only. Statistics and the desktop R recipe remain in
 * shared/rve.js and rve-meta/alm-live.js. No result is fitted in this adapter.
 * Generic entry uses SE (squared once for the native variance input); explicit
 * vi records are also accepted. Cluster IDs must be supplied, never inferred.
 */
(function (global) {
  'use strict';
  // Number settings go into type=number inputs. A value must be a complete decimal number: Number() also reads
  // 0x10 / 0b1 / ' ', and the input then silently clears such text to '' (automatic or zero). Valid forms the input
  // itself cannot hold ('+1', ' 0.5', '5.') are written as the same number.
  var DECIMAL_SETTING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function decimalSetting(v) { return typeof v === 'string' && DECIMAL_SETTING.test(v.trim()) && Number.isFinite(Number(v)); }
  function writeNumberSetting(el, v) {
    var t = String(v).trim();
    el.value = t;
    if (el.value === '' && t !== '') el.value = String(Number(t));
  }
  var APP = 'rve-meta';
  // Bridge the existing desktop adapter into the documented feature registry.
  if (global.AlmValidate && global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) {
    global.AlmValidate.adapters[APP] = global.AlmLiveAdapters[APP];
  }
  // App-specific additions to the exported typed-token registries. Shared files
  // and their frozen generic rule constants remain unchanged.
  var lowDfRule = { value: 4, text: '4', about: 'Below this Satterthwaite df, inference may be untrustworthy (Tipton 2015).' };
  if (global.AlmText) {
    global.AlmText.RULES.rveLowDf = lowDfRule;
    global.AlmText.CITES.rveHTJ = {
      short: 'Hedges, Tipton and Johnson 2010',
      full: 'Hedges LV, Tipton E, Johnson MC. Robust variance estimation in meta-regression with dependent effect size estimates. Research Synthesis Methods. 2010;1:39–65. https://doi.org/10.1002/jrsm.5'
    };
    global.AlmText.CITES.rveTipton = {
      short: 'Tipton 2015',
      full: 'Tipton E. Small sample adjustments for robust variance estimation with meta-regression. Psychological Methods. 2015;20:375–393. https://doi.org/10.1037/met0000011'
    };
    global.AlmText.CITES.rvePustejovskyTipton = {
      short: 'Pustejovsky and Tipton 2018',
      full: 'Pustejovsky JE, Tipton E. Small-sample methods for cluster-robust variance estimation and hypothesis testing in fixed effects models. Journal of Business & Economic Statistics. 2018;36:672–683. https://doi.org/10.1080/07350015.2016.1247004'
    };
  }
  function byId(id) { return document.getElementById(id); }
  function live() { return global.AlmValidate && global.AlmValidate.adapters[APP]; }
  function names() { return byId('f-names').value.split(/\s*,\s*/).filter(Boolean); }
  function number(v, label) {
    if (!(typeof v === 'number' ? Number.isFinite(v) : decimalSetting(v))) {
      throw new Error(label + ' must be a finite number.');
    }
    return Number(v);
  }
  function safeLabel(v, label) {
    if (typeof v !== 'string' || !v.trim() || /[,\r\n<>]/.test(v)) {
      throw new Error(label + ' must be nonempty and contain no commas, line breaks or angle brackets.');
    }
    return v.trim();
  }
  function get() {
    return { src: byId('src').value, rho: byId('f-rho').value, names: byId('f-names').value,
      centred: byId('f-centre').checked };
  }
  function validateState(s) {
    if (!s || typeof s.src !== 'string' || !s.src.trim() || s.src.length > 200000) throw new Error('Data text missing or too long.');
    if (typeof s.names !== 'string' || s.names.length > 10000 || /[<>\r\n]/.test(s.names)) throw new Error('Invalid predictor names.');
    var rho = number(s.rho, 'Working correlation');
    if (rho < 0 || rho > 1) throw new Error('Working correlation must be between zero and one.');
    if (s.centred !== undefined && typeof s.centred !== 'boolean') throw new Error('Invalid predictor centring option.');
    // Share the page's parser contract: headers, reordered columns, SE, quoted
    // labels and delimiters must round-trip just as they do in Studies.
    global.AlmRVEExtras.parseStudies(s.src);
  }
  // Validate first; roll back if the original app refuses the fit (e.g. singular design).
  function set(s) {
    validateState(s);
    var before = get();
    function write(v) {
      byId('src').value = v.src; writeNumberSetting(byId('f-rho'), v.rho); byId('f-names').value = v.names;
      // Links created before the centring option existed describe uncentred fits.
      byId('f-centre').checked = v.centred === true;
      byId('btn-run').click();
    }
    write(s);
    if (!byId('coef-body').rows.length) {
      write(before);
      throw new Error('The app could not fit these rows; previous inputs restored.');
    }
  }
  function apply(records) {
    if (!Array.isArray(records) || !records.length) throw new Error('No rows to apply.');
    var requested = names();
    var aliases = Array.from(new Set(records.flatMap(function (r) { return Object.keys(r); })))
      .filter(function (k) { return /^x[1-9]\d*$/.test(k); })
      .sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); });
    var mods = requested.filter(function (k) { return records.some(function (r) { return r[k] !== undefined; }); });
    if (mods.length && aliases.some(function (k) { return mods.indexOf(k) < 0; })) {
      throw new Error('Use named moderators or alias moderators consistently; no columns were applied.');
    }
    if (!mods.length) mods = aliases;
    if (mods.length && requested.some(function (k) { return records.some(function (r) { return r[k] !== undefined; }); }) &&
        mods.length !== requested.length) throw new Error('Supply every named moderator, or omit all moderators for an intercept-only fit.');
    var steps = [];
    var lines = records.map(function (r, i) {
      var cluster = safeLabel(r.cluster, 'Cluster on row ' + (i + 1));
      var yi = number(r.yi, 'Effect');
      var vi;
      if (r.vi !== undefined) vi = number(r.vi, 'Variance');
      else {
        var se = number(r.sei, 'Standard error');
        if (se <= 0) throw new Error('Standard error must be positive.');
        vi = se * se;
        steps.push({ study: r.study, row: i, text: String(r.study || cluster) + ': sampling variance = SE squared',
          method: 'vi = sei * sei', citation: 'Definition of sampling variance', inputs: { sei: se }, output: vi });
      }
      if (!(vi > 0) || !Number.isFinite(vi)) throw new Error('Sampling variance must be positive and finite.');
      if (r.vi !== undefined && r.sei !== undefined) {
        var suppliedSE = number(r.sei, 'Standard error');
        if (!(suppliedSE > 0) || Math.abs(suppliedSE * suppliedSE - vi) > 1e-9 * vi) throw new Error('Variance and standard error disagree.');
      }
      // Quote cluster IDs so comment markers and literal quotes survive native parsing.
      return ['"' + cluster.replace(/"/g, '""') + '"', yi, vi].concat(mods.map(function (k) { return number(r[k], 'Moderator ' + k); })).join(', ');
    });
    set({ src: lines.join('\n'), rho: byId('f-rho').value, names: mods.join(', '), centred: byId('f-centre').checked });
    global.AlmFeaturesState.entryLog = (global.AlmFeaturesState.entryLog || []).concat(steps);
    // A new paste must never retain source records from an earlier analysis.
    global.AlmFeaturesState.provenance = records.map(function (r) { return r.provenance; }).filter(Boolean);
    return { ok: true, n: records.length };
  }

  function results() {
    try { live().currentState(); } catch (e) { return null; }
    var o = global.__almLastRVE();
    var r = { k: o.fit.k_total, clusters: o.fit.m_clusters, coefficients: o.fit.p,
      tau2: o.fit.tau2, rho: o.fit.rho, correction: Number(o.fit.method.slice(2)),
      ciLevel: 95, nullValue: 0, centred: !!o.inputs.centred, coefficientKeys: [] };
    o.summary.forEach(function (s, i) {
      var prefix = 'coef_' + i + '_';
      r.coefficientKeys.push({ prefix: prefix, indexKey: prefix + 'index' });
      r[prefix + 'index'] = s.coef_index + 1;
      Object.keys(s).forEach(function (k) { r[prefix + k] = s[k]; });
    });
    var pt = global.__almTextPerturb;
    if (pt && typeof r[pt.key] === 'number' && typeof pt.delta === 'number') r[pt.key] += pt.delta;
    return r;
  }
  function dom() {
    var out = {};
    function add(key, text, digits) { out[key] = { text: text, fmt: { kind: 'num', digits: digits } }; }
    add('tau2', byId('meta-row').querySelector('code').textContent, 4);
    var m = /k = (\d+) effects, m = (\d+) clusters, p = (\d+) coefficients.*ρ = ([\d.]+)/.exec(byId('meta-row').textContent);
    if (m) {
      ['k', 'clusters', 'coefficients'].forEach(function (k, i) { out[k] = { text: m[i + 1], fmt: { kind: 'int' } }; });
      add('rho', m[4], 2);
    }
    Array.from(byId('coef-body').rows).forEach(function (row, i) {
      var prefix = 'coef_' + i + '_', cells = row.cells;
      ['estimate', 'se', 't', 'df'].forEach(function (k, j) { add(prefix + k, cells[j + 1].textContent, j < 2 ? 3 : 2); });
      var ci = cells[5].textContent.split(',');
      add(prefix + 'ci_lo', ci[0], 3); add(prefix + 'ci_hi', ci[1], 3);
      // Below the page's reporting threshold, the DOM contains a bound, not a point value.
      if (!cells[6].textContent.includes('<')) add(prefix + 'p', cells[6].textContent, 3);
    });
    return out;
  }
  var templates = {
    plain: function (T, r) {
      return ['The analysis included ', T.int('k'), ' dependent effects in ', T.int('clusters'),
        ' clusters. A meta-regression accounted for dependence within each cluster. ',
        r.centred ? 'The intercept describes the estimated effect at the predictor means; it is not an overall pooled effect. ' :
          'The intercept describes the estimated effect when every predictor is zero; it is not an overall pooled effect. ',
        'The estimates describe associations and do not establish causation or clinical importance.'];
    },
    methods: function (T, r) {
      return ['Effects and sampling variances on the supplied analysis scale were analysed using the Hedges–Tipton–Johnson correlated-effects (CORR) working model (',
        T.cite('rveHTJ'), '), with correlation ρ = ',
        T.num('rho', 2), '. An intercept was added automatically. ',
        r.centred ? 'Predictors were centred at their arithmetic means before fitting. ' : '',
        'The between-cluster variance used the CORR moment estimator truncated at zero. ',
        'Each effect was weighted by the reciprocal of the product of its cluster size and the sum of that cluster’s mean sampling variance and τ². ',
        'Inference used the CR', T.int('correction'), ' bias-reduced sandwich correction and coefficient-specific Satterthwaite degrees of freedom (',
        T.cite('rveTipton'), '; ', T.cite('rvePustejovskyTipton'), '). ',
        'Two-sided t tests compared each coefficient with zero; ', T.pct('ciLevel', 0),
        ' confidence limits were the estimate plus or minus the corresponding t quantile times its robust standard error. ',
        'The app applied no effect transformation or back-transformation. It computed no prediction interval or I² statistic. ',
        T.entry(), T.when(T.entry(), ' '), T.software(),
        T.when(global.AlmFeatures.verifiedCurrent(APP), function () { return [' ', T.verify()]; })];
    },
    results: function (T, r) {
      var parts = ['There were ', T.int('k'), ' effects, ', T.int('clusters'), ' clusters and ',
        T.int('coefficients'), ' coefficients. Between-cluster variance τ²(CORR) = ', T.num('tau2', 4),
        '; working correlation ρ = ', T.num('rho', 2), '. '];
      r.coefficientKeys.forEach(function (c) {
        parts.push('Coefficient ', T.int(c.indexKey), ': estimate ', T.num(c.prefix + 'estimate', 3),
          ', robust SE ', T.num(c.prefix + 'se', 3), ', t = ', T.num(c.prefix + 't', 2),
          ', df = ', T.num(c.prefix + 'df', 2), ', ', T.pct('ciLevel', 0), ' CI ',
          T.ci(c.prefix + 'ci_lo', c.prefix + 'ci_hi', 3), ', ', T.p(c.prefix + 'p'), '. ');
      });
      parts.push('Coefficients follow the displayed table order, beginning with the intercept.');
      return parts;
    },
    flags: function (T, r) {
      var flags = [];
      r.coefficientKeys.forEach(function (c) {
        if (global.AlmText.cochrane.ciIncludesNull(r[c.prefix + 'ci_lo'], r[c.prefix + 'ci_hi'], r.nullValue)) {
          flags.push(['Coefficient ', T.int(c.indexKey), ': ',
            global.AlmText.cochrane.differencePhrase(r[c.prefix + 'ci_lo'], r[c.prefix + 'ci_hi'], r.nullValue),
            '. This does not establish absence of an association.']);
        }
      });
      if (r.coefficientKeys.some(function (c) { return r[c.prefix + 'df'] < lowDfRule.value; })) {
        flags.push(['For coefficients with low Satterthwaite degrees of freedom, p-values and confidence intervals may not be trustworthy (Satterthwaite df < ',
          T.rule('rveLowDf'), '; ', T.cite('rveTipton'), ').']);
      }
      return flags;
    }
  };
  var textSpec = { app: APP, verifyPackage: 'robumeta', results: results, dom: dom, templates: templates };
  var entry = { schema: 'generic', apply: apply };
  Object.defineProperty(entry, 'extras', { enumerable: true, get: function () {
    return ['cluster', 'vi'].concat(names(), Array.from({ length: 20 }, function (_, i) { return 'x' + (i + 1); }));
  } });
  var spec = {
    paper: 15, title: 'Robust variance estimation', entry: entry, text: textSpec,
    verify: { adapter: live, inputs: '#src, #f-rho, #f-names, #f-centre', rObjects: 'd, f (robu fit), tab, cr2' },
    share: { get: get, set: set }
  };
  Object.defineProperty(spec.verify, 'plots', { enumerable: true, get: function () {
    return live().plots;
  } });
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  global.AlmRVEFeatures = spec;
  if (global.AlmFeatures) {
    global.AlmFeatures.register(APP, spec);
  }
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') {
    global.AlmFeatures.registerModule('text', { label: 'Report text', render: function (panel) {
      var ui = global.AlmTextUI.mount(panel, { app: APP, text: textSpec });
      return { onShow: function () { ui.regenerate(); } };
    } });
    // The shared module offers the desktop script on a missing-package result,
    // but its ZIP is only created after a successful R execution. Export a
    // clearly unverified bundle here without changing that shared module.
    global.AlmFeatures.registerModule('verify', { label: 'Verify in R', render: function (panel, ctx) {
      var hooks = global.AlmVerifyR.module.render(panel, ctx);
      var note = document.createElement('p');
      note.textContent = 'The desktop script includes a robust coefficient-interval plot for intercept-only and moderator models. This page has a coefficient table and no app SVG to compare.';
      panel.appendChild(note);
      var zip = document.createElement('button');
      zip.type = 'button'; zip.className = 'alm-f-btn'; zip.hidden = true;
      zip.textContent = 'Download unavailable-check bundle (ZIP)';
      panel.appendChild(zip);
      var summary = panel.querySelector('[data-testid="verify-summary"]');
      new MutationObserver(function () {
        zip.hidden = !summary.textContent.startsWith('Not checked in the browser:');
      }).observe(summary, { childList: true, subtree: true, characterData: true });
      zip.addEventListener('click', async function () {
        var v = global.AlmFeaturesState.verify;
        if (!v || v.passed || !v.error) return;
        var files = [
          { name: APP + '-verify.R', string: panel.querySelector('[aria-label="R script"]').textContent },
          { name: 'status.json', string: JSON.stringify({ app: APP, passed: false, n: 0, nPassed: 0,
            error: v.error, revision: v.revision, stale: global.AlmFeatures.revision(APP) !== v.revision }, null, 2) },
          { name: 'README.txt', string: 'NOT VERIFIED. Required packages are unavailable in browser R. No R comparisons, sessionInfo or R graphics were produced. Run the supplied script in desktop R with robumeta, clubSandwich and jsonlite installed.\n' }
        ];
        var manifest = await Promise.all(files.map(async function (f) {
          var bytes = new TextEncoder().encode(f.string);
          var hash = await crypto.subtle.digest('SHA-256', bytes);
          return { name: f.name, bytes: bytes.length, sha256: Array.from(new Uint8Array(hash), function (b) { return b.toString(16).padStart(2, '0'); }).join('') };
        }));
        var receipt = await global.AlmTruthCertExport.buildReceipt({ studies: [], method: 'Unavailable browser R check',
          label: APP, results: { app: APP, passed: false, n: 0, nPassed: 0, error: v.error, files: manifest } });
        files.push({ name: 'truthcert.json', string: global.AlmTruthCertExport.sidecarJSON(receipt) });
        var url = URL.createObjectURL(new Blob([global.AlmZip.zip(files)], { type: 'application/zip' }));
        var a = document.createElement('a'); a.href = url; a.download = APP + '-unverified.zip'; a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
      return hooks;
    } });
    global.AlmFeatures.registerModule('entry', { label: 'Data entry', render: function (panel, ctx) {
      var note = document.createElement('p');
      note.textContent = 'Paste study, cluster, yi and SE (or an estimate with confidence limits), plus predictor columns named as above or x1, x2, …. Confirm unknown column mappings. Cluster identifiers are required. SE is squared to supply the app’s sampling variance. Variance-only tables can be entered directly in Studies.';
      panel.appendChild(note);
      return global.AlmEntryUI.mount(panel, { schema: entry.schema, extras: entry.extras, apply: function (records) {
        var prior = global.AlmFeaturesState.entryLog;
        global.AlmFeaturesState.entryLog = [];
        try {
          var response = apply(records), added = global.AlmFeaturesState.entryLog;
          // Shared entry UI stores its conversion log after apply resolves.
          setTimeout(function () { global.AlmFeaturesState.entryLog = global.AlmFeaturesState.entryLog.concat(added); }, 0);
          return response;
        } catch (e) { global.AlmFeaturesState.entryLog = prior; throw e; }
      } });
    } });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
