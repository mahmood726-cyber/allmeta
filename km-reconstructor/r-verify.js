/* km-reconstructor/r-verify.js — app-local R user path for the K-M IPD reconstructor.
 *
 * "Download R script" and "Verify in R (WebR)" run ONE script, generated from the inputs the page has
 * just reconstructed from (the page re-runs first, so script and display agree). The script:
 *   1. rebuilds the analysed curve from the inputs (digitized / registry anchors / fusion, as the page);
 *   2. re-implements the page's documented reconstruction heuristic in base R (events from the survival
 *      drop between adjacent curve points, residual fall in the at-risk count as censoring, rows at the
 *      interval midpoint, optional total-events re-split) -- JavaScript's Math.round is floor(x + 0.5);
 *   3. compares R's IPD with the page's IPD cell by cell, and the displayed N, total events and median
 *      with survival::survfit() on R's IPD (the package the pack validates against).
 * survival is not in the WebR bundle: there the script says so and uses a base-R product-limit estimate
 * with survival's median convention (a curve resting exactly at 0.5 takes the midpoint to the next drop).
 * This checks the page's simplified heuristic, NOT Guyot's full algorithm (IPDfromKM): the page says so.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function rnum(x) { return (x == null || !isFinite(x)) ? "NA" : String(Number(x)); }   // shortest round-trip decimal (exact)
  function rstr(s) { return JSON.stringify(String(s)); }
  function rvecN(a) { return "c(" + a.map(rnum).join(", ") + ")"; }
  function pts(name, a) { return name + " <- data.frame(t = " + rvecN(a.map(function (p) { return p.t; })) + ", s = " + rvecN(a.map(function (p) { return p.s; })) + ")"; }

  var R_BODY = [
    "## ---- 1. the analysed curve (as the page builds it) ----",
    "fuse <- function(dig, anc) {   # shared/km-fusion-v1.js fuseCurve: anchors authoritative, then monotone repair",
    "  anc <- anc[order(anc$t), , drop = FALSE]; dig <- dig[order(dig$t), , drop = FALSE]",
    "  keep <- vapply(dig$t, function(t) !any(abs(anc$t - t) < 1e-9), logical(1))",
    "  m <- rbind(data.frame(t = anc$t, s = anc$s, a = rep(TRUE, nrow(anc))), data.frame(t = dig$t[keep], s = dig$s[keep], a = rep(FALSE, sum(keep))))",
    "  m <- m[order(m$t), , drop = FALSE]; n <- nrow(m)",
    "  if (n > 1) for (i in 2:n) if (m$s[i] > m$s[i - 1] && !m$a[i]) m$s[i] <- m$s[i - 1]",
    "  if (n > 1) for (i in (n - 1):1) if (!m$a[i] && m$s[i] < m$s[i + 1]) m$s[i] <- m$s[i + 1]",
    "  m[, c(\"t\", \"s\")] }",
    "curve <- switch(source, registry = anchors, fusion = fuse(digitized, anchors), digitized)",
    "## ---- 2. the page's reconstruction heuristic, in base R ----",
    "jsround <- function(x) floor(x + 0.5)",
    "K <- nrow(curve); nr <- nrow(risk); N0 <- risk$n[1]; d <- numeric(K); cz <- numeric(K); nRisk <- N0",
    "for (k in seq_len(K)[-1]) {",
    "  tk <- curve$t[k]; idx <- 1",
    "  if (nr > 1) for (j in 1:(nr - 1)) if (tk >= risk$t[j] && tk < risk$t[j + 1]) idx <- j",
    "  if (tk >= risk$t[nr]) idx <- nr",
    "  targetN <- if (idx >= nr) risk$n[nr] else risk$n[idx] + (tk - risk$t[idx]) / (risk$t[idx + 1] - risk$t[idx]) * (risk$n[idx + 1] - risk$n[idx])",
    "  dk <- max(0, jsround(nRisk * (1 - curve$s[k] / curve$s[k - 1]))); if (dk > nRisk) dk <- nRisk",
    "  ck <- max(0, jsround(nRisk - dk - targetN)); if (dk + ck > nRisk) ck <- max(0, nRisk - dk)",
    "  d[k] <- dk; cz[k] <- ck; nRisk <- nRisk - dk - ck",
    "}",
    "if (is.finite(totEvents)) {   # re-split events / censored within each interval to hit the reported total",
    "  need <- min(max(0, jsround(totEvents)), N0) - sum(d); k <- 2",
    "  while (k <= K && need != 0) {",
    "    if (need > 0) { x <- min(need, cz[k]); d[k] <- d[k] + x; cz[k] <- cz[k] - x; need <- need - x }",
    "    else { x <- min(-need, d[k]); d[k] <- d[k] - x; cz[k] <- cz[k] + x; need <- need + x }",
    "    k <- k + 1 } }",
    "time <- c(); event <- c()",
    "for (k in seq_len(K)[-1]) { tm <- (curve$t[k - 1] + curve$t[k]) / 2",
    "  time <- c(time, rep(tm, d[k] + cz[k])); event <- c(event, rep(1, d[k]), rep(0, cz[k])) }",
    "if (nRisk > 0) { time <- c(time, rep(curve$t[K], nRisk)); event <- c(event, rep(0, nRisk)) }",
    "ipd <- data.frame(time = time, event = event)",
    "## ---- 3. K-M summaries of R's IPD ----",
    "if (requireNamespace(\"survival\", quietly = TRUE)) {",
    "  sf <- survival::survfit(survival::Surv(time, event) ~ 1, data = ipd)",
    "  kmN <- sf$n; kmEv <- sum(sf$n.event); kmMed <- unname(summary(sf)$table[\"median\"])",
    "  kmWhat <- paste(\"survival\", as.character(packageVersion(\"survival\")), \"survfit()\")",
    "} else {",
    "  cat(\"NOTE: package survival is not available here (it is not in the WebR bundle); N, events and median use a base-R\\n\")",
    "  cat(\"NOTE: product-limit estimate with survival's median rule. The downloadable script run in R uses survival::survfit().\\n\")",
    "  ut <- sort(unique(ipd$time)); S <- cumprod(vapply(ut, function(t) { n <- sum(ipd$time >= t); (n - sum(ipd$time == t & ipd$event == 1)) / n }, 0))",
    "  i <- which(S <= 0.5 + sqrt(.Machine$double.eps))[1]",
    "  kmMed <- if (is.na(i)) NA_real_ else if (abs(S[i] - 0.5) < sqrt(.Machine$double.eps) && any(S[-(1:i)] < S[i])) (ut[i] + ut[i + which(S[-(1:i)] < S[i])[1]]) / 2 else ut[i]",
    "  kmN <- nrow(ipd); kmEv <- sum(ipd$event); kmWhat <- \"base-R product-limit (survival unavailable)\"",
    "}",
    "## ---- comparison (exact for counts; tolerance 1e-6 for the median: tighter than the page's 1-decimal display) ----",
    ".q <- character(0); .p <- numeric(0); .r <- numeric(0)",
    ".add <- function(q, page, r) { .q <<- c(.q, q); .p <<- c(.p, page); .r <<- c(.r, if (length(r) == 1) r else NA_real_) }",
    "key <- function(t, e) paste(format(t, digits = 15), e)",
    "tabP <- table(key(pageIPD$time, pageIPD$event)); tabR <- table(key(ipd$time, ipd$event))",
    "cells <- union(names(tabP), names(tabR))",
    "cellDiff <- sum(vapply(cells, function(z) (if (z %in% names(tabP)) tabP[[z]] else 0) != (if (z %in% names(tabR)) tabR[[z]] else 0), logical(1)))",
    ".add(\"IPD (time,event) cells differing\", 0, cellDiff)",
    ".add(\"IPD rows (page IPD vs R IPD)\", nrow(pageIPD), nrow(ipd))",
    ".add(\"Reconstructed N\", page$n, kmN)",
    ".add(\"Total events\", page$events, kmEv)",
    ".add(\"Median survival\", page$median, kmMed)",
    ".d <- abs(.p - .r)",
    ".ok <- (!is.na(.d) & .d <= 1e-6 * pmax(1, abs(.p))) | (is.na(.p) & is.na(.r))",
    "for (i in seq_along(.q)) cat(sprintf(\"%-34s page=%12.6f  R=%12.6f  |diff|=%9.2e  %s\\n\", .q[i], .p[i], .r[i], .d[i], if (.ok[i]) \"ok\" else \"DIFFERENT\"))",
    "cat(R.version.string, \"|\", kmWhat, \"\\n\")",
    "cat(sprintf(\"%s %d/%d\\n\", if (length(.q) > 0 && all(.ok)) \"MATCH\" else \"MISMATCH\", sum(.ok), length(.q)))"
  ].join("\n");

  function buildScript() {
    var st = window.__almKmLast;
    if (!st) throw new Error("No current result on the page (the curve or at-risk table is unusable): fix the input and press Reconstruct. No R script was made.");
    var L = [];
    L.push("# R check of the allmeta Kaplan-Meier IPD Reconstructor page (km-reconstructor).");
    L.push("# Generated " + new Date().toISOString() + " from " + location.href.split("#")[0] + ".");
    L.push("# Inputs = what the page reconstructed from when this script was made (parsed: survival in 0..1).");
    L.push("# Checks the page's documented SIMPLIFIED heuristic (re-implemented below in base R) and its K-M summaries");
    L.push("# with survival::survfit(). It is not Guyot's full algorithm (IPDfromKM); see the page text.");
    L.push("source <- " + rstr(st.source));
    L.push(pts("digitized", st.digitized));
    L.push(pts("anchors", st.anchors));
    L.push("risk <- data.frame(t = " + rvecN(st.risk.map(function (p) { return p.t; })) + ", n = " + rvecN(st.risk.map(function (p) { return p.n; })) + ")");
    L.push("totEvents <- " + rnum(st.totEvents) + "   # NA = not supplied");
    L.push("## ---- values the page displayed, and the page's IPD (Download IPD CSV), tabulated ----");
    var tab = {};
    st.ipd.forEach(function (r) { var k = r.time + "|" + r.event; tab[k] = (tab[k] || 0) + 1; });
    var keys = Object.keys(tab);
    L.push("pageIPD <- data.frame(time = rep(" + rvecN(keys.map(function (k) { return +k.split("|")[0]; })) + ", " +
      rvecN(keys.map(function (k) { return tab[k]; })) + "),");
    L.push("                      event = rep(" + rvecN(keys.map(function (k) { return +k.split("|")[1]; })) + ", " +
      rvecN(keys.map(function (k) { return tab[k]; })) + "))");
    L.push("page <- list(n = " + rnum(st.n) + ", events = " + rnum(st.events) + ", median = " + rnum(st.median) + ")");
    L.push(R_BODY);
    return L.join("\n") + "\n";
  }

  function mount() {
    var exp = $("btn-export"), panel = exp && exp.closest("section.panel");
    var results = panel && panel.nextElementSibling;
    if (!results || $("rv-panel")) return;
    var sec = document.createElement("section");
    sec.className = "panel"; sec.id = "rv-panel"; sec.setAttribute("aria-label", "Verify in R");
    sec.innerHTML = '<h2>Check this reconstruction in R</h2>' +
      '<div class="note" style="margin:0 0 .5rem">The R script re-runs this page\'s reconstruction heuristic in base R from the inputs above, compares R\'s IPD with the page\'s cell by cell, and checks the displayed N, total events and median with <code>survival::survfit()</code>, ending in <code>MATCH n/n</code> or <code>MISMATCH</code>. "Verify in R" runs the same script here in WebR (first run downloads R, a few minutes). It checks this simplified heuristic, not Guyot\'s full algorithm.</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" id="rv-download" class="secondary">Download R script</button>' +
      '<button type="button" id="rv-run" class="secondary">Verify in R (WebR)</button></div>' +
      '<p id="rv-status" role="status" aria-live="polite" style="margin:.5rem 0 0"></p>' +
      '<pre id="rv-out" style="white-space:pre-wrap;font-size:.72rem;max-height:28rem;overflow:auto" hidden></pre>';
    results.parentNode.insertBefore(sec, results.nextSibling);
    function rerun() { var b = $("btn-run"); if (b) b.click(); }
    $("rv-download").addEventListener("click", function () {
      try {
        rerun();
        var blob = new Blob([buildScript()], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "km-reconstructor-check.R"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        $("rv-status").textContent = "R script downloaded (run it with Rscript; uses survival).";
      } catch (e) { $("rv-status").textContent = e.message; }
    });
    $("rv-run").addEventListener("click", async function () {
      var btn = $("rv-run"), out = $("rv-out"), status = $("rv-status"), script;
      try { rerun(); script = buildScript(); } catch (e) { status.textContent = e.message; return; }
      if (!window.AlmWebR || !AlmWebR.runR) { status.textContent = "WebR runner (../shared/webr-runner.js) did not load; use Download R script instead."; return; }
      btn.disabled = true; out.hidden = true; status.textContent = "Starting WebR...";
      try {
        // survival is not in the pinned WebR repository, so no package is requested; the script says so itself.
        var r = await AlmWebR.runR({ packages: [], script: script, onStatus: function (s) { status.textContent = s; } });
        if (!r.ok) { status.textContent = "WebR could not run the check: " + r.error + " (the downloadable R script remains the check)."; return; }
        out.textContent = r.stdout; out.hidden = false;
        var lines = r.stdout.trim().split(/\r?\n/), last = lines[lines.length - 1] || "";
        var ver = Object.keys(r.versions).map(function (k) { return k + " " + r.versions[k]; }).join("; ");
        status.textContent = (/^(MATCH|MISMATCH)\b/.test(last) ? last : "No MATCH/MISMATCH line in R output") + "  —  " + ver +
          (/NOTE: package survival is not available/.test(r.stdout) ? "  (package survival is not available in WebR: K-M summaries use base R here; the downloadable script uses survival::survfit)" : "");
      } catch (e) { status.textContent = "WebR error: " + (e.message || e); }
      finally { btn.disabled = false; }
    });
  }
  window.AlmKmRVerify = { buildScript: buildScript };
  if (document.readyState !== "loading") mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
