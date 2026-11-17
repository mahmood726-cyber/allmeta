/* transportability/r-verify.js — "Download R script" + "Verify in R (WebR)" for the
 * transportability page (P58, AT engine).
 *
 * buildScript(snapshot) writes one self-contained R script from the page's CURRENT
 * analysed trials and target. metafor (the pack's reference, metafor 5.2.1) fits the
 * random-effects meta-regression y ~ 1 + modifier with Paule-Mandel tau^2 (rma, test="z"
 * for the unscaled (X'WX)^-1); the page's Knapp-Hartung t_{k-2} intervals with the HKSJ
 * q = max(1, RSS/(k-2)) floor are then formed from that fit in base R (metafor's
 * test="knha" has no floor, so the floor is written out). Every displayed quantity is
 * printed next to the page's value with |diff|, then MATCH n/n or MISMATCH.
 *
 * The same script text is what "Verify in R" runs in WebR via shared/webr-runner.js.
 * Pure buildScript is node-testable: module.exports = { buildScript }.
 */
(function (global) {
  "use strict";

  function rstr(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\u0000-\u001f\u007f-\uffff]/g, function (c) {
      return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
    }) + '"';
  }
  function rnum(x) {
    if (typeof x !== "number" || Number.isNaN(x)) return "NA_real_";
    if (!Number.isFinite(x)) return x > 0 ? "Inf" : "-Inf";
    return String(x);
  }
  function vec(a, f) { return "c(" + a.map(f).join(", ") + ")"; }

  // snapshot: { input: { studies:[{label,est,se,x}], target, log, modname }, result: AlmTransport.transport(...) }
  function buildScript(snap) {
    var inp = snap.input, r = snap.result, S = inp.studies;
    var L = [];
    L.push("# Transportability (effect-modifier standardisation) - independent R check of the allmeta transportability page.");
    L.push("# Generated from the page's CURRENT trials and target. Needs: metafor.");
    L.push("# Model: random-effects meta-regression yi ~ 1 + modifier, Paule-Mandel tau^2 (metafor::rma),");
    L.push("# Knapp-Hartung t_{k-2} intervals with the HKSJ floor q = max(1, RSS/(k-2)) (written out below),");
    L.push("# mean effect predicted at the target modifier value.");
    L.push("TOL <- 1e-6   # absolute; the page displays 3-4 decimals (half a unit = 5e-4 or 5e-5), so this is tighter");
    L.push("suppressPackageStartupMessages(library(metafor))");
    L.push("");
    L.push("dat <- data.frame(");
    L.push("  label = " + vec(S, function (s) { return rstr(s.label); }) + ",");
    L.push("  yi    = " + vec(S, function (s) { return rnum(s.est); }) + ",");
    L.push("  sei   = " + vec(S, function (s) { return rnum(s.se); }) + ",");
    L.push("  x     = " + vec(S, function (s) { return rnum(s.x); }));
    L.push(")");
    L.push("target <- " + rnum(inp.target) + "   # " + String(inp.modname || "modifier").replace(/[\r\n]/g, " ").replace(/[^\x20-\x7e]/g, "?"));
    L.push("log_scale <- " + (inp.log ? "TRUE" : "FALSE") + "   # TRUE: effects are log ratios and the page displays exp()");
    L.push("");
    L.push("# page values (full precision, as computed by the page; analysis scale)");
    L.push("page <- list(trans_est = " + rnum(r.transported.est) + ", trans_lo = " + rnum(r.transported.ciLo) + ", trans_hi = " + rnum(r.transported.ciHi) + ",");
    L.push("  mean_x = " + rnum(r.trialMean) + ", at_est = " + rnum(r.atTrialMean.est) + ", at_lo = " + rnum(r.atTrialMean.ciLo) + ", at_hi = " + rnum(r.atTrialMean.ciHi) + ",");
    L.push("  shift = " + rnum(r.shift) + ", slope = " + rnum(r.slope.est) + ", slope_p = " + rnum(r.slope.p) + ", tau2 = " + rnum(r.tau2) + ", q = " + rnum(r.q) + ",");
    L.push("  k = " + rnum(r.k) + ", bias_to_null = " + rnum(r.sensitivity.biasToNull) + ")");
    L.push(R_BODY);
    return L.join("\n") + "\n";
  }

  var R_BODY = [
    "",
    ".n <- 0L; .bad <- 0L",
    "chk <- function(what, page, r, tol = TOL) {",
    "  d <- abs(page - r)",
    "  ok <- isTRUE(d <= tol)",
    "  .n <<- .n + 1L; if (!ok) .bad <<- .bad + 1L",
    "  cat(sprintf(\"%-46s page=%-18.12g R=%-18.12g |diff|=%.1e %s\\n\", what, page, r, d, if (ok) \"ok\" else \"<-- MISMATCH\"))",
    "}",
    "",
    "k <- nrow(dat)",
    "fit <- rma(yi, sei = sei, mods = ~ x, data = dat, method = \"PM\", test = \"z\",",
    "           control = list(tol = 1e-12, maxiter = 1000))",
    "b <- unname(coef(fit)); V <- unname(vcov(fit))   # (X'WX)^-1 at the PM tau^2 (unscaled)",
    "tau2 <- fit$tau2",
    "wt <- 1 / (dat$sei^2 + tau2)",
    "rss <- sum(wt * (dat$yi - b[1] - b[2] * dat$x)^2)",
    "q <- max(1, rss / (k - 2))                  # HKSJ scaling with the floor at 1",
    "tcrit <- qt(0.975, k - 2)",
    "pred <- function(xs) { est <- b[1] + b[2] * xs; se <- sqrt(q * (V[1, 1] + 2 * xs * V[1, 2] + xs^2 * V[2, 2]))",
    "  c(est = est, lo = est - tcrit * se, hi = est + tcrit * se) }",
    "xbar <- sum(wt * dat$x) / sum(wt)",
    "tr <- pred(target); at <- pred(xbar)",
    "slope_se <- sqrt(q * V[2, 2]); slope_p <- 2 * pt(-abs(b[2] / slope_se), k - 2)",
    "shift <- b[2] * (target - xbar)",
    "near <- if (abs(tr[[\"lo\"]]) < abs(tr[[\"hi\"]])) tr[[\"lo\"]] else tr[[\"hi\"]]",
    "bias <- if (tr[[\"lo\"]] > 0 || tr[[\"hi\"]] < 0) abs(near) else 0",
    "",
    "cat(\"Transportability check - k =\", k, \"trials, target modifier =\", target, \"\\n\")",
    "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\\n\")",
    "cat(sprintf(\"metafor rma(PM): intercept %.6f  slope %.6f  tau2 %.6f\\n\\n\", b[1], b[2], tau2))",
    "chk(\"transported effect\", page$trans_est, tr[[\"est\"]])",
    "chk(\"transported 95% CI lower\", page$trans_lo, tr[[\"lo\"]])",
    "chk(\"transported 95% CI upper\", page$trans_hi, tr[[\"hi\"]])",
    "chk(\"trials' (weighted) mean modifier\", page$mean_x, xbar)",
    "chk(\"effect at trials' mean modifier\", page$at_est, at[[\"est\"]])",
    "chk(\"  CI lower\", page$at_lo, at[[\"lo\"]])",
    "chk(\"  CI upper\", page$at_hi, at[[\"hi\"]])",
    "chk(\"transport shift (analysis scale)\", page$shift, shift)",
    "chk(\"effect-modification slope\", page$slope, b[2])",
    "chk(\"slope p-value (t, k-2 df)\", page$slope_p, slope_p)",
    "chk(\"residual tau^2 (Paule-Mandel)\", page$tau2, tau2)",
    "chk(\"HKSJ q (floored)\", page$q, q)",
    "chk(\"k\", page$k, k, 0)",
    "chk(\"unmeasured-modifier shift to the null\", page$bias_to_null, bias)",
    "if (log_scale) {   # the page shows these back-transformed",
    "  chk(\"exp(transported effect)\", exp(page$trans_est), exp(tr[[\"est\"]]), TOL * max(1, exp(tr[[\"est\"]])))",
    "  chk(\"exp(transported CI lower)\", exp(page$trans_lo), exp(tr[[\"lo\"]]), TOL * max(1, exp(tr[[\"lo\"]])))",
    "  chk(\"exp(transported CI upper)\", exp(page$trans_hi), exp(tr[[\"hi\"]]), TOL * max(1, exp(tr[[\"hi\"]])))",
    "  chk(\"transport shift (ratio)\", exp(page$shift), exp(shift), TOL * max(1, exp(shift)))",
    "}",
    "cat(if (.bad == 0L) sprintf(\"MATCH %d/%d\\n\", .n, .n) else sprintf(\"MISMATCH %d of %d checks differ\\n\", .bad, .n))"
  ].join("\n");

  // ---------------- UI (browser only) ----------------
  function mount() {
    var doc = global.document; if (!doc) return;
    var $ = function (id) { return doc.getElementById(id); };
    function snapshot() {
      if (!global.__lastTransport || !global.__lastTransportInput) return null;
      return { input: global.__lastTransportInput, result: global.__lastTransport };
    }
    var status = $("r-status"), out = $("r-out");
    $("btn-rscript").addEventListener("click", function () {
      var s = snapshot();
      if (!s) { status.textContent = "Run the analysis first - the script is generated from the analysed inputs."; return; }
      var blob = new Blob([buildScript(s)], { type: "text/plain" }), url = URL.createObjectURL(blob);
      var a = doc.createElement("a"); a.href = url; a.download = "transportability-check.R"; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);   // a download can start seconds after click()
      status.textContent = "Downloaded transportability-check.R - run it with Rscript (needs metafor); it ends with MATCH n/n or MISMATCH.";
    });
    $("btn-webr").addEventListener("click", function () {
      var s = snapshot(), btn = $("btn-webr");
      if (!s) { status.textContent = "Run the analysis first."; return; }
      if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") { status.textContent = "WebR runner (../shared/webr-runner.js) did not load - use Download R script."; return; }
      btn.disabled = true; out.hidden = true;
      var t0 = Date.now();
      global.AlmWebR.runR({ script: buildScript(s), packages: ["metafor"], onStatus: function (m) { status.textContent = m; } }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { status.textContent = "WebR could not run the check: " + r.error + " - use Download R script."; return; }
        out.textContent = r.stdout; out.hidden = false;
        var last = r.stdout.split(/\r?\n/).filter(function (l) { return /^(MATCH|MISMATCH)/.test(l); }).pop() || "no MATCH/MISMATCH line in R output";
        status.textContent = last + "  (R in WebR: " + r.versions.R + ", webR " + r.versions.webR + ", metafor " + r.versions.metafor + "; " + ((Date.now() - t0) / 1000).toFixed(0) + " s)";
        global.__lastRVerify = { line: last, stdout: r.stdout, versions: r.versions };
      });
    });
  }

  var api = { buildScript: buildScript };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmTransportR = api;
  if (global.document) { if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount); else mount(); }
})(typeof window !== "undefined" ? window : globalThis);
