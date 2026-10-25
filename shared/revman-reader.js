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
 *       </COMPARISON>
 *     </ANALYSES_AND_DATA>
 *     <STUDIES_AND_REFERENCES>
 *       <STUDIES>
 *         <STUDY ID="X" NAME="…" YEAR_OF_PUB="…" />
 *       </STUDIES>
 *     </STUDIES_AND_REFERENCES>
 *   </COCHRANE_REVIEW>
 *
 * Returns from parse(buffer):
 *   {
 *     title, version, studyCount,
 *     studies: { [id]: { id, name, year } },
 *     comparisons: [ {
 *       id, name,
 *       outcomes: [ {
 *         name, type: "binary" | "continuous" | "o_e_var",
 *         effectMeasure: "OR" | "RR" | "RD" | "PETO_OR" | "MD" | "SMD" | "HR",
 *         arm1Name, arm2Name,
 *         studies: [ { id, name, year, scale, arms: [{treatment, events, n} | {treatment, mean, sd, n}] } ]
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

  function _collectStudies(doc) {
    // STUDY entries live under STUDIES_AND_REFERENCES > STUDIES. Index by ID
    // so DICH_DATA / CONTINUOUS_DATA can resolve the human-readable name.
    var out = Object.create(null);
    var nodes = doc.getElementsByTagName("STUDY");
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i];
      var id = _attr(s, "ID");
      if (!id) continue;
      out[id] = {
        id: id,
        name: _attr(s, "NAME") || id,
        year: _numAttr(s, "YEAR_OF_PUB"),
      };
    }
    return out;
  }

  function _readDichOutcome(node, studyIndex, group1, group2) {
    var effect = _attr(node, "EFFECT_MEASURE") || "OR";
    // PETO_OR collapses to OR for downstream purposes.
    var em = effect === "PETO_OR" ? "OR" : effect.toUpperCase();
    var t1 = _attr(node, "GROUP_LABEL_1") || group1 || "Group 1";
    var t2 = _attr(node, "GROUP_LABEL_2") || group2 || "Group 2";

    var studies = [];
    var dataNodes = node.getElementsByTagName("DICH_DATA");
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var e1 = _numAttr(d, "EVENTS_1"), n1 = _numAttr(d, "TOTAL_1");
      var e2 = _numAttr(d, "EVENTS_2"), n2 = _numAttr(d, "TOTAL_2");
      if (e1 == null || n1 == null || e2 == null || n2 == null) continue;
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      studies.push({
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        arms: [
          { treatment: t1, events: e1, n: n1 },
          { treatment: t2, events: e2, n: n2 },
        ],
      });
    }
    return {
      name: _attr(node, "NAME") || "Outcome",
      type: "binary",
      effectMeasure: em,
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    };
  }

  function _readContinuousOutcome(node, studyIndex, group1, group2) {
    var em = (_attr(node, "EFFECT_MEASURE") || "MD").toUpperCase();
    var t1 = _attr(node, "GROUP_LABEL_1") || group1 || "Group 1";
    var t2 = _attr(node, "GROUP_LABEL_2") || group2 || "Group 2";

    var studies = [];
    var dataNodes = node.getElementsByTagName("CONTINUOUS_DATA");
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var n1 = _numAttr(d, "N_1"),  m1 = _numAttr(d, "MEAN_1"), sd1 = _numAttr(d, "SD_1");
      var n2 = _numAttr(d, "N_2"),  m2 = _numAttr(d, "MEAN_2"), sd2 = _numAttr(d, "SD_2");
      if (m1 == null || sd1 == null || n1 == null || m2 == null || sd2 == null || n2 == null) continue;
      if (sd1 <= 0 || sd2 <= 0 || n1 <= 0 || n2 <= 0) continue;
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      studies.push({
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        arms: [
          { treatment: t1, mean: m1, sd: sd1, n: n1 },
          { treatment: t2, mean: m2, sd: sd2, n: n2 },
        ],
      });
    }
    return {
      name: _attr(node, "NAME") || "Outcome",
      type: "continuous",
      effectMeasure: em,
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    };
  }

  function _readOEVarianceOutcome(node, studyIndex, group1, group2) {
    // O-E/Var outcomes carry a per-study log-HR (or log-OR for Peto) and its
    // variance directly. The bus doesn't carry pre-computed effects natively
    // (it carries arm-level counts), so we surface this as a "summary"
    // outcome whose arms carry a synthetic effect column. NMA consumers that
    // can ingest yi/vi (forest-plot path) will pick it up via the bus reader.
    var em = (_attr(node, "EFFECT_MEASURE") || "HR").toUpperCase();
    var t1 = _attr(node, "GROUP_LABEL_1") || group1 || "Experimental";
    var t2 = _attr(node, "GROUP_LABEL_2") || group2 || "Control";

    var studies = [];
    var dataNodes = node.getElementsByTagName("O_E_AND_VARIANCE_DATA");
    for (var i = 0; i < dataNodes.length; i++) {
      var d = dataNodes[i];
      var sid = _attr(d, "STUDY_ID");
      var oe = _numAttr(d, "O_MINUS_E"), va = _numAttr(d, "VARIANCE");
      if (oe == null || va == null || va <= 0) continue;
      var meta = studyIndex[sid] || { id: sid, name: sid, year: null };
      // Peto/O-E log estimate is oe/va; SE is 1/sqrt(va).
      var yi = oe / va, se = 1 / Math.sqrt(va);
      studies.push({
        id: meta.id, name: meta.name, year: meta.year,
        scale: em,
        precomputed: { est: yi, se: se },
        arms: [
          { treatment: t1, oeVarianceEst: yi, se: se },
          { treatment: t2, isReference: true },
        ],
      });
    }
    return {
      name: _attr(node, "NAME") || "Outcome",
      type: "o_e_var",
      effectMeasure: em,
      arm1Name: t1, arm2Name: t2,
      studies: studies,
    };
  }

  function _readComparison(node, studyIndex) {
    var name = _attr(node, "NAME") || "Comparison";
    var g1 = _attr(node, "GROUP_LABEL_1"), g2 = _attr(node, "GROUP_LABEL_2");
    var outcomes = [];

    var dichNodes = node.getElementsByTagName("DICH_OUTCOME");
    for (var i = 0; i < dichNodes.length; i++) outcomes.push(_readDichOutcome(dichNodes[i], studyIndex, g1, g2));
    var contNodes = node.getElementsByTagName("CONTINUOUS_OUTCOME");
    for (var j = 0; j < contNodes.length; j++) outcomes.push(_readContinuousOutcome(contNodes[j], studyIndex, g1, g2));
    var oeNodes = node.getElementsByTagName("O_E_AND_VARIANCE_OUTCOME");
    for (var k = 0; k < oeNodes.length; k++) outcomes.push(_readOEVarianceOutcome(oeNodes[k], studyIndex, g1, g2));

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
    var firstOutcome = null, oeOnly = null;
    for (var i = 0; i < comparison.outcomes.length; i++) {
      var o = comparison.outcomes[i];
      if (!o.studies || o.studies.length === 0) continue;
      if (o.type === "o_e_var") { if (!oeOnly) oeOnly = o; continue; }
      firstOutcome = o; break;
    }
    if (!firstOutcome) {
      if (oeOnly) return { _unsupported: "o_e_var", name: oeOnly.name, effectMeasure: oeOnly.effectMeasure };
      return null;
    }

    // Binary or continuous: arm rows carry events/n or mean/sd directly.
    var studies = firstOutcome.studies.map(function (s) {
      return {
        id: s.id, year: s.year, arms: s.arms,
      };
    });
    if (!global.MaComparisons) {
      return {
        _schema: "ma-comparisons-v1",
        _savedAt: new Date().toISOString(),
        effectMeasure: firstOutcome.effectMeasure,
        studies: studies,
      };
    }
    // buildEnvelope drops studies whose rows are incomplete or impossible
    // (missing counts, events>n, sd<=0). Report how many so the importer can
    // tell the user instead of silently shipping fewer studies than they saw.
    var env = global.MaComparisons.buildEnvelope(studies, firstOutcome.effectMeasure);
    var dropped = studies.length - (env.studies ? env.studies.length : 0);
    if (dropped > 0) env._dropped = dropped;
    return env;
  }

  var api = { parse: parse, comparisonToBus: comparisonToBus,
              _parseXmlString: _parseXmlString, _isZip: _isZip };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RevmanReader = api;
})(typeof window !== "undefined" ? window : globalThis);
