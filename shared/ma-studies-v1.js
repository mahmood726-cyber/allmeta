/* shared/ma-studies-v1.js — canonical helper for the allmeta cross-tool bus.
 *
 * Contract: see shared/ma-studies-v1.md
 *
 * Drop-in: <script src="../shared/ma-studies-v1.js"></script>
 * Then read with:    const studies = MaStudies.read();
 *      write with:   MaStudies.write(studies);
 *      merge with:   MaStudies.merge(newStudies);
 *
 * This module is ADDITIVE. Apps that currently roll their own read/write block
 * continue to work; adoption is opt-in and per-app. The shared helper exists
 * so that future apps don't reinvent the contract and so the contract has a
 * single canonical implementation to audit.
 */
(function (global) {
  "use strict";

  var KEY = "ma-studies-v1";
  var SCHEMA = "ma-studies-v1";
  var Z975 = 1.959963984540054; // 2-sided 95 % normal quantile

  // ----- Validation -------------------------------------------------------

  function isFiniteNumber(x) {
    return typeof x === "number" && Number.isFinite(x);
  }

  function validateStudy(s, i) {
    var errs = [];
    if (s === null || typeof s !== "object") {
      return ["row " + i + ": not an object"];
    }
    if (typeof s.label !== "string" || s.label.length === 0) {
      errs.push("row " + i + ": label must be a non-empty string");
    }
    if (!isFiniteNumber(s.est)) {
      errs.push("row " + i + ": est must be a finite number");
    }
    if (!isFiniteNumber(s.se) || s.se <= 0) {
      errs.push("row " + i + ": se must be a finite positive number");
    }
    return errs;
  }

  function validate(payload) {
    var errors = [];
    if (payload === null || typeof payload !== "object") {
      return { ok: false, errors: ["payload is not an object"] };
    }
    if (payload._schema !== SCHEMA) {
      errors.push("_schema must equal " + JSON.stringify(SCHEMA));
    }
    if (typeof payload._savedAt !== "string") {
      errors.push("_savedAt must be an ISO 8601 string");
    }
    if (!Array.isArray(payload.studies)) {
      errors.push("studies must be an array");
      return { ok: false, errors: errors };
    }
    for (var i = 0; i < payload.studies.length; i++) {
      var e = validateStudy(payload.studies[i], i);
      for (var j = 0; j < e.length; j++) errors.push(e[j]);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // ----- Normalisation ----------------------------------------------------

  function normalizeStudy(s, i) {
    return {
      label: s && typeof s.label === "string" && s.label.length
        ? s.label
        : "Study " + (i + 1),
      est: s && isFiniteNumber(s.est) ? s.est : null,
      se: s && isFiniteNumber(s.se) && s.se > 0 ? s.se : null,
      moderator: s && isFiniteNumber(s.moderator) ? s.moderator : null,
      group: s && typeof s.group === "string" && s.group.length ? s.group : null,
      year: s && isFiniteNumber(s.year) ? s.year : null,
    };
  }

  function dropPoisoned(studies) {
    var out = [];
    for (var i = 0; i < studies.length; i++) {
      var s = studies[i];
      if (s && isFiniteNumber(s.est) && isFiniteNumber(s.se) && s.se > 0) {
        out.push(s);
      }
    }
    return out;
  }

  function buildEnvelope(studies) {
    var clean = dropPoisoned((studies || []).map(normalizeStudy));
    return {
      _schema: SCHEMA,
      _savedAt: new Date().toISOString(),
      studies: clean,
    };
  }

  // ----- Storage I/O ------------------------------------------------------

  function _hasStorage() {
    try {
      return typeof global.localStorage !== "undefined" && global.localStorage !== null;
    } catch (_) {
      return false;
    }
  }

  function read() {
    if (!_hasStorage()) return [];
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      if (p && p._schema === SCHEMA && Array.isArray(p.studies)) {
        return p.studies;
      }
    } catch (_) {
      /* swallow: malformed bus = empty */
    }
    return [];
  }

  function write(studies) {
    if (!_hasStorage()) return false;
    var env = buildEnvelope(studies);
    try {
      global.localStorage.setItem(KEY, JSON.stringify(env));
      return true;
    } catch (_) {
      return false;
    }
  }

  function merge(studies) {
    var existing = read();
    var combined = existing.concat(studies || []);
    write(combined);
    return read().length;
  }

  function clear() {
    if (!_hasStorage()) return;
    try { global.localStorage.removeItem(KEY); } catch (_) {}
  }

  // ----- Scale helpers ----------------------------------------------------

  /**
   * Build {est, se} from a point estimate + 95 % CI.
   *   scale = "ratio"  → est = ln(point), se = (ln(hi) - ln(lo)) / (2 * Z975)
   *   scale = "linear" → est = point,     se = (hi - lo) / (2 * Z975)
   * Returns null if any input is non-finite, or for "ratio" if point ≤ 0.
   */
  function fromCI(point, lo, hi, scale) {
    if (!isFiniteNumber(point) || !isFiniteNumber(lo) || !isFiniteNumber(hi)) return null;
    if (hi <= lo) return null;
    if (scale === "ratio") {
      if (point <= 0 || lo <= 0 || hi <= 0) return null;
      return {
        est: Math.log(point),
        se: (Math.log(hi) - Math.log(lo)) / (2 * Z975),
      };
    }
    return {
      est: point,
      se: (hi - lo) / (2 * Z975),
    };
  }

  /** Back-transform a log effect to the natural ratio scale. */
  function toRatio(est) {
    return isFiniteNumber(est) ? Math.exp(est) : null;
  }

  // ----- CSV interop ------------------------------------------------------

  /**
   * Parse a permissive CSV of `label, est, se[, year[, group[, moderator]]]`.
   * Blank lines and lines starting with `#` are ignored.
   * Numeric fields with European-decimal-style commas inside quoted cells are
   * NOT supported (matches the rest of the suite — see lessons.md).
   */
  function parseCSV(text) {
    if (typeof text !== "string") return [];
    var lines = text.split(/\r?\n/);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var parts = line.split(/\s*,\s*/);
      if (parts.length < 3) continue;
      var est = parseFloat(parts[1]);
      var se = parseFloat(parts[2]);
      if (!isFiniteNumber(est) || !isFiniteNumber(se) || se <= 0) continue;
      var year = parts.length > 3 && parts[3].length ? parseFloat(parts[3]) : null;
      var group = parts.length > 4 && parts[4].length ? parts[4] : null;
      var moderator = parts.length > 5 && parts[5].length ? parseFloat(parts[5]) : null;
      rows.push({
        label: parts[0] || ("Study " + (rows.length + 1)),
        est: est,
        se: se,
        year: isFiniteNumber(year) ? year : null,
        group: group,
        moderator: isFiniteNumber(moderator) ? moderator : null,
      });
    }
    return rows;
  }

  function _csvQuote(s) {
    if (s == null) return "";
    var x = String(s);
    return /[,"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }

  function toCSV(studies) {
    var lines = ["label,est,se,year,group,moderator"];
    var s = studies || [];
    for (var i = 0; i < s.length; i++) {
      lines.push([
        _csvQuote(s[i].label),
        s[i].est,
        s[i].se,
        s[i].year == null ? "" : s[i].year,
        _csvQuote(s[i].group),
        s[i].moderator == null ? "" : s[i].moderator,
      ].join(","));
    }
    return lines.join("\n") + "\n";
  }

  // ----- Textarea I/O helpers --------------------------------------------

  /**
   * Parse a textarea value whose lines are CSV in one of these formats:
   *   "label, est, se[, year[, group[, moderator]]]"   (format: "label-est-se")
   *   "est, se[, label]"                                (format: "est-se-label")
   *   "est, se, label[, moderator]"                     (format: "est-se-label-mod")
   * Returns an array of {label, est, se, moderator?, group?, year?} rows,
   * silently dropping rows with non-finite est/se or se <= 0.
   */
  function studiesFromTextarea(text, format) {
    if (typeof text !== "string") return [];
    var lines = text.split(/\r?\n/);
    var rows = [];
    var fmt = format || "label-est-se";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var parts = line.split(/\s*,\s*/);
      if (parts.length < 2) continue;
      var label, est, se, mod = null, group = null, year = null;
      if (fmt === "est-se-label" || fmt === "est-se-label-mod") {
        est = parseFloat(parts[0]);
        se = parseFloat(parts[1]);
        label = parts[2] ? parts[2] : "Study " + (rows.length + 1);
        if (fmt === "est-se-label-mod" && parts.length > 3) {
          var m = parseFloat(parts[3]);
          if (isFiniteNumber(m)) mod = m;
        }
      } else {
        // "label-est-se" (default)
        label = parts[0] || ("Study " + (rows.length + 1));
        est = parseFloat(parts[1]);
        se = parseFloat(parts[2]);
        if (parts.length > 3 && parts[3].length) {
          var y = parseFloat(parts[3]);
          if (isFiniteNumber(y)) year = y;
        }
        if (parts.length > 4 && parts[4].length) group = parts[4];
        if (parts.length > 5 && parts[5].length) {
          var m2 = parseFloat(parts[5]);
          if (isFiniteNumber(m2)) mod = m2;
        }
      }
      if (!isFiniteNumber(est) || !isFiniteNumber(se) || se <= 0) continue;
      rows.push({ label: label, est: est, se: se, moderator: mod, group: group, year: year });
    }
    return rows;
  }

  /** Inverse of studiesFromTextarea: serialise studies → textarea text. */
  function textareaFromStudies(studies, format) {
    var fmt = format || "label-est-se";
    var lines = [];
    var s = studies || [];
    for (var i = 0; i < s.length; i++) {
      var r = s[i];
      if (fmt === "est-se-label" || fmt === "est-se-label-mod") {
        var cols = [r.est, r.se, r.label];
        if (fmt === "est-se-label-mod" && r.moderator != null) cols.push(r.moderator);
        lines.push(cols.join(", "));
      } else {
        var cols2 = [r.label, r.est, r.se];
        if (r.year != null) cols2.push(r.year);
        else if (r.group || r.moderator != null) cols2.push("");
        if (r.group) cols2.push(r.group);
        else if (r.moderator != null) cols2.push("");
        if (r.moderator != null) cols2.push(r.moderator);
        lines.push(cols2.join(", "));
      }
    }
    return lines.join("\n");
  }

  /**
   * Wire a pair of buttons to load/save a textarea against the shared bus.
   * Idempotent if buttons already have listeners (overwrites with new ones).
   *
   *   MaStudies.attachButtons({
   *     btnLoad: "#btn-bus-load",      // CSS selector or HTMLElement
   *     btnSave: "#btn-bus-save",
   *     textarea: "#f-data",            // CSS selector or HTMLElement
   *     format: "label-est-se",         // or "est-se-label" / "est-se-label-mod"
   *     onAfterLoad: function () {},    // optional callback after load
   *     toast: window.Toast,            // optional Toast object with .show
   *   });
   */
  function attachButtons(opts) {
    if (typeof document === "undefined") return false;
    function el(x) { return typeof x === "string" ? document.querySelector(x) : x; }
    var btnLoad = el(opts.btnLoad);
    var btnSave = el(opts.btnSave);
    var ta = el(opts.textarea);
    if (!ta) return false;
    var fmt = opts.format || "label-est-se";
    var toast = opts.toast || (typeof window !== "undefined" ? window.Toast : null);
    function notify(msg, kind) {
      if (toast && typeof toast.show === "function") toast.show(msg, kind || "warn");
    }
    if (btnLoad) {
      btnLoad.addEventListener("click", function () {
        var studies = read();
        if (!studies.length) { notify("No shared studies yet.", "warn"); return; }
        ta.value = textareaFromStudies(studies, fmt);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof opts.onAfterLoad === "function") opts.onAfterLoad(studies);
      });
    }
    if (btnSave) {
      btnSave.addEventListener("click", function () {
        var rows = studiesFromTextarea(ta.value, fmt);
        if (!rows.length) { notify("Nothing to save.", "warn"); return; }
        var ok = write(rows);
        notify(ok ? ("Saved " + rows.length + " studies to shared bus.") : "Could not save to bus.", ok ? "warn" : "error");
      });
    }
    return true;
  }

  // ----- Public API -------------------------------------------------------

  var api = {
    KEY: KEY,
    SCHEMA: SCHEMA,
    Z975: Z975,
    read: read,
    write: write,
    merge: merge,
    clear: clear,
    validate: validate,
    normalizeStudy: normalizeStudy,
    buildEnvelope: buildEnvelope,
    dropPoisoned: dropPoisoned,
    fromCI: fromCI,
    toRatio: toRatio,
    parseCSV: parseCSV,
    toCSV: toCSV,
    studiesFromTextarea: studiesFromTextarea,
    textareaFromStudies: textareaFromStudies,
    attachButtons: attachButtons,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MaStudies = api;
})(typeof window !== "undefined" ? window : globalThis);
