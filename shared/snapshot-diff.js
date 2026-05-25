/**
 * shared/snapshot-diff.js — semantic diff between two allmeta analysis
 * exports (JSON receipts, report bundles, MA-studies envelopes).
 *
 * Why this is more than a generic deep-diff:
 *   1. Numerical fields report ABSOLUTE and RELATIVE deltas, not just
 *      "value changed". Reviewers care whether the pooled effect moved
 *      from -0.34 to -0.33 (1% drift) or to -0.05 (85% drift).
 *   2. Study-level changes are detected by stable label, not by array
 *      index — so re-ordering the input list doesn't appear as a diff.
 *   3. Provenance fields (sha, version, seed) are surfaced at the top
 *      because they explain WHY the numerical fields differ.
 *   4. Fields that are well-known to be timestamps (_signedAt, builtAt,
 *      generatedAt) are reported as "timestamp changed" without flagging
 *      every byte difference.
 *
 * Public API:
 *   AlmDiff.diffJson(a, b, opts)  -> { provenance, fields, studies, summary }
 *   AlmDiff.renderHtml(diff)      -> HTML string (color-coded)
 *
 * The diff object shape is documented in test_snapshot_diff.py.
 */
(function (global) {
  'use strict';

  var TIMESTAMP_KEYS = ['_signedAt', 'signedAt', 'builtAt', 'generatedAt',
                        'savedAt', 'timestamp', 'createdAt', 'updatedAt'];
  var PROV_KEYS = ['producedBy', 'app', 'version', 'sha', 'shortSha',
                   'seed', 'seedSource', 'url'];

  function _isObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  function _isNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  function _allKeys(a, b) {
    var s = new Set();
    if (_isObject(a)) Object.keys(a).forEach(function (k) { s.add(k); });
    if (_isObject(b)) Object.keys(b).forEach(function (k) { s.add(k); });
    var out = [];
    s.forEach(function (k) { out.push(k); });
    out.sort();
    return out;
  }

  function _relDelta(a, b) {
    if (!_isNumber(a) || !_isNumber(b)) return null;
    var absD = b - a;
    var denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
    var rel = absD / denom;
    return { abs: absD, rel: rel, relPct: rel * 100 };
  }

  function _isStudyArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.every(function (x) {
      return _isObject(x) && (x.label != null || x.id != null);
    });
  }

  function _diffStudies(aStudies, bStudies, path) {
    var aMap = new Map();
    var bMap = new Map();
    (aStudies || []).forEach(function (s, i) {
      var k = String(s.label != null ? s.label : (s.id != null ? s.id : i));
      aMap.set(k, s);
    });
    (bStudies || []).forEach(function (s, i) {
      var k = String(s.label != null ? s.label : (s.id != null ? s.id : i));
      bMap.set(k, s);
    });
    var added = [];
    var removed = [];
    var changed = [];
    aMap.forEach(function (s, k) {
      if (!bMap.has(k)) removed.push(s);
    });
    bMap.forEach(function (s, k) {
      if (!aMap.has(k)) added.push(s);
      else {
        var diff = _diffFields(aMap.get(k), s, path + '[' + k + ']', false);
        if (diff.changes.length > 0) changed.push({ key: k, before: aMap.get(k), after: s, changes: diff.changes });
      }
    });
    return { added: added, removed: removed, changed: changed };
  }

  function _diffFields(a, b, path, surfaceProvenance) {
    var changes = [];
    var provenance = surfaceProvenance ? [] : null;
    var keys = _allKeys(a, b);
    keys.forEach(function (k) {
      var aVal = _isObject(a) ? a[k] : undefined;
      var bVal = _isObject(b) ? b[k] : undefined;
      var keyPath = path ? path + '.' + k : k;

      if (TIMESTAMP_KEYS.indexOf(k) !== -1) {
        if (aVal !== bVal) {
          changes.push({ path: keyPath, kind: 'timestamp', before: aVal, after: bVal });
        }
        return;
      }

      if (_isStudyArray(aVal) || _isStudyArray(bVal)) {
        var ds = _diffStudies(aVal, bVal, keyPath);
        if (ds.added.length || ds.removed.length || ds.changed.length) {
          changes.push({ path: keyPath, kind: 'studies', studies: ds });
        }
        return;
      }

      if (_isObject(aVal) && _isObject(bVal)) {
        var inner = _diffFields(aVal, bVal, keyPath, false);
        inner.changes.forEach(function (c) { changes.push(c); });
        return;
      }

      if (aVal === undefined && bVal !== undefined) {
        changes.push({ path: keyPath, kind: 'added', after: bVal });
        if (provenance && PROV_KEYS.indexOf(k) !== -1) {
          provenance.push({ path: keyPath, kind: 'added', after: bVal });
        }
        return;
      }
      if (bVal === undefined && aVal !== undefined) {
        changes.push({ path: keyPath, kind: 'removed', before: aVal });
        if (provenance && PROV_KEYS.indexOf(k) !== -1) {
          provenance.push({ path: keyPath, kind: 'removed', before: aVal });
        }
        return;
      }
      if (_isNumber(aVal) && _isNumber(bVal)) {
        if (aVal !== bVal) {
          var d = _relDelta(aVal, bVal);
          var entry = { path: keyPath, kind: 'numeric', before: aVal, after: bVal,
                        abs: d.abs, rel: d.rel, relPct: d.relPct };
          changes.push(entry);
          if (provenance && PROV_KEYS.indexOf(k) !== -1) provenance.push(entry);
        }
        return;
      }
      if (JSON.stringify(aVal) !== JSON.stringify(bVal)) {
        var entry2 = { path: keyPath, kind: 'changed', before: aVal, after: bVal };
        changes.push(entry2);
        if (provenance && PROV_KEYS.indexOf(k) !== -1) provenance.push(entry2);
      }
    });
    return { changes: changes, provenance: provenance };
  }

  function diffJson(a, b, opts) {
    opts = opts || {};
    var top = _diffFields(a || {}, b || {}, '', true);

    // Partition into provenance / studies / other fields.
    var provenance = top.provenance || [];
    var studiesEntries = [];
    var fields = [];
    top.changes.forEach(function (c) {
      if (c.kind === 'studies') studiesEntries.push(c);
      else if (provenance.some(function (p) { return p.path === c.path; })) {
        /* already in provenance bucket */
      } else if (PROV_KEYS.some(function (k) { return c.path === k || c.path.startsWith(k + '.'); })) {
        provenance.push(c);
      } else {
        fields.push(c);
      }
    });

    // Summary counts
    var summary = {
      provenance: provenance.length,
      fields: fields.length,
      studiesAdded: 0, studiesRemoved: 0, studiesChanged: 0,
      maxRelPct: 0,
    };
    studiesEntries.forEach(function (s) {
      summary.studiesAdded += s.studies.added.length;
      summary.studiesRemoved += s.studies.removed.length;
      summary.studiesChanged += s.studies.changed.length;
    });
    fields.concat(provenance).forEach(function (c) {
      if (c.kind === 'numeric' && Math.abs(c.relPct) > summary.maxRelPct) {
        summary.maxRelPct = Math.abs(c.relPct);
      }
    });

    return { provenance: provenance, fields: fields, studies: studiesEntries, summary: summary };
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _fmtNumber(x) {
    if (!_isNumber(x)) return _esc(x);
    if (Math.abs(x) >= 1000 || (Math.abs(x) < 0.001 && x !== 0)) return x.toExponential(3);
    return Number(x.toFixed(6)).toString();
  }

  function _fmtPct(p) {
    if (!_isNumber(p)) return '';
    var s = p >= 0 ? '+' : '';
    if (Math.abs(p) < 0.01) return s + p.toFixed(4) + '%';
    if (Math.abs(p) < 1) return s + p.toFixed(2) + '%';
    return s + p.toFixed(1) + '%';
  }

  function _rowHtml(c) {
    var pct = (c.kind === 'numeric')
      ? '<span class="d-pct ' + (Math.abs(c.relPct) > 5 ? 'd-big' : 'd-small') + '">' + _fmtPct(c.relPct) + '</span>'
      : '';
    var beforeHtml = c.before === undefined ? '<em class="d-empty">∅</em>'
      : (_isNumber(c.before) ? _fmtNumber(c.before) : _esc(JSON.stringify(c.before)));
    var afterHtml = c.after === undefined ? '<em class="d-empty">∅</em>'
      : (_isNumber(c.after) ? _fmtNumber(c.after) : _esc(JSON.stringify(c.after)));
    return '<tr class="d-row d-' + c.kind + '">' +
           '<td class="d-path">' + _esc(c.path) + '</td>' +
           '<td class="d-before">' + beforeHtml + '</td>' +
           '<td class="d-after">' + afterHtml + '</td>' +
           '<td class="d-delta">' + pct + '</td>' +
           '</tr>';
  }

  function renderHtml(diff) {
    if (!diff) return '';
    var sections = [];
    if (diff.provenance.length) {
      sections.push('<h3>Provenance</h3><table class="d-table">' +
        '<thead><tr><th>field</th><th>A</th><th>B</th><th>Δ%</th></tr></thead>' +
        '<tbody>' + diff.provenance.map(_rowHtml).join('') + '</tbody></table>');
    }
    if (diff.fields.length) {
      sections.push('<h3>Result fields</h3><table class="d-table">' +
        '<thead><tr><th>field</th><th>A</th><th>B</th><th>Δ%</th></tr></thead>' +
        '<tbody>' + diff.fields.map(_rowHtml).join('') + '</tbody></table>');
    }
    if (diff.studies.length) {
      diff.studies.forEach(function (s) {
        sections.push('<h3>Studies — ' + _esc(s.path) + '</h3>');
        if (s.studies.added.length) sections.push('<p><strong>Added (' + s.studies.added.length + '):</strong> ' +
          s.studies.added.map(function (x) { return _esc(x.label || x.id || '?'); }).join(', ') + '</p>');
        if (s.studies.removed.length) sections.push('<p><strong>Removed (' + s.studies.removed.length + '):</strong> ' +
          s.studies.removed.map(function (x) { return _esc(x.label || x.id || '?'); }).join(', ') + '</p>');
        if (s.studies.changed.length) {
          var rows = s.studies.changed.map(function (c) {
            return c.changes.map(function (cc) {
              return _rowHtml({ path: c.key + '.' + cc.path.split('.').pop(),
                               kind: cc.kind, before: cc.before, after: cc.after,
                               relPct: cc.relPct });
            }).join('');
          }).join('');
          sections.push('<table class="d-table">' +
            '<thead><tr><th>study.field</th><th>A</th><th>B</th><th>Δ%</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>');
        }
      });
    }
    if (sections.length === 0) {
      return '<p class="d-empty">No semantic differences between A and B.</p>';
    }
    return sections.join('\n');
  }

  var api = { diffJson: diffJson, renderHtml: renderHtml,
              _diffStudies: _diffStudies, _relDelta: _relDelta };
  global.AlmDiff = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
