/* spec-collapse/r-verify.js — "Download R script" + "Verify in R (WebR)" for the
 * spec-collapse multiverse page (P64).
 *
 * buildScript(snapshot) writes one self-contained R script from the page's CURRENT
 * studies and weight scheme. metafor (the pack's reference, metafor 5.2.1) fits every one
 * of the 36 specifications: tau^2 in {DL, PM, REML} x CI in {z, HKSJ} x outlier rule in
 * {none, drop-resid, drop-imprecise} x {raw, trim-and-fill (metafor::trimfill, L0)}. The
 * HKSJ intervals use the page's floor q = max(1, Q_gen/(k-1)) with t_{k-1}, written out
 * from the rma fit (metafor's test="knha" has no floor). The naive IV-RE pool and the
 * weighted-likelihood t-mixture interval are the published formulas in base R.
 * Every displayed number (36 x [estimate, CI, significant, k], the three summary cards) is
 * printed next to the page's value with |diff|, then MATCH n/n or MISMATCH.
 * The same script text is what "Verify in R" runs in WebR via shared/webr-runner.js.
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

  // snapshot: { input: { studies:[{est,se,label}], scheme }, result: AlmSpecCollapse.analyze(...) }
  function buildScript(snap) {
    var inp = snap.input, out = snap.result, S = inp.studies, sp = out.specs;
    var L = [];
    L.push("# Spec-collapse multiverse (36 specifications) - independent R check of the allmeta spec-collapse page.");
    L.push("# Generated from the page's CURRENT studies and weight scheme. Needs: metafor.");
    L.push("TOL <- 1e-6   # absolute; the page displays 3 decimals (half a unit = 5e-4), so this is tighter");
    L.push("suppressPackageStartupMessages(library(metafor))");
    L.push("");
    L.push("dat <- data.frame(label = " + vec(S, function (s) { return rstr(s.label); }) + ",");
    L.push("  yi = " + vec(S, function (s) { return rnum(s.est); }) + ",");
    L.push("  sei = " + vec(S, function (s) { return rnum(s.se); }) + ", stringsAsFactors = FALSE)");
    L.push("scheme <- " + rstr(inp.scheme || "uniform") + "   # weighted-likelihood weights: uniform | reml_only | hksj_only");
    L.push("");
    L.push("# page values (full precision, as computed by the page), in the page's spec order");
    L.push("page_spec <- data.frame(");
    L.push("  est = " + vec(sp, function (s) { return rstr(s.estimator); }) + ",");
    L.push("  ci  = " + vec(sp, function (s) { return rstr(s.ci_method); }) + ",");
    L.push("  out = " + vec(sp, function (s) { return rstr(s.outlier); }) + ",");
    L.push("  tf  = " + vec(sp, function (s) { return s.trimfill ? "TRUE" : "FALSE"; }) + ",");
    L.push("  k   = " + vec(sp, function (s) { return rnum(s.k); }) + ",");
    L.push("  theta = " + vec(sp, function (s) { return rnum(s.theta); }) + ",");
    L.push("  lo  = " + vec(sp, function (s) { return rnum(s.ciLo); }) + ",");
    L.push("  hi  = " + vec(sp, function (s) { return rnum(s.ciHi); }) + ",");
    L.push("  sig = " + vec(sp, function (s) { return s.significant ? "TRUE" : "FALSE"; }) + ", stringsAsFactors = FALSE)");
    L.push("page_conc <- " + rnum(out.concordance.pctSig));
    L.push("page_naive <- c(theta = " + rnum(out.naive.theta) + ", lo = " + rnum(out.naive.ciLo) + ", hi = " + rnum(out.naive.ciHi) + ")");
    L.push("page_wl <- c(theta = " + rnum(out.weighted.theta) + ", lo = " + rnum(out.weighted.ciLo) + ", hi = " + rnum(out.weighted.ciHi) + ")");
    L.push("page_verdicts <- c(conc = " + rstr(out.concordance.verdict) + ", naive = " + rstr(out.naive.verdict) + ", wl = " + rstr(out.weighted.verdict) + ")");
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
    "  if (!ok || VERBOSE) cat(sprintf(\"%-52s page=%-16.10g R=%-16.10g |diff|=%.1e %s\\n\", what, page, r, d, if (ok) \"ok\" else \"<-- MISMATCH\"))",
    "}",
    "chk_eq <- function(what, page, r) { ok <- identical(page, r); .n <<- .n + 1L; if (!ok) .bad <<- .bad + 1L",
    "  if (!ok || VERBOSE) cat(sprintf(\"%-52s page=%-16s R=%-16s %s\\n\", what, page, r, if (ok) \"ok\" else \"<-- MISMATCH\")) }",
    "VERBOSE <- FALSE   # TRUE prints every one of the checks; FALSE prints a per-spec table plus any mismatch",
    "ctl <- list(tol = 1e-12, threshold = 1e-12, maxiter = 10000)",
    "",
    "# one specification: rma at estimator `m`; HKSJ = t_{k-1} with q = max(1, Q_gen/(k-1)) (page's floor)",
    "spec <- function(yi, vi, m, hksj) {",
    "  f <- rma(yi, vi, method = m, test = \"z\", control = ctl)",
    "  mu <- as.numeric(f$beta); k <- length(yi)",
    "  if (hksj) { w <- 1 / (vi + f$tau2); q <- max(1, sum(w * (yi - mu)^2) / (k - 1))",
    "    se <- sqrt(q / sum(w)); crit <- qt(0.975, k - 1)",
    "  } else { se <- f$se; crit <- qnorm(0.975) }",
    "  c(theta = mu, var = se^2, k = k, lo = mu - crit * se, hi = mu + crit * se)",
    "}",
    "# outlier rules (never below k = 3): drop the largest |y - mu_DL| / se, or the largest SE (first on ties)",
    "subset_rule <- function(d, rule) {",
    "  if (rule == \"none\" || nrow(d) <= 3) return(d)",
    "  if (rule == \"drop-imprecise\") return(d[-which.max(d$sei), ])",
    "  mu <- as.numeric(rma(d$yi, sei = d$sei, method = \"DL\")$beta)",
    "  d[-which.max(abs(d$yi - mu) / d$sei), ]",
    "}",
    "rows <- list()",
    "for (m in c(\"DL\", \"PM\", \"REML\")) for (hk in c(FALSE, TRUE)) for (rule in c(\"none\", \"drop-resid\", \"drop-imprecise\")) {",
    "  d <- subset_rule(dat, rule); yi <- d$yi; vi <- d$sei^2",
    "  rows[[length(rows) + 1]] <- c(spec(yi, vi, m, hk), tf = 0)",
    "  tf <- trimfill(rma(yi, vi, method = m, control = ctl))     # Duval & Tweedie L0, side by metafor's rule",
    "  rows[[length(rows) + 1]] <- c(spec(tf$yi, tf$vi, m, hk), tf = 1)",
    "}",
    "R <- as.data.frame(do.call(rbind, rows))",
    "R$sig <- R$lo > 0 | R$hi < 0",
    "",
    "cat(\"Spec-collapse check -\", nrow(dat), \"studies,\", nrow(R), \"specifications, weights:\", scheme, \"\\n\")",
    "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\\n\\n\")",
    "cat(sprintf(\"%-5s %-5s %-15s %-3s %3s %10s %10s %10s  %s\\n\", \"tau2\", \"CI\", \"outlier\", \"TF\", \"k\", \"est (R)\", \"lo (R)\", \"hi (R)\", \"max|diff| vs page\"))",
    "for (i in seq_len(nrow(R))) {",
    "  p <- page_spec[i, ]; lab <- paste(p$est, p$ci, p$out, if (p$tf) \"TF\" else \"raw\")",
    "  chk(paste(lab, \"k\"), p$k, R$k[i], 0)",
    "  chk(paste(lab, \"estimate\"), p$theta, R$theta[i])",
    "  chk(paste(lab, \"CI lower\"), p$lo, R$lo[i])",
    "  chk(paste(lab, \"CI upper\"), p$hi, R$hi[i])",
    "  chk_eq(paste(lab, \"significant\"), p$sig, R$sig[i])",
    "  cat(sprintf(\"%-5s %-5s %-15s %-3s %3d %10.6f %10.6f %10.6f  %.1e\\n\", p$est, p$ci, p$out, if (p$tf) \"yes\" else \"no\",",
    "      as.integer(R$k[i]), R$theta[i], R$lo[i], R$hi[i], max(abs(c(p$theta - R$theta[i], p$lo - R$lo[i], p$hi - R$hi[i])))))",
    "}",
    "",
    "# naive concordance and naive IV-RE pool of the 36 spec estimates (the collapse the page warns about)",
    "conc <- 100 * mean(R$sig)",
    "nv <- 1 / sum(1 / R$var); nt <- sum(R$theta / R$var) * nv",
    "naive <- c(theta = nt, lo = nt - qnorm(0.975) * sqrt(nv), hi = nt + qnorm(0.975) * sqrt(nv))",
    "# weighted-likelihood: mixture of t_{k-1}(theta_s, sd_s) with spec weights; CI by inverting the mixture CDF",
    "pw <- switch(scheme, reml_only = as.numeric(page_spec$est == \"REML\"), hksj_only = as.numeric(page_spec$ci == \"HKSJ\"), rep(1, nrow(R)))",
    "if (sum(pw) <= 0) pw <- rep(1, nrow(R))",
    "pw <- pw / sum(pw); dfs <- pmax(1, R$k - 1); sds <- sqrt(R$var)",
    "mixcdf <- function(x) sum(pw * pt((x - R$theta) / sds, dfs))",
    "lo_b <- min(R$theta - 2 * sds * qt(0.999, dfs)); hi_b <- max(R$theta + 2 * sds * qt(0.999, dfs))",
    "inv <- function(p) uniroot(function(x) mixcdf(x) - p, c(lo_b, hi_b), tol = 1e-14, maxiter = 1000)$root",
    "wl <- c(theta = sum(pw * R$theta), lo = inv(0.025), hi = inv(0.975))",
    "verd <- function(lo, hi) if (lo > 0 || hi < 0) \"robust\" else \"fragile\"",
    "VERBOSE <- TRUE; cat(\"\\n\")",
    "chk(\"naive concordance: % of specs significant\", page_conc, conc)",
    "chk(\"naive IV-RE pool: theta\", page_naive[[\"theta\"]], naive[[\"theta\"]])",
    "chk(\"naive IV-RE pool: CI lower\", page_naive[[\"lo\"]], naive[[\"lo\"]])",
    "chk(\"naive IV-RE pool: CI upper\", page_naive[[\"hi\"]], naive[[\"hi\"]])",
    "chk(\"weighted-likelihood: theta\", page_wl[[\"theta\"]], wl[[\"theta\"]])",
    "chk(\"weighted-likelihood: CI lower\", page_wl[[\"lo\"]], wl[[\"lo\"]])",
    "chk(\"weighted-likelihood: CI upper\", page_wl[[\"hi\"]], wl[[\"hi\"]])",
    "chk_eq(\"verdict: naive concordance\", page_verdicts[[\"conc\"]], if (conc / 100 >= 0.95) \"robust\" else \"fragile\")",
    "chk_eq(\"verdict: naive IV-RE pool\", page_verdicts[[\"naive\"]], verd(naive[[\"lo\"]], naive[[\"hi\"]]))",
    "chk_eq(\"verdict: weighted-likelihood\", page_verdicts[[\"wl\"]], verd(wl[[\"lo\"]], wl[[\"hi\"]]))",
    "cat(if (.bad == 0L) sprintf(\"MATCH %d/%d\\n\", .n, .n) else sprintf(\"MISMATCH %d of %d checks differ\\n\", .bad, .n))"
  ].join("\n");

  // ---------------- UI (browser only) ----------------
  var STALE = "R result discarded: the analysis on the page changed while R was running, so the verdict R returned (for the earlier analysis) is not shown. Press Verify in R again.";
  function mount() {
    var verifyGen = 0;   // a later Verify, or a re-run of the analysis, makes an earlier run's answer stale
    var doc = global.document; if (!doc) return;
    var $ = function (id) { return doc.getElementById(id); };
    function snapshot() {
      if (!global.__lastSpec) return null;
      return { input: global.__lastSpec.input, result: global.__lastSpec.result };
    }
    var status = $("r-status"), out = $("r-out");
    $("btn-rscript").addEventListener("click", function () {
      var s = snapshot();
      if (!s) { status.textContent = "Run the multiverse first - the script is generated from the analysed studies."; return; }
      var blob = new Blob([buildScript(s)], { type: "text/plain" }), url = URL.createObjectURL(blob);
      var a = doc.createElement("a"); a.href = url; a.download = "spec-collapse-check.R"; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);   // a download can start seconds after click()
      status.textContent = "Downloaded spec-collapse-check.R - run it with Rscript (needs metafor); it ends with MATCH n/n or MISMATCH.";
    });
    $("btn-webr").addEventListener("click", function () {
      var s = snapshot(), btn = $("btn-webr"), my = ++verifyGen, run = global.__lastSpec;   // run() replaces it on every analysis
      if (!s) { status.textContent = "Run the multiverse first."; return; }
      if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") { status.textContent = "WebR runner (../shared/webr-runner.js) did not load - use Download R script."; return; }
      btn.disabled = true; out.hidden = true;
      var t0 = Date.now();
      global.AlmWebR.runR({ script: buildScript(s), packages: ["metafor"], onStatus: function (m) { status.textContent = m; } }).then(function (r) {
        btn.disabled = false;
        // R answered for the analysis it was given; if the page has moved on, never show that answer beside the new one.
        if (my !== verifyGen || global.__lastSpec !== run) { out.hidden = true; out.textContent = ""; status.textContent = STALE; return; }
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
  global.AlmSpecCollapseR = api;
  if (global.document) { if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount); else mount(); }
})(typeof window !== "undefined" ? window : globalThis);
