/* rmst-ma/r-check.js — app-local "Download R script" + "Verify in R (WebR)" for the RMST
 * meta-analysis page. The script is built from the page's CURRENT analysed inputs and the
 * numbers the page displays, refits them with metafor::rma (the R reference of paper 37,
 * metafor 5.2.1) and prints each quantity next to the page's value, the absolute difference
 * and a final "MATCH n/n" or "MISMATCH" line. Tolerance = half a unit of the page's displayed
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

  // state: { rows:[{label,diff,se}], method, page:{mu,se,ciLo,ciHi,tau2,I2,piLo,piHi,weights:[%]} }
  function buildScript(state) {
    var rows = state.rows, p = state.page, m = state.method;
    var L = [
      "# allmeta rmst-ma: R check of the analysis currently on the page",
      "# Generated " + new Date().toISOString() + " from the page's current inputs.",
      "# R reference: metafor::rma(yi = RMST difference, sei = SE) (paper 37 validates metafor 5.2.1).",
      "# 95% prediction interval written in base R: mu +/- qt(0.975, k-1) * sqrt(tau2 + se^2)",
      "# (Cochrane Handbook v6.5), as the page computes it. Run: Rscript --vanilla <this file>",
      "suppressPackageStartupMessages(library(metafor))",
      "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\\n\")",
      PRELUDE,
      "## ---- the page's current inputs ----",
      "label <- c(" + rows.map(function (r) { return str(r.label); }).join(", ") + ")",
      "yi    <- " + vec(rows.map(function (r) { return r.diff; })),
      "sei   <- " + vec(rows.map(function (r) { return r.se; })),
      "method <- " + str(m) + "   # page model: " + m,
      "fit <- rma(yi = yi, sei = sei, method = method)",
      "k <- length(yi)",
      "print(fit)",
      "## ---- the numbers the page displays (full precision) ----",
      "page <- list(mu = " + num(p.mu) + ", se = " + num(p.se) + ", ciLo = " + num(p.ciLo) + ", ciHi = " + num(p.ciHi) +
        ", tau2 = " + num(p.tau2) + ", I2 = " + num(p.I2) + ", piLo = " + num(p.piLo) + ", piHi = " + num(p.piHi) + ")",
      "page_weight <- " + vec(p.weights),
      "cat(\"\\n---- R vs page ----\\n\")",
      "chk(\"pooled RMST difference\", as.numeric(fit$b), page$mu, 3)",
      "chk(\"SE\", fit$se, page$se, 3)",
      "chk(\"95% CI lower\", fit$ci.lb, page$ciLo, 3)",
      "chk(\"95% CI upper\", fit$ci.ub, page$ciHi, 3)",
      "chk(\"tau^2\", fit$tau2, page$tau2, 4)",
      "chk(\"I^2 (%)\", fit$I2, page$I2, 1)",
      "if (method != \"FE\") {",
      "  pint <- as.numeric(fit$b) + c(-1, 1) * qt(0.975, k - 1) * sqrt(fit$tau2 + fit$se^2)",
      "  chk(\"95% PI lower\", pint[1], page$piLo, 3)",
      "  chk(\"95% PI upper\", pint[2], page$piHi, 3)",
      "}",
      "w <- weights(fit)",
      "for (i in seq_len(k)) chk(paste0(\"weight % \", label[i]), w[[i]], page_weight[i], 1)",
      "verdict()"
    ];
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
      '<button type="button" id="rcheck-dl" style="' + bs + '" title="Download an R script that refits the current analysis with metafor and compares, at display precision, the pooled estimate, SE, 95% CI, tau^2, I^2, 95% PI and study weights (not the study CIs or the forest geometry)">Download R script</button>' +
      '<button type="button" id="rcheck-webr" style="' + bs + '" title="Run the same R script in your browser (WebR; first run downloads R, a few minutes)">Verify in R (WebR)</button></div>' +
      '<div id="rcheck-status" class="note" role="status" style="margin-top:.4rem"></div>' +
      '<pre id="rcheck-out" style="white-space:pre-wrap;font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:.5rem;max-height:28rem;overflow:auto;display:none"></pre>';
    var status = host.querySelector("#rcheck-status"), out = host.querySelector("#rcheck-out");
    host.querySelector("#rcheck-dl").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = "Nothing to check: enter at least 2 trials."; return; }
      download(buildScript(st), opts.filename || "allmeta-r-check.R");
      status.textContent = "R script downloaded. Run it with Rscript --vanilla; its last line says MATCH n/n or MISMATCH.";
    });
    host.querySelector("#rcheck-webr").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = "Nothing to check: enter at least 2 trials."; return; }
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
    // invalidate(): the page calls this whenever it re-runs its analysis. A verdict already on screen
    // was for the earlier analysis, so it is removed (an in-flight run becomes stale via verifyGen).
    api.invalidate = function () {
      verifyGen++;
      if (out.textContent || out.style.display !== "none") { out.textContent = ""; out.style.display = "none"; status.textContent = "Analysis changed: the earlier R verdict was removed. Press Verify in R again."; }
      host.querySelector("#rcheck-webr").disabled = false;
    };
    return true;
  }

  var api = { buildScript: buildScript, attach: attach, invalidate: function () {} };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmRmstRCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
