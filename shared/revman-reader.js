/* shared/revman-reader.js — Cochrane RevMan .rm5 / .rm6 → ma-comparisons-v1.
 *
 * RevMan stores reviews as XML (sometimes wrapped in a zip envelope). This
 * module reads either form, walks the documented schema, and emits a
 * normalised object the importer UI renders + pushes to the cross-tool bus.
 *
 * Documented schema highlights (per Cochrane KB):
 *   <COCHRANE_REVIEW>
 *     <COVER_SHEET>
 *       <TITLE>…</TITLE>
 *       <VERSION>…</VERSION>
 *     </COVER_SHEET>
 *     <ANALYSES_AND_DATA>
 *       <COMPARISON NAME="…">
 *         <DICH_OUTCOME NAME="…" EFFECT_MEASURE="OR|RR|RD|PETO_OR">
 *           <DICH_SUBGROUP NAME="…">
 *             <DICH_DATA STUDY_ID="X" EVENTS_1 TOTAL_1 EVENTS_2 TOTAL_2 />
 *           </DICH_SUBGROUP>
 *         </DICH_OUTCOME>
 *         <CONTINUOUS_OUTCOME NAME="…" EFFECT_MEASURE="MD|SMD">
 *           <CONTINUOUS_DATA STUDY_ID N_1 MEAN_1 SD_1 N_2 MEAN_2 SD_2 />
 *         </CONTINUOUS_OUTCOME>
 *         <O_E_AND_VARIANCE_OUTCOME EFFECT_MEASURE="HR|OR">
 *           <O_E_AND_VARIANCE_DATA STUDY_ID O_MINUS_E VARIANCE />
 *         </O_E_AND_VARIANCE_OUTCOME>
 *         <IPD_OUTCOME>                      (RevMan 5 time-to-event, as meta::read.rm5 reads it)
 *           <EFFECT_MEASURE>Hazard Ratio</EFFECT_MEASURE>
 *           <IPD_SUBGROUP><IPD_DATA STUDY_ID O_E VAR /></IPD_SUBGROUP>
 *         </IPD_OUTCOME>                     (→ type "o_e_var", est = O_E/VAR, se = 1/sqrt(VAR),
 *                                             raw values kept as study.oeVar = {oe, v})
 *         <CONT_OUTCOME EFFECT_MEASURE="MD|SMD">   (RevMan 5's real continuous tag, as meta::read.rm5 reads it)
 *           <CONT_DATA STUDY_ID MEAN_1 SD_1 TOTAL_1 MEAN_2 SD_2 TOTAL_2 />   (→ type "continuous", n = TOTAL_*)
 *         </CONT_OUTCOME>
 *         <IV_OUTCOME LOG_DATA="YES|NO">     (RevMan 5 generic inverse variance, as meta::read.rm5 reads it)
 *           <EFFECT_MEASURE>Risk Ratio</EFFECT_MEASURE>
 *           <IV_SUBGROUP><IV_DATA STUDY_ID EFFECT_SIZE SE /></IV_SUBGROUP>
 *         </IV_OUTCOME>                      (→ type "generic_iv", precomputed = {est: EFFECT_SIZE, se: SE}
 *                                             exactly as stored, never transformed; outcome.logData keeps
 *                                             LOG_DATA as written, which meta::metacr uses to pick the scale)
 *       </COMPARISON>
 *     </ANALYSES_AND_DATA>
 *     <STUDIES_AND_REFERENCES>
 *       <STUDIES>
 *         <STUDY ID="X" NAME="…" YEAR_OF_PUB="…" />   (RevMan 5 / meta::read.rm5: YEAR="…")
 *       </STUDIES>
 *     </STUDIES_AND_REFERENCES>
 *   </COCHRANE_REVIEW>
 *
 * NAME and GROUP_LABEL_1/2 are read from the attribute first (legacy layout) and
 * otherwise from the direct child element RevMan 5 writes (<NAME>…</NAME>,
 * <GROUP_LABEL_1>…</GROUP_LABEL_1>); the study year from YEAR_OF_PUB, else YEAR.
 *
 * A data row that cannot be used (a missing or non-numeric value, SD/SE <= 0,
 * N <= 0, VAR <= 0) is never dropped silently: it is listed on its outcome as
 * outcome.skipped = [ { row, studyId, study, reason } ] (row = 1-based position
 * among that outcome's data rows). The key is present only when a row was
 * skipped. meta::read.rm5 keeps such rows (NA or the stored value) and refuses
 * no file for them, so neither does this reader.
 *
 * Returns from parse(buffer):
 *   {
 *     title, version, studyCount,
 *     studies: { [id]: { id, name, year } },
 *     comparisons: [ {
 *       id, name,
 *       outcomes: [ {
 *         name, type: "binary" | "continuous" | "o_e_var" | "generic_iv",
 *         effectMeasure: "OR" | "RR" | "RD" | "PETO_OR" | "MD" | "SMD" | "HR",
 *         arm1Name, arm2Name,
 *         studies: [ { id, name, year, scale, arms: [{treatment, events, n} | {treatment, mean, sd, n}] } ],
 *         skipped?: [ { row, studyId, study, reason } ]
 *       } ]
 *     } ]
 *   }
 *
 * comparisonToBus(comparison) flattens the first compatible outcome into a
 * ma-comparisons-v1 envelope. Mixed-scale outcomes are split into separate
 * comparisons in the dropdown — never silently combined.
 */
