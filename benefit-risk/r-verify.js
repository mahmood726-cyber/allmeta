/* benefit-risk/r-verify.js — "Download R script" + "Verify in R (WebR)" for the
 * benefit-risk MCDA page (P54).
 *
 * buildScript(snapshot) turns the page's CURRENT analysed inputs and the numbers
 * it displays into one self-contained base-R script. The script recomputes every
 * headline number (deterministic value and rank per treatment, SMAA P(best) per
 * treatment, EVPI) and prints each next to the page's value with |diff|, then a
 * final MATCH n/n or MISMATCH line computed from the comparisons.
 *
 * The pack validates the SMAA against an exact replay of the page's seeded draws
 * (smaa 0.3-4) and closed forms. The draws come from mulberry32 + Box-Muller, so
 * the script re-implements that generator bit-for-bit in base R (32-bit integer
 * arithmetic on doubles) and replays the identical Monte Carlo. smaa is not in
 * the pinned WebR repository, so it is used only as an optional cross-check of
 * the rank tally when it is installed (desktop R); base R is the check.
 *
 * The same script text is what "Verify in R" runs in WebR (shared/webr-runner.js).
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

  // snapshot: { input: {criteria:[{id,name,type,weight}], treatments:[{id,name,perf:{cid:{mean,se?}}}], iterations, seed},
  //             result: AlmBenefitRisk.analyze(...) output shown on the page }
  function buildScript(snap) {
    var inp = snap.input, res = snap.result;
    var C = inp.criteria, T = inp.treatments;
    var L = [];
    L.push("# Benefit-risk MCDA (SMAA + EVPI) - independent R check of the allmeta benefit-risk page.");
    L.push("# Generated from the page's CURRENT inputs. Runs in base R (no packages needed).");
    L.push("# Method (published formulas, written out in base R): linear partial value functions on each");
    L.push("# criterion's observed range (benefit: higher better; harm: lower better; equal endpoints -> +-0.5),");
    L.push("# normalised weights, total value = sum w_j v_j; SMAA (Tervonen & Lahdelma 2007) P(best) with ties");
    L.push("# sharing the best rank (smaa::smaa.ranks convention); EVPI = E[max_t V_t] - max_t E[V_t].");
    L.push("# The Monte Carlo replays the page's seeded generator exactly (mulberry32 + Box-Muller), so P(best)");
    L.push("# and EVPI are compared to the page at 1e-9, not to Monte Carlo error.");
    L.push("TOL <- 1e-9   # tighter than the page's display precision (P(best) 0 dp in %, value 3 dp, EVPI 4 dp)");
    L.push("");
    L.push("crit_id   <- " + vec(C, function (c) { return rstr(c.id); }));
    L.push("crit_type <- " + vec(C, function (c) { return rstr(c.type); }));
    L.push("crit_w    <- " + vec(C, function (c) { return rnum(c.weight); }));
    L.push("trt       <- " + vec(T, function (t) { return rstr(t.name || t.id); }));
    L.push("# performance matrices: rows = treatments (as entered), cols = criteria; SE NA = no uncertainty");
    L.push("perf_mean <- matrix(" + vec([].concat.apply([], T.map(function (t) { return C.map(function (c) { return (t.perf[c.id] || {}).mean; }); })), rnum)
      + ", nrow = " + T.length + ", byrow = TRUE)");
    L.push("perf_se   <- matrix(" + vec([].concat.apply([], T.map(function (t) { return C.map(function (c) { var p = t.perf[c.id] || {}; return (Number.isFinite(p.se) && p.se > 0) ? p.se : NaN; }); })), rnum)
      + ", nrow = " + T.length + ", byrow = TRUE)");
    L.push("iters <- " + rnum(inp.iterations) + "; seed <- " + rnum(inp.seed));
    L.push("");
    L.push("# page values (full precision, as computed by the page)");
    L.push("page_det_value <- " + vec(T, function (t) { var d = res.deterministic.filter(function (x) { return x.id === t.id; })[0]; return rnum(d ? d.value : NaN); }));
    L.push("page_det_rank  <- " + vec(T, function (t) { var d = res.deterministic.filter(function (x) { return x.id === t.id; })[0]; return rnum(d ? d.rank : NaN); }));
    L.push("page_pbest     <- " + vec(T, function (t) { var d = res.smaa.filter(function (x) { return x.id === t.id; })[0]; return rnum(d ? d.pBest : NaN); }));
    L.push("page_evpi      <- " + rnum(res.evpi));
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
    "  cat(sprintf(\"%-44s page=%-18.12g R=%-18.12g |diff|=%.1e %s\\n\", what, page, r, d, if (ok) \"ok\" else \"<-- MISMATCH\"))",
    "}",
    "",
    "K <- length(trt); C <- length(crit_id)",
    "# criterion ranges from the treatments' means",
    "worst <- best <- numeric(C)",
    "for (j in 1:C) {",
    "  lo <- min(perf_mean[, j]); hi <- max(perf_mean[, j])",
    "  if (lo == hi) { lo <- lo - 0.5; hi <- hi + 0.5 }",
    "  if (crit_type[j] == \"harm\") { worst[j] <- hi; best[j] <- lo } else { worst[j] <- lo; best[j] <- hi }",
    "}",
    "wpos <- ifelse(is.finite(crit_w), pmax(0, crit_w), 0)",
    "w <- if (sum(wpos) > 0) pmax(0, ifelse(is.na(crit_w), 0, crit_w)) / sum(wpos) else rep(1 / C, C)",
    "pv <- function(x, wo, be) if (be == wo) 0.5 else min(1, max(0, (x - wo) / (be - wo)))",
    "value <- function(xrow) { v <- 0; for (j in 1:C) v <- v + w[j] * pv(xrow[j], worst[j], best[j]); v }",
    "",
    "# deterministic MCDA at the mean performance; ties share the best rank",
    "det <- sapply(1:K, function(k) value(perf_mean[k, ]))",
    "det_rank <- sapply(1:K, function(k) 1 + sum(det > det[k]))",
    "",
    "# ---- exact replay of the page's generator, mulberry32 + Box-Muller ----",
    "# mulberry32's state is a Weyl sequence (seed + n * 0x6D2B79F5 mod 2^32) and each output is a pure",
    "# function of the state, so the whole stream is computed vectorised with exact 32-bit arithmetic on doubles.",
    "M32 <- 4294967296",
    "xr  <- function(a, b) bitwXor(a %/% 65536, b %/% 65536) * 65536 + bitwXor(a %% 65536, b %% 65536)",
    "imul <- function(a, b) (a %% 65536 * b + ((a %/% 65536) * (b %% 65536)) %% 65536 * 65536) %% M32",
    "or_lo <- function(a, m) (a %/% 65536) * 65536 + bitwOr(a %% 65536, m)",
    "mulberry32 <- function(seed, n) {",
    "  a <- (seed %% M32 + ((1:n) * 1831565813) %% M32) %% M32  # state after each call",
    "  t <- imul(xr(a, a %/% 32768), or_lo(a, 1))               # imul(a ^ a>>>15, 1 | a)",
    "  t <- xr((t + imul(xr(t, t %/% 128), or_lo(t, 61))) %% M32, t)",
    "  xr(t, t %/% 16384) / M32",
    "}",
    "unc <- which(!is.na(t(perf_se)))          # uncertain cells, in the page's draw order (treatment, then criterion)",
    "S <- length(unc); need <- 2 * iters * S",
    "U <- if (need > 0) mulberry32(seed, need + 64) else numeric(0)",
    "U <- U[U != 0]                            # Box-Muller's 'while (u === 0)' redraws = skipping exact zeros",
    "if (length(U) < need) stop(\"generator stream too short\")",
    "Z <- if (S > 0) matrix(sqrt(-2 * log(U[seq(1, need, 2)])) * cos(2 * pi * U[seq(2, need, 2)]), nrow = iters, byrow = TRUE) else matrix(0, iters, 0)",
    "pvv <- function(x, wo, be) if (be == wo) rep(0.5, length(x)) else pmin(1, pmax(0, (x - wo) / (be - wo)))",
    "Vmat <- matrix(0, iters, K); col <- 0",
    "for (k in 1:K) {",
    "  v <- numeric(iters)",
    "  for (j in 1:C) {",
    "    x <- if (!is.na(perf_se[k, j])) { col <- col + 1; perf_mean[k, j] + perf_se[k, j] * Z[, col] } else rep(perf_mean[k, j], iters)",
    "    v <- v + w[j] * pvv(x, worst[j], best[j])",
    "  }",
    "  Vmat[, k] <- v",
    "}",
    "wins <- sapply(1:K, function(k) sum(rowSums(Vmat > Vmat[, k]) == 0))   # no strictly better alternative",
    "sumV <- colSums(Vmat); sumPerfect <- sum(do.call(pmax, as.data.frame(Vmat)))",
    "pbest <- wins / iters",
    "evpi <- max(0, sumPerfect / iters - max(sumV / iters))",
    "",
    "cat(\"Benefit-risk MCDA check -\", K, \"treatments,\", C, \"criteria,\", iters, \"iterations, seed\", seed, \"\\n\")",
    "cat(R.version.string, \"\\n\\n\")",
    "for (k in 1:K) chk(paste0(\"deterministic value: \", trt[k]), page_det_value[k], det[k])",
    "for (k in 1:K) chk(paste0(\"deterministic rank: \", trt[k]), page_det_rank[k], det_rank[k], 0)",
    "for (k in 1:K) chk(paste0(\"SMAA P(best): \", trt[k]), page_pbest[k], pbest[k])",
    "chk(\"EVPI (value scale)\", page_evpi, evpi)",
    "",
    "# optional cross-check of the rank tally with the smaa package (not in WebR; desktop R only)",
    "if (requireNamespace(\"smaa\", quietly = TRUE)) {",
    "  ra <- smaa::smaa.ranks(Vmat)",
    "  for (k in 1:K) chk(paste0(\"smaa::smaa.ranks P(rank 1): \", trt[k]), page_pbest[k], unname(ra[k, 1]))",
    "} else cat(\"(smaa package not installed: optional smaa.ranks cross-check skipped; base-R checks above stand)\\n\")",
    "",
    "cat(if (.bad == 0L) sprintf(\"MATCH %d/%d\\n\", .n, .n) else sprintf(\"MISMATCH %d of %d checks differ\\n\", .bad, .n))"
  ].join("\n");

  // ---------------- UI (browser only) ----------------
  function mount() {
    var doc = global.document; if (!doc) return;
    var $ = function (id) { return doc.getElementById(id); };
    function snapshot() {
      if (!global.__lastBR || !global.__lastBRInput) return null;
      return { input: global.__lastBRInput, result: global.__lastBR };
    }
    var status = $("r-status"), out = $("r-out");
    $("btn-rscript").addEventListener("click", function () {
      var s = snapshot();
      if (!s) { status.textContent = "Run the analysis first - the script is generated from the analysed inputs."; return; }
      var blob = new Blob([buildScript(s)], { type: "text/plain" }), url = URL.createObjectURL(blob);
      var a = doc.createElement("a"); a.href = url; a.download = "benefit-risk-check.R"; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);   // a download can start seconds after click()
      status.textContent = "Downloaded benefit-risk-check.R - run it with Rscript; it ends with MATCH n/n or MISMATCH.";
    });
    $("btn-webr").addEventListener("click", function () {
      var s = snapshot(), btn = $("btn-webr");
      if (!s) { status.textContent = "Run the analysis first."; return; }
      if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") { status.textContent = "WebR runner (../shared/webr-runner.js) did not load - use Download R script."; return; }
      btn.disabled = true; out.hidden = true;
      var t0 = Date.now();
      global.AlmWebR.runR({ script: buildScript(s), packages: [], onStatus: function (m) { status.textContent = m; } }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { status.textContent = "WebR could not run the check: " + r.error + " - use Download R script."; return; }
        out.textContent = r.stdout; out.hidden = false;
        var last = r.stdout.split(/\r?\n/).filter(function (l) { return /^(MATCH|MISMATCH)/.test(l); }).pop() || "no MATCH/MISMATCH line in R output";
        status.textContent = last + "  (R in WebR: " + r.versions.R + ", webR " + r.versions.webR + ", " + ((Date.now() - t0) / 1000).toFixed(0) + " s; base R only)";
        global.__lastRVerify = { line: last, stdout: r.stdout, versions: r.versions };
      });
    });
  }

  var api = { buildScript: buildScript };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmBenefitRiskR = api;
  if (global.document) { if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount); else mount(); }
})(typeof window !== "undefined" ? window : globalThis);
