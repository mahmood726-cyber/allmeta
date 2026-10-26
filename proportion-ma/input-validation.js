/* App-local count validation; shared CSV and pooling engines stay unchanged. */
(function () {
  'use strict';
  function fail(row, label, reason) {
    throw new Error('Row ' + row + ' (' + label + '): ' + reason + '. Correct this row and run again.');
  }
  // Preserve physical row numbers, quoted labels and empty records. A final
  // newline terminates the last record; it does not introduce another record.
  function records(text, header) {
    text = String(text).replace(/^\uFEFF/, '');
    var rows = [], fields = [], field = '', quoted = false, closed = false, line = 1, start = 1;
    function quoteError(reason) {
      fail(start, fields[2] || (fields.length === 2 && field.trim()) || ('Study ' + (rows.length + (header ? 0 : 1))), reason);
    }
    function endField() { fields.push(field.trim()); field = ''; closed = false; }
    function endRow() { endField(); rows.push({row:start, fields:fields}); fields = []; start = line + 1; }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; }
        else if (c === '\r' || c === '\n') {
          field += '\n'; line++;
          if (c === '\r' && text[i + 1] === '\n') i++;
        } else field += c;
      } else if (c === ',') endField();
      else if (c === '\r' || c === '\n') {
        endRow(); line++;
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else if (c === '"') {
        if (field.trim() || closed) quoteError('unexpected quote');
        field = ''; quoted = true;
      } else {
        if (closed && c.trim()) quoteError('unexpected text after closing quote');
        field += c;
      }
    }
    if (quoted) quoteError('unclosed quote');
    if (field.length || fields.length || closed || !rows.length) endRow();
    return rows;
  }
  function count(token, name, row, label) {
    if (!token) fail(row, label, name + ' is empty');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token) || !Number.isFinite(Number(token)))
      fail(row, label, name + ' must be a complete finite decimal number');
    var value = Number(token);
    // Check spelling too: Number('12.0000000000000001') rounds to 12 even
    // though the supplied count is not exactly integral.
    var pieces = token.toLowerCase().split('e'), coefficient = pieces[0].replace(/^[+-]/, '');
    var decimals = (coefficient.split('.')[1] || '').length - Number(pieces[1] || 0);
    var digits = coefficient.replace('.', '');
    if (!Number.isInteger(value) || (decimals > 0 && /[1-9]/.test(digits.slice(-decimals))))
      fail(row, label, name + ' must be a whole number (no rounding or truncation)');
    if (!Number.isSafeInteger(value)) fail(row, label, name + ' must be a safe integer');
    if (name === 'events' && value < 0) fail(row, label, 'events cannot be negative');
    if (name === 'total' && value <= 0) fail(row, label, 'total must be positive');
    return value;
  }
  function study(record, index, columns) {
    var p = record.fields, label = p[columns ? columns.indexOf('label') : 2] || ('Study ' + (index + 1));
    if (p.every(function (s) { return !s; })) fail(record.row, label, 'empty row');
    if (columns ? p.length !== columns.length : p.length < 2 || p.length > 3)
      fail(record.row, label, 'expected ' + (columns ? columns.length : '2 or 3') + ' fields (events, total, optional label); found ' + p.length);
    var x = count(p[columns ? columns.indexOf('events') : 0], 'events', record.row, label);
    var n = count(p[columns ? columns.indexOf('total') : 1], 'total', record.row, label);
    if (x > n) fail(record.row, label, 'events (' + x + ') exceed total (' + n + ')');
    return {x:x, n:n, label:label};
  }
  function parse(text) { return records(text, false).map(function (r, i) { return study(r, i); }); }
  function upload(text) {
    try {
      var all = records(text, true), headers = all.shift().fields;
      var columns = headers.map(function (h) {
        h = h.toLowerCase();
        return ({x:'events', n:'total', study:'label'})[h] || h;
      });
      if (columns.length < 2 || columns.length > 3 || new Set(columns).size !== columns.length ||
          columns.indexOf('events') < 0 || columns.indexOf('total') < 0 ||
          columns.some(function (c) { return ['events','total','label'].indexOf(c) < 0; }))
        fail(1, 'header', 'use unique events and total headers, with an optional label header');
      if (!all.length) fail(2, 'Study 1', 'empty dataset');
      var rows = all.map(function (r, i) {
        var s = study(r, i, columns);
        return {events:s.x, total:s.n, label:s.label};
      });
      return {headers:headers, rows:rows, warnings:[]};
    } catch (e) { return {headers:[], rows:[], warnings:[e.message], error:e.message}; }
  }
  function csvField(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }
  window.AlmProportionInput = {parse:parse, upload:upload, csvField:csvField};
})();
