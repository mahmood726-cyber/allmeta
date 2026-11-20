/* multiplicative-nma/rcheck.js -- the page's two R user paths (app-local).
 * "Download R script" and "Verify in R (WebR)" run the SAME script, built from the inputs the page last
 * analysed (window.AlmRCheck.set(state) is called by the page's run()). The script recomputes every
 * displayed number in R, prints page value, R value and absolute difference, and ends with MATCH n/n or
 * MISMATCH. WebR runs through the unchanged shared/webr-runner.js (site-pinned packages, SHA-256 checked).
 */
(function (global) {
  "use strict";
  var FILENAME = "multiplicative-nma-check.R", PKGS = ["netmeta"], PKG_NOTE = "R netmeta (common-effect NMA) plus base-R PM/AIC";
  // ---- shared by this page's two R paths (download + in-page WebR); app-local copy ----
  var state = null, busy = false, gen = 0;   // gen: bumped on every set(), so a late R result can be recognised as stale
  function rnum(x) { return typeof x !== "number" || isNaN(x) ? "NA" : isFinite(x) ? String(x) : (x > 0 ? "Inf" : "-Inf"); }
  function rstr(s) { return JSON.stringify(String(s)); }
  function rvec(a, f) { return "c(" + a.map(f || rnum).join(", ") + ")"; }
  var HEAD = [
    "options(warn = 1, width = 250)",
    "cat(R.version.string, \"\n\")",
    ".chk <- data.frame(quantity = character(), page = numeric(), R = numeric(), tol = numeric(), stringsAsFactors = FALSE)",
    "# chk(): one displayed quantity -- the page's full-precision value, R's value, and the absolute tolerance.",
    "chk <- function(quantity, page, r, tol) {",
    "  r <- if (length(r) == 1 && is.numeric(r)) as.numeric(r) else NA_real_",
    "  .chk[nrow(.chk) + 1, ] <<- list(quantity, as.numeric(page), r, tol)",
    "}"
  ];
  var FOOT = [
    "# identical infinities (e.g. a log-likelihood at Q = 0) agree; anything else infinite does not",
    ".chk$abs_diff <- ifelse(is.infinite(.chk$page) & .chk$page == .chk$R & !is.na(.chk$R), 0, abs(.chk$page - .chk$R))",
    ".chk$ok <- !is.na(.chk$abs_diff) & .chk$abs_diff <= .chk$tol",
    "print(.chk, digits = 10, row.names = FALSE)",
    ".n <- nrow(.chk); .m <- sum(.chk$ok)",
    "# Honest verdict: MATCH only when R ran to the end AND every compared quantity is within its tolerance.",
    "if (!isTRUE(.done) || .n == 0) cat(sprintf(\"MISMATCH %d/%d (R did not complete the check)\n\", .m, .n)) else",
    "  if (.m == .n) cat(sprintf(\"MATCH %d/%d\n\", .m, .n)) else cat(sprintf(\"MISMATCH %d/%d\n\", .m, .n))"
  ];
  function wrap(header, body) {
    return header.concat(HEAD, [".done <- tryCatch({"], body.map(function (l) { return "  " + l; }),
      ["  TRUE", "}, error = function(e) { cat(\"R ERROR:\", conditionMessage(e), \"\n\"); FALSE })"], FOOT).join("\n") + "\n";
  }
  function el(id) { return document.getElementById(id); }
  function setStatus(t) { var s = el("rcheck-status"); if (s) s.textContent = t; }
  function mount(after) {
    if (typeof document === "undefined" || el("rcheck-panel")) return;
    var host = document.querySelector(after);
    if (!host) return;
    var sec = document.createElement("section");
    sec.className = "panel"; sec.id = "rcheck-panel"; sec.style.gridColumn = "1 / -1";
    sec.setAttribute("aria-label", "Check this result in R");
    sec.innerHTML = '<h2>Check in R</h2>' +
      '<p class="hint" style="margin:0 0 0.5rem">Both buttons use the same R script, generated from the inputs this page last analysed. It recomputes every displayed number with ' + PKG_NOTE + ', prints each next to the page\'s value and the absolute difference, and ends with <code>MATCH n/n</code> or <code>MISMATCH</code>.</p>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
      '<button type="button" id="btn-rscript" class="ghost">Download R script</button>' +
      '<button type="button" id="btn-verify-r" class="ghost">Verify in R (WebR)</button></div>' +
      '<p id="rcheck-status" class="hint" role="status" aria-live="polite" style="margin:0.5rem 0 0"></p>' +
      '<p id="rcheck-verdict" style="margin:0.4rem 0 0;font-weight:600"></p>' +
      '<pre id="rcheck-out" style="display:none;max-height:28rem;overflow:auto;font-size:0.78rem;white-space:pre;background:var(--accent-soft,#eef3f8);padding:0.6rem;border-radius:4px"></pre>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    el("btn-rscript").addEventListener("click", download);
    el("btn-verify-r").addEventListener("click", verify);
    refresh();
  }
  function refresh() {
    var ok = !!state;
    ["btn-rscript", "btn-verify-r"].forEach(function (id) { var b = el(id); if (b) b.disabled = !ok || (id === "btn-verify-r" && busy); });
    if (!ok) setStatus("Run an analysis first: there is nothing to check in R yet.");
  }
  function set(s) {
    state = s || null; gen++;
    if (typeof document === "undefined") return;
    var o = el("rcheck-out"), v = el("rcheck-verdict");
    if (o) { o.style.display = "none"; o.textContent = ""; }
    // XREV-631 A3: tell the user to press Verify again only when there is an analysis to verify (the button is enabled)
    if (v) v.textContent = busy ? "The inputs changed while R was running; the result will be discarded." + (state ? " Press Verify in R again for the current analysis." : "") : "";
    if (!busy) setStatus("");
    refresh();
  }
  function current() { return state ? buildScript(state) : null; }
  function download() {
    var txt = current(); if (!txt) return;
    var blob = new Blob([txt], { type: "text/x-r;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = FILENAME;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    setStatus("Downloaded " + FILENAME + ": run it with Rscript --vanilla " + FILENAME + (PKGS.length ? " (needs " + PKGS.join(", ") + ")." : " (base R only)."));
  }
  async function verify() {
    var txt = current(); if (!txt || busy) return;
    var o = el("rcheck-out"), v = el("rcheck-verdict");
    if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") {
      v.textContent = "WebR could not be loaded on this page, so R was not run. Use Download R script instead.";
      return;
    }
    busy = true; refresh(); v.textContent = ""; o.style.display = "none";
    var g0 = gen, stale = function () { return gen !== g0; };
    try {
      var r = await global.AlmWebR.runR({ script: txt, packages: PKGS, onStatus: function (t) { if (!stale()) setStatus(t); } });
      if (stale()) {
        // R ran on an analysis the page no longer shows: never report its verdict next to the current one.
        v.textContent = "R finished on an earlier analysis: the inputs changed while R was running, so that result was discarded." + (state ? " Press Verify in R again." : "");
        setStatus("");
        return;
      }
      if (!r.ok) {
        var missing = /Package not in pinned repository: (\S+)/.exec(r.error || "");
        v.textContent = missing
          ? "R was not run: package " + missing[1] + " is not available in this site's WebR. Use Download R script and run it in R."
          : "R was not run: " + r.error;
        setStatus("");
        return;
      }
      var vers = Object.keys(r.versions || {}).map(function (k) { return k === "R" ? r.versions[k] : k + " " + r.versions[k]; }).join(", ");
      o.textContent = "# WebR session: " + vers + "\n" + r.stdout;
      o.style.display = "block";
      var line = r.stdout.split(/\r?\n/).filter(function (l) { return /^(MATCH|MISMATCH) /.test(l); }).pop();
      v.textContent = line ? "R (WebR): " + line : "R (WebR) printed no MATCH/MISMATCH line: the check did not complete.";
      setStatus("R finished (" + vers + ").");
    } catch (e) {
      // XREV-631 A3: an error from a run the user has since superseded belongs to the earlier analysis too
      v.textContent = stale()
        ? "R stopped on an earlier analysis: the inputs changed while R was running, so that error was discarded." + (state ? " Press Verify in R again." : "")
        : "R was not run: " + (e && e.message ? e.message : String(e));
    } finally { busy = false; refresh(); }
  }

  // state: { rows: [{trtA,trtB,yi,sei}], treatments: [ref first], exp: bool, page: <AlmMultiplicativeNMA.fit result> }
  function buildScript(s) {
    var p = s.page, tr = s.treatments, body = [
      "suppressPackageStartupMessages(library(netmeta))",
      "cat(\"netmeta\", as.character(packageVersion(\"netmeta\")), \"(the pack validates against 3.7-0)\n\")",
      "# One row per contrast as analysed by the page: yi = effect of trtB relative to trtA (analysis scale).",
      "d <- data.frame(",
      "  trtA = " + rvec(s.rows.map(function (r) { return r.trtA; }), rstr) + ",",
      "  trtB = " + rvec(s.rows.map(function (r) { return r.trtB; }), rstr) + ",",
      "  yi   = " + rvec(s.rows.map(function (r) { return r.yi; })) + ",",
      "  sei  = " + rvec(s.rows.map(function (r) { return r.sei; })) + ", stringsAsFactors = FALSE)",
      "trts <- " + rvec(tr, rstr) + "   # page order, reference first",
      "ref <- trts[1]; n <- nrow(d); p <- length(trts) - 1",
      "# Each contrast is its own two-arm study (the page treats contrasts as independent).",
      "nm <- suppressWarnings(netmeta(TE = d$yi, seTE = d$sei, treat1 = d$trtB, treat2 = d$trtA, studlab = paste0(\"c\", seq_len(n)),",
      "  common = TRUE, random = FALSE, reference.group = ref, sm = \"MD\"))",
      "Q <- nm$Q; df <- nm$df.Q; phi <- if (df > 0) Q / df else 1",
      "tq <- if (df > 0) qt(0.975, df) else qnorm(0.975)",
      "cat(sprintf(\"netmeta common effect: Q = %.6f on %d df, phi = %.6f\n\", Q, df, phi))",
      "chk(\"contrasts n\", " + rnum(p.n) + ", n, 0)",
      "chk(\"basic parameters p\", " + rnum(p.p) + ", p, 0)",
      "chk(\"Q\", " + rnum(p.Q) + ", Q, 1e-9)",
      "chk(\"df\", " + rnum(p.df) + ", df, 0)",
      "chk(\"phi = Q/df\", " + rnum(p.phi) + ", phi, 1e-9)",
      "# exp-scale rows: the page shows exp(effect) to 3 dp, so no row may be looser than 5e-4",
      "etol <- function(rel, x) min(5e-4, rel * max(1, exp(x)))",
      "chk(\"I^2 (fraction)\", " + rnum(p.I2) + ", if (df > 0) max(0, (Q - df) / Q) else 0, 1e-9)"
    ];
    tr.slice(1).forEach(function (t, i) {
      var e = p.effects[t], T = rstr(t);
      body.push(
        "est <- nm$TE.common[" + T + ", ref]; seFE <- nm$seTE.common[" + T + ", ref]; se <- seFE * sqrt(phi)",
        "lo <- if (df > 0) est - tq * se else nm$lower.common[" + T + ", ref]; hi <- if (df > 0) est + tq * se else nm$upper.common[" + T + ", ref]",
        "chk(" + rstr(t + " vs " + tr[0] + " estimate") + ", " + rnum(e.estimate) + ", est, 1e-9)",
        "chk(" + rstr(t + " SE (fixed)") + ", " + rnum(e.seFE) + ", seFE, 1e-9)",
        "chk(" + rstr(t + " SE (mult.)") + ", " + rnum(e.se) + ", se, 1e-9)",
        "chk(" + rstr(t + " CI lower") + ", " + rnum(e.ciLo) + ", lo, 1e-9)",
        "chk(" + rstr(t + " CI upper") + ", " + rnum(e.ciHi) + ", hi, 1e-9)");
      if (s.exp) body.push(
        "chk(" + rstr("exp " + t + " estimate") + ", " + rnum(Math.exp(e.estimate)) + ", exp(est), etol(1e-9, est))",
        "chk(" + rstr("exp " + t + " CI lower") + ", " + rnum(Math.exp(e.ciLo)) + ", exp(lo), etol(1e-9, lo))",
        "chk(" + rstr("exp " + t + " CI upper") + ", " + rnum(Math.exp(e.ciHi)) + ", exp(hi), etol(1e-9, hi))");
    });
    if (p.prefer !== "not-estimable") body.push(
      "# Additive (Paule-Mandel) comparison and AIC: netmeta has no network PM estimator, so (as in the pack's",
      "# validation) they are recomputed in base R on the contrast incidence design: PM tau^2 solves the",
      "# generalised Q = n - p; log-likelihoods are Gaussian with v + tau^2 (additive) and (Q/n) v (multiplicative).",
      "X <- matrix(0, n, p)",
      "for (i in seq_len(n)) { a <- match(d$trtA[i], trts); b <- match(d$trtB[i], trts)",
      "  if (a > 1) X[i, a - 1] <- -1; if (b > 1) X[i, b - 1] <- 1 }",
      "y <- d$yi; v <- d$sei^2",
      "Qat <- function(t2) { f <- lm.wfit(X, y, 1 / (v + t2)); sum(f$weights * f$residuals^2) }",
      "dfpm <- max(1, n - p)",
      "tau2 <- if (Qat(0) <= dfpm) 0 else { up <- max(0.01, Qat(0) / dfpm); while (Qat(up) > dfpm) up <- up * 2",
      "  uniroot(function(t) Qat(t) - dfpm, c(0, up), tol = 1e-14, maxiter = 10000)$root }",
      "fre <- lm.wfit(X, y, 1 / (v + tau2)); ffe <- lm.wfit(X, y, 1 / v)",
      "llAdd <- sum(dnorm(y, y - fre$residuals, sqrt(v + tau2), log = TRUE))",
      "llMult <- sum(dnorm(y, y - ffe$residuals, sqrt((Q / n) * v), log = TRUE))",
      "aicAdd <- -2 * llAdd + 2 * (p + 1); aicMult <- -2 * llMult + 2 * (p + 1); dA <- aicAdd - aicMult",
      "verdict <- if (dA >= 2) 1 else if (dA <= -2) -1 else 0",
      "cat(sprintf(\"PM tau^2 = %.6f, AICadd = %.4f, AICmult = %.4f\n\", tau2, aicAdd, aicMult))",
      "chk(\"additive PM tau^2\", " + rnum(p.additive.tau2) + ", tau2, 1e-6)",
      "chk(\"AIC additive\", " + rnum(p.additive.aic) + ", aicAdd, 1e-6)",
      "chk(\"AIC multiplicative\", " + rnum(p.multiplicative.aic) + ", aicMult, 1e-6)",
      // the verdict line displays res.aicDiff itself (Delta AIC), so it is checked as stored (XREV-631 finding 1)
      "chk(\"Delta AIC (additive - multiplicative)\", " + rnum(p.aicDiff) + ", dA, 1e-6)",
      "chk(\"verdict (1 mult, 0 comparable, -1 additive)\", " + rnum(({ multiplicative: 1, comparable: 0, additive: -1 })[p.prefer]) + ", verdict, 0)"
    );
    return wrap([
      "# allmeta multiplicative-nma page: R check of the numbers the page displayed.",
      "# Generated by multiplicative-nma/rcheck.js from the page's current inputs.",
      "# Run: Rscript --vanilla " + FILENAME + "   (needs netmeta)"
    ], body);
  }

  var api = { set: set, buildScript: buildScript, script: current, mount: mount, _state: function () { return state; } };
  global.AlmRCheck = api;
  if (typeof document !== "undefined") {
    if (document.readyState !== "loading") mount("main > section.panel:last-of-type");
    else document.addEventListener("DOMContentLoaded", function () { mount("main > section.panel:last-of-type"); });
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
