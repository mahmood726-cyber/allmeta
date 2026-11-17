/* bayesian-ma/r-check.js -- "Download R script" + in-page "Verify in R (WebR)" for this page (lane pa8).
 * The script recomputes the numbers on screen: the Paule-Mandel plug-in tau^2 with metafor (the R
 * package the P47 pack validates this page against) and the conjugate normal posterior in closed form
 * (base R: posterior precision = 1/tau0^2 + sum 1/(v_i + tau^2)). */
(function () {
  "use strict";
  // ---- R check (app-local; lane pa8). A downloadable R script that recomputes every
  // headline number this page displays from the inputs it analysed, prints R next to the
  // page value with |diff|, and ends with an honest "MATCH n/n" or "MISMATCH m/n"; the
  // in-page "Verify in R (WebR)" runs the SAME script with the unchanged shared/webr-runner.js.
  function rNum(x) {                       // a JS number as an exact R literal (shortest round-trip)
    if (x === null || x === undefined || (typeof x === "number" && isNaN(x))) return "NA";
    if (x === Infinity) return "Inf"; if (x === -Infinity) return "-Inf";
    return String(+x);
  }
  function rVec(a) { return "c(" + a.map(rNum).join(", ") + ")"; }
  function rStr(s) { return JSON.stringify(String(s)); }
  function rStrVec(a) { return "c(" + a.map(rStr).join(", ") + ")"; }
  var R_HELPERS = [
    "## ---- comparison helpers -------------------------------------------------",
    "## chk(): |R - page| <= min(tol * max(1, |page|), 5e-4) with tol = 1e-6, so never looser than the",
    "## page's displayed precision (3-4 decimals). A quantity the page shows as undefined (\"--\") matches",
    "## only an undefined R value of the same kind (NA/NaN with NA/NaN, Inf with the same signed Inf).",
    ".res <- data.frame(quantity = character(0), ok = logical(0), stringsAsFactors = FALSE)",
    "## half: half a unit of the digits the page shows for this quantity (default 5e-4 = 3 decimals); the cap",
    "## is never looser than the display, also for values shown to 4 decimals or as exp(log value).",
    "chk <- function(q, r, page, tol = 1e-6, half = 5e-4) {",
    "  r <- as.numeric(r); page <- as.numeric(page)",
    "  if (!is.finite(page) || !is.finite(r)) { ok <- (is.na(page) && is.na(r)) || identical(page, r); d <- NA_real_ }",
    "  else { d <- abs(r - page); ok <- d <= min(tol * max(1, abs(page)), half) }",
    "  cat(sprintf(\"%-36s R = %-18.12g page = %-18.12g |diff| = %-9s %s\\n\", q, r, page,",
    "              if (is.na(d)) \"-\" else sprintf(\"%.2e\", d), if (ok) \"ok\" else \"DIFFERS\"))",
    "  .res[nrow(.res) + 1, ] <<- list(q, ok); invisible(ok) }",
    "finish <- function() { n <- nrow(.res); m <- sum(.res$ok)",
    "  cat(if (n > 0 && m == n) sprintf(\"MATCH %d/%d\\n\", n, n) else sprintf(\"MISMATCH %d/%d agree\\n\", m, n)) }",
    ""
  ].join("\n");

  var STALE = "R result discarded: the analysis on the page changed while R was running, so the verdict R returned (for the earlier analysis) is not shown. Press Verify in R again.";
  function attachRCheck(cfg) {
    var verifyGen = 0;   // a later Verify, or a re-run of the analysis, makes an earlier run's answer stale
    var mount = document.querySelector(cfg.mount);
    if (!mount) return;
    var box = document.createElement("div");
    box.className = "alm-rcheck";
    box.style.cssText = "margin-top:0.6rem;display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center";
    box.innerHTML =
      '<button type="button" id="btn-r-script" title="Download an R script that recomputes every number shown here from the inputs this page analysed and prints MATCH or MISMATCH.">Download R script</button>' +
      '<button type="button" id="btn-r-webr" title="Run the same R script in this browser with WebR (downloads R on first use) and show its output.">Verify this analysis in R (WebR)</button>' +
      '<span id="r-check-status" role="status" aria-live="polite" style="font-size:0.85rem"></span>' +
      '<pre id="r-check-out" hidden style="flex-basis:100%;max-height:28rem;overflow:auto;font-size:0.75rem;white-space:pre-wrap;border:1px solid #ccc;border-radius:6px;padding:0.5rem;margin:0"></pre>';
    mount.parentNode.insertBefore(box, mount.nextSibling);
    var st = box.querySelector("#r-check-status"), out = box.querySelector("#r-check-out");
    function current() {
      var inp = cfg.getInputs();
      if (!inp) { st.textContent = cfg.refuse || "Nothing to check: the page shows no result for the current input."; return null; }
      return inp;
    }
    box.querySelector("#btn-r-script").addEventListener("click", function () {
      var inp = current(); if (!inp) return;
      var code = cfg.buildScript(inp);
      var blob = new Blob([code], { type: "text/x-r;charset=utf-8" });
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = cfg.filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      st.textContent = "Saved " + cfg.filename + " - run it with Rscript; it ends with MATCH n/n or MISMATCH.";
    });
    box.querySelector("#btn-r-webr").addEventListener("click", async function () {
      var inp = current(); if (!inp) return;
      if (!window.AlmWebR || typeof window.AlmWebR.runR !== "function") { st.textContent = "WebR runner (shared/webr-runner.js) did not load; use Download R script."; return; }
      var btn = this; btn.disabled = true; out.hidden = false;
      var my = ++verifyGen, snap = inp.page;   // the page's result object: replaced on every new analysis
      out.textContent = (cfg.webrNote ? cfg.webrNote(inp) + "\n" : "") + "Starting WebR...\n";
      var pk = cfg.packages(inp);
      var res = await window.AlmWebR.runR({ script: cfg.buildScript(inp), packages: pk, onStatus: function (s) { st.textContent = s; out.textContent += s + "\n"; } });
      btn.disabled = false;
      // R answered for the analysis it was given; if the page has moved on, never show that answer beside the new one.
      var now = cfg.getInputs();
      if (my !== verifyGen || !now || now.page !== snap) { st.textContent = STALE; out.textContent = STALE + "\n"; return; }
      if (!res.ok) { st.textContent = "R did not run: " + res.error; out.textContent += "R did not run: " + res.error + "\n"; return; }
      var v = res.versions || {};
      out.textContent += "---- R output (verbatim) ----\n" + res.stdout + "\n---- versions: " + Object.keys(v).map(function (k) { return k + " " + v[k]; }).join("; ") + "\n";
      var m = /^(MATCH \d+\/\d+|MISMATCH \d+\/\d+ agree)\s*$/m.exec(res.stdout);
      st.textContent = m ? "R says: " + m[1] : "R ran but printed no MATCH/MISMATCH line - see output.";
      window.__almRCheckLast = { stdout: res.stdout, versions: v, verdict: m ? m[1] : null };
    });
  }

  function buildScript(c) {
    var p = c.page, s = c.studies, L = [];
    L.push("## allmeta bayesian-ma -- R check of the numbers this page displayed");
    L.push("## Generated " + new Date().toISOString() + " from the inputs the page analysed (k = " + s.length + ").");
    L.push("## Run: Rscript bayesian-ma-check.R   (needs metafor only for the Paule-Mandel tau^2)");
    L.push("");
    L.push(R_HELPERS);
    L.push("label <- " + rStrVec(s.map(function (x) { return x.label; })));
    L.push("yi    <- " + rVec(s.map(function (x) { return x.est; })));
    L.push("sei   <- " + rVec(s.map(function (x) { return x.se; })));
    L.push("mu0 <- " + rNum(c.mu0) + "; tau0 <- " + rNum(c.tau0) + "   # normal prior on theta");
    L.push("tau_method <- " + rStr(c.tauMethod) + "   # \"PM\" plug-in Paule-Mandel, \"0\" fixed effect, \"manual\"");
    L.push("tau2_manual <- " + rNum(c.tau2Manual));
    L.push("threshold <- " + rNum(c.threshold) + "; rope <- " + rNum(c.rope));
    L.push("## values the page displayed (full precision)");
    L.push("page <- list(k = " + rNum(p.k) + ", tau2 = " + rNum(p.tau2) + ", mu = " + rNum(p.mu) + ", lo = " + rNum(p.lo) + ", hi = " + rNum(p.hi) +
           ", pLess = " + rNum(p.pLess) + ", pInside = " + rNum(p.pInside) + ")");
    L.push("");
    L.push("v <- sei^2; k <- length(yi)");
    L.push("tau2 <- if (tau_method == \"0\") 0 else if (tau_method == \"manual\") {");
    L.push("  if (is.finite(tau2_manual) && tau2_manual >= 0) tau2_manual else 0   # the page uses 0 for an invalid entry");
    L.push("} else if (k < 2) 0 else {");
    L.push("  suppressPackageStartupMessages(library(metafor))");
    L.push("  ## tight convergence so R reaches the PM root the page solves for (metafor's default tol stops ~1e-4 short)");
    L.push("  rma(yi, sei = sei, method = \"PM\", control = list(tol = 1e-12, maxiter = 10000))$tau2");
    L.push("}");
    L.push("prec <- 1 / tau0^2 + sum(1 / (v + tau2))");
    L.push("post_mu <- (mu0 / tau0^2 + sum(yi / (v + tau2))) / prec; post_sd <- sqrt(1 / prec)");
    L.push("z <- qnorm(0.975)");
    L.push("cat(\"bayesian-ma R check:\", k, \"studies; tau^2 strategy\", tau_method, \"\\n\")");
    L.push("chk(\"k\", k, page$k, 0)");
    L.push("chk(\"tau^2 (plug-in)\", tau2, page$tau2, half = 5e-5)   # shown to 4 decimals");
    L.push("chk(\"posterior mean\", post_mu, page$mu)");
    L.push("chk(\"95% CrI lower\", post_mu - z * post_sd, page$lo)");
    L.push("chk(\"95% CrI upper\", post_mu + z * post_sd, page$hi)");
    L.push("if (is.finite(threshold)) chk(sprintf(\"P(theta < %g)\", threshold), pnorm((threshold - post_mu) / post_sd), page$pLess)");
    L.push("if (is.finite(rope) && rope > 0) chk(sprintf(\"P(|theta| < %g)\", rope), pnorm((rope - post_mu) / post_sd) - pnorm((-rope - post_mu) / post_sd), page$pInside)");
    L.push("cat(\"R:\", R.version.string, if (tau_method == \"PM\" && k >= 2) paste(\"| metafor\", packageVersion(\"metafor\")) else \"\", \"\\n\")");
    L.push("finish()");
    return L.join("\n") + "\n";
  }
  window.__almBayesMARScript = function () { var c = window.__almRCheckInputs && window.__almRCheckInputs(); return c ? buildScript(c) : null; };
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    attachRCheck({
      mount: ".actions", filename: "bayesian-ma-check.R",
      getInputs: function () { return window.__almRCheckInputs ? window.__almRCheckInputs() : null; },
      refuse: "Nothing to check: the page shows no posterior (enter studies and a prior SD > 0).",
      buildScript: buildScript,
      packages: function (c) { return c.tauMethod === "PM" && c.studies.length >= 2 ? ["metafor"] : []; },
    });
  });
})();
