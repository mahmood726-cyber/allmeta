/* hub/shared/decimal-sep.js — the one decimal-separator rule for pasted study rows (Mahmood 2026-10-31:
 * "Comma decimals: add an explicit decimal-separator setting, defaulting to '.'; warn when input looks ambiguous.").
 *
 * Numbers are read with the strict whole-token rule already used by csv-upload.js _coerce and
 * proportion-ma/row-check.js: /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/ after trimming, with the decimal
 * separator swapped for ',' when the user selects it. Nothing is ever reinterpreted silently:
 *   - '.' (the default): the text an app parses is returned UNCHANGED, so every existing result is identical.
 *     Rows that look like they hold a decimal comma (a field such as "0,1" between tabs/semicolons, or a
 *     digit-comma-digit in a comma-delimited row) are only REPORTED, as a non-blocking warning naming the rows.
 *   - ',': a comma cannot be both the decimal separator and the field delimiter, so every data row must
 *     separate its fields with tabs or semicolons. A row that does not is refused with that reason. Each field
 *     that is a strict comma-decimal number is rewritten to the '.' form; a field that is a '.' number, or that
 *     starts like a number but is not one, is refused. The rows are then re-joined with the app's own delimiter
 *     so the app's existing parser (and its existing validation) reads them unchanged.
 * Line count is preserved one-to-one (a refused row becomes an empty line), so the app's line numbers stay right.
 * The user's text is never rewritten: only the copy handed to the parser.
 */
