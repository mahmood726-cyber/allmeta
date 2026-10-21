/* App 14: additive shared features. Statistics are read from the app's own observation
 * hook, never reimplemented. The existing validator remains the sole R oracle, including
 * its declared conditional PM tolerance. R plot objects: yi, vi, yr, grp, fit, ctl.
 * Keep the mount outside MAIN: the validator audits MAIN's original template verbatim.
 */
(function (global) {
  'use strict';
  var APP = 'cumulative-subgroup';
  function el(id) { return document.getElementById(id); }
  function axis(edge) { return document.querySelector('#alm-axis-mount input[data-edge="' + edge + '"]'); }
  function run() { el('f-data').dispatchEvent(new Event('input', { bubbles: true })); }
  function observed() {
    var a;
    global.alm.urlState.withoutWrites(function () { a = global.__almCumSubValidationRun(); });
    return a;
  }
  function apply(records) {
    if (!Array.isArray(records) || !records.length) throw new Error('No study rows supplied');
    // Validate the entire batch before touching the app; do not let its permissive parser
    // silently discard bad rows or partially parse a year.
    var rows = records.map(function (r) {
      if (!r || typeof r.study !== 'string' || !r.study.trim() ||
          !Number.isFinite(r.yi) || !Number.isFinite(r.sei) || r.sei <= 0) {
        throw new Error('Each study needs a label, a finite estimate and a positive SE');
      }
      var year = r.year == null || r.year === '' ? null : Number(r.year);
      if (year !== null && (!Number.isSafeInteger(year) || year < 1000)) {
        throw new Error('Year must be an integer with at least four digits or empty');
      }
      if (r.subgroup != null && typeof r.subgroup !== 'string') throw new Error('Subgroup must be text');
      return { label: r.study, est: r.yi, se: r.sei, year: year, group: r.subgroup || null };
    });
    var previous = el('f-data').value;
    try {
      global.__almLoad(rows); // the app's CSV bridge quotes labels/groups and runs render()
      var parsed = observed().parsed;
      if (parsed.warnings.length || parsed.studies.length !== rows.length || rows.some(function (row, i) {
        var study = parsed.studies[i];
        return ['label', 'est', 'se', 'year', 'group'].some(function (key) { return study[key] !== row[key]; });
      })) throw new Error('The app could not preserve every study in the import round trip; check labels, years and subgroups');
      run(); // notify input fingerprints and autosave listeners only after validation
    } catch (err) {
      el('f-data').value = previous;
      run();
      throw err;
    }
    return { ok: true, n: rows.length };
  }
  function mountEntry(panel, block) {
    var ui = global.AlmEntryUI.mount(panel, block), root = ui.element, doc = root.ownerDocument;
    var paste = root.querySelector('textarea');
    var heading = doc.createElement('h3'), log = doc.createElement('ul');
    heading.textContent = 'Conversion log'; heading.id = paste.id + '-conversion-log';
    log.setAttribute('aria-labelledby', heading.id);
    root.appendChild(heading); root.appendChild(log);
    function line(text, className) {
      var item = doc.createElement('li'); item.textContent = text;
      if (className) item.className = className;
      log.appendChild(item);
    }
    function flag(f) {
      line((f.blocking ? 'Block: ' : 'Warning: ') + f.text, f.blocking ? 'alm-entry-block' : 'alm-entry-warning');
    }
    function refreshLog() {
      log.replaceChildren();
      var output = ui.getResult();
      (output.provenance || []).forEach(function (row) {
        row.conversions.forEach(function (c) { line(row.label + ': ' + c.formula + '; ' + c.citation + '; result ' + c.output); });
        row.flags.forEach(flag);
      });
      // The confirmation UI extracts supported source candidates only. A rejected table
      // still deserves the same parser/converter diagnostics as the table workflow.
      // This preview never supplies rows to apply() or bypasses source confirmation.
      if (output.extraction && !output.extraction.candidates.length) {
        var core = global.AlmEntry, table = core.parseTable(paste.value);
        if (table.header && table.rows.length) {
          var detection = core.detect(table, block.schema);
          table.header.forEach(function (name, i) {
            if (block.extras.indexOf(name) < 0) return;
            detection.mapping[i] = name;
            detection.questions = detection.questions.filter(function (q) { return q.id !== 'column:' + i; });
          });
          var converted = core.convert(table, detection, block.schema, { decimal: output.extraction.decimal });
          line('Table conversion preview only. Add supported source results and confirm each study before applying.');
          converted.steps.forEach(function (s) { line(s.text); });
          converted.flags.forEach(flag);
        }
      }
      if (!log.children.length) line('Add a source result to review its conversions and checks.');
    }
    // Bubble after the shared handlers, so the log reflects extraction and row edits.
    ['click', 'input', 'change'].forEach(function (type) { root.addEventListener(type, refreshLog); });
    refreshLog();
    return {
      element: root,
      parse: function () { ui.parse(); refreshLog(); },
      getResult: function () { return ui.getResult(); },
      destroy: function () {
        ['click', 'input', 'change'].forEach(function (type) { root.removeEventListener(type, refreshLog); });
        ui.destroy();
      }
    };
  }
  function results() {
    if (!global._almLastCumSub || !global._almLastCumSub()) return null;
    var a = observed();
    if (!a.summary) return null;
    var sub = a.summary.view === 'subgroup';
    var p = sub ? a.sub.overall : a.cum.series[a.cum.series.length - 1];
    var r = { view: a.summary.view, k: p.k, mu: p.mu, lo: p.lo, hi: p.hi,
      tau2: p.tau2, piLo: p.piLo, piHi: p.piHi,
      byYear: a.parsed.studies.every(function (s) { return s.year !== null; }),
      verified: !!(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP)),
      groupKeys: [] };
    if (r.verified) {
      var checks = global.AlmFeaturesState.verify.rows;
      r.verifyPage = checks.filter(function (row) {
        return /^display\./.test(row.key) || row.key === 'export.fields' || row.key === 'series_rows';
      }).length;
      r.verifyStats = checks.length - r.verifyPage;
    }
    if (sub) {
      r.groups = a.sub.groups.length; r.Qbw = a.sub.Q_bw; r.dfbw = a.sub.df_bw;
      r.pQ = a.sub.pQ; r.i2bw = a.sub.I2_bw;
      a.sub.groups.forEach(function (g, i) {
        var key = 'group' + i;
        r.groupKeys.push(key); r[key + 'Index'] = i + 1;
        ['k', 'mu', 'lo', 'hi', 'tau2', 'piLo', 'piHi'].forEach(function (q) { r[key + q] = g[q]; });
      });
    }
    var pt = global.__almTextPerturb;
    if (pt && typeof r[pt.key] === 'number' && Number.isFinite(pt.delta)) r[pt.key] += pt.delta;
    return r;
  }
  function dom() {
    var out = {}, cards = {};
    document.querySelectorAll('#stats-wrap .stat').forEach(function (n) {
      cards[n.querySelector('.k').textContent] = n.querySelector('.v').textContent;
    });
    function add(key, text, digits, kind) { out[key] = { text: text, fmt: { kind: kind || 'num', digits: digits } }; }
    function interval(text, keys) {
      var values = (text || '').match(/-?\d+\.\d+/g) || [];
      keys.forEach(function (key, i) { if (values[i] !== undefined) add(key, values[i], 3); });
    }
    add('k', cards.k, 0, 'int');
    interval(cards['Final pooled'] || cards['Overall pooled'], ['mu', 'lo', 'hi']);
    if (cards['Final τ²'] !== undefined) add('tau2', cards['Final τ²'], 4);
    if (cards.Groups !== undefined) {
      add('groups', cards.Groups, 0, 'int');
      interval(cards['95% prediction interval'], ['piLo', 'piHi']);
      add('i2bw', cards['I² diff'], 1, 'pct');
      Object.keys(cards).forEach(function (label) {
        var match = /^Q_bw \(df=(\d+)\)$/.exec(label);
        if (!match) return;
        add('dfbw', match[1], 0, 'int');
        var q = cards[label].split(', p='); add('Qbw', q[0], 2);
        if (q[1] !== '--') add('pQ', q[1], 3);
      });
      var rows = Array.from(document.querySelectorAll('#svg-host svg text')).filter(function (n) {
        return /^-?\d+\.\d+ \[/.test(n.textContent);
      });
      rows.slice(0, -1).forEach(function (n, i) { interval(n.textContent, ['group' + i + 'mu', 'group' + i + 'lo', 'group' + i + 'hi']); });
    }
    return out;
  }
  var templates = {
    plain: function (T, r) {
      return ['This analysis combined ', T.int('k'), ' studies. The pooled effect on the supplied analysis scale was ',
        T.num('mu', 3), ' (', T.rule('ciLevel'), ' confidence interval ', T.ci('lo', 'hi', 3), '). ',
        global.AlmText.cochrane.ciIncludesNull(r.lo, r.hi, T.R.none)
          ? ['There is ', global.AlmText.cochrane.differencePhrase(r.lo, r.hi, T.R.none), '; this is not evidence of no effect. ']
          : 'The confidence interval does not include zero on this scale. ',
        T.when(global.AlmText.cochrane.imprecise(r.lo, r.hi, T.R.none),
          'The estimate is imprecise: the confidence interval includes no effect and effects in either direction. '),
        'The prediction interval for a similar new study was ', T.ci('piLo', 'piHi', 3),
        '. This summary does not establish causation or clinical importance.'];
    },
    methods: function (T, r) {
      return ['Estimates were pooled on the supplied scale with inverse-variance random-effects weights. ',
        'Paule–Mandel estimated the between-study variance (τ²; ', T.cite('pauleMandel'), '). ',
        'Within-study variances were squared standard errors. No transformation, back-transformation or continuity correction was applied by the app. ',
        'The pooled ', T.rule('ciLevel'), ' confidence interval used a normal Wald approximation without Hartung–Knapp adjustment. ',
        'Prediction intervals used the pooled estimate ± t × √(τ² + SE²), with t degrees of freedom equal to the number of studies minus one, ',
        'computed whenever at least two studies were pooled (', T.cite('handbookPI'), '). ',
        r.view === 'cumulative'
          ? ['Each cumulative prefix was refitted, ', r.byYear ? 'ordered by ascending year with ties retaining input order. ' : 'retaining input order because at least one year was missing. ']
          : ['Subgroups with more than one study had a separately estimated τ²; missing group labels were retained as an ungrouped category. ',
             'The overall estimate pooled all studies separately. ', T.when(r.dfbw > T.R.none, [
             'Between-subgroup Q used inverse squared subgroup pooled standard errors as weights, ',
             'centred on the weighted mean of subgroup estimates. Its p-value used a chi-squared distribution with the number of groups minus one degrees of freedom. ',
             'I² of subgroup differences was the nonnegative percentage (Q − df)/Q; it is not overall study-level I². '])],
        'No pooled-effect p-value or overall study-level I² is reported by this app. ',
        T.entry(), T.when(T.entry(), ' '), T.software(), T.when(r.verified && T.hasCtx('verify.n'), function () {
          return [' Results were independently verified in R (', T.ctx('verify.pkg'), ' ', T.ctx('verify.pkgVersion'),
            '; webR ', T.ctx('verify.webr'), '): ', T.int('verifyStats'), ' statistical quantities matched R; ',
            T.int('verifyPage'), ' page self-checks passed.'];
        })];
    },
    results: function (T, r) {
      return ['The ', r.view === 'cumulative' ? 'final cumulative' : 'overall', ' pooled effect across ', T.int('k'),
        ' studies was ', T.num('mu', 3), ' (', T.rule('ciLevel'), ' CI ', T.ci('lo', 'hi', 3),
        '); τ² = ', T.num('tau2', 4), '. The ', T.rule('ciLevel'), ' prediction interval was ', T.ci('piLo', 'piHi', 3), '. ',
        T.when(r.view === 'subgroup', function () {
          return [T.plural('groups', 'There was ', 'There were '), T.int('groups'), T.plural('groups', ' subgroup. ', ' subgroups. '),
            r.dfbw > T.R.none ? ['Between-subgroup Q = ', T.num('Qbw', 2),
              ' (df = ', T.int('dfbw'), ')', T.has('pQ') ? ['; ', T.p('pQ')] : '; p was unavailable',
              '; I² of differences = ', T.pct('i2bw', 1), '. ']
              : 'No between-subgroup comparison is possible with only one subgroup. ',
            'Subgroups are listed in the plot’s order. ',
            r.groupKeys.map(function (key) {
              return ['Subgroup ', T.int(key + 'Index'), ': ', T.int(key + 'k'), T.plural(key + 'k', ' study; pooled effect ', ' studies; pooled effect '),
                T.num(key + 'mu', 3), ' (CI ', T.ci(key + 'lo', key + 'hi', 3), '); ',
                T.plural(key + 'k', 'τ² is not estimable', ['τ² = ', T.num(key + 'tau2', 4)]),
                T.when(T.has(key + 'piLo'), function () { return ['; prediction interval ', T.ci(key + 'piLo', key + 'piHi', 3)]; }), '. '];
            })];
        })];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: heterogeneity estimates are imprecise.'),
        T.when(r.k < T.R.funnelK, 'Tests for small-study effects would be underpowered; none were performed.'),
        T.when(r.groupKeys.some(function (key) { return r[key + 'k'] < T.R.fewK; }),
          'At least one subgroup has few studies: heterogeneity estimates are imprecise.'),
        T.when(r.view === 'subgroup' && r.dfbw > T.R.none, 'Subgroup comparisons are observational and do not establish effect modification.')];
    }
  };
  function shareGet() {
    return { data: el('f-data').value, view: el('f-view').value, title: el('f-title').value,
      axis: ['min', 'max'].map(function (edge) { return axis(edge).value; }) };
  }
  function shareSet(s) {
    if (!s || typeof s.data !== 'string' || s.data.length > 200000 ||
        typeof s.title !== 'string' || s.title.length > 200000 || ['cumulative', 'subgroup'].indexOf(s.view) < 0 ||
        !Array.isArray(s.axis) || s.axis.length !== 2 || s.axis.some(function (v) {
          return typeof v !== 'string' || (v !== '' && (!v.trim() || !Number.isFinite(Number(v))));
        })) throw new Error('Invalid data, view, title or axis limits');
    // All validation precedes mutation. Even invalid min/max combinations are valid app
    // states: restore them so the app can display its existing axis-refusal message.
    el('f-data').value = s.data; el('f-view').value = s.view; el('f-title').value = s.title;
    ['min', 'max'].forEach(function (edge, i) { axis(edge).value = s.axis[i]; });
    ['min', 'max'].forEach(function (edge) { axis(edge).dispatchEvent(new Event('change', { bubbles: true })); });
    run();
  }
  function forestCode(s) {
    if (s.view === 'cumulative') return "ord <- if(all(is.finite(yr))) order(yr,seq_along(yi)) else seq_along(yi)\n" +
      "f_plot <- fit(yi[ord],vi[ord])\nc_plot <- metafor::cumul(f_plot)\nmetafor::forest(c_plot, xlab='Pooled effect on supplied scale')";
    return "g_plot <- ifelse(is.na(grp)|grp=='','(ungrouped)',grp)\n" +
      'names_plot <- c(' + s.groups.map(function (g) { return JSON.stringify(g); }).join(',') + ')\n' +
      "fits_plot <- lapply(names_plot,function(g) {ix <- which(g_plot==g);fit(yi[ix],vi[ix])})\n" +
      "mu_plot <- vapply(fits_plot,function(f) as.numeric(coef(f)),0.0)\n" +
      "lo_plot <- vapply(fits_plot,function(f) f[['ci.lb']],0.0); hi_plot <- vapply(fits_plot,function(f) f[['ci.ub']],0.0)\n" +
      "metafor::forest(mu_plot,ci.lb=lo_plot,ci.ub=hi_plot,slab=names_plot,xlab='Subgroup pooled effect')";
  }
  var spec = { paper: 14, title: 'Cumulative and subgroup meta-analysis',
    entry: { schema: 'generic', extras: ['subgroup', 'year'],
      usedAs: 'estimate and SE on the supplied analysis scale (pooled as given by the app)', apply: apply },
    text: { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates },
    verify: { adapter: function () { return global.AlmLiveAdapters && global.AlmLiveAdapters[APP] || global.AlmValidate.adapters[APP]; },
      inputs: '#f-data, #f-view, #f-title, #alm-axis-mount input',
      rObjects: 'yi, vi, yr, grp; fit() and ctl() from the existing live adapter',
      plots: [{ id: 'forest', title: 'Forest plot', r: forestCode, width_in: 8, height_in: 6,
        app: function () { return document.querySelector('#svg-host svg'); } }] },
    share: { get: shareGet, set: shareSet }
  };
  global.AlmCumSubFeatures = spec;
  if (global.AlmFeatures) {
    // These shared UI libraries expose mount(), but do not register host modules themselves.
    if (global.AlmFeatures.registerModule) {
      global.AlmFeatures.registerModule('entry', { render: function (panel, ctx) { return mountEntry(panel, ctx.block); } });
      global.AlmFeatures.registerModule('text', { render: function (panel, ctx) {
        var ui = global.AlmTextUI.mount(panel, { app: APP, text: ctx.block });
        return { onShow: function () { ui.regenerate(); } };
      } });
    }
    global.AlmFeatures.register(APP, spec);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
