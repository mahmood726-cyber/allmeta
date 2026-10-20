/* App 15: additive wiring only. Statistics and the desktop R recipe remain in
 * shared/rve.js and rve-meta/alm-live.js. No result is fitted in this adapter.
 * Generic entry uses SE (squared once for the native variance input); explicit
 * vi records are also accepted. Cluster IDs must be supplied, never inferred.
 */
(function (global) {
  'use strict';
  var APP = 'rve-meta';
  function byId(id) { return document.getElementById(id); }
  function live() { return global.AlmLiveAdapters && global.AlmLiveAdapters[APP]; }
  function names() { return byId('f-names').value.split(/\s*,\s*/).filter(Boolean); }
  function number(v, label) {
    if (v === null || v === undefined || String(v).trim() === '' || !Number.isFinite(Number(v))) {
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
    return { src: byId('src').value, rho: byId('f-rho').value, names: byId('f-names').value };
  }
  function validateState(s) {
    if (!s || typeof s.src !== 'string' || !s.src.trim() || s.src.length > 200000) throw new Error('Data text missing or too long.');
    if (typeof s.names !== 'string' || s.names.length > 10000 || /[<>\r\n]/.test(s.names)) throw new Error('Invalid predictor names.');
    var rho = number(s.rho, 'Working correlation');
    if (rho < 0 || rho > 0.99) throw new Error('Working correlation must be between zero and 0.99.');
    var width, count = 0;
    s.src.split(/\r?\n/).forEach(function (line) {
      if (!line.trim() || line.trim().charAt(0) === '#') return;
      var cells = line.split(/\s*,\s*/);
      if (cells.length < 3) throw new Error('Each row needs cluster, yi and vi.');
      safeLabel(cells[0], 'Cluster');
      cells.slice(1).forEach(function (v) { number(v, 'Data value'); });
      if (Number(cells[2]) <= 0) throw new Error('Sampling variance must be positive.');
      if (width !== undefined && width !== cells.length) throw new Error('Every row needs the same predictor columns.');
      width = cells.length; count++;
    });
    if (!count) throw new Error('No data rows.');
  }
  // Validate first; roll back if the original app refuses the fit (e.g. singular design).
  function set(s) {
    validateState(s);
    var before = get();
    function write(v) {
      byId('src').value = v.src; byId('f-rho').value = String(v.rho); byId('f-names').value = v.names;
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
    var aliases = Object.keys(records[0]).filter(function (k) { return /^x[1-9]\d*$/.test(k); })
      .sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); });
    var mods = requested.filter(function (k) { return records.some(function (r) { return r[k] !== undefined; }); });
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
      return [cluster, yi, vi].concat(mods.map(function (k) { return number(r[k], 'Moderator ' + k); })).join(', ');
    });
    set({ src: lines.join('\n'), rho: byId('f-rho').value, names: mods.join(', ') });
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
      ciLevel: 95, nullValue: 0, coefficientKeys: [] };
    o.summary.forEach(function (s, i) {
      var prefix = 'coef_' + i + '_';
      r.coefficientKeys.push({ prefix: prefix, indexKey: prefix + 'index' });
      r[prefix + 'index'] = s.coef_index;
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
        'The intercept describes the estimated effect when every predictor is zero; it is not an overall pooled effect. ',
        'The estimates describe associations and do not establish causation or clinical importance.'];
    },
    methods: function (T, r) {
      return ['Effects and sampling variances on the supplied analysis scale were analysed using the Hedges–Tipton–Johnson correlated-effects (CORR) working model, with correlation ρ = ',
        T.num('rho', 2), '. An intercept was added automatically. The between-cluster variance used the CORR moment estimator truncated at zero. ',
        'Each effect was weighted by the reciprocal of the product of its cluster size and the sum of that cluster’s mean sampling variance and τ². ',
        'Inference used the CR', T.int('correction'), ' bias-reduced sandwich correction and coefficient-specific Satterthwaite degrees of freedom. ',
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
      if (r.coefficientKeys.some(function (c) { return r[c.prefix + 'df'] < T.R.fewK; })) {
        flags.push('Low Satterthwaite degrees of freedom limit the precision of inference.');
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
    verify: { adapter: live, inputs: '#src, #f-rho, #f-names', rObjects: 'd, f (robu fit), tab, cr2',
      plots: [{ id: 'forest', title: 'Forest plot', r: 'robumeta::forest.robu(f)', width_in: 8, height_in: 6,
        app: function () { return null; } }] },
    share: { get: get, set: set }
  };
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
      note.textContent = 'The desktop script includes a robumeta forest plot. This page has a coefficient table and no app SVG to compare.';
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
