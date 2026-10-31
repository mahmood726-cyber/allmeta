/* App 7: additive entry, report, R verification and share adapter.
 * The shared entry core has no multilevel converter: convertTable composes its
 * generic converter with explicit ID passthrough and vi <-> SE conversion.
 * R objects supplied by the EXISTING validation adapter: yi, vi, cluster, id,
 * f (metafor rma.mv REML fit), x (seven comparison quantities).
 * The page forest is MoM; the R forest is REML. They are labelled accordingly.
 */
(function (global) {
  'use strict';
  // Number settings go into type=number inputs. A value must be a complete decimal number: Number() also reads
  // 0x10 / 0b1 / ' ', and the input then silently clears such text to '' (automatic or zero). Valid forms the input
  // itself cannot hold ('+1', ' 0.5', '5.') are written as the same number.
  var DECIMAL_SETTING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function decimalSetting(v) { return typeof v === 'string' && DECIMAL_SETTING.test(v.trim()) && Number.isFinite(Number(v)); }
  function axisBoundOk(v) { return v === '' || decimalSetting(v); }
  function writeNumberSetting(el, v) {
    var t = String(v).trim();
    el.value = t;
    if (el.value === '' && t !== '') el.value = String(Number(t));
  }
  var APP = 'multilevel-ma';
  var VARIANCE_RULE = 'multilevel-variance.1';
  function byId(id) { return document.getElementById(id); }
  function clearProvenance() {
    if (!global.AlmFeaturesState) return;
    global.AlmFeaturesState.entryLog = [];
    global.AlmFeaturesState.provenance = [];
    delete global.AlmFeaturesState.entryInput;
  }
  function validateSource(source) {
    // The shared replay registry has no variance-to-SE operation. Replay that
    // app-local operation here; all other conversions go through shared replay.
    try {
      var conversions = source.conversions || [], local = conversions.filter(function (c) { return c.fn === 'multilevel.seFromVariance'; });
      var missing = global.AlmEntry.provenance.validate(Object.assign({}, source, {
        conversions: conversions.filter(function (c) { return c.fn !== 'multilevel.seFromVariance'; })
      }));
      if (local.some(function (c) {
        var vi = c.args && c.args.vi, value = Math.sqrt(vi);
        return c.rulesVersion !== VARIANCE_RULE || !Number.isFinite(vi) || vi <= 0 ||
          !c.inputs || c.inputs.vi !== vi || c.field !== 'sei' || c.result !== value || c.output !== value ||
          !source.values.some(function (v) { return v.field === 'vi' && v.value === vi; });
      })) missing.push('conversion replay');
      if (!source.choice || !String(source.choice.timepoint || '').trim()) missing.push('timepoint');
      return missing;
    } catch (e) { return ['invalid source record']; }
  }
  function currentProvenance() {
    var state = global.AlmFeaturesState || {}, sources = state.provenance || [];
    var input = byId('src').value;
    if (!Array.isArray(sources) || sources.some(function (s) {
      return !s || s.appliedInput !== input || validateSource(s).length;
    }) || (state.entryInput !== undefined && state.entryInput !== input)) {
      clearProvenance();
      return [];
    }
    return sources;
  }
  function identifier(s) {
    return typeof s === 'string' && s.trim() && !/[,\r\n]/.test(s) &&
      !Object.prototype.hasOwnProperty.call(Object.prototype, s.trim()) && s.trim() !== '__proto__';
  }
  function validateRecords(records) {
    if (!Array.isArray(records) || records.length < 3) throw new Error('At least three effect rows are required.');
    var seen = new Set();
    records.forEach(function (r) {
      if (!identifier(r.study) || !identifier(r.es_id)) throw new Error('Study and effect IDs are required and cannot contain commas or line breaks, or reserved object names.');
      if (!Number.isFinite(r.yi) || !Number.isFinite(r.vi) || r.vi <= 0) throw new Error('Effects must be finite and sampling variances must be positive.');
      var key = JSON.stringify([r.study.trim(), r.es_id.trim()]);
      if (seen.has(key)) throw new Error('Effect IDs must be unique within each study.');
      seen.add(key);
    });
  }
  function apply(records) {
    validateRecords(records);
    byId('src').value = records.map(function (r) {
      return [r.study.trim(), r.yi, Math.sqrt(r.vi), r.es_id.trim()].join(', ');
    }).join('\n');
    clearProvenance();
    byId('btn-run').click();
    return { ok: true, n: records.length };
  }
  function convertTable(table, detection, answers) {
    var core = global.AlmEntry, map = Object.assign({}, detection.mapping), questions = detection.questions.slice();
    var work = Object.assign({}, table, { rows: table.rows.map(function (r) { return r.slice(); }) });
    var extraSteps = [], extraFlags = [];
    (table.header || []).forEach(function (header, col) {
      var h = header.toLowerCase().trim().replace(/[_-]/g, ' ');
      var field = /^(es id|effect id|label|outcome)$/.test(h) ? 'es_id' :
        /^(vi|variance|sampling variance)$/.test(h) ? 'sei' : null;
      if (!field) return;
      if (Object.keys(map).some(function (k) { return +k !== col && map[k] === field; })) {
        extraFlags.push({ blocking: true, text: field === 'es_id' ?
          'Supply only one effect ID column (es_id, effect id, label or outcome).' :
          'Supply only one uncertainty column (variance or SE).' });
      }
      map[col] = field;
      questions = questions.filter(function (q) { return q.id !== 'column:' + col; });
      if (field === 'sei') table.rows.forEach(function (row, i) {
        var token = core.parseCell(row[col], { decimal: answers && answers.decimal });
        if (token.kind !== 'number' || !(token.value > 0)) {
          extraFlags.push({ blocking: true, row: i, text: 'Sampling variance must be a positive number with an unambiguous decimal mark.' });
        } else {
          work.rows[i][col] = String(Math.sqrt(token.value));
          extraSteps.push({ row: i, method: 'SE from variance', citation: 'Definition of sampling variance',
            inputs: { vi: token.value }, fn: 'multilevel.seFromVariance', args: { vi: token.value },
            result: Math.sqrt(token.value), rulesVersion: VARIANCE_RULE,
            text: 'Row ' + (i + 1) + ': SE = sqrt(vi); the page accepts SE, not variance.' });
        }
      });
    });
    if (!Object.keys(map).some(function (k) { return map[k] === 'study'; })) {
      extraFlags.push({ blocking: true, text: 'An explicit study column is required to preserve cluster membership.' });
    }
    // The page consumes effects and uncertainty already on the analysis scale.
    // Declare that contract through the core schema: do not infer a ratio from
    // positive values, ask an unrendered scale question, or log-transform input.
    var out = core.convert(work, { mapping: map, questions: questions }, { name: 'generic', ratio: false }, answers || {});
    out.flags = out.flags.concat(extraFlags);
    out.records = out.records.map(function (r, i) {
      if (!(r.sei > 0) || !Number.isFinite(r.sei)) out.flags.push({ blocking: true, row: i, text: 'SE must be finite and positive.' });
      return { study: r.study, es_id: r.es_id, yi: r.yi, vi: r.sei * r.sei };
    });
    try { validateRecords(out.records); } catch (e) { out.flags.push({ blocking: true, text: e.message }); }
    out.steps = extraSteps.concat(out.steps);
    out.steps.push({ method: 'page input', citation: 'App input convention', inputs: {},
      text: 'Study and effect IDs are preserved; the page uses the supplied analysis scale without back-transformation. Repeated study IDs define clusters.' });
    out.decimal = (answers && answers.decimal) || 'point';
    out.sourceMapping = Object.assign({}, map);
    (table.header || []).forEach(function (h, col) {
      if (/^(vi|variance|sampling variance)$/i.test(h.trim().replace(/[_-]/g, ' '))) out.sourceMapping[col] = 'vi';
    });
    return out;
  }
  // Anchor printed numeric tokens in the verbatim source, never in a normalised
  // copy. Unsupported quoting/normalisation is refused rather than guessed.
  function sourceRecords(text, output) {
    var core = global.AlmEntry, table = core.parseTable(text), cursor = 0;
    if (table.header) cursor = text.indexOf('\n') + 1;
    return table.rows.map(function (cells, row) {
      var record = output.records[row], source = core.provenance.create({ pastedText: text, decimal: output.decimal || 'point' });
      var steps = output.steps.filter(function (s) { return s.row === row; });
      source.choice = { study: record.study, outcome: record.es_id, timepoint: '' };
      var uncertainty = steps.some(function (s) { return s.method === 'SE from variance'; }) ? 'SE = sqrt(vi) from supplied sampling variance' :
        steps.some(function (s) { return s.method === 'SE from CI'; }) ? 'SE derived from the confidence interval' :
        steps.some(function (s) { return s.method === 'SE from p'; }) ? 'SE derived from the exact p-value' : 'supplied SE';
      source.usedAs = 'Effect on the supplied analysis scale; ' + uncertainty + '; study cluster ' + record.study;
      source.flags = output.flags.filter(function (f) { return f.row === row; });
      cells.forEach(function (cell, col) {
        var at = text.indexOf(cell, cursor);
        if (at < 0) { source.flags.push({ blocking: true, text: 'Cannot anchor this cell in the verbatim paste. Use a plain TSV table.' }); return; }
        cursor = at + cell.length;
        var h = (table.header || [])[col] || '';
        if (/^(study|study id|study name|es[_ -]id|effect id|label|outcome)$/i.test(h)) return;
        var token = core.parseCell(cell, { header: h, decimal: source.decimal });
        Object.keys(token.spans || {}).forEach(function (key) {
          var span = token.spans[key].map(function (n) { return at + n; });
          var field = key === 'value' ? output.sourceMapping[col] : key === 'est' ? 'yi' : key;
          source.values.push({ field: field, value: token[key],
            span: span, text: text.slice(span[0], span[1]), selector: core.selectors(text, span) });
        });
      });
      source.conversions = steps.filter(function (s) { return !!s.fn; }).map(function (s) {
        return { field: s.fn === 'estFromCI' ? 'yi' : 'sei', formula: s.method, method: s.method,
          citation: s.citation, inputs: s.inputs, output: s.result,
          fn: s.fn, args: s.args, result: s.result, rulesVersion: s.rulesVersion };
      });
      return source;
    });
  }
  function convert(text, answers) {
    var table = global.AlmEntry.parseTable(text);
    return convertTable(table, global.AlmEntry.detect(table, 'generic'), Object.assign({ decimal: 'point' }, answers));
  }
  function mountEntry(panel) {
    function node(tag, text, parent) {
      var el = document.createElement(tag); if (text) el.textContent = text; (parent || panel).appendChild(el); return el;
    }
    node('p', 'Paste a table with study, es_id, yi and vi, or replace vi with SE or supply an estimate and confidence interval. Use effects already on the intended analysis scale. Each effect must have an ID. Confirm each row and its source before applying it.');
    var label = node('label', 'Multilevel data table'), paste = node('textarea');
    paste.id = 'ml-entry-paste'; label.htmlFor = paste.id; paste.rows = 7;
    var decimalLabel = node('label', 'Decimal mark for this paste'), decimal = node('select');
    decimal.id = 'ml-entry-decimal'; decimalLabel.htmlFor = decimal.id;
    [['point', 'Decimal point (0.35)'], ['comma', 'Decimal comma (0,35)']].forEach(function (choice) {
      var option = node('option', choice[1], decimal); option.value = choice[0];
    });
    decimal.value = 'point';
    var preview = node('button', 'Preview and convert'); preview.type = 'button';
    var status = node('p'); status.id = 'ml-entry-status'; status.setAttribute('role', 'status');
    var rows = node('div'), heading = node('h3', 'Conversion log'), log = node('ul');
    heading.id = 'ml-entry-log'; log.setAttribute('aria-labelledby', heading.id);
    var use = node('button', 'Use these rows'); use.type = 'button'; use.disabled = true;
    use.setAttribute('aria-describedby', status.id);
    function download(name, bytes, type) {
      var url = URL.createObjectURL(new Blob([bytes], { type: type })), a = node('a');
      a.href = url; a.download = name; a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    var csv = node('button', 'Export source records CSV'), docx = node('button', 'Export source records DOCX');
    csv.type = docx.type = 'button'; csv.disabled = docx.disabled = true;
    var output = null, sources = [];
    function gate() {
      var missing = sources.map(validateSource), blocking = output ? output.flags.filter(function (f) { return f.blocking; }).length : 0;
      use.disabled = !output || !sources.length || blocking > 0 || missing.some(function (m) { return m.length; });
      csv.disabled = docx.disabled = use.disabled;
      if (output) {
        var requirements = Array.from(new Set([].concat.apply([], missing)));
        status.textContent = sources.filter(function (s) { return s.confirmed; }).length + ' of ' + sources.length +
          ' rows confirmed; ' + blocking + ' blocking issues.' +
          (requirements.length ? ' Required: ' + requirements.join(', ') + '.' : ' All source requirements complete.');
      }
      return !use.disabled;
    }
    function invalidate() {
      output = null; sources = []; use.disabled = csv.disabled = docx.disabled = true;
      rows.replaceChildren(); log.replaceChildren(); status.textContent = 'Preview and confirm this paste before using the rows.';
    }
    paste.addEventListener('input', invalidate); decimal.addEventListener('change', invalidate);
    preview.addEventListener('click', function () {
      output = convert(paste.value, { decimal: decimal.value }); sources = sourceRecords(paste.value, output); rows.replaceChildren(); log.replaceChildren();
      output.steps.concat(output.flags).forEach(function (s) { node('li', (s.blocking ? 'Block: ' : '') + s.text, log); });
      output.records.forEach(function (r, i) {
        var source = sources[i];
        var card = node('fieldset', null, rows); node('legend', String(r.study) + ' / ' + String(r.es_id), card);
        function fmt(n, digits) { return Number.isFinite(n) ? n.toFixed(digits) : 'unavailable'; }
        node('p', 'Effect = ' + fmt(r.yi, 3) + '; variance = ' + fmt(r.vi, 4) + '; page SE = ' + fmt(Math.sqrt(r.vi), 3), card);
        var sentence = node('p', global.AlmEntry.provenance.sentence(source), card);
        var quoted = node('details', null, card); node('summary', 'Verbatim source and extracted values', quoted);
        var pre = node('pre', null, quoted), end = 0;
        source.values.slice().sort(function (a, b) { return a.span[0] - b.span[0]; }).forEach(function (v) {
          node('span', source.pastedText.slice(end, v.span[0]), pre);
          var mark = node('mark', v.text, pre); mark.title = v.field; mark.setAttribute('role', 'note');
          mark.setAttribute('tabindex', '0'); mark.setAttribute('aria-label', v.field + ': ' + v.text); end = v.span[1];
        });
        node('span', source.pastedText.slice(end), pre);
        source.flags.filter(function (f) { return f.blocking; }).forEach(function (f) { node('p', 'Block: ' + f.text, card); });
        var provenance = global.AlmEntry.provenance;
        function revise() {
          sentence.textContent = provenance.sentence(source);
          provenance.unconfirm(source); check.checked = false; gate();
        }
        function select(key, title, choices, parent) {
          var lab = node('label', title, parent || card), el = node('select', null, parent || card);
          // Keep option text outside the label so exact label lookup stays stable.
          el.id = 'ml-entry-' + key + '-' + i; lab.htmlFor = el.id;
          el.required = true;
          [['', 'Choose…']].concat(choices).forEach(function (choice) {
            var option = node('option', choice[1], el); option.value = choice[0];
          });
          return el;
        }
        ['label', 'reference', 'timepoint'].forEach(function (key) {
          var labels = { label: 'Source author and year (for example Smith 2020)', reference: 'Full reference', timepoint: 'Timepoint (or not stated)' };
          var lab = node('label', labels[key], card);
          var input = node('input', null, lab); input.type = 'text'; input.required = true;
          input.addEventListener('input', function () {
            if (key === 'timepoint') source.choice.timepoint = input.value; else source[key] = input.value;
            revise();
          });
        });
        var sourceType = select('source-type', 'Source type', global.AlmEntry.SOURCE_TYPES.map(function (type) { return [type, type]; }));
        var locationLabel = node('label', 'Source location (number or page, for example 2 or p. 5)', card);
        var location = node('input', null, locationLabel); location.type = 'text';
        function updateLocation() {
          source.source = { type: sourceType.value, detail: location.value.trim() };
          source.location = provenance.sourceLocation(source.source); revise();
        }
        sourceType.addEventListener('change', updateLocation); location.addEventListener('input', updateLocation);
        var randomisation = select('randomisation', 'What was randomised?', Object.entries(global.AlmEntry.RANDOMISATION_CHOICES));
        var cluster = node('div', null, card); cluster.hidden = true;
        node('p', 'Supply an effect and uncertainty from an analysis that already accounts for cluster randomisation. Study grouping in this app does not make that adjustment.', cluster);
        var clusterAnalysis = select('cluster-analysis', 'Cluster randomisation analysis', [['already', 'The reported analysis already accounts for clustering']], cluster);
        clusterAnalysis.required = false;
        randomisation.addEventListener('change', function () {
          source.choice.randomisation = randomisation.value;
          delete source.choice.cluster; clusterAnalysis.value = '';
          cluster.hidden = randomisation.value !== 'clusters'; clusterAnalysis.required = !cluster.hidden;
          revise();
        });
        clusterAnalysis.addEventListener('change', function () {
          source.choice.cluster = { action: clusterAnalysis.value }; revise();
        });
        var initialsLabel = node('label', 'Extractor initials', card);
        var initials = node('input', null, initialsLabel); initials.type = 'text'; initials.required = true;
        initials.addEventListener('input', function () { check.disabled = !initials.value.trim(); revise(); });
        var lab = node('label', 'I confirm this effect, uncertainty and study membership', card);
        var check = node('input', null, lab); check.type = 'checkbox'; check.disabled = true;
        check.addEventListener('change', function () {
          if (check.checked) provenance.confirm(source, { by: initials.value, via: 'row' });
          else provenance.unconfirm(source);
          gate();
        });
      });
      gate();
    });
    use.addEventListener('click', function () {
      if (!gate()) return;
      try {
        apply(output.records);
        global.AlmFeaturesState.entryLog = output.steps.slice();
        sources.forEach(function (s) { s.appliedInput = byId('src').value; });
        global.AlmFeaturesState.provenance = JSON.parse(JSON.stringify(sources));
        global.AlmFeaturesState.entryInput = byId('src').value;
        status.textContent = 'Applied ' + output.records.length + ' rows.';
      } catch (e) { status.textContent = e.message; use.disabled = true; }
    });
    csv.addEventListener('click', function () {
      if (!gate()) return;
      download(APP + '-sources.csv', global.AlmEntry.provenance.toCSV(sources), 'text/csv;charset=utf-8');
    });
    docx.addEventListener('click', function () {
      if (!gate()) return;
      download(APP + '-sources.docx', global.AlmZip.docx({ title: 'Multilevel source records',
        paragraphs: global.AlmEntry.provenance.toDocxParagraphs(sources).map(function (text) { return { text: text }; }) }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  }

  function results() {
    var sources = currentProvenance();
    var m = global._almLastMlma && global._almLastMlma(), reml = global.__almReml && global.__almReml();
    if (!m || !reml || (byId('analysis-stale') && !byId('analysis-stale').hidden)) return null;
    var r = Object.assign({}, m, {
      remlMu: reml.mu, remlSE: reml.se, remlLo: reml.ciLo, remlHi: reml.ciHi,
      remlBetween: reml.sigma2Between, remlWithin: reml.sigma2Within, logLik: reml.logLik,
      studyShare: m.I2_study * 100, withinShare: m.I2_within * 100, samplingShare: m.I2_sampling * 100,
      totalShare: (m.I2_study + m.I2_within + m.I2_sampling) * 100,
      df: Math.max(1, m.J - 1), verified: !!(global.AlmFeatures && global.AlmFeatures.verifiedCurrent(APP))
    });
    var state = global.AlmFeaturesState || {}, steps = state.entryLog || [];
    r.entryRows = sources.length;
    r.entrySources = new Set(sources.map(function (s) { return s.reference; })).size;
    r.entryCI = steps.filter(function (s) { return s.method === 'SE from CI' || /SE estimated from CI/.test(s.text || ''); }).length;
    r.entryVariance = steps.filter(function (s) { return s.method === 'SE from variance'; }).length;
    var perturb = global.__almTextPerturb;
    if (perturb && typeof r[perturb.key] === 'number') r[perturb.key] += perturb.delta;
    return r;
  }
  function dom() {
    var tables = document.querySelectorAll('#summary table'), out = {};
    function values(table, row, col) {
      var tr = table && table.rows[row], cell = tr && tr.cells[col];
      return cell ? cell.textContent.match(/[-+]?\d+(?:\.\d+)?%?/g) || [] : [];
    }
    function put(key, text, digits, kind) { out[key] = { text: text === undefined ? '' : text, fmt: { kind: kind || 'num', digits: digits } }; }
    put('mu', values(tables[0], 0, 1)[0], 3); put('seMu', values(tables[0], 0, 2)[0], 3);
    [['ci_lb_z', 'ci_ub_z'], ['ci_lb_hk', 'ci_ub_hk']].forEach(function (keys, i) {
      var v = values(tables[0], i + 1, 1); keys.forEach(function (k, j) { put(k, v[j], 3); });
    });
    var m = global._almLastMlma && global._almLastMlma(), hasPI = m && m.pi_lb != null, offset = hasPI ? 1 : 0;
    if (hasPI) { var pi = values(tables[0], 3, 1); put('pi_lb', pi[0], 3); put('pi_ub', pi[1], 3); }
    ['study', 'within'].forEach(function (s, i) {
      var v = values(tables[0], 3 + offset + i, 1); put('tau2_' + s, v[0], 4); put(s + 'Share', v[1], 1, 'pct');
    });
    var sampling = values(tables[0], 5 + offset, 1);
    put('samplingShare', sampling[0], 1, 'pct'); put('totalShare', sampling[1], 1, 'pct');
    put('remlMu', values(tables[1], 0, 1)[0], 3); put('remlSE', values(tables[1], 0, 2)[0], 3);
    var ci = values(tables[1], 1, 1); put('remlLo', ci[0], 3); put('remlHi', ci[1], 3);
    put('remlBetween', values(tables[1], 2, 1)[0], 4); put('remlWithin', values(tables[1], 3, 1)[0], 4);
    put('logLik', values(tables[1], 4, 1)[0], 3);
    return out;
  }
  var templates = {
    plain: function (T, r) {
      return ['The analysis combined ', T.int('k'), ' effect estimates from ', T.int('J'), ' studies, allowing effects from the same study to be related. ',
        'The recommended REML average was ', T.num('remlMu', 3), ' (', T.rule('ciLevel'), ' confidence interval ',
        T.ci('remlLo', 'remlHi', 3), ') on the supplied effect scale. ',
        'If zero represents no effect on that scale, there is ', global.AlmText.cochrane.differencePhrase(r.remlLo, r.remlHi, T.R.none), '. ',
        'The meaning and clinical importance of the effect depend on the measure supplied; this analysis alone does not establish causation.',
        T.when(r.J < T.R.funnelK, ' With few independent studies, treat these results as descriptive.')];
    },
    methods: function (T, r) {
      return ['The page fits an intercept-only three-level model to the supplied effects and squared standard errors, without transformation or back-transformation. ',
        'The recommended fit uses restricted maximum likelihood (REML), with a study random intercept and an independent effect random intercept nested within study, diagonal sampling-error covariance, and generalized least squares pooling. ',
        'Its ', T.rule('ciLevel'), ' normal Wald CI uses the model-based SE. No p-value is computed or reported. ',
        'The separate method-of-moments (MoM) fit starts from inverse-variance study means and DerSimonian–Laird moments, then iterates between-study and within-study moment updates with nonnegative variance components. ',
        'Final MoM weights are the inverse of sampling variance plus both heterogeneity components. The page displays a normal Wald CI and a residual-scale HKSJ-labelled t CI: the weighted squared residual sum is divided by the cluster degrees of freedom, floored at one, and used to inflate the pooled variance. ',
        'The t degrees of freedom are the number of studies minus one, with a minimum of one. This is not cluster-robust inference. ',
        'The MoM prediction interval is the pooled effect ± t × √(between-study variance + within-study variance + adjusted SE squared), using cluster degrees of freedom; it is available from two studies. No REML prediction interval is computed. ',
        'MoM variance shares divide each heterogeneity component and the typical sampling variance by their sum; typical sampling variance is (number of effects minus one) × sum of inverse sampling variances, divided by the squared sum minus the sum of squared inverse sampling variances. ',
        'Study forest intervals and the MoM pooled diamond use normal Wald limits. The R forest instead shows REML pooling, so their diamonds need not coincide. ',
        T.when(r.entryRows > T.R.none, ['Data entry recorded ', T.int('entryRows'), ' confirmed effect rows from ',
          T.int('entrySources'), ' distinct reference strings, with source locations retained. ']),
        T.when(r.entryCI > T.R.none, ['SEs were obtained from confidence intervals for ', T.int('entryCI'), ' effect rows (', T.cite('handbookSE'), '). ']),
        T.when(r.entryVariance > T.R.none, ['Sampling variances were converted to SEs by square root for ', T.int('entryVariance'), ' effect rows. ']),
        T.software(),
        T.when(r.verified && T.verify(), [' Only the REML quantities were checked. ', T.verify()])];
    },
    results: function (T) {
      return ['There were ', T.int('k'), ' effects in ', T.int('J'), ' studies. REML pooled effect = ', T.num('remlMu', 3),
        ', SE = ', T.num('remlSE', 3), ', ', T.rule('ciLevel'), ' CI ', T.ci('remlLo', 'remlHi', 3),
        '; between-study variance = ', T.num('remlBetween', 4), '; within-study variance = ', T.num('remlWithin', 4),
        '; restricted log-likelihood = ', T.num('logLik', 3), '. ',
        'MoM pooled effect = ', T.num('mu', 3), ', SE = ', T.num('seMu', 3), ', ', T.rule('ciLevel'), ' normal CI ',
        T.ci('ci_lb_z', 'ci_ub_z', 3), '; adjusted t CI ', T.ci('ci_lb_hk', 'ci_ub_hk', 3), ' with ', T.int('df'), ' cluster degrees of freedom.',
        T.when(T.has('pi_lb') && T.has('pi_ub'), function () { return [' MoM ', T.rule('ciLevel'), ' prediction interval = ', T.ci('pi_lb', 'pi_ub', 3), '.']; }),
        ' MoM between-study variance = ', T.num('tau2_study', 4), ' (share ', T.pct('studyShare', 1),
        '); within-study variance = ', T.num('tau2_within', 4), ' (share ', T.pct('withinShare', 1),
        '); sampling-variance share = ', T.pct('samplingShare', 1), '; shares total ', T.pct('totalShare', 1), '.'];
    },
    flags: function (T, r) {
      return [
        T.when(r.J < T.R.fewK, ['Few independent studies (', T.int('J'), '): heterogeneity estimates are imprecise.']),
        T.when(r.J < T.R.funnelK, 'Small-cluster inference is descriptive; the adjusted MoM interval is not cluster-robust. Small-study-effect tests would be underpowered and were not performed.'),
        T.when(global.AlmText.cochrane.imprecise(r.remlLo, r.remlHi, T.R.none), 'If zero means no effect, the REML interval is imprecise: it includes no effect and effects in either direction.'),
        'The R comparison verifies REML only. MoM results, variance shares and prediction limits are not verified by that comparison.'
      ];
    }
  };
  var textSpec = { app: APP, verifyPackage: 'metafor', results: results, dom: dom, templates: templates };
  function axis(edge) { return document.querySelector('#alm-axis-mount [data-edge="' + edge + '"]'); }
  function shareGet() {
    currentProvenance();
    return { src: byId('src').value, axis: { min: axis('min').value, max: axis('max').value, log: axis('log').checked },
      entryInput: byId('src').value, entryLog: global.AlmFeaturesState.entryLog.slice() };
  }
  function shareSet(s) {
    if (!s || typeof s.src !== 'string' || s.src.length > 200000) throw new Error('Data text missing or too long.');
    var a = s.axis;
    if (!a || typeof a.log !== 'boolean' || ['min', 'max'].some(function (k) {
      return !axisBoundOk(a[k]);
    }) || (a.min !== '' && a.max !== '' && Number(a.min) >= Number(a.max))) throw new Error('Invalid axis options.');
    var lines = s.src.trim().split(/\n/), parsed = global.__almMlmaParse(s.src);
    // The page parser uses parseFloat for manual input. A shared state must
    // contain complete numeric tokens, not values with silently ignored suffixes.
    var invalidNumber = lines.some(function (line) {
      var cells = line.split(',');
      // The page parser discards fields after the optional effect label.
      if (cells.length > 4) return true;
      return [1, 2].some(function (col) {
        var token = (cells[col] || '').trim();
        return !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token);
      });
    });
    if (invalidNumber || parsed.length !== lines.length || parsed.length < 3 || parsed.some(function (r) { return !identifier(r.study); })) throw new Error('Invalid effect rows.');
    if (s.entryLog !== undefined && !Array.isArray(s.entryLog)) throw new Error('Invalid conversion log.');
    // Validate everything before changing any controls.
    clearProvenance();
    byId('src').value = s.src;
    ['min', 'max', 'log'].forEach(function (k) {
      if (k === 'log') axis(k).checked = a[k]; else writeNumberSetting(axis(k), a[k]);
    });
    ['min', 'max', 'log'].forEach(function (k) { axis(k).dispatchEvent(new Event('change', { bubbles: true })); });
    global.AlmFeaturesState.entryLog = s.entryInput === s.src ? (s.entryLog || []) : [];
    global.AlmFeaturesState.entryInput = s.src;
    byId('btn-run').click();
  }
  var spec = {
    paper: 7, title: 'Multilevel meta-analysis',
    entry: { schema: 'generic', extras: ['es_id'], apply: apply, convert: convert, convertTable: convertTable, sourceRecords: sourceRecords, validateSource: validateSource },
    text: textSpec,
    verify: {
      adapter: function () { return (global.AlmLiveAdapters && global.AlmLiveAdapters[APP]) || global.AlmMultilevelValidationAdapter; },
      inputs: '#src',
      rObjects: 'yi, vi, cluster, id, f (REML rma.mv), x',
      plots: [{ id: 'forest', title: 'Forest: R REML; app method of moments', width_in: 8, height_in: 6,
        r: function () { return 'metafor::forest(f, slab=paste("Study",cluster,"effect",id), xlab="Supplied effect scale", main="REML (app diamond uses MoM)")'; },
        app: function () { return byId('forest'); } }]
    },
    share: { get: shareGet, set: shareSet }
  };
  global.AlmMultilevelFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {};
  global.AlmTextSpecs[APP] = textSpec;
  if (typeof document !== 'undefined') {
    byId('src').addEventListener('input', clearProvenance);
  }
  if (global.AlmFeatures) {
    global.AlmFeatures.register(APP, spec);
  }
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') {
    global.AlmFeatures.registerModule('entry', { render: mountEntry });
    global.AlmFeatures.registerModule('text', { render: function (panel) {
      // Follow the host's lazy Report text contract. Mounting while collapsed
      // installs global freshness listeners; revision checks call the live
      // adapter, which reruns this app even on Tab before Run is activated.
      var ui = null;
      return { onShow: function () {
        if (ui) { ui.regenerate(); return; }
        ui = global.AlmTextUI.mount(panel, { app: APP, text: textSpec });
        document.addEventListener('input', function (event) {
          if (event.target === byId('src')) ui.regenerate();
        });
        byId('btn-run').addEventListener('click', function () { ui.regenerate(); });
      } };
    } });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
