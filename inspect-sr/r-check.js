/* inspect-sr/r-check.js — app-local "Download R script" + "Verify in R (WebR)" for the INSPECT-SR page.
 * The page's numbers are the robustness re-pool table: for each analysis set (all trials; serious
 * concerns excluded; no-concern trials only) the number of trials with an entered effect + SE (k), the
 * random-effects (Paule-Mandel) pooled estimate with its 95% CI, and I^2. The script is built from the
 * page's CURRENT trials (effect, SE and the overall judgement the page uses for each trial) and the numbers
 * the table displays. It forms the three sets with the page's handling rule (written out below), and
 * refits each with metafor::rma(method = "PM") (k >= 2; metafor's tau^2-based I^2, as the page reports).
 * For k = 1 the page shows the trial's own estimate +/- z_{0.975} x SE and I^2 = 0: that closed form is
 * written in base R. No R package implements the INSPECT-SR judgements themselves, so the judgements are
 * inputs here, not checked (paper 50 checks them against its pre-registered reading of the guidance).
 * It prints each quantity next to the page's value, the absolute difference and a final "MATCH n/n" or
 * "MISMATCH" line. Tolerance = half a unit of the page's displayed last decimal. The in-page check runs
 * the SAME script in WebR via the unchanged ../shared/webr-runner.js.
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
    "  cat(sprintf(\"%-34s R = %-14s page = %-14s |diff| = %-10s tol = %-8s %s\\n\", name,",
    "      formatC(r, digits = 8, format = \"g\"), formatC(page, digits = 8, format = \"g\"),",
    "      formatC(d, digits = 3, format = \"g\"), format(tol), if (ok) \"ok\" else \"DIFFERS\"))",
    "}",
    "verdict <- function() {",
    "  if (.alm$n == 0L) cat(\"NO CHECKS (nothing on the page to compare)\\n\")",
    "  else if (.alm$ok == .alm$n) cat(sprintf(\"MATCH %d/%d\\n\", .alm$ok, .alm$n))",
    "  else cat(sprintf(\"MISMATCH %d/%d agree\\n\", .alm$ok, .alm$n))",
    "}"
  ].join("\n");

  // state: { trials:[{label, est, se, overall}], exp (bool), page:[{name, k, mu, lo, hi, I2}] x 3 (display scale) }
  function buildScript(state) {
    var T = state.trials;
    var L = [
      "# allmeta inspect-sr: R check of the robustness re-pool table currently on the page",
      "# Generated " + new Date().toISOString() + " from the page's current trials.",
      "# R reference: metafor::rma(method = \"PM\") for k >= 2 (I^2 = metafor's tau^2-based I^2); for k = 1 the",
      "# page's closed form (estimate +/- qnorm(0.975) x SE, I^2 = 0) in base R. Run: Rscript --vanilla <this file>",
      "suppressPackageStartupMessages(library(metafor))",
      "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\\n\")",
      PRELUDE,
      "## ---- the page's current trials: effect and SE as entered (NA = not entered), and the overall",
      "## ---- judgement the page uses for each trial (reviewer's, else the suggested one; \"unset\" = none) ----",
      "label   <- c(" + T.map(function (t) { return str(t.label); }).join(", ") + ")",
      "est     <- " + vec(T.map(function (t) { return t.est; })),
      "se      <- " + vec(T.map(function (t) { return t.se; })),
      "overall <- c(" + T.map(function (t) { return str(t.overall); }).join(", ") + ")",
      "exp_scale <- " + (state.exp ? "TRUE" : "FALSE") + "   # the page's display scale (TRUE = exponentiated)",
      "tx <- if (exp_scale) exp else identity",
      "## ---- INSPECT-SR handling rule as the page applies it: serious-concern trials excluded; trials without",
      "## ---- an overall judgement only in the first row; sensitivity row = no-concern trials only ----",
      "sets <- list(",
      "  \"All trials (as published)\" = rep(TRUE, length(est)),",
      "  \"Exclude serious concerns\" = overall %in% c(\"no\", \"some\"),",
      "  \"No-concern trials only\" = overall == \"no\")",
      "ok <- is.finite(est) & is.finite(se) & se > 0   # trials the page pools (an entered effect and SE > 0)",
      "pool <- function(y, s) {",
      "  if (length(y) == 0) return(NULL)",
      "  if (length(y) == 1) { z <- qnorm(0.975); return(list(k = 1, mu = y, lo = y - z * s, hi = y + z * s, I2 = 0)) }",
      "  f <- rma(yi = y, sei = s, method = \"PM\")",
      "  list(k = f$k, mu = as.numeric(f$b), lo = f$ci.lb, hi = f$ci.ub, I2 = f$I2)",
      "}",
      "## ---- the numbers the page displays (pooled estimate and CI on the display scale) ----",
      "page <- list("
    ];
    L.push(state.page.map(function (r) {
      return "  list(k = " + num(r.k) + ", mu = " + num(r.mu) + ", lo = " + num(r.lo) + ", hi = " + num(r.hi) + ", I2 = " + num(r.I2) + ")";
    }).join(",\n"));
    L.push(
      ")",
      "cat(\"\\n---- R vs page ----\\n\")",
      "for (i in seq_along(sets)) {",
      "  nm <- names(sets)[i]; sel <- sets[[i]] & ok",
      "  r <- pool(est[sel], se[sel]); pg <- page[[i]]",
      "  cat(sprintf(\"%s: %s\\n\", nm, if (any(sel)) paste(label[sel], collapse = \", \") else \"(no trial with an effect)\"))",
      "  chk(paste0(\"  k\"), sum(sel), pg$k, 0)",
      "  if (is.null(r)) { cat(\"  page shows no estimate for an empty set; nothing else to compare\\n\"); next }",
      "  if (r$k >= 2) cat(sprintf(\"  PM tau^2 = %.6g\\n\", rma(yi = est[sel], sei = se[sel], method = \"PM\")$tau2))",
      "  chk(\"  pooled (PM)\", tx(r$mu), pg$mu, 3)",
      "  chk(\"  95% CI lower\", tx(r$lo), pg$lo, 3)",
      "  chk(\"  95% CI upper\", tx(r$hi), pg$hi, 3)",
      "  chk(\"  I^2 (%)\", r$I2, pg$I2, 0)",
      "}",
      "verdict()"
    );
    return L.join("\n") + "\n";
  }

  function download(text, name) {
    var blob = new Blob([text], { type: "text/x-r;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }

  var NOTHING = "Nothing to check: enter an effect and SE for at least one trial (the re-pool table is empty).";
  var STALE = "R result discarded: the trials on the page changed while R was running, so the verdict R returned (for the earlier table) is not shown. Press Verify in R again.";
  function attach(opts) {
    var verifyGen = 0;
    var host = document.querySelector(opts.mount);
    if (!host) return false;
    host.innerHTML = '<h2 style="margin-top:0.8rem">Check the re-pool in R</h2>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
      '<button type="button" id="rcheck-dl" class="ghost" title="Download an R script that refits the three analysis sets with metafor (Paule-Mandel) and compares every number in the table">Download R script</button>' +
      '<button type="button" id="rcheck-webr" class="ghost" title="Run the same R script in your browser (WebR; the first run loads R, a few minutes)">Verify in R (WebR)</button></div>' +
      '<div id="rcheck-status" class="suggest" role="status" style="margin-top:0.4rem"></div>' +
      '<pre id="rcheck-out" style="white-space:pre-wrap;font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:0.5rem;max-height:28rem;overflow:auto;display:none"></pre>';
    var status = host.querySelector("#rcheck-status"), out = host.querySelector("#rcheck-out");
    host.querySelector("#rcheck-dl").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = NOTHING; return; }
      download(buildScript(st), opts.filename || "inspect-sr-r-check.R");
      status.textContent = "R script downloaded. Run it with Rscript --vanilla; its last line says MATCH n/n or MISMATCH.";
    });
    host.querySelector("#rcheck-webr").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = NOTHING; return; }
      if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") { status.textContent = "WebR runner (../shared/webr-runner.js) did not load; use Download R script instead."; return; }
      var script = buildScript(st), btn = host.querySelector("#rcheck-webr"), my = ++verifyGen;
      btn.disabled = true; out.style.display = "none"; out.textContent = "";
      global.AlmWebR.runR({ script: script, packages: ["metafor"], onStatus: function (s) { status.textContent = s; } }).then(function (r) {
        btn.disabled = false;
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
  global.AlmInspectSrRCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
