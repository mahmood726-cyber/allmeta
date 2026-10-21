/* shared/rve-extras.js — input parsing, conditioning (kappa), predictor centring,
 * R-script generation and export builders for rve-meta.
 *
 * The validated engine (shared/rve.js + shared/stats-qt.js) is NOT modified by
 * this file: everything here either prepares rows for AlmRVE.fitCORR or reads
 * its output. Centring changes only the design matrix handed to the engine.
 *
 *  - parseStudies(text): delimiter sniffing (comma / semicolon / tab), quote-aware
 *    splitting, optional header row (mapped by column name, incl. an SE column
 *    converted to vi = SE^2) and row/column-specific refusal messages.
 *  - kappaXtWX(rows, weights): 2-norm condition number of X'WX at the fitted
 *    CORR weights (ratio of extreme eigenvalues; X'WX is symmetric positive
 *    definite). KAPPA_THRESHOLD = 1e-9 / u, u = 2^-53, i.e. ~9.007e6: above it the
 *    first-order forward-error bound kappa*u exceeds 1e-9.
 *  - centreRows(rows): subtracts the arithmetic mean of every predictor column
 *    (not the intercept). Slopes, their SEs and df, and tau^2 are invariant;
 *    the intercept becomes the expected effect at the predictor means.
 *  - toRScript(state): a self-contained robumeta + clubSandwich script.
 *  - buildResult / toCoefficientCSV / toInputCSV / toReportMarkdown: exports.
 */
