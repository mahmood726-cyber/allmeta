/* fragility/r-check.js — app-local "Download R script" + "Verify in R (WebR)" for the
 * fragility-index page. The script is built from the page's CURRENT analysed inputs and the
 * numbers the page displays. Pooled DL estimate: metafor::rma; FI, FQ, direction and the
 * modification path: fragility::frag.ma(method = "DL") (the R reference of paper 33,
 * fragility 2.0 / metafor 5.2-1). It prints each quantity next to the page's value, the
 * absolute difference and a final "MATCH n/n" or "MISMATCH" line. The fragility package is
 * not in the allmeta WebR bundle: in WebR the script says so and checks only the pooled part. Tolerance = half a unit of the page's displayed
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

  // state: { studies:[{e1,n1,e0,n0}], labels:[], measure, page:{est,lo,hi (display scale), sig, FI, FQ, dir, mods:[{study,arm,dir}]} }
  function buildScript(state) {
    var S = state.studies, p = state.page, m = state.measure;
    var col = function (k) { return vec(S.map(function (s) { return s[k]; })); };
    var mods = p.mods || [];
    var L = [
      "# allmeta fragility: R check of the analysis currently on the page",
      "# Generated " + new Date().toISOString() + " from the page's current inputs.",
      "# R reference: metafor::rma(method = \"DL\") for the pooled estimate and",
      "# fragility::frag.ma(method = \"DL\", defaults) for FI / FQ / direction / path",
      "# (paper 33 validates fragility 2.0 with metafor 5.2-1). Run: Rscript --vanilla <this file>",
      "suppressPackageStartupMessages(library(metafor))",
      "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"\n\")",
      PRELUDE,
      "## ---- the page's current inputs (treatment = group 1, control = group 0) ----",
      "label <- c(" + state.labels.map(str).join(", ") + ")",
      "e1 <- " + col("e1") + "; n1 <- " + col("n1") + "   # treatment events, total",
      "e0 <- " + col("e0") + "; n0 <- " + col("n0") + "   # control events, total",
      "measure <- " + str(m),
      "## zero cells: add 1/2 to studies with a zero cell, keep double-zero studies (frag.ma defaults)",
      "fit <- rma(measure = measure, ai = e1, n1i = n1, ci = e0, n2i = n0, method = \"DL\", add = 1/2, to = \"only0\", drop00 = FALSE)",
      "print(fit)",
      "tx <- if (measure == \"RD\") identity else exp",
      "## ---- the numbers the page displays ----",
      "page <- list(est = " + num(p.est) + ", lo = " + num(p.lo) + ", hi = " + num(p.hi) + ", sig = " + (p.sig ? "TRUE" : "FALSE") +
        ", FI = " + num(p.FI) + ", FQ = " + num(p.FQ) + ", dir = " + str(p.dir) + ")",
      "page_path <- c(" + mods.map(function (q) { return str(q.study + ":" + q.arm + ":" + (q.dir > 0 ? "+1" : "-1")); }).join(", ") + ")",
      "cat(\"\n---- R vs page ----\n\")",
      "chk(paste(\"pooled\", measure, \"(DL)\"), tx(as.numeric(fit$b)), page$est, 3)",
      "chk(\"95% CI lower\", tx(fit$ci.lb), page$lo, 3)",
      "chk(\"95% CI upper\", tx(fit$ci.ub), page$hi, 3)",
      "r_sig <- (fit$ci.lb > 0) || (fit$ci.ub < 0)",
      "chk(\"significant at 5% (1 = yes)\", as.numeric(r_sig), as.numeric(page$sig), 0)",
      "if (requireNamespace(\"fragility\", quietly = TRUE)) {",
      "  cat(\"fragility\", as.character(packageVersion(\"fragility\")), \"\n\")",
      "  dat <- data.frame(e0 = e0, n0 = n0, e1 = e1, n1 = n1)",
      "  fm <- fragility::frag.ma(e0 = e0, n0 = n0, e1 = e1, n1 = n1, data = dat, measure = measure, method = \"DL\")",
      "  print(fm)",
      "  if (page$sig) {",
      "    chk(\"fragility index\", fm$FI, page$FI, 0)",
      "    chk(\"fragility quotient\", fm$FQ, page$FQ, 5)",
      "    same_dir <- identical(fm$dir, page$dir)",
      "    chk(\"direction (1 = same text)\", as.numeric(same_dir), 1, 0)",
      "    if (!same_dir) cat(\"   R dir:\", fm$dir, \"| page dir:\", page$dir, \"\n\")",
      "    r_path <- character(0)",
      "    if (length(fm$sid.iter)) r_path <- paste0(fm$sid.iter, \":\", ifelse(fm$g0.mod.iter != 0, \"control\", \"treatment\"), \":\",",
      "      ifelse(ifelse(fm$g0.mod.iter != 0, fm$g0.mod.iter, fm$g1.mod.iter) > 0, \"+1\", \"-1\"))",
      "    same_path <- identical(r_path, page_path)",
      "    chk(\"modification path (1 = identical)\", as.numeric(same_path), 1, 0)",
      "    if (!same_path) { cat(\"   R path:   \", r_path, \"\n\"); cat(\"   page path:\", page_path, \"\n\") }",
      "  } else cat(\"Page reports no FI for a non-significant result; R frag.ma FI =\", fm$FI, \"(\", fm$dir, \") -- not compared.\n\")",
      "  verdict()",
      "} else {",
      "  cat(\"PACKAGE NOT AVAILABLE: 'fragility' is not installed in this R (it is not in the allmeta WebR bundle).\n\")",
      "  cat(\"FI, FQ, direction and the modification path were NOT checked. Download the R script and run it in\n\")",
      "  cat(\"desktop R after install.packages(\\\"fragility\\\") for the full check.\n\")",
      "  if (.alm$ok == .alm$n) cat(sprintf(\"MATCH %d/%d (partial: pooled estimate only; FI/FQ NOT checked, package fragility unavailable)\n\", .alm$ok, .alm$n))",
      "  else cat(sprintf(\"MISMATCH %d/%d agree (partial: package fragility unavailable)\n\", .alm$ok, .alm$n))",
      "}"
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
      '<button type="button" id="rcheck-dl" style="' + bs + '" title="Download an R script that refits the current analysis with metafor + fragility::frag.ma and compares every displayed number">Download R script</button>' +
      '<button type="button" id="rcheck-webr" style="' + bs + '" title="Run the same R script in your browser (WebR; first run downloads R, a few minutes)">Verify in R (WebR)</button></div>' +
      '<div id="rcheck-status" class="note" role="status" style="margin-top:.4rem"></div>' +
      '<pre id="rcheck-out" style="white-space:pre-wrap;font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:.5rem;max-height:28rem;overflow:auto;display:none"></pre>';
    var status = host.querySelector("#rcheck-status"), out = host.querySelector("#rcheck-out");
    host.querySelector("#rcheck-dl").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = "Nothing to check: enter at least two valid 2x2 studies."; return; }
      download(buildScript(st), opts.filename || "allmeta-r-check.R");
      status.textContent = "R script downloaded. Run it with Rscript --vanilla; its last line says MATCH n/n or MISMATCH.";
    });
    host.querySelector("#rcheck-webr").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = "Nothing to check: enter at least two valid 2x2 studies."; return; }
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
  global.AlmFragilityRCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
