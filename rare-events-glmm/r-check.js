/* rare-events-glmm/r-check.js — app-local "Download R script" + "Verify in R (WebR)" for the
 * rare-events GLMM page. The script is built from the page's CURRENT analysed inputs, model
 * and displayed numbers. GLMM row: metafor::rma.glmm(measure = "OR", model = <page model>)
 * (the R reference of paper 30, metafor 5.2.1 with lme4); comparison row: metafor::rma(DL,
 * add 1/2 to studies with a zero cell, double-zero studies kept). It prints each quantity
 * next to the page's value, the absolute difference and a final "MATCH n/n" or "MISMATCH"
 * line. The page itself states that its UM.FS / CM.AL fits are NOT metafor's models, so a
 * MISMATCH here is a real, reported difference, not a failure of the check. Tolerance = half a unit of the page's displayed
 * last decimal (never looser than what the page shows). The in-page check runs the SAME
 * script in WebR via the unchanged ../shared/webr-runner.js.
 */
(function (global) {
  "use strict";
  function num(x) { return (typeof x === "number" && isFinite(x)) ? String(x) : "NA"; }
  function vec(a) { return "c(" + a.map(num).join(", ") + ")"; }
  function str(s) { return JSON.stringify(String(s)); }

  var PRELUDE = [
    "## ---- comparison helpers (base R) ----",
    ".alm <- new.env(); .alm$n <- 0L; .alm$ok <- 0L",
    "chk <- function(name, r, page, dec) {",
    "  tol <- 0.5 * 10^(-dec); d <- abs(r - page)",
    "  ok <- isTRUE(is.finite(d) && d <= tol)",
    "  .alm$n <- .alm$n + 1L; if (ok) .alm$ok <- .alm$ok + 1L",
    "  cat(sprintf(\"%-24s R = %-14s page = %-14s |diff| = %-10s tol = %-8s %s\\n\", name,",
    "      formatC(r, digits = 8, format = \"g\"), formatC(page, digits = 8, format = \"g\"),",
    "      formatC(d, digits = 3, format = \"g\"), format(tol), if (ok) \"ok\" else \"DIFFERS\"))",
    "}",
    "verdict <- function() {",
    "  if (.alm$n == 0L) cat(\"NO CHECKS (nothing on the page to compare)\\n\")",
    "  else if (.alm$ok == .alm$n) cat(sprintf(\"MATCH %d/%d\\n\", .alm$ok, .alm$n))",
    "  else cat(sprintf(\"MISMATCH %d/%d agree\\n\", .alm$ok, .alm$n))",
    "}"
  ].join("\n");

  var NOTE = {
    "UM.FS": "page: 'Experimental unconditional fit (not default metafor UM.FS)': treatment-only random effects, fixed 10-point quadrature",
    "CM.EL": "page: 'CM.EL: conditional likelihood; numerical parity unverified'",
    "CM.AL": "page: 'Fixed-baseline approximation (not metafor CM.AL)'",
    "UM.RS": "page: UM.RS is R-only (the page displays no GLMM numbers for it)"
  };
  // state: { rows:[{label,events_T,n_T,events_C,n_C}], model, page:null | {OR,OR_lo,OR_hi,theta,tau2,k,zero, iv:{OR,OR_lo,OR_hi,tau2}} }
  function buildScript(state) {
    var R = state.rows, p = state.page, m = state.model;
    var col = function (k) { return vec(R.map(function (s) { return s[k]; })); };
    var L = [
      "# allmeta rare-events-glmm: R check of the analysis currently on the page",
      "# Generated " + new Date().toISOString() + " from the page's current inputs.",
      "# R reference: metafor::rma.glmm (paper 30 validates metafor 5.2.1 with lme4). Run: Rscript --vanilla <this file>",
      "# Model on the page: " + m + "  (" + (NOTE[m] || "") + ")",
      "suppressPackageStartupMessages(library(metafor))",
      "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\n\")",
      PRELUDE,
      "## ---- the page's current inputs ----",
      "label <- c(" + R.map(function (r) { return str(r.label); }).join(", ") + ")",
      "ai <- " + col("events_T") + "; n1i <- " + col("n_T") + "   # treatment events, total",
      "ci <- " + col("events_C") + "; n2i <- " + col("n_C") + "   # control events, total",
      "model <- " + str(m),
      "need <- if (model == \"CM.EL\") \"BiasedUrn\" else \"lme4\"",
      "have <- requireNamespace(need, quietly = TRUE)",
      "if (!have) cat(\"PACKAGE NOT AVAILABLE: '\", need, \"' is needed by rma.glmm(model = '\", model, \"') and is not installed in this R\", \n      \" (BiasedUrn is not in the allmeta WebR bundle). The GLMM row was NOT checked; run the downloaded script in desktop R.\n\", sep = \"\")",
      "gl <- if (have) tryCatch(rma.glmm(measure = \"OR\", ai = ai, n1i = n1i, ci = ci, n2i = n2i, model = model),",
      "  error = function(e) { cat(\"R could not fit rma.glmm(model = '\", model, \"'): \", conditionMessage(e), \"\n\", sep = \"\"); NULL }) else NULL",
      "if (!is.null(gl)) print(gl)"
    ];
    if (!p) {
      L.push("cat(\"\nNO PAGE VALUES: UM.RS is R-only on this page, so there is nothing to compare; the R fit is shown above.\n\")", "verdict()");
      return L.join("\n") + "\n";
    }
    L.push(
      "## ---- the numbers the page displays (full precision) ----",
      "page <- list(OR = " + num(p.OR) + ", OR_lo = " + num(p.OR_lo) + ", OR_hi = " + num(p.OR_hi) + ", theta = " + num(p.theta) +
        ", tau2 = " + num(p.tau2) + ", k = " + num(p.k) + ", zero = " + num(p.zero) + ")",
      "page_iv <- list(OR = " + num(p.iv.OR) + ", OR_lo = " + num(p.iv.OR_lo) + ", OR_hi = " + num(p.iv.OR_hi) + ", tau2 = " + num(p.iv.tau2) + ")",
      "cat(\"\n---- R vs page: GLMM (\", model, \") ----\n\", sep = \"\")",
      "if (is.null(gl)) {",
      "  pv <- c(\"OR (GLMM)\" = page$OR, \"95% CI lower\" = page$OR_lo, \"95% CI upper\" = page$OR_hi, \"log-OR\" = page$theta, \"tau^2\" = page$tau2, \"k studies (model)\" = page$k)",
      "  dv <- c(3, 3, 3, 4, 4, 0)",
      "  for (i in seq_along(pv)) chk(names(pv)[i], NA_real_, pv[[i]], dv[i])",
      "  cat(\"   (the GLMM quantities above could not be checked in this R and count as not agreeing)\n\")",
      "} else {",
      "  chk(\"OR (GLMM)\", exp(as.numeric(gl$b)), page$OR, 3)",
      "  chk(\"95% CI lower\", exp(gl$ci.lb), page$OR_lo, 3)",
      "  chk(\"95% CI upper\", exp(gl$ci.ub), page$OR_hi, 3)",
      "  chk(\"log-OR\", as.numeric(gl$b), page$theta, 4)",
      "  chk(\"tau^2\", gl$tau2, page$tau2, 4)",
      "  chk(\"k studies (model)\", gl$k, page$k, 0)",
      "}",
      "chk(\"0-event studies\", sum(ai == 0 | ci == 0), page$zero, 0)",
      "cat(\"---- R vs page: IV pool + 0.5 CC (DL) ----\n\")",
      "iv <- rma(measure = \"OR\", ai = ai, n1i = n1i, ci = ci, n2i = n2i, method = \"DL\", add = 1/2, to = \"only0\", drop00 = FALSE)",
      "chk(\"IV OR\", exp(as.numeric(iv$b)), page_iv$OR, 3)",
      "chk(\"IV 95% CI lower\", exp(iv$ci.lb), page_iv$OR_lo, 3)",
      "chk(\"IV 95% CI upper\", exp(iv$ci.ub), page_iv$OR_hi, 3)",
      "chk(\"IV tau^2\", iv$tau2, page_iv$tau2, 4)",
      "verdict()"
    );
    return L.join("\n") + "\n";
  }

  function download(text, name) {
    var blob = new Blob([text], { type: "text/x-r;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }

  // attach({ getState, mount }) — getState() returns the buildScript state or null.
  var STALE = "R result discarded: the analysis on the page changed while R was running, so the verdict R returned (for the earlier analysis) is not shown. Press Verify in R again.";
  function attach(opts) {
    var verifyGen = 0;   // a later Verify, or a re-run of the analysis, makes an earlier run's answer stale
    var host = document.querySelector(opts.mount);
    if (!host) return false;
    var bs = "padding:.4rem .8rem;border:1px solid var(--border);background:var(--panel);color:var(--ink);border-radius:6px;cursor:pointer;font:inherit";
    host.innerHTML = '<h2 style="margin-top:1rem">Check in R</h2>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
      '<button type="button" id="rcheck-dl" style="' + bs + '" title="Download an R script that refits the current analysis with metafor::rma.glmm and compares every displayed number">Download R script</button>' +
      '<button type="button" id="rcheck-webr" style="' + bs + '" title="Run the same R script in your browser (WebR; first run downloads R, a few minutes)">Verify in R (WebR)</button></div>' +
      '<div id="rcheck-status" class="note" role="status" style="margin-top:.4rem"></div>' +
      '<pre id="rcheck-out" style="white-space:pre-wrap;font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:.5rem;max-height:28rem;overflow:auto;display:none"></pre>';
    var status = host.querySelector("#rcheck-status"), out = host.querySelector("#rcheck-out");
    host.querySelector("#rcheck-dl").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = "Nothing to check: fit the GLMM first (at least 2 valid studies)."; return; }
      download(buildScript(st), opts.filename || "allmeta-r-check.R");
      status.textContent = "R script downloaded. Run it with Rscript --vanilla; its last line says MATCH n/n or MISMATCH.";
    });
    host.querySelector("#rcheck-webr").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = "Nothing to check: fit the GLMM first (at least 2 valid studies)."; return; }
      if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") { status.textContent = "WebR runner (../shared/webr-runner.js) did not load; use Download R script instead."; return; }
      var script = buildScript(st), btn = host.querySelector("#rcheck-webr"), my = ++verifyGen;
      btn.disabled = true; out.style.display = "none"; out.textContent = "";
      global.AlmWebR.runR({ script: script, packages: opts.packages || ["metafor"], onStatus: function (s) { status.textContent = s; } }).then(function (r) {
        btn.disabled = false;
        // R answered for the analysis it was given (st); if the page has moved on, never show that answer beside the new one.
        if (my !== verifyGen || opts.getState() !== st) { out.textContent = ""; status.textContent = STALE; return; }
        out.style.display = "block";
        if (!r.ok) { status.textContent = "WebR failed: " + r.error; out.textContent = "WebR error: " + r.error; return; }
        var last = r.stdout.trim().split(/\r?\n/).pop();
        var v = r.versions || {};
        status.textContent = "R (WebR " + (v.webR || "?") + ", " + Object.keys(v).filter(function (k) { return k !== "R" && k !== "webR"; }).map(function (k) { return k + " " + v[k]; }).join(", ") + "): " + last;
        out.textContent = r.stdout;
      });
    });
    return true;
  }

  var api = { buildScript: buildScript, attach: attach };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRareGlmmRCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
