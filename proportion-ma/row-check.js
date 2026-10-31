/* proportion-ma/row-check.js — the one checker for the "events, total, label" lines of #src.
 * Used by the page parser (index.html parseTable: rows it cannot use are excluded AND listed in #src-excluded
 * with a reason) and by share set() (alm-features.js: an analysis file with any such row is refused before
 * anything is changed). Nothing is truncated: "2.5, 40" is excluded, never analysed as 2/40.
 * Rule (the same one shared/alm-entry.js countSanity, this app's entry apply() and plus-core.js validateRows
 * apply): events and total are whole numbers written in digits, 0 <= events <= total, total > 0.
 * Blank lines are not rows. Valid rows are returned exactly as the previous parser returned them
 * ({ x, n, label: third field or "Study <line>" }), so every valid-data number is unchanged.
 */
(function (root) {
  'use strict';
  var NAMES = ['events', 'total'];
  // null when s is a usable count; otherwise the reason it is not.
  function countProblem(s, name) {
    if (s === undefined || s === '') return name + ' missing';
    if (/^\d+$/.test(s)) return Number.isSafeInteger(Number(s)) ? null : name + ' too large';
    var v = Number(s);
    if (!Number.isFinite(v)) return name + ' is not a number';
    if (v < 0) return name + ' negative';
    if (!Number.isInteger(v)) return name + ' not a whole number';
    return name + ' must be written as a whole number in digits';
  }
  function classify(text) {
    var rows = [], excluded = [];
    String(text == null ? '' : text).trim().split(/\n/).forEach(function (l, i) {
      var shown = l.trim();
      if (!shown) return;
      var parts = l.split(/,/).map(function (s) { return s.trim(); });
      var reason = null;
      if (parts.length < 2) reason = 'fewer than 2 comma-separated fields (events, total)';
      for (var k = 0; !reason && k < 2; k++) reason = countProblem(parts[k], NAMES[k]);
      if (!reason) {
        var x = Number(parts[0]), n = Number(parts[1]);
        if (n === 0) reason = 'total must be greater than 0';
        else if (x > n) reason = 'events exceed the total';
        else { rows.push({ x: x, n: n, label: parts[2] || ('Study ' + (i + 1)) }); return; }
      }
      excluded.push({ line: i + 1, text: shown, reason: reason });
    });
    return { rows: rows, excluded: excluded };
  }
  var api = { classify: classify };
  root.AlmPropRows = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
