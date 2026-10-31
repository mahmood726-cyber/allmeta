/* Additive features for P18. No fitting is performed here.
 * Entry uses AlmEntry's generic effect converter per outcome, then pairs two
 * explicitly named outcomes and checks the supplied within-study covariance.
 * The existing alm-live.js supplies the paper's independent mvmeta oracle,
 * including its boundary handling and unchanged comparison tolerances.
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
  var APP = 'multivariate-ma';
  function el(id) { return document.getElementById(id); }
  function block(text, row) { return { code: 'multivariate-input', text: text, row: row, blocking: true }; }
  function numeric(value, decimal) {
    var token = global.AlmEntry.parseCell(String(value), { decimal: decimal });
    return token.kind === 'number' && !token.ambiguousDecimal ? token.value : NaN;
  }
  // Offsets are into each verbatim pasted row, never the normalised table.
  // Quoted single-line cells retain their original quote/space offsets.
  function sourceCells(line, delimiter) {
    var spans = [], start = 0, quoted = false;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && (line[i] === delimiter || (delimiter === 'spaces' && /[ \u00a0\u2009\u202f]/.test(line[i]) && /[ \u00a0\u2009\u202f]/.test(line[i + 1] || '')))) {
        spans.push([start, i]);
        if (delimiter === 'spaces') while (/[ \u00a0\u2009\u202f]/.test(line[i + 1] || '')) i++;
        start = i + 1;
      }
    }
    spans.push([start, line.length]);
    return spans;
  }
  function sourceValue(line, cellSpan, field, value, decimal) {
    if (!cellSpan || !Number.isFinite(value)) return null;
    var normalized = global.AlmEntry.normalize(line.slice(cellSpan[0], cellSpan[1]));
    // This replacement preserves offsets into the verbatim comma source.
    if (decimal === 'comma') normalized.text = normalized.text.replace(/(\d),(?=\d)/g, '$1.');
    var re = /[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?/gi, m;
    while ((m = re.exec(normalized.text))) {
      var start = m.index, printed = m[0];
      // A range dash following a number is a separator, not the upper sign.
      if (printed[0] === '-' && /[\d.]/.test(normalized.text[start - 1] || '')) { start++; printed = printed.slice(1); }
      if (Number(printed) !== value) continue;
      var span = [cellSpan[0] + normalized.map[start], cellSpan[0] + normalized.map[m.index + m[0].length]];
      return { field: field, value: value, span: span, text: line.slice(span[0], span[1]), selector: global.AlmEntry.selectors(line, span) };
    }
    return null;
  }

  // A long table deliberately makes outcome membership explicit. A RevMan
  // export without a covariance cannot identify this model and is refused.
  function convert(source, answers) {
    answers = Object.assign({ decimal: 'point' }, answers);
    var core = global.AlmEntry, table = core.parseTable(source);
    var headers = (table.header || []).map(function (h) { return h.trim().toLowerCase().replace(/_/g, ' '); });
    var aliases = {
      study: ['study', 'study id', 'study or subgroup', 'trial'],
      outcome: ['outcome', 'outcome name'],
      yi: ['yi', 'estimate', 'effect', 'mean difference', 'mean difference iv, random, 95% ci'],
      vi: ['vi', 'variance'], sei: ['sei', 'se', 'standard error'],
      cov: ['cov', 'covariance', 'cov12', 'within-study covariance']
    };
    var map = {}, out = { records: [], steps: [], flags: [], questions: [], source: source };
    Object.keys(aliases).forEach(function (key) {
      var found = headers.map(function (h, i) { return aliases[key].indexOf(h) >= 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      if (found.length === 1) map[key] = found[0];
      else if (found.length > 1) out.flags.push(block('Multiple ' + key + ' columns are ambiguous; supply one column for this field.'));
    });
    var sourceRows = source.split(/\r?\n/).filter(function (line) { return line.trim(); }).slice(1);
    if (sourceRows.length !== table.rows.length) out.flags.push(block('Use single-line table rows so every numeric source span can be reviewed.'));
    ['study', 'outcome', 'yi', 'cov'].forEach(function (k) {
      if (map[k] === undefined) out.flags.push(block('An explicit ' + k + ' column is required.'));
    });
    if (out.flags.length) return out;
    var generic = {
      header: ['study', 'yi', 'sei'], rows: [], notes: table.notes,
      source: source, delimiter: table.delimiter
    };
    function working(cell) {
      return answers.decimal === 'comma' ? String(cell).replace(/(\d),(?=\d)/g, '$1.') : cell;
    }
    table.rows.forEach(function (row) {
      var se = map.sei === undefined ? '' : row[map.sei];
      if (map.vi !== undefined && map.sei === undefined) {
        var v = numeric(row[map.vi], answers.decimal);
        se = v > 0 ? String(Math.sqrt(v)) : '';
      }
      // The shared CI-swap retry reads cells without a decimal context.
      // Normalise only this working copy after the explicit per-paste choice.
      generic.rows.push([row[map.study], working(row[map.yi]), working(se)]);
    });
    var detected = core.detect(generic, 'generic');
    var converted = core.convert(generic, detected, { name: 'generic', ratio: false }, answers);
    out.flags = converted.flags.filter(function (f) { return f.code !== 'duplicate-study'; });
    out.steps = converted.steps;
    out.questions = converted.questions.filter(function (q) { return q.choices.indexOf(answers[q.id]) < 0; });
    out.records = converted.records.map(function (r, i) {
      var raw = table.rows[i];
      var vi = map.vi === undefined ? r.sei * r.sei : numeric(raw[map.vi], answers.decimal);
      if (map.sei !== undefined && map.vi !== undefined) {
        var suppliedSE = numeric(raw[map.sei], answers.decimal);
        var printed = core.normalize(working(raw[map.sei])).text.trim();
        var precision = printed.match(/^[-+]?(?:\d+(?:\.(\d+))?|\.(\d+))(?:e([-+]?\d+))?$/i);
        var unit = precision ? Math.pow(10, Number(precision[3] || 0) - (precision[1] || precision[2] || '').length) : NaN;
        if (!(suppliedSE > 0) || !Number.isFinite(suppliedSE)) {
          out.flags.push(block('Supplied SE must be positive and finite when variance is also supplied.', i));
        } else if (!(vi > 0) || !Number.isFinite(unit) || Math.abs(suppliedSE - Math.sqrt(vi)) > unit / 2) {
          out.flags.push(block('SE and variance disagree at the printed SE precision; check the source and choose one dispersion column.', i));
        } else {
          out.steps.push({ row: i, study: r.study, text: r.study + ': supplied SE agrees with the square root of variance at its printed precision; variance retained for analysis.',
            method: 'SE and variance checked', citation: 'Definition of sampling variance' });
        }
      }
      if (map.vi === undefined && Number.isFinite(r.sei)) {
        out.steps.push({ row: i, study: r.study, text: r.study + ': variance = SE squared.',
          field: 'vi', formula: 'variance = SE squared', method: 'variance = SE squared',
          citation: 'Definition of sampling variance', inputs: { sei: r.sei }, output: vi });
      }
      var line = sourceRows[i], spans = sourceCells(line, table.delimiter), values = [];
      [['yi', 'yi', r.yi], ['vi', 'vi', vi], ['sei', 'sei', r.sei], ['cov', 'cov', numeric(raw[map.cov], answers.decimal)],
        ['yi', 'lo', r.lo], ['yi', 'hi', r.hi]].forEach(function (item) {
        if (map[item[0]] === undefined || !Number.isFinite(item[2])) return;
        var v = sourceValue(line, spans[map[item[0]]], item[1], item[2], answers.decimal);
        if (v) values.push(v); else out.flags.push(block('Cannot anchor ' + item[1] + ' to the verbatim source row.', i));
      });
      return { study: r.study, outcome: raw[map.outcome], yi: r.yi, vi: vi, cov: numeric(raw[map.cov], answers.decimal), decimal: answers.decimal,
        pastedText: line, values: values, sourceRow: i, conversions: out.steps.filter(function (s) {
          // Choices and consistency checks stay in entryLog; only numerical
          // conversions go to the independently replayed conversion registry.
          return s.row === i && (s.fn || s.method === 'variance = SE squared');
        }).map(function (s) {
          return Object.assign({}, s, { field: s.field || 'sei', formula: s.formula || s.method, output: s.output === undefined ? s.result : s.output });
        }) };
    });
    try { pair(out.records); } catch (e) { out.flags.push(block(e.message)); }
    if (!out.steps.length) out.steps.push({ text: 'Effect sizes, variances and covariances retained as supplied; no statistical conversion.',
      method: 'direct input', citation: 'User-supplied analysis-scale data' });
    return out;
  }

  function pair(records) {
    if (!Array.isArray(records) || !records.length) throw Error('Supply complete paired outcome rows.');
    var names = [], studies = new Map();
    records.forEach(function (r) {
      if (typeof r.study !== 'string' || !r.study.trim() || r.study.trim()[0] === '#' || /[\r\n]/.test(r.study) ||
          typeof r.outcome !== 'string' || !r.outcome.trim() || /[\r\n]/.test(r.outcome)) throw Error('Study and outcome labels are required.');
      if (![r.yi, r.vi, r.cov].every(Number.isFinite) || !(r.vi > 0)) throw Error('Effects and covariance must be finite; variance must be positive.');
      if (names.indexOf(r.outcome) < 0) names.push(r.outcome);
      if (!studies.has(r.study)) studies.set(r.study, new Map());
      var group = studies.get(r.study);
      if (group.has(r.outcome)) throw Error('Duplicate study/outcome row: ' + r.study);
      group.set(r.outcome, r);
    });
    if (names.length !== 2 || studies.size < 2) throw Error('Exactly two outcomes and at least two complete studies are required.');
    var lines = [];
    studies.forEach(function (group, study) {
      var a = group.get(names[0]), b = group.get(names[1]);
      if (!a || !b) throw Error('Both outcomes are required for ' + study);
      if (a.cov !== b.cov) throw Error('Both outcome rows must give the same within-study covariance for ' + study);
      if (!(a.vi * b.vi > a.cov * a.cov)) throw Error('Within-study covariance must be positive definite for ' + study);
      lines.push([study, a.yi, a.vi, b.yi, b.vi, a.cov].join(', '));
    });
    return { src: lines.join('\n'), names: names, n: studies.size };
  }
  function apply(records) {
    var p = pair(records); // Validate the entire batch before touching the app.
    global.AlmMvPage.load(p.src, 'cov', p.names[0], p.names[1]);
    if (!global._almLastMultivariate()) throw Error('The app could not fit these rows.');
    return { ok: true, n: p.n };
  }

  function node(tag, text, parent) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function validateProvenance(record, options) {
    var square = record.conversions.filter(function (c) { return c.method === 'variance = SE squared'; });
    var copy = Object.assign({}, record, { conversions: record.conversions.filter(function (c) {
      return c.method !== 'variance = SE squared';
    }) });
    var errors = global.AlmEntry.provenance.validate(copy, options);
    // The shared replay registry has no variance-from-SE rule. Replay this
    // elementary app-specific conversion here, without extending shared code.
    square.forEach(function (c) {
      if (c.field !== 'vi' || !(c.inputs.sei > 0) || !Number.isFinite(c.inputs.sei) ||
          c.output !== c.inputs.sei * c.inputs.sei) errors.push('variance conversion replay');
    });
    return errors;
  }
  function mountEntry(panel) {
    var core = global.AlmEntry, P = core.provenance;
    panel.classList.add('alm-entry');
    node('p', 'Paste one row per study and outcome, with columns study, outcome, yi, vi (or SE or an estimate with its confidence interval), and cov. Supply the same within-study covariance on both outcome rows. Values must already be on the intended analysis scale; no log transformation is applied.', panel);
    node('p', 'RevMan/Covidence tables need an explicit outcome and covariance column. Marginal effects alone cannot supply the missing covariance.', panel);
    var label = node('label', 'Paired outcome table', panel), paste = node('textarea', undefined, panel);
    paste.id = 'mv-entry-paste'; label.htmlFor = paste.id;
    var decimalLabel = node('label', 'Decimal mark for this paste', panel), decimal = node('select', undefined, panel);
    decimal.id = 'mv-entry-decimal'; decimalLabel.htmlFor = decimal.id;
    ['point', 'comma'].forEach(function (value) { node('option', value, decimal).value = value; });
    decimal.value = 'point';
    var initialsLabel = node('label', 'Your initials', panel), initials = node('input', undefined, panel);
    initials.id = 'mv-entry-initials'; initialsLabel.htmlFor = initials.id;
    initials.type = 'text';
    var preview = node('button', 'Preview and convert', panel);
    preview.type = 'button';
    var status = node('p', 'Paste a table to begin.', panel); status.setAttribute('role', 'status');
    status.id = 'mv-entry-status';
    var details = node('div', undefined, panel), log = node('div', undefined, panel);
    log.dataset.testid = 'entry-log';
    var use = node('button', 'Use these rows', panel); use.type = 'button'; use.disabled = true;
    use.setAttribute('aria-describedby', status.id);
    var out = null, confirmed = [], answers = { decimal: 'point' };
    function provenance(c, i) {
      if (c.confirmed) return c.confirmed;
      var r = c.record;
      var p = { id: 'mv-' + i, label: c.label.value, study: r.study, reference: c.reference.value, location: c.location.value,
        source: { type: c.sourceType.value, detail: c.location.value },
        pastedText: r.pastedText, decimal: r.decimal,
        choice: { study: r.study, outcome: r.outcome, timepoint: c.timepoint.value, randomisation: c.randomisation.value,
          cluster: { action: c.cluster.value } },
        values: r.values, conversions: r.conversions, flags: [], usedAs: 'Paired analysis-scale effect, sampling variance and covariance',
        confirmed: false, confirmedAt: null };
      P.applyDesign(p, {});
      if (p.choice.randomisation === 'not stated') {
        p.statements = [{ facet: 'randomisation', value: 'not stated in source', by: 'user' }];
        p.flags.push({ code: 'NOT_STATED_RANDOMISATION', text: 'Unit of randomisation: not stated in the source (your statement).', blocking: false });
      }
      return p;
    }
    function gate() {
      confirmed.forEach(function (c, i) {
        c.check.disabled = !initials.value.trim() || !c.timepoint.value.trim() ||
          validateProvenance(provenance(c, i), { beforeConfirm: true }).length > 0;
      });
      use.disabled = !out || !!out.questions.length || out.flags.some(function (f) { return f.blocking; }) ||
        !confirmed.length || confirmed.some(function (c, i) {
          return !c.timepoint.value.trim() || validateProvenance(provenance(c, i)).length;
        });
    }
    initials.addEventListener('input', function () {
      confirmed.forEach(function (c) { c.confirmed = null; c.check.checked = false; });
      gate();
    });
    paste.addEventListener('input', function () {
      out = null; confirmed = []; answers = { decimal: 'point' }; decimal.value = 'point';
      details.replaceChildren(); log.replaceChildren(); use.disabled = true;
      status.textContent = 'Text changed. Choose the decimal mark and preview again.';
    });
    decimal.addEventListener('change', function () { answers = { decimal: decimal.value }; showPreview(); });
    function showPreview() {
      out = convert(paste.value, answers); confirmed = []; details.replaceChildren(); log.replaceChildren();
      node('h3', 'Conversion log', log);
      out.steps.forEach(function (s) { node('p', s.text, log); });
      var flags = node('div', undefined, details); flags.setAttribute('role', 'alert');
      out.flags.forEach(function (f) { node('p', (f.blocking ? 'Block: ' : 'Check: ') + f.text, flags); });
      out.questions.forEach(function (q, i) {
        var prompt = q.id.indexOf('decimal:') === 0 ? 'Decimal mark for this paste (including variance and covariance): ' + q.text : q.text;
        var lab = node('label', prompt, details), select = node('select', undefined, details);
        select.id = 'mv-entry-question-' + i; lab.htmlFor = select.id;
        node('option', 'Choose an answer', select).value = '';
        q.choices.forEach(function (choice) { node('option', choice, select).value = choice; });
        select.value = '';
        select.addEventListener('change', function () {
          // Comma interpretation is a per-paste decision, including variance
          // and covariance columns handled by this adapter.
          if (q.id.indexOf('decimal:') === 0 && select.value === 'comma') {
            answers.decimal = 'comma'; decimal.value = 'comma';
          }
          answers[q.id] = select.value; showPreview();
        });
      });
      if (!out.flags.some(function (f) { return f.blocking; }) && !out.questions.length) {
        out.records.forEach(function (r, i) {
          var box = node('fieldset', undefined, details);
          node('legend', r.study + ' — ' + r.outcome, box);
          var original = node('pre', undefined, box), at = 0;
          original.className = 'alm-entry-source';
          r.values.slice().sort(function (a, b) { return a.span[0] - b.span[0]; }).forEach(function (v) {
            if (v.span[0] < at) return;
            node('span', r.pastedText.slice(at, v.span[0]), original);
            var mark = node('mark', v.text, original); mark.title = v.field;
            at = v.span[1];
          });
          node('span', r.pastedText.slice(at), original);
          node('p', 'Effect ' + r.yi + '; variance ' + r.vi + '; covariance ' + r.cov + '. Used as supplied analysis-scale inputs to the joint model.', box);
          var c = { record: r };
          [['label', 'Source author and year'], ['reference', 'Full reference'], ['sourceType', 'Source type'],
            ['location', 'Source location'], ['timepoint', 'Timepoint (or not stated)'], ['randomisation', 'What was randomised?'],
            ['cluster', 'Clustering in the supplied analysis'], ['check', 'I confirm this outcome row']].forEach(function (field) {
            var choices = field[0] === 'sourceType' ? core.SOURCE_TYPES.map(function (v) { return [v, v]; }) :
              field[0] === 'randomisation' ? Object.entries(core.RANDOMISATION_CHOICES) :
              field[0] === 'cluster' ? [['already', 'Reported analysis accounts for clustering'], ['decline', 'No adjustment for clustering']] : null;
            // Keep option text outside the label so exact label lookup uses
            // only the prompt. The wrapper also hides the whole cluster field.
            var fieldRow = node('div', undefined, box);
            var lab = node('label', field[1], fieldRow), input = node(choices ? 'select' : 'input', undefined, fieldRow);
            input.id = 'mv-source-' + i + '-' + field[0]; lab.htmlFor = input.id;
            if (choices) {
              node('option', 'Choose an answer', input).value = '';
              choices.forEach(function (choice) { node('option', choice[1], input).value = choice[0]; });
            } else input.type = field[0] === 'check' ? 'checkbox' : 'text';
            input.addEventListener(choices ? 'change' : 'input', function () {
              c.confirmed = null;
              if (field[0] !== 'check') c.check.checked = false;
              else if (c.check.checked && !c.check.disabled) {
                c.confirmed = P.confirm(provenance(c, i), { by: initials.value, via: 'row' });
              }
              c.cluster.parentNode.hidden = c.randomisation.value !== 'clusters';
              gate();
            });
            c[field[0]] = input;
          });
          c.cluster.parentNode.hidden = true;
          confirmed.push(c);
        });
      }
      var blocking = out.flags.filter(function (f) { return f.blocking; });
      status.textContent = blocking.length || out.questions.length
        ? 'Preview blocked: ' + blocking.length + ' blocking issues; ' + out.questions.length + ' unanswered questions. ' +
          (blocking.length ? blocking[0].text : out.questions[0].text)
        : 'Enter your initials, review the conversion log, and confirm the source and randomisation choice of every outcome row.';
      gate();
    }
    preview.addEventListener('click', showPreview);
    use.addEventListener('click', function () {
      if (use.disabled) return;
      try {
        var result = apply(out.records);
        global.AlmFeaturesState.entryLog = out.steps;
        global.AlmFeaturesState.provenance = confirmed.map(provenance);
        status.textContent = 'Applied ' + result.n + ' complete studies.';
      } catch (e) { status.textContent = e.message; }
    });
    function download(name, type, content) {
      var url = URL.createObjectURL(new Blob([content], { type: type })), a = node('a', undefined, panel);
      a.href = url; a.download = name; a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    var csv = node('button', 'Export provenance CSV', panel); csv.type = 'button';
    csv.addEventListener('click', function () {
      download(APP + '-provenance.csv', 'text/csv;charset=utf-8', global.AlmEntry.provenance.toCSV(global.AlmFeaturesState.provenance));
    });
    var docx = node('button', 'Export provenance DOCX', panel); docx.type = 'button';
    docx.addEventListener('click', function () {
      download(APP + '-provenance.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        global.AlmZip.docx(global.AlmEntry.provenance.toDocxParagraphs(global.AlmFeaturesState.provenance)));
    });
    return { convert: convert };
  }

  function dom() {
    var out = {}, cards = document.querySelectorAll('#stats .v');
    if (cards.length !== 5) return out;
    ['a', 'b'].forEach(function (suffix, i) {
      var m = cards[i].textContent.match(/(-?\d+\.\d+) \[(-?\d+\.\d+), (-?\d+\.\d+)\]/);
      if (m) ['mu', 'lo', 'hi'].forEach(function (k, j) {
        // Number('-0.000') loses its printed sign when formatted by AlmText.
        // Canonicalise only zero CI spellings, leaving nonzero audit evidence intact.
        var printed = k === 'mu' ? m[j + 1] : m[j + 1].replace(/^-0\.0+$/, '0.000');
        out[k + suffix] = { text: printed, fmt: { kind: 'num', digits: 3 } };
      });
      out['sd' + suffix] = { text: cards[i + 2].textContent, fmt: { kind: 'num', digits: 4 } };
    });
    if (cards[4].textContent !== '—') out.rho = { text: cards[4].textContent, fmt: { kind: 'num', digits: 3 } };
    var headline = el('headline').textContent.match(/k = (\d+).*logLik = (-?\d+\.\d+)/);
    if (headline) {
      out.k = { text: headline[1], fmt: { kind: 'int' } };
      out.logLik = { text: headline[2], fmt: { kind: 'num', digits: 3 } };
    }
    return out;
  }
  function results() {
    // The live adapter checks that the observed fit belongs to these inputs.
    // During the editor debounce, the last-result accessor still holds the old
    // fit; never generate a report from that stale result or trigger a refit.
    var fit;
    try { fit = oracle().currentState().result; } catch (e) { return null; }
    var r = { k: fit.k, outcomes: fit.mu.length, mua: fit.mu[0], mub: fit.mu[1],
      sea: fit.muSE[0], seb: fit.muSE[1], vara: fit.G[0][0], varb: fit.G[1][1],
      covariance: fit.G[0][1], rho: fit.rho, logLik: fit.logLik, level: 95 };
    // The last-result accessor omits CIs and SDs: read exactly the displayed
    // values, rather than recomputing statistics or silently adding precision.
    var shown = dom();
    ['loa', 'hia', 'lob', 'hib', 'sda', 'sdb'].forEach(function (key) { r[key] = shown[key] ? Number(shown[key].text) : NaN; });
    var p = global.__almTextPerturb;
    if (p && typeof r[p.key] === 'number') r[p.key] += p.delta;
    return r;
  }
  var templates = {
    plain: function (T, r) {
      return ['The analysis combined ', T.int('k'), ' studies measuring ', T.int('outcomes'),
        ' correlated outcomes. In the order shown on the page, the pooled effects were ', T.num('mua', 3), ' and ', T.num('mub', 3),
        '. Their ', T.pct('level', 0), ' confidence intervals were ', T.ci('loa', 'hia', 3), ' and ', T.ci('lob', 'hib', 3),
        '. These intervals describe uncertainty in average effects, not the range of effects in a new study. Clinical importance and causality cannot be determined from this summary.',
        ' If an interval includes the no-effect value for the supplied scale, this is not evidence of no difference.'];
    },
    methods: function (T) {
      return ['Complete paired outcome vectors were analysed using a multivariate normal random-effects model with known within-study covariance matrices. ',
        'The unstructured between-study covariance was estimated by restricted maximum likelihood; outcome means were estimated by generalised least squares. ',
        'The app uses Cholesky-parameterised Nelder–Mead optimisation, boundary refinements, and an exact restricted-likelihood solution for two studies. ',
        'Mean standard errors come from the inverse sum of inverse total covariance matrices. Marginal ', T.pct('level', 0),
        ' confidence limits use the normal Wald formula, mean plus or minus the normal quantile times its standard error, without a Hartung–Knapp adjustment. ',
        'The joint plot uses a bivariate normal confidence ellipse. Effects are used on their supplied scale without transformation or continuity correction. ',
        'Incomplete rows are omitted by the app; positive-definite within-study covariance matrices and at least two complete studies are required. ',
        'Between-study correlation is undefined if either between-study variance is zero. The restricted log likelihood includes the outcome-design normalisation. ',
        'No hypothesis-test p-values, heterogeneity Q or I-squared statistics, or prediction intervals are computed. ',
        T.entry(), T.when(T.entry(), ' '), T.software(), T.when(T.verify(), [' ', T.verify()])];
    },
    results: function (T) {
      return ['There were ', T.int('k'), ' studies and ', T.int('outcomes'), ' outcomes. In page order, the pooled estimates were ',
        T.num('mua', 3), ' (', T.pct('level', 0), ' CI ', T.ci('loa', 'hia', 3), ') and ',
        T.num('mub', 3), ' (', T.pct('level', 0), ' CI ', T.ci('lob', 'hib', 3), '). Between-study standard deviations were ',
        T.num('sda', 4), ' and ', T.num('sdb', 4), '. ',
        T.has('rho') ? ['Between-study correlation was ', T.num('rho', 3), '. '] : 'Between-study correlation was undefined. ',
        'The restricted log likelihood was ', T.num('logLik', 3), '.'];
    },
    flags: function (T, r) {
      return [T.when(r.k < T.R.fewK, 'Few studies: between-study covariance estimates are imprecise.'),
        T.when(r.k < T.R.funnelK, 'Tests for small-study effects would be underpowered; none were performed.')];
    }
  };
  var text = { app: APP, verifyPackage: 'mvmeta', results: results, dom: dom, templates: templates };
  function oracle() {
    var a = global.AlmLiveAdapters && global.AlmLiveAdapters[APP];
    if (!a) throw Error('The independent mvmeta adapter is unavailable.');
    return a;
  }
  var adapter = {
    app: APP, packages: ['mvmeta'],
    currentState: function () {
      var s = oracle().currentState();
      adapter.compare = oracle().compare;
      return s;
    },
    buildScript: function (s) { return oracle().buildScript(s); },
    appValues: function (s) { return oracle().appValues(s); },
    compare: { tolerance: { default: 1e-6 }, kind: {} }
  };
  function plotCode(s) {
    return 'theta <- seq(0,2*pi,length.out=201)\n' +
      'ellipse <- t(mu + sqrt(qchisq(.95,2)) * t(chol(CV)) %*% rbind(cos(theta),sin(theta)))\n' +
      'plot(Y, xlim=range(Y[,1],ellipse[,1]), ylim=range(Y[,2],ellipse[,2]), xlab=' + JSON.stringify(s.names[0]) +
      ', ylab=' + JSON.stringify(s.names[1]) + ', pch=16)\n' +
      'polygon(ellipse,col=adjustcolor("firebrick",alpha.f=.1),border="firebrick")\npoints(mu[1],mu[2],pch=18,col="firebrick")';
  }
  var share = {
    get: function () { return { src: el('f-data').value, names: [el('f-o1').value, el('f-o2').value],
      mode: global.AlmMvPage.getMode(), rhoW: el('f-rhow').value, entryLog: global.AlmFeaturesState.entryLog }; },
    set: function (s) {
      if (!s || typeof s.src !== 'string' || s.src.length > 200000 ||
          !Array.isArray(s.names) || s.names.length !== 2 || s.names.some(function (n) { return typeof n !== 'string' || n.length > 1000; }) ||
          (s.entryLog !== undefined && !Array.isArray(s.entryLog))) throw Error('Invalid multivariate analysis state.');
      // Links without a mode retain the historical covariance default. Never
      // inherit the recipient's current interpretation of those same numbers.
      var mode = s.mode === undefined ? 'cov' : s.mode;
      var rhoW = s.rhoW === undefined ? '0.5' : s.rhoW;
      if (['cov', 'r', 'rhoW'].indexOf(mode) < 0 || typeof rhoW !== 'string' || rhoW.length > 100 ||
          (mode === 'rhoW' && (s.rhoW === undefined || !decimalSetting(rhoW) || !(Math.abs(Number(rhoW)) < 1)))) {
        throw Error('Invalid multivariate analysis state.');
      }
      // The page's own row parser (index.html parse, exposed as AlmMvPage.parse), before anything is changed: a row the
      // page would omit (listed as omitted) makes the file invalid instead of quietly changing the analysis.
      if (!global.AlmMvPage || typeof global.AlmMvPage.parse !== 'function') throw Error('The app row checker is not available.');
      var omitted = global.AlmMvPage.parse(s.src, mode, Number(rhoW)).omitted;
      if (omitted.length) throw Error('Line ' + omitted[0].line + ' cannot be used: ' + omitted[0].reason + '.');
      writeNumberSetting(el('f-rhow'), rhoW);
      // load synchronises mode controls and completes the fit synchronously.
      global.AlmMvPage.load(s.src, mode, s.names[0], s.names[1]);
      global.AlmFeaturesState.entryLog = s.entryLog || [];
    }
  };
  var spec = { paper: 18, title: 'Multivariate meta-analysis',
    entry: { schema: 'multivariate', convert: convert, apply: apply, mount: mountEntry, validateProvenance: validateProvenance },
    text: text, share: share,
    verify: { adapter: function () { return adapter; }, inputs: '#f-data, #f-o1, #f-o2, #f-mode, #f-rhow',
      rObjects: 'f (mvmeta), Y, S, G, mu, CV (pooled covariance)',
      plots: [{ id: 'joint', title: 'Joint outcome plot', r: plotCode, app: function () { return document.querySelector('#plot-host svg'); } }] }
  };
  global.AlmMultivariateFeatures = spec;
  global.AlmTextSpecs = global.AlmTextSpecs || {}; global.AlmTextSpecs[APP] = text;
  // Edited analysis inputs no longer represent the confirmed extraction.
  // apply() records new provenance after running; AlmShare restores it after set().
  function invalidateProvenance(event) {
    // Text/number edits are handled immediately on input. Their later change
    // event only commits the same edit on blur (including a click on Share),
    // and must not discard provenance recorded for the current inputs.
    // The covariance select is handled by its change event, like the page fit.
    if (!event.target || event.type !== (event.target.id === 'f-mode' ? 'change' : 'input')) return;
    if (event.target && ['f-data', 'f-o1', 'f-o2', 'f-mode', 'f-rhow'].indexOf(event.target.id) >= 0 && global.AlmFeaturesState) {
      global.AlmFeaturesState.provenance = [];
      global.AlmFeaturesState.entryLog = [];
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('input', invalidateProvenance);
    document.addEventListener('change', invalidateProvenance);
  }
  if (global.AlmFeatures) {
    global.AlmFeatures.register(APP, spec);
    if (typeof global.AlmFeatures.registerModule === 'function') {
      global.AlmFeatures.registerModule('entry', { render: function (panel) { return mountEntry(panel); } });
      global.AlmFeatures.registerModule('text', { render: function (panel) {
        var ui = global.AlmTextUI.mount(panel, { app: APP, text: text });
        return { onShow: function () { ui.regenerate(); } };
      } });
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = spec;
})(typeof window !== 'undefined' ? window : globalThis);