(function (root) {
  'use strict';
  var DOT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  var COMMA = /^[+-]?(\d+,?\d*|,\d+)([eE][+-]?\d+)?$/;
  var AMBIGUOUS_FIELD = /^[+-]?\d+,\d+$/;
  var NUMBERISH = /^[+-]?[\d.,]/;

  // '.' for the default (absent, null, '' or '.'), ',' for comma, null for anything else (callers refuse it).
  function normalize(sep) {
    if (sep === undefined || sep === null || sep === '' || sep === '.') return '.';
    if (sep === ',') return ',';
    return null;
  }

  // Strict number for one token under the chosen separator; NaN when the whole token is not a number.
  function parseNumber(token, sep) {
    var s = normalize(sep);
    var t = String(token == null ? '' : token).trim();
    if (s === '.') return DOT.test(t) ? Number(t) : NaN;
    if (s === ',') return COMMA.test(t) ? Number(t.replace(',', '.')) : NaN;
    return NaN;
  }

  function isComment(line, opts) {
    var t = line.trim();
    if (!t) return true;
    var c = opts && opts.comment !== undefined ? opts.comment : '#';
    return !!c && t.charAt(0) === c;
  }

  // The delimiter a ','-mode row uses: tab if present, else semicolon, else none (refused).
  function rowDelimiter(line) {
    if (line.indexOf('\t') >= 0) return '\t';
    if (line.indexOf(';') >= 0) return ';';
    return null;
  }

  function quoteField(f) { return '"' + f.replace(/"/g, '""') + '"'; }

  function shown(line) { var t = line.trim(); return t.length > 60 ? t.slice(0, 57) + '...' : t; }

  // '.'-mode check: rows whose tokens look like a decimal comma. Returns [{line, text, tokens}].
  // opts.expect: the fixed number of comma-separated fields the format has (if it has one); a comma row with
  // exactly one more field than that and a digit-comma-digit is flagged even when written without spaces.
  function ambiguousRows(text, opts) {
    opts = opts || {};
    var out = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line, i) {
      if (isComment(line, opts)) return;
      var tokens = [];
      var d = rowDelimiter(line);
      if (d) {
        line.split(d).forEach(function (f) { if (AMBIGUOUS_FIELD.test(f.trim())) tokens.push(f.trim()); });
      } else {
        // Quoted text (a label such as "Davis, BH") is neither a number nor a delimiter.
        var bare = line.replace(/"(?:[^"]|"")*"/g, '""');
        // A whole digit,digit token: "1,0.61" is "1" then "0.61", not a decimal comma.
        var m = [], re = /(?:^|[^\d.+-])([+-]?\d+,\d+)(?![\d.])/g, hit;
        while ((hit = re.exec(bare))) m.push(hit[1]);
        if (m.length) {
          // A comma with whitespace next to it is a field delimiter, so a bare digit,digit in the same row is
          // not one: "Eta, 0,1, 0.1". Without spaces, only an exact one-extra-field count gives it away.
          var spaced = /\s,|,\s/.test(bare);
          var extra = typeof opts.expect === 'number' && line.split(',').length === opts.expect + 1;
          if (spaced || extra) tokens = m;
        }
      }
      if (tokens.length) out.push({ line: i + 1, text: shown(line), tokens: tokens });
    });
    return out;
  }

  // One warning sentence for the app's existing note UI (or '' when there is nothing to say).
  function ambiguityMessage(rows) {
    if (!rows || !rows.length) return '';
    var list = rows.slice(0, 5).map(function (r) { return 'line ' + r.line + ' ("' + r.tokens[0] + '")'; }).join(', ') +
      (rows.length > 5 ? ' and ' + (rows.length - 5) + ' more' : '');
    return 'Possible decimal comma' + (rows.length > 1 ? 's' : '') + ' on ' + list + ': numbers are read with "." as the ' +
      'decimal separator, so a comma splits a number into two fields. If your data use decimal commas, set ' +
      'Decimal separator to "," and separate fields with tabs or semicolons.';
  }

  /**
   * prepare(text, sep, opts) -> { sep, text, errors: [{line, text, reason}], ambiguous: [...], warning }
   *   opts.join    the delimiter the app's parser expects between fields (default ', ')
   *   opts.quote   quote a re-joined field that contains a comma, tab or quote (for parsers that read quotes)
   *   opts.expect  fixed field count of the format, for the '.'-mode ambiguity check
   *   opts.comment comment prefix (default '#'); comment and blank lines pass through untouched
   */
  function prepare(text, sep, opts) {
    opts = opts || {};
    var s = normalize(sep);
    var src = String(text == null ? '' : text);
    if (s === '.') {
      var amb = ambiguousRows(src, opts);
      return { sep: '.', text: src, errors: [], ambiguous: amb, warning: ambiguityMessage(amb) };
    }
    if (s === null) {
      return { sep: null, text: '', errors: [{ line: 0, text: '', reason: 'unknown decimal separator "' + String(sep) + '"' }], ambiguous: [], warning: '' };
    }
    var join = opts.join == null ? ', ' : opts.join;
    var errors = [];
    var lines = src.split(/\r?\n/).map(function (line, i) {
      if (isComment(line, opts)) return line;
      var d = rowDelimiter(line);
      if (!d) {
        errors.push({ line: i + 1, text: shown(line), reason: 'the decimal separator is set to ",", so fields must be separated by tabs or semicolons; this row has neither' });
        return '';
      }
      var bad = null;
      var fields = line.split(d).map(function (raw) {
        var f = raw.trim();
        if (bad) return f;
        if (COMMA.test(f)) return f.replace(',', '.');
        if (DOT.test(f) && f.indexOf('.') >= 0) { bad = '"' + f + '" uses "." but the decimal separator is set to ","'; return f; }
        if (NUMBERISH.test(f) && !/\s/.test(f) && /[.,]/.test(f)) { bad = '"' + f + '" is not a number written with a decimal comma'; return f; }
        return opts.quote && /[,\t"]/.test(f) ? quoteField(f) : f;
      });
      if (bad) { errors.push({ line: i + 1, text: shown(line), reason: bad }); return ''; }
      return fields.join(join);
    });
    return { sep: ',', text: lines.join('\n'), errors: errors, ambiguous: [], warning: '' };
  }

  // Each refused row as "Line N (text): reason" for an app's existing warning list.
  function errorMessages(prep) {
    return (prep && prep.errors || []).map(function (e) { return 'Line ' + e.line + (e.text ? ' (' + e.text + ')' : '') + ': ' + e.reason; });
  }

  // Sentence for exported Methods/notes; '' for the default so existing exports are unchanged.
  function methodsNote(sep) {
    return normalize(sep) === ',' ? 'Numbers were entered with a decimal comma (","), fields separated by tabs or semicolons; they were read as decimal numbers before analysis.' : '';
  }

  // The current setting from a <select> (default '.'), tolerant of a page without the control.
  function read(id) {
    var doc = root.document;
    var el = doc && doc.getElementById ? doc.getElementById(id || 'f-decsep') : null;
    var s = el ? normalize(el.value) : '.';
    return s === null ? '.' : s;
  }

  // Restore from saved/shared state: a state without the field (every link made before the setting existed)
  // restores the default '.'. Returns the value applied, or null when the stored value is not a separator
  // (the control is then set to the default '.', never left at a value the state did not ask for).
  function restore(id, value) {
    var s = normalize(value);
    var doc = root.document;
    var el = doc && doc.getElementById ? doc.getElementById(id || 'f-decsep') : null;
    if (el) el.value = s === null ? '.' : s;
    return s;
  }

  // Autosave. The setting is kept OUT of shared/autosave.js's draft (its saved key set and positional idx:N keys are
  // pinned per app, so a new control would shift them) and stored beside it under "alm-decsep:<app>", saved whenever
  // the page's inputs change (the same events the draft is saved on). Pressing the draft banner's Restore puts the
  // separator back with the data it was saved with. A share link still wins: it restores its own value ('.' if absent).
  function persist(id, app) {
    var doc = root.document;
    if (!doc || !doc.addEventListener) return;
    var key = 'alm-decsep:' + app;
    function el() { return doc.getElementById(id || 'f-decsep'); }
    function save() {
      var e = el(); if (!e) return;
      try { root.localStorage.setItem(key, normalize(e.value) === ',' ? ',' : '.'); } catch (_) { /* storage unavailable */ }
    }
    doc.addEventListener('input', save, true);
    doc.addEventListener('change', save, true);
    // Capture phase: runs before the banner's own Restore handler, so the data it restores is read with this separator.
    doc.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      var banner = b && b.parentElement;
      if (!b || b.textContent !== 'Restore' || !banner || banner.parentElement !== doc.body || banner.getAttribute('role') !== 'status') return;
      var v = null;
      try { v = root.localStorage.getItem(key); } catch (_) { return; }
      var e = el();
      if (!e || (v !== ',' && v !== '.') || e.value === v) return;
      e.value = v;
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, true);
  }

  var api = { persist: persist, DOT: DOT, COMMA: COMMA, normalize: normalize, parseNumber: parseNumber, ambiguousRows: ambiguousRows,
    ambiguityMessage: ambiguityMessage, prepare: prepare, errorMessages: errorMessages, methodsNote: methodsNote,
    read: read, restore: restore };
  root.AlmDecimalSep = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
