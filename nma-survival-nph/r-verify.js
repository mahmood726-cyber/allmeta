/* nma-survival-nph/r-verify.js — app-local R user path for the non-PH survival NMA page.
 *
 * Two controls, one script:
 *   "Download R script"  — a self-contained R script built from the inputs the page has just
 *                          analysed (the textarea + model/estimator/correction selects at the moment
 *                          of the click; the page is re-fitted first so script and display agree).
 *   "Verify in R (WebR)" — runs the SAME script in the browser through the unchanged
 *                          ../shared/webr-runner.js (pinned, SHA-checked webR bundle).
 * The script recomputes every number the page displays (per-interval log-HR and SE for each
 * treatment, tau^2 per interval under random effects, and the inverse-variance pooled log-HR and
 * SE) from the arm-level rows, with netmeta (common effect, DerSimonian-Laird) or metafor::rma.mv
 * (REML / ML with the full multi-arm sampling covariance, rho = 0.5 — the model the page fits),
 * prints each value next to the page's, and ends with an honest MATCH n/n or MISMATCH line.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function rnum(x) { return (x == null || !isFinite(x)) ? "NA" : String(Number(x)); }   // shortest round-trip decimal (exact)
  function rstr(s) { return JSON.stringify(String(s)); }   // JSON string escapes are valid R string escapes
  function rvecN(a) { return "c(" + a.map(rnum).join(", ") + ")"; }
  function rvecS(a) { return "c(" + a.map(rstr).join(", ") + ")"; }

  var COMPARE_R = [
    "## ---- comparison (tolerance 1e-6 relative to max(1,|page|): tighter than the page's 4-decimal display) ----",
    ".q <- character(0); .p <- numeric(0); .r <- numeric(0)",
    ".add <- function(q, page, r) { .q <<- c(.q, q); .p <<- c(.p, page); .r <<- c(.r, if (length(r) == 1) r else NA_real_) }",
    "COMPARE_HERE",
    ".d <- abs(.p - .r)",
    ".ok <- (!is.na(.d) & .d <= 1e-6 * pmax(1, abs(.p))) | (is.na(.p) & is.na(.r))",
    "for (i in seq_along(.q)) cat(sprintf(\"%-34s page=%15.10f  R=%15.10f  |diff|=%9.2e  %s\\n\", .q[i], .p[i], .r[i], .d[i], if (.ok[i]) \"ok\" else \"DIFFERENT\"))",
    "cat(sprintf(\"%s %d/%d\\n\", if (length(.q) > 0 && all(.ok)) \"MATCH\" else \"MISMATCH\", sum(.ok), length(.q)))"
  ].join("\n");

  function buildScript() {
    var st = window.__almNphLast;
    if (!st || !st.res) throw new Error("No current result on the page (no data, or the last Fit failed): fix the input and press Fit. No R script was made.");
    var rows = st.rows, o = st.opts, res = st.res;
    var method = o.method || "DL";
    var model = o.model === "re" ? "re" : "fe";
    var ccTo = o.ccTo === "only0" ? "only0" : "all";
    var globalRef = rows.map(function (r) { return String(r.treatment); }).sort()[0];
    var build = window.AlmBuildInfo ? (window.AlmBuildInfo.version + " " + window.AlmBuildInfo.shortSha) : "unknown build";
    var L = [];
    L.push("# R check of the allmeta Non-PH Survival NMA page (nma-survival-nph).");
    L.push("# Generated " + new Date().toISOString() + " from " + location.href.split("#")[0] + " (" + build + ").");
    L.push("# Data = the arm-level rows the page analysed when this script was made; page values are copied at full precision.");
    L.push("# Method (as the page): arm log-hazard log((events+cc)/person-time), Var 1/(events+cc); every within-study pair of arms");
    L.push("# is a contrast; each interval is its own NMA. Common effect and DerSimonian-Laird: netmeta::netmeta().");
    L.push("# REML / ML: metafor::rma.mv() with the full multi-arm sampling covariance and between-study covariance tau^2/2");
    L.push("# (struct = \"CS\", rho = 0.5) -- netmeta's own REML/ML uses a diagonal covariance for multi-arm studies.");
    L.push("# Pooled = inverse-variance average of the interval log-HRs, over intervals whose reference is globalRef (below).");
    L.push("suppressPackageStartupMessages({ library(netmeta); library(metafor) })");
    L.push("rows <- data.frame(");
    L.push("  study     = " + rvecS(rows.map(function (r) { return r.study; })) + ",");
    L.push("  treatment = " + rvecS(rows.map(function (r) { return r.treatment; })) + ",");
    L.push("  interval  = " + rvecS(rows.map(function (r) { return r.interval; })) + ",");
    L.push("  events    = " + rvecN(rows.map(function (r) { return r.events; })) + ",");
    L.push("  ptime     = " + rvecN(rows.map(function (r) { return r.ptime; })) + ",");
    L.push("  stringsAsFactors = FALSE)");
    L.push("model <- " + rstr(model) + "; method <- " + rstr(method) + "; cc <- " + rnum(o.cc) + "; ccTo <- " + rstr(ccTo));
    L.push("globalRef <- " + rstr(globalRef));
    // page values
    L.push("## ---- values the page displayed (full precision) ----");
    L.push("page <- list(");
    var ivs = res.intervalIds.map(function (iv) {
      var b = res.intervals[iv];
      if (!b) return "  " + rstr(iv) + " = NULL";
      var t = Object.keys(b.effects).sort();
      return "  " + rstr(iv) + " = list(ref = " + rstr(b.refTreat) + ", tau2 = " + rnum(b.tau2) +
        ", trt = " + rvecS(t) + ", logHR = " + rvecN(t.map(function (k) { return b.effects[k].logHR; })) +
        ", se = " + rvecN(t.map(function (k) { return b.effects[k].se; })) + ")";
    });
    L.push(ivs.join(",\n") + ")");
    var pt = Object.keys(res.pooled).sort();
    L.push("pagePooled <- list(trt = " + rvecS(pt) + ", logHR = " + rvecN(pt.map(function (k) { return res.pooled[k].logHR; })) +
      ", se = " + rvecN(pt.map(function (k) { return res.pooled[k].se; })) + ")");
    L.push(R_ENGINE);
    L.push(COMPARE_R.replace("COMPARE_HERE", R_COMPARE_BODY));
    return L.join("\n") + "\n";
  }

  var R_ENGINE = [
    "## ---- R computation from the rows ----",
    "fitInterval <- function(x, ref) {",
    "  c1 <- list(); c2 <- list()",
    "  for (s in unique(x$study)) {",
    "    a <- x[x$study == s, ]; a <- a[order(a$treatment, method = \"radix\"), ]",
    "    if (nrow(a) < 2) next",
    "    ccS <- if (ccTo == \"only0\" && !any(a$events == 0)) 0 else cc",
    "    lh <- log((a$events + ccS) / a$ptime); v <- 1 / (a$events + ccS)",
    "    for (i in 1:(nrow(a) - 1)) for (j in (i + 1):nrow(a))",
    "      c1[[length(c1) + 1]] <- data.frame(studlab = s, treat1 = a$treatment[j], treat2 = a$treatment[i],",
    "                                        TE = lh[j] - lh[i], seTE = sqrt(v[i] + v[j]), stringsAsFactors = FALSE)",
    "    c2[[length(c2) + 1]] <- list(study = s, trt = a$treatment, lh = lh, v = v)",
    "  }",
    "  if (!length(c1)) return(NULL)",
    "  pw <- do.call(rbind, c1)",
    "  trts <- sort(unique(c(pw$treat1, pw$treat2)), method = \"radix\"); nonref <- setdiff(trts, ref)",
    "  if (model == \"fe\" || method == \"DL\") {",
    "    n <- suppressWarnings(netmeta(TE, seTE, treat1, treat2, studlab, data = pw, reference.group = ref,",
    "                                  common = TRUE, random = TRUE, method.tau = \"DL\"))",
    "    TE <- if (model == \"fe\") n$TE.common else n$TE.random",
    "    SE <- if (model == \"fe\") n$seTE.common else n$seTE.random",
    "    return(list(ref = ref, trt = nonref, logHR = TE[nonref, ref], se = SE[nonref, ref],",
    "                tau2 = if (model == \"re\") n$tau2 else NA_real_))",
    "  }",
    "  # REML / ML: contrasts vs each study's first arm, full sampling covariance, CS random effects (rho = 0.5)",
    "  yi <- c(); comp <- c(); sid <- c(); X <- NULL; Vb <- list()",
    "  for (b in c2) {",
    "    m <- length(b$trt); if (m < 2) next",
    "    for (j in 2:m) {",
    "      yi <- c(yi, b$lh[j] - b$lh[1]); comp <- c(comp, b$trt[j]); sid <- c(sid, b$study)",
    "      xr <- setNames(numeric(length(nonref)), nonref)",
    "      if (b$trt[j] %in% nonref) xr[b$trt[j]] <- 1",
    "      if (b$trt[1] %in% nonref) xr[b$trt[1]] <- -1",
    "      X <- rbind(X, xr)",
    "    }",
    "    V <- matrix(b$v[1], m - 1, m - 1); diag(V) <- b$v[1] + b$v[-1]; Vb[[length(Vb) + 1]] <- V",
    "  }",
    "  dd <- data.frame(yi = yi, comp = comp, sid = sid)",
    "  f <- rma.mv(yi, bldiag(Vb), mods = X, intercept = FALSE, random = ~ comp | sid, struct = \"CS\", rho = 0.5,",
    "              method = method, data = dd)",
    "  list(ref = ref, trt = nonref, logHR = as.numeric(coef(f)), se = sqrt(diag(vcov(f))), tau2 = f$tau2)",
    "}",
    "R <- list()",
    "for (iv in names(page)) {",
    "  x <- rows[rows$interval == iv, ]",
    "  ref <- if (!is.null(page[[iv]])) page[[iv]]$ref else globalRef",
    "  R[[iv]] <- tryCatch(fitInterval(x, ref), error = function(e) { cat(\"interval\", iv, \"R error:\", conditionMessage(e), \"\\n\"); NULL })",
    "}",
    "sw <- numeric(0); swy <- numeric(0)",
    "for (iv in names(R)) { r <- R[[iv]]; if (is.null(r) || r$ref != globalRef) next",
    "  for (k in seq_along(r$trt)) { t <- r$trt[k]; if (!is.finite(r$se[k]) || r$se[k] <= 0) next",
    "    w <- 1 / r$se[k]^2; sw[t] <- (if (is.na(sw[t])) 0 else sw[t]) + w; swy[t] <- (if (is.na(swy[t])) 0 else swy[t]) + w * r$logHR[k] } }"
  ].join("\n");

  var R_COMPARE_BODY = [
    "for (iv in names(page)) {",
    "  pg <- page[[iv]]; r <- R[[iv]]",
    "  .add(paste0(\"interval \", iv, \" fitted (1=yes)\"), as.numeric(!is.null(pg)), as.numeric(!is.null(r)))",
    "  if (is.null(pg) || is.null(r)) next",
    "  for (k in seq_along(pg$trt)) { t <- pg$trt[k]; m <- match(t, r$trt)",
    "    .add(paste0(\"iv\", iv, \" \", t, \" vs \", pg$ref, \" logHR\"), pg$logHR[k], if (is.na(m)) NA_real_ else r$logHR[m])",
    "    .add(paste0(\"iv\", iv, \" \", t, \" vs \", pg$ref, \" SE\"), pg$se[k], if (is.na(m)) NA_real_ else r$se[m]) }",
    "  if (length(setdiff(r$trt, pg$trt))) .add(paste0(\"iv\", iv, \" treatments only in R\"), 0, length(setdiff(r$trt, pg$trt)))",
    "  if (model == \"re\") .add(paste0(\"iv\", iv, \" tau2 (\", method, \")\"), pg$tau2, r$tau2)",
    "}",
    "for (k in seq_along(pagePooled$trt)) { t <- pagePooled$trt[k]",
    "  .add(paste0(\"pooled \", t, \" logHR\"), pagePooled$logHR[k], if (is.na(sw[t])) NA_real_ else swy[t] / sw[t])",
    "  .add(paste0(\"pooled \", t, \" SE\"), pagePooled$se[k], if (is.na(sw[t])) NA_real_ else sqrt(1 / sw[t])) }",
    "if (length(setdiff(names(sw), pagePooled$trt))) .add(\"pooled treatments only in R\", 0, length(setdiff(names(sw), pagePooled$trt)))",
    "cat(R.version.string, \"| netmeta\", as.character(packageVersion(\"netmeta\")), \"| metafor\", as.character(packageVersion(\"metafor\")), \"\\n\")"
  ].join("\n");

  function mount() {
    var host = document.querySelector('section[aria-label="Interval-specific effects"]');
    if (!host || $("rv-panel")) return;
    var sec = document.createElement("section");
    sec.className = "panel"; sec.id = "rv-panel"; sec.setAttribute("aria-label", "Verify in R");
    sec.innerHTML = '<h2>Check these numbers in R</h2>' +
      '<p class="note" style="margin:0 0 .5rem">The R script refits the rows above with netmeta (common effect, DerSimonian-Laird) or metafor::rma.mv (REML/ML) and prints every displayed value next to R\'s, ending in <code>MATCH n/n</code> or <code>MISMATCH</code>. "Verify in R" runs the same script here in WebR (first run downloads R, a few minutes).</p>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button type="button" id="rv-download">Download R script</button>' +
      '<button type="button" id="rv-run">Verify in R (WebR)</button></div>' +
      '<p id="rv-status" role="status" aria-live="polite" style="margin:.5rem 0 0"></p>' +
      '<pre id="rv-out" style="white-space:pre-wrap;font-size:.75rem;max-height:28rem;overflow:auto" hidden></pre>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    function refit() { var b = $("run"); if (b) b.click(); }
    $("rv-download").addEventListener("click", function () {
      try {
        refit();
        var blob = new Blob([buildScript()], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "nma-survival-nph-check.R"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        $("rv-status").textContent = "R script downloaded (run it with Rscript; needs netmeta and metafor).";
      } catch (e) { $("rv-status").textContent = e.message; }
    });
    $("rv-run").addEventListener("click", async function () {
      var btn = $("rv-run"), out = $("rv-out"), status = $("rv-status");
      var script;
      try { refit(); script = buildScript(); } catch (e) { status.textContent = e.message; return; }
      if (!window.AlmWebR || !AlmWebR.runR) { status.textContent = "WebR runner (../shared/webr-runner.js) did not load; use Download R script instead."; return; }
      btn.disabled = true; out.hidden = true; status.textContent = "Starting WebR...";
      try {
        var r = await AlmWebR.runR({ packages: ["netmeta", "metafor"], script: script, onStatus: function (s) { status.textContent = s; } });
        if (!r.ok) { status.textContent = "WebR could not run the check: " + r.error + " (the downloadable R script remains the check)."; return; }
        out.textContent = r.stdout; out.hidden = false;
        var lines = r.stdout.trim().split(/\r?\n/), last = lines[lines.length - 1] || "";
        var ver = Object.keys(r.versions).map(function (k) { return k + " " + r.versions[k]; }).join("; ");
        status.textContent = (/^(MATCH|MISMATCH)\b/.test(last) ? last : "No MATCH/MISMATCH line in R output") + "  —  " + ver;
      } catch (e) { status.textContent = "WebR error: " + (e.message || e); }
      finally { btn.disabled = false; }
    });
  }
  window.AlmNphRVerify = { buildScript: buildScript };
  if (document.readyState !== "loading") mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
