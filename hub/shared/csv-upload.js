(function () {
  // Levenshtein distance <= 3 (early-exit) — used for fuzzy column matching.
  function _lev(a, b, max) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev = Array.from({ length: lb + 1 }, function (_, i) { return i; });
    for (var i = 1; i <= la; i++) {
      var curr = [i];
      var rowMin = i;
      for (var j = 1; j <= lb; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (rowMin > max) return max + 1;
      prev = curr;
    }
    return prev[lb];
  }

  // RFC-4180 parser. Handles quoted fields (embedded commas, newlines,
  // doubled-quote escapes). Returns array of arrays of strings.
  function _splitCSV(text) {
    var rows = [];
    var row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"' && field === '') { inQuotes = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* swallow CR in CRLF */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += c; }
      }
    }
    // Flush final field/row (no trailing newline).
    if (field.length || row.length) { row.push(field); rows.push(row); }
    // Drop trailing empty row that some editors append.
    if (rows.length &&
        rows[rows.length - 1].length === 1 &&
        rows[rows.length - 1][0] === '') {
      rows.pop();
    }
    return rows;
  }

  function _coerce(value, type) {
    if (type === 'int') {
      var n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { value: null, err: 'not int: ' + value };
      }
      return { value: n };
    }
    if (type === 'float') {
      var f = Number(value);
      if (!Number.isFinite(f)) {
        return { value: null, err: 'not float: ' + value };
      }
      return { value: f };
    }
    return { value: value };
  }

  /**
   * parse(text, columns) -> { headers, rows, warnings }
   *
   * text    — raw CSV string (RFC-4180)
   * columns — array of { name: string, type?: 'int'|'float'|'string' }
   *
   * Fuzzy header matching: any header within Levenshtein <= 2 of a declared
   * column name is silently remapped (with a warning in the warnings array).
   */
  function parse(text, columns) {
    columns = columns || [];
    var warnings = [];
    var matrix = _splitCSV(text);
    if (matrix.length === 0) {
      return { headers: [], rows: [], warnings: ['empty CSV'] };
    }
    var rawHeaders = matrix[0].map(function (h) { return h.trim(); });

    // Build headerMap: raw header string -> column descriptor (possibly fuzzy).
    var headerMap = {};
    for (var hi = 0; hi < rawHeaders.length; hi++) {
      var h = rawHeaders[hi];
      var bestCol = null, bestDist = Infinity;
      for (var ci = 0; ci < columns.length; ci++) {
        var d = _lev(h, columns[ci].name, 3);
        if (d < bestDist) { bestDist = d; bestCol = columns[ci]; }
      }
      if (bestCol && bestDist === 0) {
        // Exact match.
        headerMap[h] = bestCol;
      } else if (bestCol && bestDist <= 2) {
        // Fuzzy match — remap silently with a warning.
        headerMap[h] = bestCol;
        warnings.push('Header "' + h + '" mapped to "' + bestCol.name + '" (Levenshtein ' + bestDist + ')');
      } else {
        // Unknown header — pass through as a plain string column.
        headerMap[h] = { name: h };
      }
    }

    var rows = [];
    for (var r = 1; r < matrix.length; r++) {
      var rowArr = matrix[r];
      var obj = {};
      for (var i = 0; i < rawHeaders.length; i++) {
        var col = headerMap[rawHeaders[i]];
        var raw = (rowArr[i] !== undefined ? rowArr[i] : '').trim();
        var result = _coerce(raw, col.type);
        if (result.err) {
          warnings.push('row ' + r + ': ' + result.err);
        }
        obj[col.name] = result.value;
      }
      rows.push(obj);
    }

    return { headers: rawHeaders, rows: rows, warnings: warnings };
  }

  // Public init — parser-only in this task; DOM/UI lands in Task 9.
  function init(opts) {
    opts = opts || {};
    var target = null;
    if (typeof opts.target === 'string') {
      target = document.querySelector(opts.target);
    } else if (opts.target) {
      target = opts.target;
    }
    if (!target) {
      console.warn('[alm.csvUpload] target not found');
      return;
    }
    console.warn('[alm.csvUpload] UI not yet implemented (Task 9 pending)');
  }

  // Attach parse directly onto init so callers can use
  // window.alm.csvUpload.parse(text, columns).
  init.parse = parse;

  window.alm = window.alm || {};
  window.alm.csvUpload = init;
})();
