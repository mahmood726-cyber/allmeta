/* surrogate-validation/r-verify.js — app-local R user path for the trial-level surrogacy page.
 *
 * "Download R script" and "Verify in R (WebR)" run ONE script, generated from the trials the page
 * has just analysed (the page re-validates first, so script and display agree). It recomputes every
 * displayed number from those trials and prints each next to the page's value, ending in an honest
 * verdict line: MATCH n/n, MISMATCH, or NOT CHECKED (nothing estimated). WebR runs it through the unchanged ../shared/webr-runner.js.
 *   slope, intercept, Q, df, I^2 : metafor::rma(method = "FE")   (the page's metafor oracle)
 *   naive and leave-one-out R^2  : weighted lm(f ~ s, weights = 1/SE^2) in base R. The pack's oracle,
 *                                  Surrogate::TrialLevelMA with weights 1/SE^2, computes the same weighted R^2,
 *                                  but Surrogate is not in the WebR bundle, so base R is used everywhere.
 *   Pearson r                    : cor()
 *   adjusted R^2, its refusal, STE: the page's printed formulas, written out in base R (no package oracle exists).
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function rnum(x) { return (x == null || !isFinite(x)) ? "NA" : String(Number(x)); }   // shortest round-trip decimal (exact)
  function rstr(s) { return JSON.stringify(String(s)); }
  function rvecN(a) { return "c(" + a.map(rnum).join(", ") + ")"; }
  function rvecS(a) { return "c(" + a.map(rstr).join(", ") + ")"; }

  var R_BODY = [
    "suppressPackageStartupMessages(library(metafor))",
    "k <- nrow(d); allEq <- function(x) length(unique(x)) == 1",
    "wlsR2 <- function(dd) {   # weighted R^2 of f ~ s, weights 1/SE^2; NA where the page reports none",
    "  if (allEq(dd$s) || allEq(dd$f)) return(NA_real_)",
    "  summary(lm(f ~ s, data = dd, weights = 1 / dd$se^2))$r.squared }",
    "fe0 <- rma(yi = f, sei = se, data = d, method = \"FE\")",
    "fe1 <- if (allEq(d$s)) NULL else rma(yi = f, sei = se, mods = ~ s, data = d, method = \"FE\")",
    "slope <- if (is.null(fe1)) NA_real_ else unname(coef(fe1)[2]); intercept <- if (is.null(fe1)) NA_real_ else unname(coef(fe1)[1])",
    "Q <- fe0$QE; df <- fe0$k - 1; I2 <- fe0$I2 / 100",
    "r2n <- wlsR2(d); pear <- if (allEq(d$s) || allEq(d$f)) NA_real_ else cor(d$s, d$f)",
    "varFadj <- var(d$f) - mean(d$se^2)",
    "refused <- (Q <= df) || (varFadj <= 0.25 * var(d$f)) || allEq(d$s) || var(d$s) <= 0",
    "r2adj <- if (refused) NA_real_ else min(cov(d$s, d$f)^2 / (var(d$s) * varFadj), 1)",
    "ste <- if (is.na(slope) || abs(slope) <= 1e-12) NA_real_ else -intercept / slope",
    "loo <- sapply(seq_len(k), function(i) wlsR2(d[-i, ]))",
    "## ---- comparison (tolerance 1e-6 relative to max(1,|page|): tighter than the page's 2-3 decimal display) ----",
    ".q <- character(0); .p <- numeric(0); .r <- numeric(0); .e <- logical(0)",
    "# est = FALSE marks a flag or count (fitted?, refused?, rows differing): agreement on it alone is not a check",
    ".add <- function(q, page, r, est = TRUE) { .q <<- c(.q, q); .p <<- c(.p, page); .r <<- c(.r, if (length(r) == 1) r else NA_real_); .e <<- c(.e, est) }",
    ".add(\"trials analysed (k)\", page$k, k, est = FALSE)",
    ".add(\"slope\", page$slope, slope); .add(\"intercept\", page$intercept, intercept)",
    ".add(\"Q (final effects)\", page$Q, Q); .add(\"df\", page$df, df, est = FALSE); .add(\"I2 (final)\", page$i2, I2)",
    ".add(\"naive R2\", page$r2_naive, r2n); .add(\"Pearson r\", page$pearson, pear)",
    ".add(\"adjusted R2 refused (1=yes)\", as.numeric(page$refused), as.numeric(refused), est = FALSE)",
    ".add(\"adjusted R2\", page$r2_adj, r2adj); .add(\"STE\", page$ste, ste)",
    "for (i in seq_len(k)) .add(paste0(\"LOO R2 without \", d$label[i]), page$loo[i], loo[i])",
    ".add(\"LOO R2 min\", page$loo_min, if (all(is.na(loo))) NA_real_ else min(loo, na.rm = TRUE))",
    ".add(\"LOO R2 max\", page$loo_max, if (all(is.na(loo))) NA_real_ else max(loo, na.rm = TRUE))",
    ".d <- abs(.p - .r)",
    ".ok <- (!is.na(.d) & .d <= 1e-6 * pmax(1, abs(.p))) | (is.na(.p) & is.na(.r))",
    "for (i in seq_along(.q)) cat(sprintf(\"%-30s page=%15.10f  R=%15.10f  |diff|=%9.2e  %s\\n\", .q[i], .p[i], .r[i], .d[i], if (.ok[i]) \"ok\" else \"DIFFERENT\"))",
    "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\\n\")",
    ".nEst <- sum(.e & !is.na(.p) & !is.na(.r))   # estimates computed on BOTH sides and compared",
    "cat(if (length(.q) > 0 && !all(.ok)) sprintf(\"MISMATCH %d/%d\\n\", sum(.ok), length(.q)) else if (.nEst == 0) \"NOT CHECKED: no estimate (nothing was estimated from these trials)\\n\" else sprintf(\"MATCH %d/%d\\n\", sum(.ok), length(.q)))"
  ].join("\n");

  function buildScript() {
    var r = window.__lastSurrogate, pairs = window.__lastSurrogatePairs;
    if (!r || !pairs) throw new Error("No current result on the page (fewer than 3 valid trials): fix the trials and press Validate. No R script was made.");
    var L = [];
    L.push("# R check of the allmeta Surrogate validation page (surrogate-validation).");
    L.push("# Generated " + new Date().toISOString() + " from " + location.href.split("#")[0] + ".");
    L.push("# Data = the trials the page analysed when this script was made; page values are copied at full precision.");
    L.push("# metafor::rma(FE) for slope/intercept/Q/I2; base-R weighted lm for naive and leave-one-out R2 (the pack's oracle,");
    L.push("# Surrogate::TrialLevelMA with weights 1/SE^2, gives the same weighted R2 but is not available in WebR);");
    L.push("# adjusted R2 (Daniels-Hughes / van Houwelingen as printed on the page), its refusal rule and STE are the page's");
    L.push("# printed formulas written in base R -- there is no package oracle for them.");
    L.push("d <- data.frame(");
    L.push("  label = " + rvecS(pairs.map(function (p) { return p.label; })) + ",");
    L.push("  s     = " + rvecN(pairs.map(function (p) { return p.s; })) + ",   # surrogate effect");
    L.push("  f     = " + rvecN(pairs.map(function (p) { return p.f; })) + ",   # final-outcome effect");
    L.push("  se    = " + rvecN(pairs.map(function (p) { return p.seF; })) + ",   # SE of the final effect");
    L.push("  stringsAsFactors = FALSE)");
    L.push("## ---- values the page displayed (full precision) ----");
    L.push("page <- list(k = " + rnum(r.k) + ", slope = " + rnum(r.slope) + ", intercept = " + rnum(r.intercept) +
      ", Q = " + rnum(r.Q) + ", df = " + rnum(r.df) + ", i2 = " + rnum(r.i2) + ",");
    L.push("  r2_naive = " + rnum(r.r2_naive) + ", pearson = " + rnum(r.pearson) + ", refused = " + (r.adj_degenerate ? "TRUE" : "FALSE") +
      ", r2_adj = " + rnum(r.r2_adj) + ", ste = " + rnum(r.ste) + ",");
    L.push("  loo = " + rvecN(r.loo.map(function (l) { return l.r2; })) + ", loo_min = " + rnum(r.loo_min) + ", loo_max = " + rnum(r.loo_max) + ")");
    L.push(R_BODY);
    return L.join("\n") + "\n";
  }

  function mount() {
    var anchor = $("result") && $("result").closest("section.panel");
    if (!anchor || $("rv-panel")) return;
    var sec = document.createElement("section");
    sec.className = "panel"; sec.id = "rv-panel"; sec.setAttribute("aria-label", "Verify in R");
    sec.innerHTML = '<h2>Check these numbers in R</h2>' +
      '<p class="hint" style="margin:0 0 .5rem">The R script recomputes every number above from the trials analysed (metafor for slope, intercept, Q and I²; base R for the R² values, Pearson r and the printed adjusted-R² and STE formulas) and prints each next to the page\'s value, ending in <code>MATCH n/n</code> or <code>MISMATCH</code>. "Verify in R" runs the same script here in WebR (first run downloads R, a few minutes).</p>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" id="rv-download">Download R script</button>' +
      '<button type="button" id="rv-run">Verify in R (WebR)</button></div>' +
      '<p id="rv-status" role="status" aria-live="polite" style="margin:.5rem 0 0"></p>' +
      '<pre id="rv-out" style="white-space:pre-wrap;font-size:.72rem;max-height:28rem;overflow:auto" hidden></pre>';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    function revalidate() { if (window.__almSurrogate) window.__almSurrogate.run(); }
    $("rv-download").addEventListener("click", function () {
      try {
        revalidate();
        var blob = new Blob([buildScript()], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "surrogate-validation-check.R"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        $("rv-status").textContent = "R script downloaded (run it with Rscript; needs metafor).";
      } catch (e) { $("rv-status").textContent = e.message; }
    });
    $("rv-run").addEventListener("click", async function () {
      var btn = $("rv-run"), out = $("rv-out"), status = $("rv-status"), script;
      try { revalidate(); script = buildScript(); } catch (e) { status.textContent = e.message; return; }
      if (!window.AlmWebR || !AlmWebR.runR) { status.textContent = "WebR runner (../shared/webr-runner.js) did not load; use Download R script instead."; return; }
      btn.disabled = true; out.hidden = true; status.textContent = "Starting WebR...";
      try {
        var r = await AlmWebR.runR({ packages: ["metafor"], script: script, onStatus: function (s) { status.textContent = s; } });
        if (!r.ok) { status.textContent = "WebR could not run the check: " + r.error + " (the downloadable R script remains the check)."; return; }
        out.textContent = r.stdout; out.hidden = false;
        var lines = r.stdout.trim().split(/\r?\n/), last = lines[lines.length - 1] || "";
        var ver = Object.keys(r.versions).map(function (k) { return k + " " + r.versions[k]; }).join("; ");
        status.textContent = (/^(MATCH|MISMATCH|NOT CHECKED)\b/.test(last) ? last : "No MATCH/MISMATCH/NOT CHECKED line in R output") + "  —  " + ver +
          "  (Surrogate, the pack's R² oracle, is not in the WebR bundle: R² values are computed with base-R weighted lm)";
      } catch (e) { status.textContent = "WebR error: " + (e.message || e); }
      finally { btn.disabled = false; }
    });
  }
  window.AlmSurrogateRVerify = { buildScript: buildScript };
  if (document.readyState !== "loading") mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
