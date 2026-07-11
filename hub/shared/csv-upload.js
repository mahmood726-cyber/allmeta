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
      if (value === '') {
        return { value: null, err: 'missing int' };
      }
      var n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { value: null, err: 'not int: ' + value };
      }
      return { value: n };
    }
    if (type === 'float') {
      if (value === '') {
        return { value: null, err: 'missing float' };
      }
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

  const _STYLE = `.alm-csv{display:grid;gap:.6rem;font:13px/1.4 system-ui,sans-serif}.alm-csv-row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.alm-csv input[type=file]{font:inherit}.alm-csv textarea{min-height:6rem;width:100%;font:12px/1.35 ui-monospace,Consolas,monospace;padding:.4rem;border:1px solid var(--border,#cbd5e1);border-radius:6px;background:var(--input-bg,#fff);color:var(--ink,#15181d)}.alm-csv button{padding:.3rem .6rem;border:1px solid var(--border,#cbd5e1);border-radius:6px;background:var(--panel,#fff);color:var(--ink,#15181d);cursor:pointer;font:inherit}.alm-csv details summary{cursor:pointer;font-weight:600}.alm-csv [data-section=warnings]{color:#b45309;font-size:12px}.alm-csv [data-section=warnings]:empty{display:none}.alm-csv table{border-collapse:collapse;font-size:12px;margin-top:.4rem}.alm-csv th,.alm-csv td{padding:.2rem .4rem;border:1px solid var(--border,#e2e8f0);text-align:left}@media (prefers-color-scheme:dark){.alm-csv textarea{background:var(--input-bg,#23272c);color:var(--ink,#e7e4dc);border-color:var(--border,#3a4048)}.alm-csv button{background:var(--panel,#23272c);color:var(--ink,#e7e4dc);border-color:var(--border,#3a4048)}.alm-csv [data-section=warnings]{color:#e0a85e}.alm-csv th,.alm-csv td{border-color:var(--border,#3a4048)}}`;
  let _stylesInjected = false;
  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s); _stylesInjected = true;
  }
  function _formatPanel(columns) {
    const rows = columns.map(c =>
      `<tr><td>${c.name}</td><td>${c.type || 'string'}</td><td>${c.required ? 'yes' : ''}</td><td>${c.example != null ? c.example : ''}</td></tr>`
    ).join('');
    return `<details data-section="format" open><summary>Expected CSV format</summary>
      <table><thead><tr><th>column</th><th>type</th><th>required</th><th>example</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:.4rem"><button type="button" data-action="sample">Download sample CSV</button></p>
    </details>`;
  }
  function _sampleCSV(columns) {
    const header = columns.map(c => c.name).join(',');
    const example = columns.map(c => {
      if (c.example != null) return c.example;
      if (c.type === 'int') return '1';
      if (c.type === 'float') return '0.1';
      return c.name === 'study' ? 'StudyA' : 'x';
    }).join(',');
    return header + '\n' + example;
  }
  function _download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) { console.warn('[alm.csvUpload] target not found'); return; }
    const columns = opts.columns || [];
    const onParse = typeof opts.onParse === 'function' ? opts.onParse : () => {};
    _ensureStyle();
    target.innerHTML = `
      <div class="alm-csv">
        <div class="alm-csv-row">
          <label>Upload CSV: <input type="file" accept=".csv,text/csv"></label>
          <span>or paste below:</span>
        </div>
        <textarea placeholder="Paste CSV here (with header row)"></textarea>
        <div class="alm-csv-row">
          <button type="button" data-action="parse-paste">Parse pasted text</button>
        </div>
        <div data-section="warnings"></div>
        ${_formatPanel(columns)}
      </div>`;
    const fileInput = target.querySelector('input[type="file"]');
    const ta = target.querySelector('textarea');
    const warnEl = target.querySelector('[data-section="warnings"]');
    function _emit(text) {
      const result = parse(text, columns);
      warnEl.innerHTML = result.warnings.map(w => '<div>' + String.fromCharCode(8226) + ' ' + w + '</div>').join('');
      onParse(result);
    }
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => _emit(String(reader.result));
      reader.readAsText(f);
    });
    target.querySelector('[data-action="parse-paste"]').addEventListener('click', () => {
      _emit(ta.value);
    });
    target.querySelector('[data-action="sample"]').addEventListener('click', () => {
      _download(new Blob([_sampleCSV(columns)], { type: 'text/csv' }), 'sample.csv');
    });
  }

  // Attach parse directly onto init so callers can use
  // window.alm.csvUpload.parse(text, columns).
  init.parse = parse;

  window.alm = window.alm || {};
  window.alm.csvUpload = init;
})();
