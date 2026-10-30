/* Summary of findings. Only absolute risks are calculated here; effects and CIs
 * are read from the host app. Generic effect inputs retain their declared scale.
 * No certainty inference: the only rating source is the user's select control.
 * References are by name: no supplied citation-lint allowlist was found.
 */
(function (global) {
  'use strict';
  var DOMAINS = ['Risk of bias', 'Inconsistency', 'Indirectness', 'Imprecision', 'Publication bias'];
  var RATINGS = ['High', 'Moderate', 'Low', 'Very low'];
  var CITATION = 'Guyatt et al. GRADE guidelines: 1. Introduction—GRADE evidence profiles and summary of findings tables (2011); GRADE guidelines: 12. Preparing summary of findings tables—binary outcomes (2013); GRADE guidelines: 13. Preparing summary of findings tables and evidence profiles—continuous outcomes (2013).';
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function risk(measure, acr, effect) {
    if (!finite(acr) || acr <= 0 || acr >= 1) throw new Error('Assumed comparator risk must be strictly between 0 and 1.');
    if (!finite(effect) || effect <= 0) throw new Error('Ratio effect must be finite and positive.');
    var p;
    if (measure === 'RR') p = acr * effect;
    else if (measure === 'OR') p = 1 / (1 + (1 - acr) / acr / effect);
    else if (measure === 'HR') p = -Math.expm1(effect * Math.log1p(-acr));
    else throw new Error('Absolute risks require RR, OR or HR on the natural scale.');
    if (!finite(p) || p < 0 || p > 1) throw new Error('This comparator risk and effect imply a risk outside 0–1; choose a compatible comparator risk.');
    return p;
  }
  function absoluteEffects(measure, acr, estimate, lower, upper) {
    if (![estimate, lower, upper].every(finite) || lower > estimate || estimate > upper) throw new Error('The app effect and CI are unavailable or inconsistent.');
    var p = risk(measure, acr, estimate), lo = risk(measure, acr, lower), hi = risk(measure, acr, upper);
    return { comparator: acr, intervention: p, lower: lo, upper: hi,
      difference: p * 1000 - acr * 1000, differenceLower: lo * 1000 - acr * 1000, differenceUpper: hi * 1000 - acr * 1000 };
  }
  // Half away from zero; round only final displayed quantities, never inputs.
  function round(x) { var n = Math.floor(Math.abs(x) + 0.5); return n ? (x < 0 ? -n : n) : 0; }
  function per1000(p) { return round(p * 1000); }
  function participants(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var ns = rows.map(function (r) { return finite(r.n1) && finite(r.n2) ? r.n1 + r.n2 : r.n; });
    return ns.every(function (n) { return finite(n) && n > 0; }) ? ns.reduce(function (a, b) { return a + b; }, 0) : null;
  }
  function medianControlRisk(rows) {
    if (!Array.isArray(rows) || !rows.length || !rows.every(function (r) { return finite(r.e2) && finite(r.n2) && r.n2 > 0 && r.e2 >= 0 && r.e2 <= r.n2; })) return null;
    var ps = rows.map(function (r) { return r.e2 / r.n2; }).sort(function (a, b) { return a - b; }), mid = Math.floor(ps.length / 2);
    return ps.length % 2 ? ps[mid] : (ps[mid - 1] + ps[mid]) / 2;
  }
  function selectedCertainty(value) { return RATINGS.indexOf(value) >= 0 ? value : 'Not selected'; }
  function fmt(x) { return finite(x) ? x.toFixed(3) : 'Unavailable'; }
  function buildFinding(result, user) {
    result = result || {}; user = user || {};
    var valid = [result.estimate, result.lower, result.upper].every(finite);
    var ratio = ['RR', 'OR', 'HR'].indexOf(result.measure) >= 0;
    var reasons = DOMAINS.map(function (d) { return d + ': ' + String((user.reasons || {})[d.toLowerCase()] || 'Not supplied'); }).join('\n');
    var f = { outcome: String(user.outcome || 'Outcome not specified'),
      participants: (finite(result.n) ? result.n : 'Not reported') + ' (' + (finite(result.k) ? result.k : 'Not reported') + ' studies)',
      measure: result.measure || 'Effect', model: result.model || '',
      effect: valid ? (result.display || (fmt(result.estimate) + ' [' + fmt(result.lower) + ', ' + fmt(result.upper) + ']')) : 'Unavailable',
      certainty: selectedCertainty(user.certainty), reasons: reasons, absolute: null,
      comparator: 'Not applicable', intervention: 'Not applicable', difference: 'Not applicable', singleGroup: '',
      absoluteNote: result.unavailable || '', riskSource: '', hint: '', citation: CITATION };
    if (valid && result.measure !== 'proportion' && result.lower <= (ratio ? 1 : 0) && result.upper >= (ratio ? 1 : 0)) f.hint = 'CI includes no effect — hint, not a judgement.';
    if (valid && ratio) {
      var useDefault = user.acr === undefined || user.acr === null;
      var acr = useDefault ? result.defaultRisk : (String(user.acr).trim() === '' ? NaN : Number(user.acr));
      f.riskSource = useDefault ? (finite(result.defaultRisk) ? 'Default: median control-arm risk of included studies (unweighted).' : 'No comparator risk available; enter an assumed comparator risk.') : 'User-entered assumed comparator risk.';
      f.comparator = f.intervention = f.difference = 'Unavailable';
      try {
        f.absolute = absoluteEffects(result.measure, acr, result.estimate, result.lower, result.upper);
        var a = f.absolute;
        f.comparator = per1000(acr) + ' per 1,000';
        f.intervention = per1000(a.intervention) + ' [' + per1000(a.lower) + ', ' + per1000(a.upper) + '] per 1,000';
        f.difference = round(a.difference) + ' [' + round(a.differenceLower) + ', ' + round(a.differenceUpper) + '] per 1,000';
        f.absoluteNote = '95% CI holds comparator risk fixed; difference = intervention minus comparator. ' +
          (result.measure === 'HR' ? 'HR conversion assumes proportional hazards and the same follow-up time for comparator risk and effect. ' : '') +
          'Per 1,000 values rounded once to whole numbers, halves away from zero.';
      } catch (e) { f.absoluteNote = e.message; }
    } else if (valid && result.measure === 'proportion') {
      f.singleGroup = per1000(result.estimate) + ' [' + per1000(result.lower) + ', ' + per1000(result.upper) + '] per 1,000';
      f.absoluteNote = 'Single-group proportion (95% CI); no comparator or comparative difference.';
    } else if (valid) f.absoluteNote = 'Effect and 95% CI on the app’s input scale; no absolute-risk conversion for this measure.';
    return f;
  }
  function columns(f) {
    var pairs = [['Outcome', f.outcome], ['№ participants (studies)', f.participants], ['Relative effect / effect (95% CI)', f.measure + ': ' + f.effect], ['Model', f.model]];
    if (f.singleGroup) pairs.push(['Single-group risk (95% CI)', f.singleGroup]);
    else if (['RR', 'OR', 'HR'].indexOf(f.measure) >= 0) pairs.push(['Risk with comparator', f.comparator], ['Risk with intervention (95% CI)', f.intervention], ['Difference (95% CI)', f.difference]);
    return pairs.concat([['Certainty of evidence (user-selected)', f.certainty], ['Downgrade reasons (user-entered)', f.reasons], ['Comparator risk source', f.riskSource], ['Notes', f.absoluteNote], ['Advisory', f.hint], ['References', f.citation]]);
  }
  function csvCell(s) {
    s = String(s); if (/^[\s]*[=+@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;  // not '-': negative differences stay numbers
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv(f) { var c = columns(f); return c.map(function (p) { return csvCell(p[0]); }).join(',') + '\r\n' + c.map(function (p) { return csvCell(p[1]); }).join(',') + '\r\n'; }
  function copyText(f) { return 'Summary of findings\n' + columns(f).map(function (p) { return p[0] + ': ' + p[1]; }).join('\n'); }
  function xml(s) { return String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function docx(f, zip) {
    // Use AlmZip.docx for its OOXML package, then AlmZip.zip to add the table.
    // The shared writer's documented output is store-only; no compressor needed.
    var all = columns(f), certaintyAt = all.findIndex(function (pair) { return pair[0].indexOf('Certainty of evidence') === 0; });
    var primary = all.slice(0, certaintyAt + 1).filter(function (pair) { return pair[0] !== 'Model'; });
    var notes = [['Model', f.model]].concat(all.slice(certaintyAt + 1));
    var base = zip.docx({ title: 'Summary of findings', paragraphs: [{ text: 'Certainty and downgrade reasons are user-selected. Review them when the analysis changes.' }] });
    var view = new DataView(base.buffer, base.byteOffset, base.byteLength), files = [], p = 0, decoder = new TextDecoder();
    var table = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' + [0, 1].map(function (row) {
      return '<w:tr>' + primary.map(function (pair) { return '<w:tc><w:p><w:r>' + (row === 0 ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(pair[row]) + '</w:t></w:r></w:p></w:tc>'; }).join('') + '</w:tr>';
    }).join('') + '</w:tbl>' + notes.map(function (pair) {
      return (pair[0] + ': ' + pair[1]).split('\n').map(function (line) { return '<w:p><w:r><w:t xml:space="preserve">' + xml(line) + '</w:t></w:r></w:p>'; }).join('');
    }).join('');
    while (view.getUint32(p, true) === 0x04034b50) {
      var size = view.getUint32(p + 18, true), n = view.getUint16(p + 26, true), extra = view.getUint16(p + 28, true);
      var name = decoder.decode(base.subarray(p + 30, p + 30 + n)), start = p + 30 + n + extra, bytes = base.slice(start, start + size);
      files.push(name === 'word/document.xml' ? { name: name, string: decoder.decode(bytes).replace('<w:sectPr/>', table + '<w:sectPr/>') } : { name: name, bytes: bytes });
      p = start + size;
    }
    return zip.zip(files);
  }

  // Read-only adapters. No fitting, CI construction, statistical-engine calls,
  // transformations of generic effects, or fallback to shared-bus data.
  function readResult(app, env) {
    env = env || global;
    var d = env.document;
    function get(name) { return typeof env[name] === 'function' ? env[name]() : null; }
    function node(sel) { return d ? d.querySelector(sel) : null; }
    function card(label) {
      if (!d) return null;
      var cards = Array.prototype.slice.call(d.querySelectorAll('.stat'));
      var c = cards.find(function (e) { var k = e.querySelector('.k'); return k && k.textContent.indexOf(label) >= 0; });
      return c && c.querySelector('.v') ? c.querySelector('.v').textContent : null;
    }
    var r, rows = [], out = { measure: 'Effect', n: null, estimate: null, lower: null, upper: null };
    if (app === 'heterogeneity') {
      r = get('_almLastFE'); if (!r || !r.sum) return null;
      Object.assign(out, { estimate: r.sum.mu, lower: r.sum.ciLoHKSJ, upper: r.sum.ciHiHKSJ, k: r.sum.k, display: card('modified HK'), model: 'Random effects, modified HK + t (input scale)' });
      rows = get('_almLastStudies') || [];
    } else if (app === 'mh-peto') {
      r = get('_almLastMhPeto'); if (!r) return null;
      Object.assign(out, { estimate: r.mh_est, lower: r.mh_lo, upper: r.mh_hi, measure: r.measure, k: r.k, model: 'Mantel–Haenszel, fixed effect; counts as entered' });
      var src = node('#src');
      if (src && env.__mhValidation) rows = env.__mhValidation.parse(src.value);
      out.defaultRisk = medianControlRisk(rows);
      var tr = node('#pooled-body tr');
      if (tr && tr.cells.length >= 3 && finite(r.mh_est)) out.display = tr.cells[1].textContent + ' ' + tr.cells[2].textContent;
    } else if (app === 'proportion-ma') {
      r = get('_almLastPropMA'); if (!r) return null;
      Object.assign(out, { estimate: r.poolP, lower: r.poolLo, upper: r.poolHi, measure: 'proportion', k: r.k, model: 'Single-group proportion; ' + r.transform + '; ' + r.tauEstimator });
      var snap = env.__almPropValidation && env.__almPropValidation.snapshot(); rows = snap ? snap.studies : [];
      var pooled = node('#res-body tr.pooled-row');
      if (pooled) out.display = pooled.cells[2].textContent + ' [' + pooled.cells[3].textContent + ']';
    } else if (app === 'correlation-ma') {
      r = get('_almLastCorrMA'); if (!r) return null;
      Object.assign(out, { estimate: r.r, lower: r.r_lo, upper: r.r_hi, measure: 'r', k: r.k, model: 'Correlation; ' + r.method }); rows = r.studies;
    } else if (app === 'influence') {
      r = get('_almLastInfluence'); if (!r) return null;
      Object.assign(out, { estimate: r.mu, lower: r.ciLo, upper: r.ciHi, k: r.k, model: 'Full model, all included studies (input scale)' }); rows = get('_almStudies') || [];
      // The host shows four decimals in its model summary. Preserve those
      // strings and always take the full-model column, even during exclusions.
      // Numeric values above remain unrounded for advisory hints.
      if (d) {
        var modelRows = Array.prototype.slice.call(d.querySelectorAll('#model-body tr'));
        var mainCells = ['Pooled estimate', '95% CI lower', '95% CI upper'].map(function (label) {
          var row = modelRows.find(function (tr) { return tr.cells.length > 1 && tr.cells[0].textContent.trim() === label; });
          return row ? row.cells[1].textContent : null;
        });
        if (mainCells.every(function (value) { return value !== null; })) out.display = mainCells[0] + ' [' + mainCells[1] + ', ' + mainCells[2] + ']';
      }
    } else if (app === 'limit-ma') {
      r = get('_almLastLimit'); if (!r) return null;
      Object.assign(out, { estimate: r.limit_est, lower: r.limit_ci_lo, upper: r.limit_ci_hi, k: r.k, model: 'Limit meta-analysis (Rücker), input scale' });
    } else if (app === 'cumulative-subgroup') {
      r = get('_almLastCumSub'); if (!r) return null;
      var sub = r.view === 'subgroup';
      Object.assign(out, { estimate: sub ? r.overall_mu : r.mu_final, lower: sub ? r.overall_lo : r.lo_final, upper: sub ? r.overall_hi : r.hi_final, k: r.k,
        display: card(sub ? 'Overall pooled' : 'Final pooled'), model: sub ? 'Overall pooled, all subgroups (input scale)' : 'Final cumulative pooled estimate (input scale)' });
    } else if (app === 'meta-regression') {
      if (!get('_almLastFitted')) return null;
      // Keep the page's display, but use its own result accessor for precision:
      // a CI bound rounded to zero must not create a false no-effect hint.
      // Older hosts supply only the displayed interval. Never construct a CI.
      var display = card('intercept'), nums = display && display.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi);
      var main = typeof env.__almResults === 'function' ? env.__almResults() || {} : null;
      rows = get('_almLastStudies') || [];
      Object.assign(out, { estimate: main ? main.intercept : nums && Number(nums[0]),
        lower: main ? main.intercept_ci_lb : nums && Number(nums[1]), upper: main ? main.intercept_ci_ub : nums && Number(nums[2]),
        display: display, k: rows.length, model: 'Main model intercept at moderator = 0; HKSJ (input scale)' });
    } else if (app === 'pubbias-tests') {
      r = get('_almLastPubbias'); if (!r) return null;
      Object.assign(out, { k: r.k, model: 'Publication-bias tests', unavailable: 'The app does not supply a main pooled effect with a 95% CI. No effect or interval has been recomputed.' });
      var binaryInput = node('#src');
      if (r.format === 'binary' && binaryInput && env.__almPubBiasEngine) rows = env.__almPubBiasEngine.parseBinary(binaryInput.value);
    } else return null;
    out.n = participants(rows);
    return out;
  }

  // Install before the host's DOMContentLoaded autosave callback. Keep its
  // selector order (and therefore positional draft keys), excluding only this
  // panel, whose inputs are persisted separately below.
  function isolateAutosave(app) {
    var autosave = global.AlmAutosave;
    if (!autosave || typeof autosave.install !== 'function') return;
    var install = autosave.install;
    autosave.install = function (options) {
      if (!options || options.appKey !== app) return install.apply(this, arguments);
      var selectors = Array.isArray(options.selectors) && options.selectors.length ? options.selectors :
        ['textarea', 'select', 'input[type=text]', 'input[type=number]', 'input[type=checkbox]', 'input[type=radio]', 'input[type=range]'];
      return install.call(this, Object.assign({}, options, { selectors: selectors.map(function (s) { return ':is(' + s + '):not(#alm-sof *)'; }) }));
    };
  }

  function mount(app) {
    var d = global.document; if (!d || d.getElementById('alm-sof')) return;
    var css = d.createElement('link'); css.rel = 'stylesheet'; css.href = '../shared/alm-sof.css'; d.head.appendChild(css);
    var host = d.createElement('section'); host.id = 'alm-sof'; host.setAttribute('aria-labelledby', 'alm-sof-title');
    host.innerHTML = '<h2 id="alm-sof-title">Summary of findings</h2>' +
      '<p>Certainty is your GRADE assessment. This tool never assigns it. Review your saved choice and reasons whenever the analysis changes.</p>' +
      '<div class="sof-controls"><label>Outcome<input id="sof-outcome" type="text"></label>' +
      '<label>Certainty of evidence<select id="sof-certainty"><option value="">Select certainty</option>' + RATINGS.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select></label>' +
      '<label id="sof-risk-label">Assumed comparator risk (proportion)<input id="sof-risk" type="number" step="any" min="0" max="1" aria-describedby="sof-risk-source"></label></div>' +
      '<p id="sof-risk-source" data-sof="risk-source"></p><fieldset><legend>User-entered downgrade reasons</legend>' + DOMAINS.map(function (name, i) { return '<label>' + name + ' downgrade reason<textarea id="sof-reason-' + i + '" rows="2"></textarea></label>'; }).join('') + '</fieldset>' +
      '<div class="sof-scroll"><table><caption>Summary of findings — app results and user-selected certainty</caption><thead></thead><tbody></tbody></table></div>' +
      '<p data-sof="model"></p><p data-sof="absolute-note"></p><p data-sof="hint"></p><p data-sof="status" role="status"></p>' +
      '<div class="sof-actions"><button type="button" data-export="CSV">Export CSV</button><button type="button" data-export="DOCX">Export DOCX</button><button type="button" data-export="copy">Copy table</button><button type="button" id="sof-default">Use median control risk</button></div><p class="sof-references"></p>';
    // Keep the archived main/results/plot geometry unchanged. Some older
    // hosts have no feature panel; their safe fallback is the end of body.
    var features = d.getElementById('alm-features');
    if (features && !features.closest('main')) features.insertAdjacentElement('afterend', host);
    else d.body.appendChild(host);
    host.querySelector('.sof-references').textContent = CITATION;
    var key = 'alm-sof-v1:' + app, user = { outcome: '', certainty: '', reasons: {} }, current = null, available = false, lastRender = '';
    try { var saved = JSON.parse(global.localStorage.getItem(key)); if (saved && typeof saved === 'object') user = { outcome: typeof saved.outcome === 'string' ? saved.outcome : '', certainty: RATINGS.indexOf(saved.certainty) >= 0 ? saved.certainty : '', reasons: saved.reasons && typeof saved.reasons === 'object' ? saved.reasons : {}, acr: typeof saved.acr === 'string' ? saved.acr : undefined }; } catch (e) { /* Storage is optional. */ }
    var outcome = host.querySelector('#sof-outcome'), certainty = host.querySelector('#sof-certainty'), acr = host.querySelector('#sof-risk');
    outcome.value = user.outcome; certainty.value = user.certainty; acr.value = user.acr === undefined ? '' : user.acr;
    DOMAINS.forEach(function (name, i) { host.querySelector('#sof-reason-' + i).value = user.reasons[name.toLowerCase()] || ''; });
    function save() { try { global.localStorage.setItem(key, JSON.stringify(user)); } catch (e) { host.querySelector('[data-sof="status"]').textContent = 'Browser storage unavailable; changes last for this page session.'; } }
    function text(key, value) { var el = host.querySelector('[data-sof="' + key + '"]'); if (el && el.textContent !== value) el.textContent = value; }
    function refresh() {
      // Corpus replay owns the disabled state until it restores the page.
      // Do not publish transient replay results or re-enable its locked buttons.
      if (outcome.disabled) return;
      var status = d.getElementById('analysis-status'), stale = d.getElementById('analysis-stale'), r = null;
      var blocked = (stale && !stale.hidden) || (status && status.hidden);
      try { if (!blocked) r = readResult(app); } catch (e) { r = null; }
      available = !!r; current = buildFinding(r, user);
      var fingerprint = JSON.stringify([r, user, blocked]); if (fingerprint === lastRender) return; lastRender = fingerprint;
      // Preserve this render's unrounded calculation for independent numerical
      // checks. Visible cells retain the documented whole-number rounding.
      // Invalid/stale input explicitly clears it, rather than retaining values.
      host.dataset.sofAbsolute = JSON.stringify(current.absolute);
      var ratio = r && ['RR', 'OR', 'HR'].indexOf(r.measure) >= 0;
      host.querySelector('#sof-risk-label').hidden = !ratio;
      host.querySelector('#sof-default').hidden = !ratio;
      // A default is not a user edit. Changing .value here changes the host's
      // validation fingerprint after live R has captured its input revision.
      acr.placeholder = r && finite(r.defaultRisk) ? String(r.defaultRisk) : '';
      text('risk-source', current.riskSource); text('model', current.model); text('absolute-note', current.absoluteNote); text('hint', current.hint);
      text('status', r ? '' : 'Run a valid analysis to display and export current findings.');
      var cells = [['Outcome', current.outcome, 'outcome'], ['№ participants (studies)', current.participants, 'participants'], ['Relative effect / effect (95% CI): ' + current.measure, current.effect, 'effect']];
      if (ratio) cells = cells.concat([['Risk with comparator', current.comparator, 'comparator'], ['Risk with intervention (95% CI)', current.intervention, 'intervention'], ['Difference (95% CI)', current.difference, 'difference']]);
      if (current.singleGroup) cells.push(['Single-group risk (95% CI)', current.singleGroup, 'single-group']);
      cells.push(['Certainty of evidence (user-selected)', current.certainty, 'certainty']);
      var head = host.querySelector('thead'), body = host.querySelector('tbody'); head.replaceChildren(); body.replaceChildren();
      var hr = d.createElement('tr'), br = d.createElement('tr');
      cells.forEach(function (c) { var th = d.createElement('th'), td = d.createElement('td'); th.scope = 'col'; th.textContent = c[0]; td.textContent = c[1]; td.dataset.sof = c[2]; hr.appendChild(th); br.appendChild(td); });
      head.appendChild(hr); body.appendChild(br);
      host.querySelectorAll('[data-export]').forEach(function (button) { button.disabled = !available || (button.dataset.export === 'DOCX' && !global.AlmZip); });
    }
    host.addEventListener('input', function (e) {
      if (e.target === outcome) user.outcome = outcome.value;
      if (e.target === certainty) user.certainty = certainty.value;
      if (e.target === acr) user.acr = acr.value;
      DOMAINS.forEach(function (name, i) { if (e.target.id === 'sof-reason-' + i) user.reasons[name.toLowerCase()] = e.target.value; });
      save(); refresh();
    });
    host.addEventListener('change', function (e) { if (e.target === certainty) { user.certainty = certainty.value; save(); refresh(); } });
    host.querySelector('#sof-default').addEventListener('click', function () { delete user.acr; acr.value = ''; save(); refresh(); });
    host.addEventListener('click', async function (e) {
      var kind = e.target.dataset.export; if (!kind) return; refresh(); if (!available) return;
      try {
        if (kind === 'copy') {
          await global.navigator.clipboard.writeText(copyText(current)); text('status', 'Table copied.');
        } else {
          var data = kind === 'CSV' ? csv(current) : docx(current, global.AlmZip);
          var url = global.URL.createObjectURL(new Blob([data], { type: kind === 'CSV' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
          var a = d.createElement('a'); a.href = url; a.download = app + '-summary-of-findings.' + kind.toLowerCase(); d.body.appendChild(a); a.click(); a.remove(); global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
        }
      } catch (error) { text('status', 'Export failed: ' + error.message); }
    });
    var pending = false;
    function schedule() { if (!pending) { pending = true; global.setTimeout(function () { pending = false; refresh(); }, 0); } }
    ['input', 'change', 'click'].forEach(function (event) { d.addEventListener(event, function (e) { if (!host.contains(e.target)) schedule(); }); });
    new global.MutationObserver(function (changes) { if (changes.some(function (m) { return !host.contains(m.target) || (m.target === outcome && m.attributeName === 'disabled'); })) schedule(); }).observe(d.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
    refresh();
  }
  var api = { risk: risk, absoluteEffects: absoluteEffects, round: round, per1000: per1000, participants: participants, medianControlRisk: medianControlRisk, buildFinding: buildFinding, csv: csv, docx: docx, copyText: copyText, readResult: readResult, mount: mount };
  global.AlmSoF = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.document) {
    var script = global.document.currentScript, app = script && script.getAttribute('data-alm-sof-app');
    if (app) { isolateAutosave(app); if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', function () { mount(app); }); else mount(app); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
