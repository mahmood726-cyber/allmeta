/* Screen first-run and interoperability helpers. Pure functions; no network, no ranking maths.
   The progress counts are descriptive only: they are not a recall estimate or stopping rule. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScreenUX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Label column aliases accepted by ASReview LAB tabular import (asreview.readthedocs.io,
  // stable "Data format" page) plus its own export column asreview_label.
  var LABEL_COLUMNS = ['asreview_label', 'final_included', 'label', 'label_included', 'included_label',
    'included_final', 'included', 'included_flag', 'include'];
  var GATE = 2;

  function labelColumn(header) {
    var h = (header || []).map(function (x) { return String(x).trim().toLowerCase(); });
    for (var i = 0; i < LABEL_COLUMNS.length; i++) { var k = h.indexOf(LABEL_COLUMNS[i]); if (k >= 0) return k; }
    return -1;
  }
  // 1 = relevant, 0 = irrelevant, null = not seen. Anything else is treated as not seen.
  function parseLabel(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === '1' || s === '1.0' || s === 'true') return 1;
    if (s === '0' || s === '0.0' || s === 'false') return 0;
    return null;
  }
  function risNoteLabel(note) {
    var s = String(note || '');
    if (/\bASReview_relevant\b/i.test(s)) return 1;
    if (/\bASReview_irrelevant\b/i.test(s)) return 0;
    return null;
  }
  function decisionFromLabel(l) { return l === 1 ? 'include' : l === 0 ? 'exclude' : ''; }
  function labelFromDecision(d) { return d === 'include' ? '1' : d === 'exclude' ? '0' : ''; }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/^[=+@\t\r]/.test(v)) v = "'" + v;
    if (/^-/.test(v) && !/^-\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }
  // ASReview-compatible CSV: recognised column names, included = 1/0/blank.
  // decisionOf(record) must return the title/abstract decision to export.
  var ASREVIEW_HEADER = ['title', 'abstract', 'authors', 'year', 'journal', 'doi', 'included'];
  function asreviewCSV(records, decisionOf) {
    var rows = [ASREVIEW_HEADER.map(csvCell).join(',')];
    (records || []).forEach(function (r) {
      rows.push([r.title, r.abstract, (r.authors || []).join('; '), r.year, r.journal, r.doi,
        labelFromDecision(decisionOf(r))].map(csvCell).join(','));
    });
    return rows.join('\n');
  }

  function gate(labels) {
    var inc = 0, exc = 0;
    (labels || []).forEach(function (l) { if (l === 1) inc++; else if (l === 0) exc++; });
    var met = inc >= GATE && exc >= GATE;
    return {inc: inc, exc: exc, met: met,
      text: met ? 'Enough labels to start AI ranking (' + inc + ' relevant, ' + exc + ' irrelevant).'
        : 'Label ' + GATE + ' relevant and ' + GATE + ' irrelevant to start AI ranking: ' +
          Math.min(inc, GATE) + '/' + GATE + ', ' + Math.min(exc, GATE) + '/' + GATE + '.'};
  }

  // decisions: [{d:'include'|'exclude'|'maybe'|'', at:'ISO or empty'}], in import order.
  // Untimed (imported) decisions are ordered before timed ones, keeping import order.
  function progress(decisions) {
    var list = (decisions || []).map(function (x, i) { return {d: x.d, t: Date.parse(x.at || ''), i: i}; })
      .filter(function (x) { return x.d === 'include' || x.d === 'exclude' || x.d === 'maybe'; });
    list.sort(function (a, b) {
      var ta = isFinite(a.t) ? a.t : -Infinity, tb = isFinite(b.t) ? b.t : -Infinity;
      return ta === tb ? a.i - b.i : ta - tb;
    });
    var screened = 0, relevant = 0, irrelevant = 0, maybe = 0, since = 0, anyRelevant = false;
    list.forEach(function (x) {
      screened++;
      if (x.d === 'include') { relevant++; since = 0; anyRelevant = true; }
      else if (x.d === 'exclude') { irrelevant++; since++; }
      else maybe++;
    });
    return {screened: screened, relevant: relevant, irrelevant: irrelevant, maybe: maybe,
      sinceLastRelevant: since, anyRelevant: anyRelevant,
      untimed: list.filter(function (x) { return !isFinite(x.t); }).length};
  }

  function formatName(text, name) {
    var t = String(text || '').replace(/^﻿/, ''), trimmed = t.replace(/^\s+/, '');
    if (trimmed[0] === '{' || trimmed[0] === '[') return 'JSON';
    if (/^\s*TY\s\s?-\s/m.test(t)) return 'RIS';
    if (/^PMID\s*-\s/m.test(t)) return 'PubMed/MEDLINE (nbib)';
    if (/\.ris$/i.test(name || '')) return 'RIS';
    if (/\.nbib$/i.test(name || '')) return 'PubMed/MEDLINE (nbib)';
    return 'CSV';
  }

  return {LABEL_COLUMNS: LABEL_COLUMNS, ASREVIEW_HEADER: ASREVIEW_HEADER, GATE: GATE, labelColumn: labelColumn,
    parseLabel: parseLabel, risNoteLabel: risNoteLabel, decisionFromLabel: decisionFromLabel,
    labelFromDecision: labelFromDecision, asreviewCSV: asreviewCSV, gate: gate, progress: progress, formatName: formatName};
});
