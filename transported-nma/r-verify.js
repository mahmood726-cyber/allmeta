/* transported-nma/r-verify.js — "Download R script" + "Verify in R (WebR)" for the
 * transported-NMA page (P58, TN engine).
 *
 * buildScript(snapshot) writes one self-contained R script from the page's CURRENT
 * contrasts, study covariates, target profile, reference and direction:
 *   1. entropy-balancing weights (Hainmueller 2012) by Newton on the convex dual, in
 *      base R (ebal is not in the pinned WebR repository; the pack checks against its own
 *      Newton code and ebal 0.2.1) -> ESS, achieved moments;
 *   2. source and transported random-effects NMA as a contrast-level meta-regression
 *      without intercept: Paule-Mandel tau^2 solved in base R (metafor's PM mean-centres yi,
 *      valid only with an intercept), then metafor::rma at that tau^2 (the pack's reference
 *      is metafor 5.2.1); transported SEs inflated as se / sqrt(w_i / mean(w));
 *   3. league vs reference with t_{n-p} intervals and Rucker-Schwarzer P-scores
 *      (normal CDF) written out in base R.
 * Each displayed quantity is printed next to the page's value with |diff|, then MATCH n/n
 * or MISMATCH. The same script text is what "Verify in R" runs in WebR.
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

  // snapshot: { input: { studies:[{label,cov}], rows:[{trtA,trtB,yi,sei,study,_label}], treatments (ref first),
  //                     target:{name:value}, higherIsBetter }, result: AlmTransportedNMA.run(...) }
  function buildScript(snap) {
    var inp = snap.input, r = snap.result, trts = inp.treatments, covs = r.transport.covariates;
    var L = [];
    L.push("# Population-transported NMA - independent R check of the allmeta transported-nma page.");
    L.push("# Generated from the page's CURRENT inputs. Needs: metafor (entropy balancing, PM tau^2 and P-scores in base R).");
    L.push("TOL <- 1e-6   # absolute; the page displays 1-4 decimals (half a unit >= 5e-5), so this is tighter");
    L.push("suppressPackageStartupMessages(library(metafor))");
    L.push("");
    L.push("con <- data.frame(");
    L.push("  study = " + vec(inp.rows, function (x) { return rnum(x.study + 1); }) + ",");
    L.push("  trtA  = " + vec(inp.rows, function (x) { return rstr(x.trtA); }) + ",");
    L.push("  trtB  = " + vec(inp.rows, function (x) { return rstr(x.trtB); }) + ",   # effect = trtB vs trtA");
    L.push("  yi    = " + vec(inp.rows, function (x) { return rnum(x.yi); }) + ",");
    L.push("  sei   = " + vec(inp.rows, function (x) { return rnum(x.sei); }) + ", stringsAsFactors = FALSE)");
    L.push("study_label <- " + vec(inp.studies, function (s) { return rstr(s.label); }));
    L.push("# study covariates (rows = studies in contrast order) and the target profile");
    L.push("X_cov <- cbind(" + covs.map(function (c) { return rstr(c) + " = " + vec(inp.studies, function (s) { return rnum((s.cov || {})[c]); }); }).join(", ") + ")");
    L.push("target <- " + vec(covs, function (c) { return rnum(inp.target[c]); }) + "; names(target) <- colnames(X_cov)");
    L.push("trts <- " + vec(trts, rstr) + "   # reference first");
    L.push("higher_is_better <- " + (inp.higherIsBetter !== false ? "TRUE" : "FALSE"));
    L.push("");
    L.push("# page values (full precision, as computed by the page)");
    L.push("page_ess <- " + rnum(r.transport.ess) + "; page_ess_ratio <- " + rnum(r.transport.essRatio));
    L.push("page_achieved <- " + vec(covs, function (c) { return rnum(r.transport.achieved[c]); }));
    L.push("page_tau2_src <- " + rnum(r.source.tau2) + "; page_tau2_tgt <- " + rnum(r.transported.tau2));
    L.push("page_ps_src <- " + vec(trts, function (t) { return rnum(r.source.pScore[t]); }));
    L.push("page_ps_tgt <- " + vec(trts, function (t) { return rnum(r.transported.pScore[t]); }));
    L.push("page_eff <- " + vec(trts, function (t) { return rnum(r.transported.effects[t].estimate); }));
    L.push("page_lo  <- " + vec(trts, function (t) { return rnum(r.transported.effects[t].ciLo); }));
    L.push("page_hi  <- " + vec(trts, function (t) { return rnum(r.transported.effects[t].ciHi); }));
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
    "# 1. entropy balancing: w_i proportional to exp(lambda' Z_i), Z = X - target; Newton on F(lambda) = log sum exp(lambda' Z)",
    "Z <- sweep(X_cov, 2, target)",
    "lam <- rep(0, ncol(Z)); converged <- FALSE",
    "for (it in 1:200) {",
    "  eta <- drop(Z %*% lam); w <- exp(eta - max(eta)); w <- w / sum(w)",
    "  g <- colSums(w * Z)",
    "  if (sqrt(sum(g^2)) < 1e-10) { converged <- TRUE; break }",
    "  Zc <- sweep(Z, 2, g); H <- crossprod(Zc * sqrt(w))",
    "  lam <- lam - solve(H, g)",
    "}",
    "ess <- 1 / sum(w^2); achieved <- colSums(w * X_cov)",
    "",
    "# 2. random-effects NMA: contrast-level meta-regression on the basic parameters (no intercept), PM tau^2",
    "p <- length(trts) - 1",
    "Xd <- t(sapply(seq_len(nrow(con)), function(i) { r <- numeric(p)",
    "  a <- match(con$trtA[i], trts); b <- match(con$trtB[i], trts)",
    "  if (a > 1) r[a - 1] <- -1; if (b > 1) r[b - 1] <- 1; r }))",
    "if (p == 1) Xd <- matrix(Xd, ncol = 1)",
    "colnames(Xd) <- trts[-1]",
    "# Paule-Mandel tau^2 written out in base R: solve the generalised Q(tau^2) = n - p (Paule & Mandel 1982).",
    "# Not rma(method = \"PM\") here: metafor mean-centres yi for its Q/PM computations, which is only valid",
    "# for models WITH an intercept; this contrast design has none, so rma's QE and PM tau^2 would be wrong.",
    "# metafor then fits the model at that tau^2 (beta and (X'WX)^-1 do not depend on the centring).",
    "Qgen <- function(t2, sei) { w <- 1 / (sei^2 + t2)",
    "  b <- solve(crossprod(Xd * w, Xd), crossprod(Xd * w, con$yi)); sum(w * (con$yi - Xd %*% b)^2) }",
    "tau2_pm <- function(sei) { df <- max(1, nrow(con) - p); q0 <- Qgen(0, sei)",
    "  if (q0 <= df) return(0)",
    "  hi <- max(0.01, q0 / df); while (Qgen(hi, sei) > df) hi <- 2 * hi",
    "  uniroot(function(t) Qgen(t, sei) - df, c(0, hi), tol = 1e-14, maxiter = 1000)$root }",
    "nma <- function(sei) {",
    "  t2 <- tau2_pm(sei)",
    "  f <- rma(yi = con$yi, sei = sei, mods = Xd, intercept = FALSE, tau2 = t2, test = \"z\")",
    "  beta <- c(0, unname(coef(f))); V <- matrix(0, p + 1, p + 1); V[-1, -1] <- unname(vcov(f))",
    "  df <- max(1, nrow(con) - p); tc <- qt(0.975, df)",
    "  se <- sqrt(pmax(0, diag(V)))",
    "  ps <- sapply(1:(p + 1), function(i) { s <- 0",
    "    for (j in setdiff(1:(p + 1), i)) { est <- beta[i] - beta[j]; sd <- sqrt(max(0, V[i, i] + V[j, j] - 2 * V[i, j]))",
    "      s <- s + if (sd > 0) pnorm((if (higher_is_better) est else -est) / sd) else 0.5 }",
    "    s / p })",
    "  list(tau2 = f$tau2, beta = beta, lo = beta - tc * se, hi = beta + tc * se, ps = ps)",
    "}",
    "src <- nma(con$sei)",
    "wn <- w[con$study] / mean(w)",
    "tgt <- nma(con$sei / sqrt(wn))",
    "",
    "cat(\"Transported NMA check -\", nrow(con), \"contrasts,\", length(trts), \"treatments, reference\", trts[1], \"\\n\")",
    "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"| entropy balancing converged:\", converged, \"\\n\\n\")",
    "chk(\"effective sample size (Kish)\", page_ess, ess)",
    "chk(\"ESS ratio\", page_ess_ratio, ess / length(w))",
    "for (j in seq_along(target)) chk(paste0(\"achieved weighted mean: \", names(target)[j]), page_achieved[j], achieved[[j]])",
    "chk(\"tau^2 source (PM)\", page_tau2_src, src$tau2)",
    "chk(\"tau^2 transported (PM)\", page_tau2_tgt, tgt$tau2)",
    "for (i in seq_along(trts)) chk(paste0(\"source P-score: \", trts[i]), page_ps_src[i], src$ps[i])",
    "for (i in seq_along(trts)) chk(paste0(\"target P-score: \", trts[i]), page_ps_tgt[i], tgt$ps[i])",
    "for (i in seq_along(trts)) chk(paste0(\"delta P-score: \", trts[i]), page_ps_tgt[i] - page_ps_src[i], tgt$ps[i] - src$ps[i])",
    "for (i in seq_along(trts)) chk(paste0(\"transported effect vs \", trts[1], \": \", trts[i]), page_eff[i], tgt$beta[i])",
    "for (i in seq_along(trts)[-1]) {",
    "  chk(paste0(\"  95% CI lower: \", trts[i]), page_lo[i], tgt$lo[i])",
    "  chk(paste0(\"  95% CI upper: \", trts[i]), page_hi[i], tgt$hi[i])",
    "}",
    "cat(if (.bad == 0L) sprintf(\"MATCH %d/%d\\n\", .n, .n) else sprintf(\"MISMATCH %d of %d checks differ\\n\", .bad, .n))"
  ].join("\n");

  // ---------------- UI (browser only) ----------------
  function mount() {
    var doc = global.document; if (!doc) return;
    var $ = function (id) { return doc.getElementById(id); };
    function snapshot() {
      if (!global.__lastTNMA || !global.__lastTNMAInput) return null;
      return { input: global.__lastTNMAInput, result: global.__lastTNMA };
    }
    var status = $("r-status"), out = $("r-out");
    $("btn-rscript").addEventListener("click", function () {
      var s = snapshot();
      if (!s) { status.textContent = "Run the analysis first - the script is generated from the analysed inputs."; return; }
      var blob = new Blob([buildScript(s)], { type: "text/plain" }), url = URL.createObjectURL(blob);
      var a = doc.createElement("a"); a.href = url; a.download = "transported-nma-check.R"; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);   // a download can start seconds after click()
      status.textContent = "Downloaded transported-nma-check.R - run it with Rscript (needs metafor); it ends with MATCH n/n or MISMATCH.";
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
  global.AlmTransportedNMAR = api;
  if (global.document) { if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", mount); else mount(); }
})(typeof window !== "undefined" ? window : globalThis);