(function (global) {
  "use strict";

  // ----- File-shape detection (zip vs raw XML) ----------------------------

  function _isZip(buf) {
    if (!buf || buf.byteLength < 4) return false;
    var view = new Uint8Array(buf, 0, 4);
    // ZIP local file header magic = "PK\003\004"
    return view[0] === 0x50 && view[1] === 0x4B && view[2] === 0x03 && view[3] === 0x04;
  }

  function _decodeXml(buf) {
    // RevMan declares UTF-8 in the prolog; trust that.
    return new TextDecoder("utf-8").decode(new Uint8Array(buf));
  }

  // ----- Parser -----------------------------------------------------------

  function _attr(el, name) {
    if (!el || !el.getAttribute) return null;
    var v = el.getAttribute(name);
    return (v == null || v === "") ? null : v;
  }
  function _numAttr(el, name) {
    var v = _attr(el, name);
    if (v == null) return null;
    var n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  function _textOf(parent, tag) {
    if (!parent) return null;
    var el = parent.getElementsByTagName(tag)[0];
    return el ? (el.textContent || "").trim() : null;
  }
  // Text of a DIRECT child element (RevMan 5 writes <NAME>, <GROUP_LABEL_1>, ... as
  // children); never a descendant, so a comparison never picks up an outcome's NAME.
  function _childText(el, tag) {
    var kids = el && (el.children || el.childNodes);
    if (!kids) return null;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c && c.nodeType !== 3 && c.tagName === tag) {
        var t = (c.textContent || "").trim();
        return t === "" ? null : t;
      }
    }
    return null;
  }
  function _label(el, name) { return _attr(el, name) || _childText(el, name); }

  // A data value must be a whole number literal; "12abc" or "1,5" is reported, not
  // read as 12 or 1 (parseFloat would), and is what meta's as.numeric() turns into NA.
  var _NUM = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
  // Reads `names` from a data row into `vals`; returns the list of problems (empty = usable).
  function _rowValues(d, names, positive, vals) {
    var problems = [];
    for (var i = 0; i < names.length; i++) {
      var k = names[i], raw = _attr(d, k), v = null;
      if (raw == null) problems.push(k + " missing");
      else if (!_NUM.test(raw) || !Number.isFinite(v = parseFloat(raw))) { v = null; problems.push(k + " is not a number (\"" + raw + "\")"); }
      else if (positive.indexOf(k) >= 0 && v <= 0) problems.push(k + " must be > 0 (is " + raw + ")");
      vals[k] = v;
    }
    return problems;
  }
  function _skip(list, i, sid, studyIndex, problems) {
    var meta = studyIndex[sid];
    list.push({ row: i + 1, studyId: sid, study: meta ? meta.name : sid, reason: problems.join("; ") });
  }
  function _withSkipped(outcome, skipped) {
    if (skipped.length) outcome.skipped = skipped;
    return outcome;
  }
  // EFFECT_MEASURE attribute, else the child element text mapped as meta::read.rm5 maps it.
  var _MEASURES = { "ODDS RATIO": "OR", "PETO ODDS RATIO": "OR", "PETO_OR": "OR", "ODDS RATIO (NON-EVENT)": "OR",
    "RISK RATIO": "RR", "RISK DIFFERENCE": "RD", "MEAN DIFFERENCE": "MD", "STANDARDIZED MEAN DIFFERENCE": "SMD",
    "STD. MEAN DIFFERENCE": "SMD", "HAZARD RATIO": "HR" };
  function _measure(node, dflt) {
    var a = _attr(node, "EFFECT_MEASURE");
    if (a) return a.toUpperCase();
    var t = _childText(node, "EFFECT_MEASURE");
    if (!t) return dflt;
    t = t.toUpperCase();
    return _MEASURES[t] || t;
  }

  function _collectStudies(doc) {
    // STUDY entries live under STUDIES_AND_REFERENCES > STUDIES. Index by ID
    // so DICH_DATA / CONTINUOUS_DATA can resolve the human-readable name.
    var out = Object.create(null);
    var nodes = doc.getElementsByTagName("STUDY");
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i];
      var id = _attr(s, "ID");
      if (!id) continue;
      // RevMan 5 (and meta::read.rm5) store the year as YEAR; YEAR_OF_PUB is the legacy layout.
      var year = _numAttr(s, "YEAR_OF_PUB");
      if (year == null) year = _numAttr(s, "YEAR");
      out[id] = {
        id: id,
        name: _attr(s, "NAME") || id,
        year: year,
      };
    }
    return out;
  }

  function _readDichOutcome(node, studyIndex, group1, group2) {
    var effect = _attr(node, "EFFECT_MEASURE") || "OR";
    // PETO_OR collapses to OR for downstream purposes.
    var em = effect === "PETO_OR" ? "OR" : effect.toUpperCase();
    var t1 = _label(node, "GROUP_LABEL_1") || group1 || "Group 1";
    var t2 = _label(node, "GROUP_LABEL_2") || group2 || "Group 2";

    var studies = [], skipped = [];
    var dataNodes = node.getElementsByTagName("DICH_DATA");
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var v = {}, problems = _rowValues(d, ["EVENTS_1", "TOTAL_1", "EVENTS_2", "TOTAL_2"], [], v);
      if (problems.length) { _skip(skipped, i, sid, studyIndex, problems); continue; }
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      studies.push({
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        arms: [
          { treatment: t1, events: v.EVENTS_1, n: v.TOTAL_1 },
          { treatment: t2, events: v.EVENTS_2, n: v.TOTAL_2 },
        ],
      });
    }
    return _withSkipped({
      name: _label(node, "NAME") || "Outcome",
      type: "binary",
      effectMeasure: em,
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    }, skipped);
  }

  // Legacy layout CONTINUOUS_OUTCOME > CONTINUOUS_DATA (N_1/N_2); RevMan 5 writes
  // CONT_OUTCOME > CONT_SUBGROUP > CONT_DATA with TOTAL_1/TOTAL_2 (what meta::read.rm5 reads).
  var _CONT = { data: "CONT_DATA", n1: "TOTAL_1", n2: "TOTAL_2" };
  function _readContinuousOutcome(node, studyIndex, group1, group2, tags) {
    var em = tags ? _measure(node, "MD") : (_attr(node, "EFFECT_MEASURE") || "MD").toUpperCase();
    tags = tags || { data: "CONTINUOUS_DATA", n1: "N_1", n2: "N_2" };
    var t1 = _label(node, "GROUP_LABEL_1") || group1 || "Group 1";
    var t2 = _label(node, "GROUP_LABEL_2") || group2 || "Group 2";

    var studies = [], skipped = [];
    var dataNodes = node.getElementsByTagName(tags.data);
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var v = {}, problems = _rowValues(d, ["MEAN_1", "SD_1", tags.n1, "MEAN_2", "SD_2", tags.n2], ["SD_1", "SD_2", tags.n1, tags.n2], v);
      if (problems.length) { _skip(skipped, i, sid, studyIndex, problems); continue; }
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      studies.push({
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        arms: [
          { treatment: t1, mean: v.MEAN_1, sd: v.SD_1, n: v[tags.n1] },
          { treatment: t2, mean: v.MEAN_2, sd: v.SD_2, n: v[tags.n2] },
        ],
      });
    }
    return _withSkipped({
      name: _label(node, "NAME") || "Outcome",
      type: "continuous",
      effectMeasure: em,
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    }, skipped);
  }

  // RevMan 5 generic inverse variance: IV_OUTCOME > IV_SUBGROUP > IV_DATA with
  // EFFECT_SIZE and SE (the attributes meta::read.rm5 reads as TE and seTE). The
  // values are kept exactly as stored; LOG_DATA is passed through as outcome.logData
  // (meta::metacr decides the scale from it) and nothing is transformed here.
  function _readIVOutcome(node, studyIndex, group1, group2) {
    var em = _measure(node, null);
    var t1 = _label(node, "GROUP_LABEL_1") || group1 || "Group 1";
    var t2 = _label(node, "GROUP_LABEL_2") || group2 || "Group 2";

    var studies = [], skipped = [];
    var dataNodes = node.getElementsByTagName("IV_DATA");
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var v = {}, problems = _rowValues(d, ["EFFECT_SIZE", "SE"], ["SE"], v);
      if (problems.length) { _skip(skipped, i, sid, studyIndex, problems); continue; }
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      studies.push({
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        precomputed: { est: v.EFFECT_SIZE, se: v.SE },
        arms: [
          { treatment: t1, est: v.EFFECT_SIZE, se: v.SE },
          { treatment: t2, isReference: true },
        ],
      });
    }
    return _withSkipped({
      name: _label(node, "NAME") || "Outcome",
      type: "generic_iv",
      effectMeasure: em,
      logData: _attr(node, "LOG_DATA"),
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    }, skipped);
  }

  // RevMan 5 writes time-to-event data as IPD_OUTCOME > IPD_SUBGROUP > IPD_DATA
  // with O_E and VAR attributes (the tags meta::read.rm5 reads); the effect
  // measure is an <EFFECT_MEASURE> child such as "Hazard Ratio".
  var _IPD = { data: "IPD_DATA", oe: "O_E", v: "VAR", raw: true };
  function _ipdMeasure(node) {
    var a = _attr(node, "EFFECT_MEASURE");
    var s = String(a || _textOf(node, "EFFECT_MEASURE") || "HR").trim().toUpperCase();
    return ({ "HAZARD RATIO": "HR", "PETO ODDS RATIO": "OR", "ODDS RATIO": "OR", "PETO_OR": "OR" })[s] || s;
  }

  function _readOEVarianceOutcome(node, studyIndex, group1, group2, tags) {
    // O-E/Var outcomes carry a per-study log-HR (or log-OR for Peto) and its
    // variance directly. The bus doesn't carry pre-computed effects natively
    // (it carries arm-level counts), so we surface this as a "summary"
    // outcome whose arms carry a synthetic effect column. NMA consumers that
    // can ingest yi/vi (forest-plot path) will pick it up via the bus reader.
    var em = tags ? _ipdMeasure(node) : (_attr(node, "EFFECT_MEASURE") || "HR").toUpperCase();
    var t1 = _label(node, "GROUP_LABEL_1") || group1 || "Experimental";
    var t2 = _label(node, "GROUP_LABEL_2") || group2 || "Control";
    tags = tags || { data: "O_E_AND_VARIANCE_DATA", oe: "O_MINUS_E", v: "VARIANCE" };

    var studies = [], skipped = [];
    var dataNodes = node.getElementsByTagName(tags.data);
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var v = {}, problems = _rowValues(d, [tags.oe, tags.v], [tags.v], v);
      if (problems.length) { _skip(skipped, i, sid, studyIndex, problems); continue; }
      var oe = v[tags.oe], va = v[tags.v];
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      // Peto/O-E log estimate is oe/va; SE is 1/sqrt(va).
      var yi = oe / va, se = 1 / Math.sqrt(va);
      var row = {
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        precomputed: { est: yi, se: se },
        arms: [
          { treatment: t1, oeVarianceEst: yi, se: se },
          { treatment: t2, isReference: true },
        ],
      };
      if (tags.raw) row.oeVar = { oe: oe, v: va };
      studies.push(row);
    }
    return _withSkipped({
      name: _label(node, "NAME") || "Outcome",
      type: "o_e_var",
      effectMeasure: em,
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    }, skipped);
  }

  function _readComparison(node, studyIndex) {
    var name = _label(node, "NAME") || "Comparison";
    var g1 = _label(node, "GROUP_LABEL_1"), g2 = _label(node, "GROUP_LABEL_2");
    var outcomes = [];

    var dichNodes = node.getElementsByTagName("DICH_OUTCOME");
    for (var i = 0; i < dichNodes.length; i++) outcomes.push(_readDichOutcome(dichNodes[i], studyIndex, g1, g2));
    var contNodes = node.getElementsByTagName("CONTINUOUS_OUTCOME");
    for (var j = 0; j < contNodes.length; j++) outcomes.push(_readContinuousOutcome(contNodes[j], studyIndex, g1, g2));
    var rm5ContNodes = node.getElementsByTagName("CONT_OUTCOME");
    for (var q = 0; q < rm5ContNodes.length; q++) outcomes.push(_readContinuousOutcome(rm5ContNodes[q], studyIndex, g1, g2, _CONT));
    var oeNodes = node.getElementsByTagName("O_E_AND_VARIANCE_OUTCOME");
    for (var k = 0; k < oeNodes.length; k++) outcomes.push(_readOEVarianceOutcome(oeNodes[k], studyIndex, g1, g2));
    var ipdNodes = node.getElementsByTagName("IPD_OUTCOME");
    for (var p = 0; p < ipdNodes.length; p++) outcomes.push(_readOEVarianceOutcome(ipdNodes[p], studyIndex, g1, g2, _IPD));
    var ivNodes = node.getElementsByTagName("IV_OUTCOME");
    for (var r = 0; r < ivNodes.length; r++) outcomes.push(_readIVOutcome(ivNodes[r], studyIndex, g1, g2));

    return {
      id: _attr(node, "ID") || ("comp_" + Math.random().toString(36).slice(2, 8)),
      name: name, outcomes: outcomes,
    };
  }

  function _parseXmlString(xmlStr) {
    var doc = new DOMParser().parseFromString(xmlStr, "application/xml");
    var parseErr = doc.getElementsByTagName("parsererror")[0];
    if (parseErr) throw new Error("Malformed XML: " + (parseErr.textContent || "").slice(0, 200));

    var root = doc.getElementsByTagName("COCHRANE_REVIEW")[0];
    if (!root) throw new Error("Not a RevMan file (no <COCHRANE_REVIEW> root)");

    var title = _textOf(doc, "TITLE");
    var version = _attr(root, "VERSION") || _textOf(doc, "VERSION") || _textOf(doc, "REVMAN_VERSION");

    var studyIndex = _collectStudies(doc);
    var compNodes = doc.getElementsByTagName("COMPARISON");
    var comparisons = [];
    for (var i = 0; i < compNodes.length; i++) comparisons.push(_readComparison(compNodes[i], studyIndex));

    var studyCount = comparisons.reduce(function (n, c) {
      return n + c.outcomes.reduce(function (m, o) { return m + o.studies.length; }, 0);
    }, 0);

    return { title: title, version: version, studies: studyIndex, comparisons: comparisons, studyCount: studyCount };
  }

  // ----- Public entry point ----------------------------------------------

  /**
   * Parse a .rm5 / .rm6 ArrayBuffer. Auto-detects zip vs raw XML. Returns a
   * Promise. Pass `opts.jszip` to inject the JSZip global (the importer page
   * loads JSZip up-front so this stays a thin wrapper).
   */
  function parse(buffer, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      try {
        if (_isZip(buffer)) {
          var JSZip = opts.jszip || global.JSZip;
          if (!JSZip) {
            reject(new Error("File is zipped but JSZip is not loaded."));
            return;
          }
          JSZip.loadAsync(buffer).then(function (zip) {
            // RevMan zip typically contains a single .rm5 entry + supplementary files.
            var entries = Object.keys(zip.files).filter(function (n) {
              return !zip.files[n].dir && /\.(rm5|rm6|xml)$/i.test(n);
            });
            if (!entries.length) {
              entries = Object.keys(zip.files).filter(function (n) { return !zip.files[n].dir; });
            }
            if (!entries.length) { reject(new Error("Zip is empty.")); return; }
            // Prefer files whose name starts with "review" or matches "*.rm*"
            entries.sort(function (a, b) {
              var sa = /review|\.rm/i.test(a) ? 0 : 1;
              var sb = /review|\.rm/i.test(b) ? 0 : 1;
              return sa - sb;
            });
            zip.file(entries[0]).async("string").then(function (xmlStr) {
              try { resolve(_parseXmlString(xmlStr)); }
              catch (e) { reject(e); }
            }, reject);
          }, function (zerr) { reject(new Error("Zip parse failed: " + (zerr.message || zerr))); });
        } else {
          resolve(_parseXmlString(_decodeXml(buffer)));
        }
      } catch (e) { reject(e); }
    });
  }

  /**
   * Pick the first non-empty outcome from a comparison and emit an
   * ma-comparisons-v1 envelope. Multi-outcome comparisons are NOT silently
   * merged — the importer UI presents them as separate dropdown entries so
   * the user picks one outcome at a time.
   *
   * Returns a fully-validated envelope ready for MaComparisons.write().
   */
  function comparisonToBus(comparison) {
    if (!comparison || !Array.isArray(comparison.outcomes)) return null;
    // Prefer a non-empty outcome the bus can represent as arm-level counts
    // (DICH / CONTINUOUS). O-E/Variance outcomes are summary log-HR / Peto effects,
    // NOT 2x2 counts: the bus carries arm counts and ma-comparisons normalizeStudy
    // strips any precomputed sidecar, so emitting placeholder 0/1 arms for them
    // would silently feed a downstream meta-analysis garbage (0/1-vs-0/1). So skip
    // O-E outcomes here and, if that's all the comparison has, signal "unsupported"
    // so the caller can refuse the push with a clear message instead of corrupting.
    // Generic inverse-variance outcomes (estimate + SE) are refused the same way.
    var firstOutcome = null, oeOnly = null, ivOnly = null;
    for (var i = 0; i < comparison.outcomes.length; i++) {
      var o = comparison.outcomes[i];
      if (!o.studies || o.studies.length === 0) continue;
      if (o.type === "o_e_var") { if (!oeOnly) oeOnly = o; continue; }
      if (o.type === "generic_iv") { if (!ivOnly) ivOnly = o; continue; }
      firstOutcome = o; break;
    }
    if (!firstOutcome) {
      if (oeOnly) return { _unsupported: "o_e_var", name: oeOnly.name, effectMeasure: oeOnly.effectMeasure };
      if (ivOnly) return { _unsupported: "generic_iv", name: ivOnly.name, effectMeasure: ivOnly.effectMeasure };
      return null;
    }
    // Rows the reader could not use (outcome.skipped) are counted on the envelope so the
    // push message can say so; the key is absent when nothing was skipped.
    var readerSkipped = (firstOutcome.skipped && firstOutcome.skipped.length) || 0;

    // Binary or continuous: arm rows carry events/n or mean/sd directly.
    var studies = firstOutcome.studies.map(function (s) {
      return {
        id: s.id, year: s.year, arms: s.arms,
      };
    });
    if (!global.MaComparisons) {
      var plain = {
        _schema: "ma-comparisons-v1",
        _savedAt: new Date().toISOString(),
        effectMeasure: firstOutcome.effectMeasure,
        studies: studies,
      };
      if (readerSkipped > 0) plain._readerSkipped = readerSkipped;
      return plain;
    }
    // buildEnvelope drops studies whose rows are incomplete or impossible
    // (missing counts, events>n, sd<=0). Report how many so the importer can
    // tell the user instead of silently shipping fewer studies than they saw.
    var env = global.MaComparisons.buildEnvelope(studies, firstOutcome.effectMeasure);
    var dropped = studies.length - (env.studies ? env.studies.length : 0);
    if (dropped > 0) env._dropped = dropped;
    if (readerSkipped > 0) env._readerSkipped = readerSkipped;
    return env;
  }

  var api = { parse: parse, comparisonToBus: comparisonToBus,
              _parseXmlString: _parseXmlString, _isZip: _isZip };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RevmanReader = api;
})(typeof window !== "undefined" ? window : globalThis);