(function (global) {
  "use strict";

  var U = Math.pow(2, -53);
  var KAPPA_THRESHOLD = 1e-9 / U; // 9.007199254740992e6

  function UserError(msg) { var e = new Error(msg); e.userFacing = true; return e; }

  // ----- Parsing -------------------------------------------------------------

  function sniffDelimiter(line) {
    if (line.indexOf("\t") >= 0) return "\t";
    // Count delimiters outside double quotes.
    var inQ = false, semi = 0, comma = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === ";") semi++;
      else if (!inQ && ch === ",") comma++;
    }
    if (semi > 0 && semi >= comma) return ";";
    return ",";
  }

  // Quote-aware split. Fields may be wrapped in double quotes; "" inside quotes is
  // a literal quote. Surrounding whitespace is trimmed outside quotes.
  function splitLine(line, delim, lineNo) {
    var out = [], cur = "", inQ = false, quoted = false, i = 0;
    while (i < line.length) {
      var ch = line.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === '"' && !quoted && cur.trim() === "") { inQ = true; quoted = true; cur = ""; i++; continue; }
      if (ch === delim) { out.push(quoted ? cur : cur.trim()); cur = ""; quoted = false; i++; continue; }
      if (quoted) {
        if (ch.trim() !== "") throw UserError("Line " + lineNo + ": text after a closing quote; check the quoting of this row.");
        i++; continue; // Whitespace outside the closing quote is not field content.
      }
      cur += ch; i++;
    }
    if (inQ) throw UserError("Line " + lineNo + ": unclosed double quote.");
    out.push(quoted ? cur : cur.trim());
    return out;
  }

  var NAMES = {
    cluster: ["cluster", "study", "studyid", "study_id", "studynum", "id", "trial", "author"],
    yi: ["yi", "y", "es", "effect", "effectsize", "effect_size", "estimate", "g", "d", "smd", "lnor", "logor"],
    vi: ["vi", "v", "var", "variance", "var.eff.size", "var_eff_size", "sampling_variance"],
    se: ["se", "sei", "sete", "std.err", "std_err", "stderr", "standard_error"]
  };
  function canon(s) { return String(s).trim().toLowerCase().replace(/\s+/g, "_"); }
  function isNumberText(s) { return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(String(s).trim()); }

  // R's read.csv (type.convert, na.strings = "NA") reads a column as numeric
  // when every entry is a decimal or hexadecimal number, Inf/infinity, NaN or NA.
  var R_NUMBER = /^\s*[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|0x(?:[0-9a-f]+\.?[0-9a-f]*|\.[0-9a-f]+)(?:p[+-]?\d+)?|inf(?:inity)?|nan)\s*$/i;
  function rNumberValue(s) {
    var t = String(s).trim(), sign = /^-/.test(t) ? -1 : 1;
    t = t.replace(/^[+-]/, "");
    var hex = t.match(/^0x([0-9a-f]*)\.?([0-9a-f]*)(?:p([+-]?\d+))?$/i);
    if (!hex) return sign * Number(/^inf/i.test(t) ? Infinity : /^nan$/i.test(t) ? NaN : t);
    var v = 0, digits = hex[1] + hex[2];
    for (var i = 0; i < digits.length; i++) v = v * 16 + parseInt(digits.charAt(i), 16);
    return sign * v * Math.pow(2, Number(hex[3] || 0) - 4 * hex[2].length);
  }
  // robumeta orders clusters by as.factor(studynum), which sorts a numeric
  // column numerically ("2" < "10", and "007" and "7" are one study). Type the
  // cluster column as read.csv would; a numeric column must be finite.
  // type.convert() tries logical before numeric: a column of exactly T, F,
  // TRUE or FALSE (case-sensitive, after quote removal) is logical, and
  // as.factor(<logical>) has the levels "FALSE" < "TRUE". Those labels are
  // what the C-locale string path sorts, so the column becomes them.
  var R_LOGICAL = /^(?:T|F|TRUE|FALSE)$/;
  function typeClusters(rows, lineNos) {
    var labels = rows.map(function (r) { return r.cluster; });
    if (labels.every(function (s) { return R_LOGICAL.test(s) || s === "NA"; }) && labels.some(function (s) { return s !== "NA"; })) {
      labels.forEach(function (s, i) {
        if (s === "NA") throw UserError("Line " + lineNos[i] + ": cluster label 'NA' is missing. Every other cluster label is T/F/TRUE/FALSE, so R's read.csv would read this column as logical. Give every row a cluster label.");
        rows[i].cluster = s.charAt(0) === "T" ? "TRUE" : "FALSE";
      });
      return false;
    }
    if (!labels.every(function (s) { return R_NUMBER.test(s) || String(s).trim() === "NA"; })) return false;
    labels.forEach(function (s, i) {
      var v = String(s).trim() === "NA" ? NaN : rNumberValue(s);
      if (!isFinite(v)) throw UserError("Line " + lineNos[i] + ": cluster label '" + s + "' is not a finite number. Every other cluster label is a number, so R's read.csv would read this column as numeric. Use finite numbers, or text labels, for every cluster.");
      rows[i].cluster = v;
    });
    return true;
  }

  // Returns { rows, predictorNames (from header or null), header, delimiter,
  //           seColumn, columnLabels }
  function parseStudies(text) {
    var lines = String(text == null ? "" : text).split(/\r\n|\r|\n/);
    var data = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw.trim() || raw.trim().charAt(0) === "#") continue;
      data.push({ no: i + 1, text: raw });
    }
    if (!data.length) throw UserError("No data rows. Paste one row per effect: cluster, yi, vi, then any predictors.");
    var delim = sniffDelimiter(data[0].text);
    var delimName = delim === "\t" ? "tab" : (delim === ";" ? "semicolon" : "comma");
    var parsed = data.map(function (d) { return { no: d.no, f: splitLine(d.text, delim, d.no) }; });

    var header = null, colCluster = 0, colY = 1, colV = 2, colSE = -1, predCols = null;
    var first = parsed[0].f;
    // Remove a header only when all required roles have recognized names.
    // Otherwise validate the first row as data, including any malformed values.
    var c = first.map(canon);
    function find(list) { for (var a = 0; a < c.length; a++) if (list.indexOf(c[a]) >= 0) return a; return -1; }
    var fc = find(NAMES.cluster), fy = find(NAMES.yi), fv = find(NAMES.vi), fs = find(NAMES.se);
    if (fc >= 0 && fy >= 0 && (fv >= 0 || fs >= 0)) {
      header = first.map(function (h) { return String(h).trim(); });
      parsed.shift();
      colCluster = fc; colY = fy; colV = fv; colSE = fv >= 0 ? -1 : fs;
      predCols = [];
      for (var hc = 0; hc < header.length; hc++) if (hc !== colCluster && hc !== colY && hc !== colV && hc !== colSE) predCols.push(hc);
      if (!parsed.length) throw UserError("Only a header row was found; add data rows below it.");
    }
    if (!header) {
      if (first.length < 3) {
        throw UserError("Line " + parsed[0].no + ": needs at least 3 " + delimName + "-separated columns (cluster, yi, vi); found " + first.length + ".");
      }
    }
    var width = header ? header.length : first.length;
    if (!predCols) { predCols = []; for (var pc = 3; pc < width; pc++) predCols.push(pc); }
    var colLabel = function (col) {
      return header ? "'" + header[col] + "' (column " + (col + 1) + ")" : "column " + (col + 1);
    };

    var rows = [], lineNos = [];
    parsed.forEach(function (r) {
      lineNos.push(r.no);
      var f = r.f;
      if (f.length < 3) throw UserError("Line " + r.no + ": needs at least cluster, yi, vi (" + delimName + "-separated); found " + f.length + " column" + (f.length === 1 ? "" : "s") + ".");
      if (f.length !== width) {
        var hint = (delim === "," && f.length > width) ? " If a cluster label contains a comma, wrap it in double quotes." : "";
        throw UserError("Line " + r.no + ": inconsistent number of columns (" + f.length + ", expected " + width + ")." + hint);
      }
      var cluster = f[colCluster];
      if (!cluster || !String(cluster).trim()) throw UserError("Line " + r.no + ": empty cluster label.");
      if (/[\u0000]/.test(cluster)) throw UserError("Line " + r.no + ": cluster label contains a NUL character.");
      var ys = f[colY];
      if (!isNumberText(ys)) {
        var dc = (delim === ";" && /^[+-]?\d+,\d+$/.test(String(ys).trim())) ? " Decimal commas are not supported; use a point (0.45, not 0,45)." : "";
        throw UserError("Line " + r.no + ": effect size yi " + (header ? colLabel(colY) + " " : "") + "'" + ys + "' is not a number." + dc);
      }
      var yi = Number(ys), vi;
      if (colSE >= 0) {
        var ss = f[colSE];
        if (!isNumberText(ss) || !(Number(ss) > 0)) throw UserError("Line " + r.no + ": standard error " + colLabel(colSE) + " must be a positive number (got '" + ss + "').");
        vi = Number(ss) * Number(ss);
      } else {
        var vs = f[colV];
        if (!isNumberText(vs)) throw UserError("Line " + r.no + ": sampling variance vi '" + vs + "' is not a number.");
        vi = Number(vs);
        if (!(vi > 0)) throw UserError("Line " + r.no + ": vi must be a positive sampling variance (got " + vs + "). If this column holds standard errors, add a header row naming it 'se' (vi = SE\u00b2 is then computed).");
      }
      if (!isFinite(yi) || !isFinite(vi)) throw UserError("Line " + r.no + ": yi/vi out of range.");
      var xs = [1];
      for (var q = 0; q < predCols.length; q++) {
        var col = predCols[q], s = f[col];
        if (!isNumberText(s) || !isFinite(Number(s))) {
          throw UserError("Line " + r.no + ": predictor " + colLabel(col) + " value '" + s + "' is not a number. Missing values are not imputed: remove the row or fill in the value. Text categories must be coded as numbers (e.g. 0/1).");
        }
        xs.push(Number(s));
      }
      rows.push({ cluster: String(cluster), yi: yi, vi: vi, X: xs });
    });
    var clusterNumeric = typeClusters(rows, lineNos);
    return {
      rows: rows,
      clusterNumeric: clusterNumeric,
      predictorNames: header ? predCols.map(function (cc) { return header[cc]; }) : null,
      header: !!header,
      delimiter: delimName,
      seColumn: colSE >= 0,
      nPredictors: predCols.length
    };
  }

  // ----- Conditioning ----------------------------------------------------------

  function xtwx(rows, weights) {
    var p = rows[0].X.length, M = [];
    for (var a = 0; a < p; a++) { M.push(new Array(p).fill(0)); }
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i].X, w = weights[i];
      for (var r = 0; r < p; r++) for (var c = 0; c < p; c++) M[r][c] += w * x[r] * x[c];
    }
    return M;
  }

  function kappaXtWX(rows, weights) {
    if (!rows.length) return NaN;
    var M = xtwx(rows, weights);
    if (M.length === 1) return 1;
    var eig = global.AlmRVE._symEig(M).values.map(Math.abs);
    var mx = Math.max.apply(null, eig), mn = Math.min.apply(null, eig);
    return mn > 0 ? mx / mn : Infinity;
  }

  // ----- Centring --------------------------------------------------------------

  function centreRows(rows) {
    var p = rows[0].X.length, n = rows.length, means = [];
    for (var j = 1; j < p; j++) {
      var s = 0;
      for (var i = 0; i < n; i++) s += rows[i].X[j];
      means.push(s / n);
    }
    var out = rows.map(function (r) {
      var X = [1];
      for (var j2 = 1; j2 < p; j2++) X.push(r.X[j2] - means[j2 - 1]);
      return { cluster: r.cluster, yi: r.yi, vi: r.vi, X: X };
    });
    return { rows: out, means: means };
  }

  // ----- Working-correlation sensitivity ---------------------------------------
  // Refits the unchanged engine at each rho of robumeta::sensitivity()'s grid
  // (0, 0.2, ..., 1) and adds the inferential columns sensitivity() omits (df, CI,
  // p). Flags coefficients whose sign, or whose p < 0.05 status, changes across rho.
  var RHO_GRID = [0, 0.2, 0.4, 0.6, 0.8, 1];
  function rhoSensitivity(rows, grid) {
    grid = grid || RHO_GRID;
    var fits = grid.map(function (rho) {
      try {
        var f = global.AlmRVE.fitCORR(rows, { rho: rho });
        return { rho: rho, tau2: f.tau2, summary: global.AlmRVE.summary(f) };
      } catch (e) { return { rho: rho, error: e.message }; }
    });
    var ok = fits.filter(function (f) { return !f.error; });
    var p = ok.length ? ok[0].summary.length : 0, flags = [];
    for (var j = 0; j < p; j++) {
      var est = ok.map(function (f) { return f.summary[j].estimate; });
      var sig = ok.map(function (f) { return f.summary[j].p < 0.05; });
      flags.push({
        coef_index: j,
        sign_changes: est.some(function (e) { return e > 0; }) && est.some(function (e) { return e < 0; }),
        significance_changes: sig.some(Boolean) && sig.some(function (x) { return !x; })
      });
    }
    return { grid: grid.slice(), fits: fits, flags: flags };
  }

  function toRhoSensitivityCSV(sens, coefNames) {
    var L = [["rho", "term", "estimate", "se", "t", "df", "ci_lo", "ci_hi", "p", "tau2"].join(",")];
    sens.fits.forEach(function (f) {
      if (f.error) { L.push([f.rho, csvCell("(refused: " + f.error + ")"), "", "", "", "", "", "", "", ""].join(",")); return; }
      f.summary.forEach(function (s, j) {
        L.push([f.rho, csvCell(coefNames[j]), s.estimate, s.se, s.t, s.df, s.ci_lo, s.ci_hi, s.p, f.tau2].map(String).join(","));
      });
    });
    return L.join("\r\n") + "\r\n";
  }

  // ----- R script ----------------------------------------------------------------

  function rString(s) {
    var out = '"';
    var str = String(s);
    for (var i = 0; i < str.length; i++) {
      var cp = str.codePointAt(i);
      if (cp > 0xffff) i++;
      if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // lone surrogate
      if (cp === 0x5c) out += "\\\\";
      else if (cp === 0x22) out += '\\"';
      else if (cp === 0x0a) out += "\\n";
      else if (cp === 0x0d) out += "\\r";
      else if (cp === 0x09) out += "\\t";
      else if (cp === 0) out += "\\uFFFD";
      else if (cp < 0x20 || cp === 0x7f) out += "\\x" + ("0" + cp.toString(16)).slice(-2);
      else if (cp > 0x7e) out += cp > 0xffff ? "\\U{" + cp.toString(16) + "}" : "\\u{" + cp.toString(16) + "}";
      else out += String.fromCharCode(cp);
    }
    return out + '"';
  }

  var R_RESERVED = ["if", "else", "repeat", "while", "function", "for", "next", "break", "TRUE", "FALSE", "NULL", "Inf", "NaN", "NA", "NA_integer_", "NA_real_", "NA_character_", "NA_complex_", "in", "T", "F"];
  function rColumnNames(names) {
    // Also reserve the column names robu() adds to its internal data frame
    // (study, k, weights, pred, e, ...): a predictor called "study" otherwise
    // makes robu fail with "arguments must have same length".
    var used = { cluster: 1, yi: 1, vi: 1, d: 1, fit: 1, ct: 1, study: 1, studynum: 1, k: 1, weights: 1,
                 pred: 1, e: 1, userweights: 1, ImH: 1, predictor_labels: 1 };
    return names.map(function (nm, i) {
      var b = String(nm == null ? "" : nm).normalize ? String(nm).normalize("NFKD") : String(nm);
      b = b.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
      if (!b) b = "x" + (i + 1);
      if (!/^[A-Za-z]/.test(b)) b = "x_" + b;
      if (R_RESERVED.indexOf(b) >= 0) b = b + "_";
      b = b.slice(0, 40);
      var base = b, k = 2;
      while (used[b] || used[b + "_c"]) b = base + "_" + (k++);
      used[b] = 1; used[b + "_c"] = 1;
      return b;
    });
  }

  function rNum(x) {
    if (!isFinite(x)) throw new Error("non-finite value cannot be written to R");
    return String(x);
  }

  // state: { rows (raw, uncentred, X incl. intercept), names, rho, centred, version }
  function toRScript(state) {
    var rows = state.rows, p = rows[0].X.length, q = p - 1;
    var names = (state.names || []).slice(0, q);
    while (names.length < q) names.push("x" + (names.length + 1));
    var cols = rColumnNames(names);
    var L = [];
    L.push("# robumeta / clubSandwich reproduction of an allmeta rve-meta fit");
    L.push("# Generated " + (state.generated || new Date().toISOString()) + " by allmeta rve-meta " + (state.version || ""));
    L.push("# Reference functions: robumeta::robu(modelweights = \"CORR\", small = TRUE) and");
    L.push("# clubSandwich::coef_test(vcov = \"CR2\", test = \"Satterthwaite\").");
    L.push("# The app was validated against robumeta 2.1 and clubSandwich 0.7.0 (R 4.6.0,");
    L.push("# Windows x64, LC_COLLATE=C). Other platforms or a non-C collation of text");
    L.push("# cluster labels can change results in the last digits: Sys.setlocale(\"LC_COLLATE\", \"C\").");
    L.push("# If needed: install.packages(c(\"robumeta\", \"clubSandwich\"))");
    L.push("");
    L.push("library(robumeta)");
    L.push("library(clubSandwich)");
    L.push("");
    L.push("d <- data.frame(");
    // A numeric cluster column stays numeric so robu's as.factor() orders it
    // as the app does.
    var numericClusters = rows.every(function (r) { return typeof r.cluster === "number"; });
    L.push("  cluster = c(" + rows.map(function (r) { return numericClusters ? rNum(r.cluster) : rString(r.cluster); }).join(", ") + "),");
    L.push("  yi = c(" + rows.map(function (r) { return rNum(r.yi); }).join(", ") + "),");
    var viLine = "  vi = c(" + rows.map(function (r) { return rNum(r.vi); }).join(", ") + ")";
    L.push(viLine + (q ? "," : ""));
    for (var j = 0; j < q; j++) {
      L.push("  " + cols[j] + " = c(" + rows.map(function (r) { return rNum(r.X[j + 1]); }).join(", ") + ")" + (j < q - 1 ? "," : ""));
    }
    L.push(")");
    L.push("");
    if (q) {
      L.push("# Predictor labels as typed in the app (R column name = label)");
      L.push("predictor_labels <- c(" + cols.map(function (c, i) { return c + " = " + rString(names[i]); }).join(", ") + ")");
      L.push("");
    }
    var terms = cols.slice();
    if (state.centred && q) {
      L.push("# Predictors centred at their means: the intercept is the effect at the predictor means.");
      for (var c2 = 0; c2 < q; c2++) L.push("d$" + cols[c2] + "_c <- d$" + cols[c2] + " - mean(d$" + cols[c2] + ")");
      L.push("");
      terms = cols.map(function (c) { return c + "_c"; });
    }
    var formula = "yi ~ " + (q ? terms.join(" + ") : "1");
    L.push("fit <- robu(" + formula + ", data = d, studynum = cluster, var.eff.size = vi,");
    L.push("            modelweights = \"CORR\", rho = " + rNum(state.rho) + ", small = TRUE)");
    L.push("print(fit)");
    L.push("");
    L.push("ct <- coef_test(fit, vcov = \"CR2\", test = \"Satterthwaite\")");
    L.push("print(ct)");
    L.push("");
    L.push("sessionInfo()");
    return L.join("\n") + "\n";
  }

  // ----- Exports -------------------------------------------------------------------

  var CSV_DANGEROUS = /^[=+@\t\r]/;
  function csvCell(v) {
    var s = (v == null) ? "" : String(v);
    if (CSV_DANGEROUS.test(s)) s = "'" + s;
    if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function coefficientNames(names, p, centred) {
    var out = [centred && p > 1 ? "(intercept: effect at predictor means)" : "(intercept)"];
    for (var j = 1; j < p; j++) out.push(names[j - 1] != null && names[j - 1] !== "" ? names[j - 1] : "x" + j);
    return out;
  }

  // state: { rawRows, names, rho, centred, means, fit, summary, kappa, warnings, parseInfo, buildInfo }
  function buildResult(st) {
    var p = st.fit.p;
    var cn = coefficientNames(st.names, p, st.centred);
    var bi = st.buildInfo || {};
    return {
      _schema: "allmeta.rve-meta.result.v2",
      software: {
        app: "allmeta rve-meta",
        version: bi.version || null,
        build_sha: bi.sha || null,
        url: "https://mahmood726-cyber.github.io/allmeta/rve-meta/",
        engine: "shared/rve.js (CORR working model, CR2 standard errors, Satterthwaite df)",
        validated_against: "robumeta 2.1 robu(modelweights='CORR', small=TRUE); clubSandwich 0.7.0 coef_test(vcov='CR2', test='Satterthwaite'); R 4.6.0 (Windows x64, LC_COLLATE=C)"
      },
      inputs: {
        rho: st.rho,
        predictor_names: cn.slice(1),
        centred: !!st.centred,
        predictor_means: st.centred ? st.means : null,
        delimiter: st.parseInfo ? st.parseInfo.delimiter : null,
        header_row: st.parseInfo ? st.parseInfo.header : null,
        vi_from_se: st.parseInfo ? st.parseInfo.seColumn : null,
        rows: st.rawRows.map(function (r) { return { cluster: r.cluster, yi: r.yi, vi: r.vi, x: r.X.slice(1) }; })
      },
      coefficients: st.summary.map(function (s, j) {
        return { term: cn[j], estimate: s.estimate, se: s.se, t: s.t, df: s.df, ci_lo: s.ci_lo, ci_hi: s.ci_hi, p: s.p };
      }),
      model: { k_effects: st.fit.k_total, m_clusters: st.fit.m_clusters, p_coefficients: p, tau2: st.fit.tau2, rho: st.fit.rho, method: st.fit.method },
      conditioning: { kappa_XtWX: isFinite(st.kappa) ? st.kappa : null, threshold: KAPPA_THRESHOLD, ill_conditioned: st.kappa > KAPPA_THRESHOLD },
      warnings: st.warnings.slice(),
      fit: st.fit,
      summary: st.summary
    };
  }

  function toCoefficientCSV(res) {
    var L = [["term", "estimate", "se", "t", "df", "ci_lo", "ci_hi", "p"].join(",")];
    res.coefficients.forEach(function (c) {
      L.push([csvCell(c.term), c.estimate, c.se, c.t, c.df, c.ci_lo, c.ci_hi, c.p].map(String).join(","));
    });
    return L.join("\r\n") + "\r\n";
  }

  function toInputCSV(res) {
    var names = res.inputs.predictor_names;
    var L = [["cluster", "yi", "vi"].concat(names).map(csvCell).join(",")];
    res.inputs.rows.forEach(function (r) {
      L.push([csvCell(r.cluster), r.yi, r.vi].concat(r.x).map(String).join(","));
    });
    return L.join("\r\n") + "\r\n";
  }

  function fmt(x, d) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(d) : "NA"; }
  function mdCell(s) { return String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").replace(/[<>]/g, function (c) { return c === "<" ? "&lt;" : "&gt;"; }); }
  function kappaText(k) { return isFinite(k) ? k.toExponential(2) : "infinite"; }

  function toReportMarkdown(res, today) {
    var m = res.model, L = [];
    L.push("# Robust variance estimation meta-regression (allmeta rve-meta)");
    L.push("");
    L.push("_Generated " + (today || new Date().toISOString().slice(0, 10)) + " with allmeta rve-meta" + (res.software.version ? " " + res.software.version : "") + (res.software.build_sha ? " (build " + res.software.build_sha.slice(0, 7) + ")" : "") + ", " + res.software.url + "._");
    L.push("");
    L.push("## Methods");
    L.push("");
    var q = m.p_coefficients - 1;
    L.push("Dependent effect sizes were synthesised with robust variance estimation (Hedges, Tipton and Johnson 2010) using the correlated-effects (CORR) working model with an assumed within-cluster correlation of \u03c1 = " + m.rho + ". " +
      "The between-cluster variance \u03c4\u00b2 was estimated with the method-of-moments estimator of the CORR model. " +
      "Standard errors used the CR2 bias-reduced small-sample correction with Satterthwaite degrees of freedom for each coefficient (Tipton 2015), and 95% confidence intervals and p-values used the Student t distribution with those degrees of freedom. " +
      (q ? "The model included " + q + " predictor" + (q > 1 ? "s" : "") + " (" + res.inputs.predictor_names.join(", ") + ") and an intercept" + (res.inputs.centred ? "; predictors were centred at their means, so the intercept is the expected effect at the predictor means" : "") + ". " : "The model was intercept-only. ") +
      "This corresponds to robumeta::robu(modelweights = \"CORR\", small = TRUE) and clubSandwich::coef_test(vcov = \"CR2\", test = \"Satterthwaite\") in R; an R script reproducing this fit can be exported from the app.");
    L.push("");
    L.push("## Results");
    L.push("");
    L.push("k = " + m.k_effects + " effect sizes in m = " + m.m_clusters + " clusters; \u03c4\u00b2 = " + fmt(m.tau2, 4) + "; \u03c1 = " + m.rho + "; condition number \u03ba\u2082(X\u1d40WX) = " + kappaText(res.conditioning.kappa_XtWX) + ".");
    L.push("");
    L.push("| Term | Estimate | SE (CR2) | t | df (Satterthwaite) | 95% CI | p |");
    L.push("|---|---:|---:|---:|---:|---|---:|");
    res.coefficients.forEach(function (c) {
      L.push("| " + mdCell(c.term) + " | " + fmt(c.estimate, 4) + " | " + fmt(c.se, 4) + " | " + fmt(c.t, 2) + " | " + fmt(c.df, 2) + " | " + fmt(c.ci_lo, 4) + " to " + fmt(c.ci_hi, 4) + " | " + (c.p < 0.001 ? "<0.001" : fmt(c.p, 3)) + " |");
    });
    if (res.warnings.length) {
      L.push("");
      L.push("**Warnings:**");
      res.warnings.forEach(function (w) { L.push("- " + mdCell(w)); });
    }
    L.push("");
    L.push("## Input data");
    L.push("");
    var names = res.inputs.predictor_names;
    L.push("| cluster | yi | vi" + names.map(function (n) { return " | " + mdCell(n); }).join("") + " |");
    L.push("|---|---:|---:" + names.map(function () { return "|---:"; }).join("") + "|");
    res.inputs.rows.forEach(function (r) {
      L.push("| " + mdCell(r.cluster) + " | " + r.yi + " | " + r.vi + r.x.map(function (v) { return " | " + v; }).join("") + " |");
    });
    L.push("");
    L.push("## References");
    L.push("");
    L.push("- Hedges LV, Tipton E, Johnson MC. Robust variance estimation in meta-regression with dependent effect size estimates. Res Synth Methods. 2010;1(1):39-65. doi:10.1002/jrsm.5");
    L.push("- Tipton E. Small sample adjustments for robust variance estimation with meta-regression. Psychol Methods. 2015;20(3):375-393. doi:10.1037/met0000011");
    L.push("");
    return L.join("\n");
  }

  var api = {
    KAPPA_THRESHOLD: KAPPA_THRESHOLD,
    parseStudies: parseStudies,
    sniffDelimiter: sniffDelimiter,
    splitLine: splitLine,
    kappaXtWX: kappaXtWX,
    xtwx: xtwx,
    centreRows: centreRows,
    rString: rString,
    rColumnNames: rColumnNames,
    toRScript: toRScript,
    coefficientNames: coefficientNames,
    buildResult: buildResult,
    toCoefficientCSV: toCoefficientCSV,
    toInputCSV: toInputCSV,
    toReportMarkdown: toReportMarkdown,
    RHO_GRID: RHO_GRID,
    rhoSensitivity: rhoSensitivity,
    toRhoSensitivityCSV: toRhoSensitivityCSV,
    kappaText: kappaText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRVEExtras = api;
})(typeof window !== "undefined" ? window : globalThis);
