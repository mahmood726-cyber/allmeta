/* correlation-ma/plus-core.js — pure functions behind the "plus" panel (paper 17).
 *
 * Everything here is computed by AlmMaCore.pool() (shared/ma-core.js) on the same Fisher-z
 * inputs the page itself uses (z = atanh(r), v = 1/(n-3)); no estimator is re-implemented.
 *   sensitivity()  REML/PM/DL/FE x {Wald z, HKSJ (metafor test="knha"), HKSJ ad-hoc floor
 *                  max(1,q) (metafor test="adhoc")}; explicit t_{k-1} prediction interval.
 *   leaveOneOut()  per-study omission fits; flags only from the computed numbers.
 *   rScript()      a runnable metafor script reproducing the current selection.
 *   plainLanguage() / methodsText()  prose bound to the same display strings as the table.
 * Browser: window.AlmCorrPlus. Node: module.exports.
 */
(function (global) {
  "use strict";

  var METHODS = ["REML", "PM", "DL", "FE"];
  var TESTS = ["z", "knha", "adhoc"];
  var METHOD_NAMES = { REML: "restricted maximum likelihood (REML)", PM: "Paule–Mandel", DL: "DerSimonian–Laird", FE: "fixed-effect (common-effect)" };
  var TEST_NAMES = { z: "Wald z", knha: "HKSJ", adhoc: "HKSJ (ad-hoc floor)" };
  var LOO_MAX_K = 200; // = the oracle-validated range (metafor leave1out run for every input with 3 <= k <= 200)

  function core() {
    var c = global.AlmMaCore;
    if (!c && typeof require === "function") c = require("../shared/ma-core.js");
    if (!c || typeof c.pool !== "function") throw new Error("AlmMaCore.pool is not loaded");
    return c;
  }

  function fmt(x, d) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(d == null ? 3 : d) : "—"; }

  // Same transformation as the page parser (index.html): z = atanh(r), v = 1/(n-3).
  function prepare(studies) {
    if (!Array.isArray(studies)) throw new Error("studies must be an array");
    var z = [], v = [], labels = [];
    studies.forEach(function (s) {
      var r = s.r, n = s.n;
      if (!(typeof r === "number" && isFinite(r) && r > -1 && r < 1 && typeof n === "number" && isFinite(n) && n > 3)) {
        throw new Error("non-finite or out-of-range study passed to plus-core: " + JSON.stringify(s));
      }
      z.push(Math.atanh(r)); v.push(1 / (n - 3)); labels.push(String(s.label));
    });
    return { z: z, v: v, labels: labels, k: z.length };
  }

  function excludesZero(lo, hi) { return lo > 0 || hi < 0; }

  // One fit. FE x HKSJ is not offered by ma-core (it disables knha for FE): reported as not applicable.
  function fitCell(z, v, method, test) {
    var k = z.length;
    if (method === "FE" && test !== "z") {
      return { method: method, test: test, applicable: false, k: k, reason: "HKSJ is not applicable to the fixed-effect model" };
    }
    var p = core().pool(z, v, { method: method, pi: true, knha: test !== "z", knhaFloor: test === "adhoc" });
    var re = method !== "FE";
    var cell = {
      method: method, test: test, applicable: true, k: k, df: k - 1,
      mu_z: p.mu, se_z: p.se, tau2_z: p.tau2, tau_z: Math.sqrt(p.tau2),
      I2: p.I2, // RE: tau2-based; FE: Q-based max(0,100(Q-df)/Q), as metafor (ma-core on the v1 branch)
      Q: p.Q,
      ciLo: p.ciLo, ciHi: p.ciHi,
      piLo: re && p.piLo != null ? p.piLo : null, piHi: re && p.piHi != null ? p.piHi : null,
      r: Math.tanh(p.mu), r_lo: Math.tanh(p.ciLo), r_hi: Math.tanh(p.ciHi),
      r_pi_lo: re && p.piLo != null ? Math.tanh(p.piLo) : null,
      r_pi_hi: re && p.piHi != null ? Math.tanh(p.piHi) : null,
      ci_excludes_0: excludesZero(p.ciLo, p.ciHi),
      zero_width_ci: p.ciHi - p.ciLo === 0,
    };
    // With tau2 = 0 the t_{k-1} PI uses the same SE and quantile as the HKSJ CI, so the two coincide
    // (metafor predict() on a knha/adhoc fit gives the same). Flagged from the computed widths.
    if (re) {
      var wPi = cell.piHi - cell.piLo, wCi = cell.ciHi - cell.ciLo;
      cell.pi_equals_ci = Math.abs(wPi - wCi) <= 1e-12 * Math.max(1, wCi);
    }
    return cell;
  }

  function sensitivity(studies, current) {
    var d = prepare(studies);
    if (d.k < 2) return { _schema: "corr-ma-plus-v1", refused: true, k: d.k, reason: "Enter at least 2 studies (label, r, n)." };
    current = current || {};
    var cells = [];
    METHODS.forEach(function (m) { TESTS.forEach(function (t) { cells.push(fitCell(d.z, d.v, m, t)); }); });
    // Flag: an HKSJ interval narrower than the Wald interval for the same estimator (happens when q < 1).
    METHODS.forEach(function (m) {
      var wald = find(cells, m, "z");
      ["knha", "adhoc"].forEach(function (t) {
        var c = find(cells, m, t);
        if (c.applicable) c.narrower_than_wald = (c.ciHi - c.ciLo) < (wald.ciHi - wald.ciLo);
      });
    });
    return {
      _schema: "corr-ma-plus-v1", refused: false, k: d.k,
      current: { method: current.method || "REML", test: current.test || "z" },
      cells: cells,
    };
  }

  function find(cells, m, t) {
    for (var i = 0; i < cells.length; i++) if (cells[i].method === m && cells[i].test === t) return cells[i];
    return null;
  }

  function leaveOneOut(studies, method, test) {
    var d = prepare(studies);
    if (d.k < 3) return { refused: true, k: d.k, reason: "Leave-one-out needs at least 3 studies (k = " + d.k + ")." };
    if (d.k > LOO_MAX_K) return { refused: true, k: d.k, reason: "Leave-one-out is limited to " + LOO_MAX_K + " studies in the browser (k = " + d.k + ")." };
    if (method === "FE" && test !== "z") return { refused: true, k: d.k, reason: "HKSJ is not applicable to the fixed-effect model." };
    var full = fitCell(d.z, d.v, method, test);
    var rows = [], best = -1, bestAbs = -Infinity, nChange = 0;
    for (var i = 0; i < d.k; i++) {
      var z = d.z.slice(0, i).concat(d.z.slice(i + 1)), v = d.v.slice(0, i).concat(d.v.slice(i + 1));
      var c = fitCell(z, v, method, test);
      c.omitted = d.labels[i]; c.omitted_index = i + 1;
      if (method === "FE") c.I2 = null; // FE leave-one-out I² is not in the validated scope
      c.delta_r = c.r - full.r;
      c.changes_ci_excludes_0 = c.ci_excludes_0 !== full.ci_excludes_0;
      if (c.changes_ci_excludes_0) nChange++;
      if (Math.abs(c.delta_r) > bestAbs) { bestAbs = Math.abs(c.delta_r); best = i + 1; }
      rows.push(c);
    }
    return { refused: false, k: d.k, method: method, test: test, full: full, rows: rows,
             n_changes_ci_excludes_0: nChange, largest_abs_delta_index: best };
  }

  // ---------- R script export ----------
  function rStr(s) {
    var out = '"';
    // ASCII-only output; R cannot hold NUL or lone surrogates, so those become U+FFFD.
    Array.from(String(s)).forEach(function (ch) {
      var c = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === '"') out += '\\"';
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (c === 0 || (c >= 0xd800 && c <= 0xdfff)) out += "\\u{fffd}";
      else if (c < 0x20 || c > 0x7e) out += (c > 0xffff ? "\\U{" : "\\u{") + c.toString(16) + "}";
      else out += ch;
    });
    return out + '"';
  }
  function rNum(x) {
    if (!(typeof x === "number" && isFinite(x))) throw new Error("rScript: refusing non-finite value " + x);
    return String(x);
  }

  function rScript(studies, opts) {
    opts = opts || {};
    var method = opts.method || "REML", test = opts.test || "z", loo = !!opts.loo;
    if (METHODS.indexOf(method) < 0 || TESTS.indexOf(test) < 0) throw new Error("rScript: unknown method/test");
    if (method === "FE" && test !== "z") throw new Error("rScript: HKSJ is not applicable to the fixed-effect model");
    var d = prepare(studies);
    if (d.k < 2) throw new Error("rScript: needs at least 2 studies");
    var lines = [];
    lines.push("# Correlation meta-analysis exported from allmeta correlation-ma (plus panel).");
    lines.push("# Reproduces the selected analysis: method = " + method + ", CI test = " + test + ", k = " + d.k + ".");
    lines.push("# Requires the metafor package: install.packages(\"metafor\")");
    lines.push("suppressPackageStartupMessages(library(metafor))");
    lines.push("dat <- data.frame(");
    lines.push("  label = c(" + studies.map(function (s) { return rStr(s.label); }).join(", ") + "),");
    lines.push("  r = c(" + studies.map(function (s) { return rNum(s.r); }).join(", ") + "),");
    lines.push("  n = c(" + studies.map(function (s) { return rNum(s.n); }).join(", ") + "),");
    lines.push("  stringsAsFactors = FALSE)");
    lines.push("# Fisher z: yi = atanh(r), vi = 1/(n - 3)");
    lines.push("dat <- escalc(measure = \"ZCOR\", ri = r, ni = n, data = dat)");
    lines.push("# test = \"z\": Wald; \"knha\": Hartung-Knapp-Sidik-Jonkman; \"adhoc\": HKSJ with q floored at 1");
    lines.push("fit <- rma(yi, vi, data = dat, method = " + rStr(method) + ", test = " + rStr(test) + ",");
    lines.push("  control = list(threshold = 1e-12, maxiter = 10000, stepadj = 0.5, tol = .Machine$double.eps^0.75))");
    lines.push("print(fit)");
    lines.push("k <- fit$k");
    lines.push("mu <- as.numeric(fit$b)");
    if (method !== "FE") {
      lines.push("# 95% prediction interval with t on k - 1 df (Cochrane Handbook v6.5), formed explicitly:");
      lines.push("# metafor's predict() uses the normal quantile for test = \"z\" fits.");
      lines.push("pint <- mu + c(-1, 1) * qt(0.975, df = k - 1) * sqrt(fit$tau2 + fit$se^2)");
    } else {
      lines.push("pint <- c(NA_real_, NA_real_)  # no prediction interval for the fixed-effect model");
    }
    lines.push("res <- c(r = tanh(mu), r_lo = tanh(fit$ci.lb), r_hi = tanh(fit$ci.ub), r_pi_lo = tanh(pint[1]), r_pi_hi = tanh(pint[2]),");
    lines.push("  tau2_z = fit$tau2, I2 = fit$I2, Q = fit$QE)");
    lines.push("print(round(res, 4))");
    lines.push("j <- function(x) if (length(x) == 1) { if (is.na(x)) \"null\" else sprintf(\"%.17g\", x) } else paste0(\"[\", paste(vapply(x, function(e) if (is.na(e)) \"null\" else sprintf(\"%.17g\", e), \"\"), collapse = \",\"), \"]\")");
    var fields = "\"{\\\"k\\\":\", k, \",\\\"mu_z\\\":\", j(mu), \",\\\"se_z\\\":\", j(fit$se), \",\\\"tau2_z\\\":\", j(fit$tau2), \",\\\"I2\\\":\", j(fit$I2), \",\\\"Q\\\":\", j(fit$QE), \",\\\"ciLo\\\":\", j(fit$ci.lb), \",\\\"ciHi\\\":\", j(fit$ci.ub), \",\\\"piLo\\\":\", j(pint[1]), \",\\\"piHi\\\":\", j(pint[2])";
    if (loo) {
      lines.push("l <- leave1out(fit)");
      lines.push("print(l)");
      fields += ", \",\\\"loo_mu_z\\\":\", j(as.numeric(l$estimate)), \",\\\"loo_ciLo\\\":\", j(as.numeric(l$ci.lb)), \",\\\"loo_ciHi\\\":\", j(as.numeric(l$ci.ub))";
    }
    lines.push("cat(\"ALMJSON:\", paste0(" + fields + ", \"}\"), \"\\n\", sep = \"\")");
    return lines.join("\n") + "\n";
  }

  // ---------- plain language + Methods ----------
  var BENCHMARKS = {
    cohen: { name: "Cohen's conventional benchmarks", cuts: [0.10, 0.30, 0.50], cite: "Cohen 1988", labels: ["very small", "small", "medium", "large"] },
    gignac: { name: "Gignac and Szodorai's benchmarks", cuts: [0.10, 0.20, 0.30], cite: "Gignac & Szodorai 2016", labels: ["very small", "small", "typical", "large"] },
  };
  function category(r, bench) {
    var b = BENCHMARKS[bench || "cohen"], a = Math.abs(r);
    if (a < b.cuts[0]) return b.labels[0];
    if (a < b.cuts[1]) return b.labels[1];
    if (a < b.cuts[2]) return b.labels[2];
    return b.labels[3];
  }

  function plainLanguage(cell, opts) {
    opts = opts || {};
    if (!cell || !cell.applicable) return null;
    var bench = BENCHMARKS[opts.benchmark || "cohen"];
    var dir = cell.r > 0 ? "positive" : (cell.r < 0 ? "negative" : "zero");
    var cLo = category(cell.r_lo, opts.benchmark), cHi = category(cell.r_hi, opts.benchmark);
    var spans = cLo !== cHi || (cell.r_lo < 0) !== (cell.r_hi < 0);
    var p = [];
    p.push("Across k = " + cell.k + " studies, the pooled correlation was r = " + fmt(cell.r) + " (95% CI " + fmt(cell.r_lo) + " to " + fmt(cell.r_hi) + "); the point estimate is a " +
      category(cell.r, opts.benchmark) + " " + dir + " correlation by " + bench.name + " (" + bench.cite + "; |r| " + bench.cuts.map(function (c) { return c.toFixed(2); }).join(" / ") + ")" +
      (spans ? ", but the confidence interval spans more than one benchmark category, so the magnitude is uncertain." : "."));
    p.push("The confidence interval is compatible with population correlations from " + fmt(cell.r_lo) + " to " + fmt(cell.r_hi) +
      (cell.ci_excludes_0 ? "; it excludes zero." : "; it includes zero, so a zero correlation is not ruled out."));
    if (cell.r_pi_lo != null) {
      var vacuous = fmt(cell.r_pi_lo) === "-1.000" && fmt(cell.r_pi_hi) === "1.000";
      p.push("The 95% prediction interval, for the true correlation in a new comparable study, runs from " + fmt(cell.r_pi_lo) + " to " + fmt(cell.r_pi_hi) +
        (vacuous ? "; it covers the whole correlation scale and is uninformative." : "."));
      if (!vacuous && cell.r_pi_lo < 0 && cell.r_pi_hi > 0 && cell.ci_excludes_0)
        p.push("The prediction interval includes correlations of both signs, so the average should not be read as the correlation in every setting.");
      p.push("Between-study heterogeneity: τ² = " + fmt(cell.tau2_z, 4) + " on the Fisher-z scale (τ = " + fmt(cell.tau_z, 4) + "), I² = " + fmt(cell.I2, 1) + "%.");
    } else {
      p.push("The fixed-effect model assumes one common correlation, so no prediction interval or between-study variance is reported.");
    }
    var cav = ["Correlation does not establish causation.",
      "The pooled r is tanh of the weighted mean Fisher z, not an average of the r values.",
      "If several rows come from the same sample they are not independent: the intervals are then too narrow, and a multilevel or robust-variance analysis is needed (not provided here).",
      "Rows with r = ±1, |r| > 1 or n ≤ 3 are excluded before pooling."];
    if (cell.pi_equals_ci) cav.unshift("τ² was estimated as 0, so the prediction interval coincides with the " + (cell.test === "z" ? "" : "HKSJ ") + "confidence interval; this does not show that the studies are homogeneous.");
    if (cell.narrower_than_wald) cav.unshift("Here q < 1, so this HKSJ interval is narrower than the Wald interval; the ad-hoc variant (q floored at 1) is the conservative check.");
    if (cell.k < 5) cav.unshift("With fewer than 5 studies, τ² and I² are estimated very imprecisely" +
      (cell.test === "z" ? " and the Wald interval can be too narrow; compare the HKSJ columns of the sensitivity table." : "; the HKSJ interval uses t with only " + cell.df + " degree" + (cell.df === 1 ? "" : "s") + " of freedom."));
    return { summary: p.join(" "), caveats: cav };
  }

  function methodsText(cell, scope) {
    if (!cell || !cell.applicable) return null;
    scope = scope || {};
    var ci = { z: "a normal (Wald) distribution", knha: "the Hartung–Knapp–Sidik–Jonkman (HKSJ) adjustment with a t distribution on k − 1 degrees of freedom (metafor test = \"knha\")",
      adhoc: "the HKSJ adjustment with its scaling factor floored at 1, max(1, q), and a t distribution on k − 1 degrees of freedom (metafor test = \"adhoc\")" }[cell.test];
    var m = [];
    m.push("Correlation coefficients were transformed to Fisher's z (z = atanh r, sampling variance 1/(n − 3)) and pooled by inverse-variance weighting " +
      (cell.method === "FE" ? "under a fixed-effect (common-effect) model." : "under a random-effects model with the " + METHOD_NAMES[cell.method] + " estimator of the between-study variance τ²."));
    m.push("The 95% confidence interval used " + ci + ".");
    if (cell.method !== "FE") m.push("The 95% prediction interval was μ ± t(0.975, k − 1) × √(τ² + SE²).");
    m.push("Estimates were back-transformed to r with tanh.");
    if (scope.text) m.push(scope.text);
    var res = "Results: k = " + cell.k + "; pooled r = " + fmt(cell.r) + " (95% CI " + fmt(cell.r_lo) + " to " + fmt(cell.r_hi) + ")" +
      (cell.r_pi_lo != null ? "; 95% PI " + fmt(cell.r_pi_lo) + " to " + fmt(cell.r_pi_hi) + "; τ²(z) = " + fmt(cell.tau2_z, 4) + "; I² = " + fmt(cell.I2, 1) + "%" : "") +
      "; Q = " + fmt(cell.Q, 2) + " on " + cell.df + " df.";
    return { methods: m.join(" "), results: res };
  }

  var api = {
    METHODS: METHODS, TESTS: TESTS, TEST_NAMES: TEST_NAMES, METHOD_NAMES: METHOD_NAMES, BENCHMARKS: BENCHMARKS, LOO_MAX_K: LOO_MAX_K,
    fmt: fmt, prepare: prepare, fitCell: fitCell, sensitivity: sensitivity, find: find, leaveOneOut: leaveOneOut,
    rScript: rScript, rStr: rStr, category: category, plainLanguage: plainLanguage, methodsText: methodsText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmCorrPlus = api;
})(typeof window !== "undefined" ? window : globalThis);
