/* tsa/r-check.js — app-local "Download R script" + "Verify in R here (WebR)" for the TSA page.
 * The script is built from the page's CURRENT analysed inputs (studies in order, RIS settings) and
 * the numbers the page displays, and recomputes each of them in R, as paper 46 validates them:
 *  - RIS = (z_{1-a/2} + z_{1-b})^2 / delta^2 x D (or manual RIS x D): published closed form, base R qnorm;
 *  - pooled mu, its 95% CI and the cumulative Z: fixed-effect inverse-variance pool, metafor::rma(method = "FE");
 *  - cumulative information = sum(1/SE^2) and its fraction of the RIS: base R;
 *  - O'Brien-Fleming boundary: Lan-DeMets O'Brien-Fleming-type alpha-spending with the page's (total,
 *    Lan-DeMets 1983) convention a(t) = 2 - 2 Phi(z_{1-a/2}/sqrt t), solved exactly at every look with
 *    mvtnorm::pmvnorm + uniroot -- the exact reference paper 46 checks the tsa page against for this
 *    convention (RTSA and ldbounds spend per side, a different convention; see the pack);
 *  - "Crossed?" and the TSA-adjusted CI (mu +/- boundary x SE) from those.
 * It prints each quantity next to the page's value, the absolute difference and a final "MATCH n/n"
 * or "MISMATCH" line. Tolerance = half a unit of the page's displayed last decimal. The in-page check
 * runs the SAME script in WebR via the unchanged ../shared/webr-runner.js (metafor and mvtnorm are in
 * the allmeta WebR bundle).
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
    "  cat(sprintf(\"%-26s R = %-14s page = %-14s |diff| = %-10s tol = %-8s %s\\n\", name,",
    "      formatC(r, digits = 8, format = \"g\"), formatC(page, digits = 8, format = \"g\"),",
    "      formatC(d, digits = 3, format = \"g\"), format(tol), if (ok) \"ok\" else \"DIFFERS\"))",
    "}",
    "verdict <- function() {",
    "  if (.alm$n == 0L) cat(\"NO CHECKS (nothing on the page to compare)\\n\")",
    "  else if (.alm$ok == .alm$n) cat(sprintf(\"MATCH %d/%d\\n\", .alm$ok, .alm$n))",
    "  else cat(sprintf(\"MISMATCH %d/%d agree\\n\", .alm$ok, .alm$n))",
    "}"
  ].join("\n");

  // state: { studies:[{label,est,se}], ris:{mode,delta,alpha,power,manual,D}, alpha (boundary alpha),
  //          page:{k, ris, info, pct, z, mu, lo, hi, bnd (null if not computed), crossed (bool|null), tlo, thi} }
  function buildScript(state) {
    var S = state.studies, R = state.ris, p = state.page;
    var hasB = typeof p.bnd === "number" && isFinite(p.bnd);
    var L = [
      "# allmeta tsa: R check of the trial sequential analysis currently on the page",
      "# Generated " + new Date().toISOString() + " from the page's current inputs.",
      "# R reference (paper 46): RIS closed form (base R qnorm); fixed-effect pool metafor::rma(method = \"FE\");",
      "# Lan-DeMets O'Brien-Fleming-type boundary with TOTAL two-sided spending a(t) = 2 - 2 pnorm(qnorm(1 - alpha/2)/sqrt(t)),",
      "# solved exactly with mvtnorm::pmvnorm + uniroot (the exact reference the pack uses for this convention;",
      "# RTSA / ldbounds spend alpha per side, a different convention). Run: Rscript --vanilla <this file>",
      "suppressPackageStartupMessages({ library(metafor); library(mvtnorm) })",
      "cat(R.version.string, \"| metafor\", as.character(packageVersion(\"metafor\")), \"| mvtnorm\", as.character(packageVersion(\"mvtnorm\")), \"\\n\")",
      PRELUDE,
      "## ---- the page's current inputs (studies in the order given) ----",
      "label <- c(" + S.map(function (s) { return str(s.label); }).join(", ") + ")",
      "est <- " + vec(S.map(function (s) { return s.est; })),
      "se  <- " + vec(S.map(function (s) { return s.se; })),
      "ris_mode <- " + str(R.mode) + "; delta <- " + num(R.delta) + "; alpha <- " + num(R.alpha) + "; power <- " + num(R.power) +
        "; ris_manual <- " + num(R.manual) + "; D <- " + num(R.D),
      "alpha_b <- " + num(state.alpha) + "   # two-sided alpha of the monitoring boundary",
      "## ---- required information size ----",
      "ris <- if (ris_mode == \"manual\") ris_manual * D else (qnorm(1 - alpha/2) + qnorm(power))^2 / delta^2 * D",
      "## ---- fixed-effect inverse-variance pool of all studies (the page's 'Pooled mu' and 'Cumulative Z') ----",
      "fit <- rma(yi = est, sei = se, method = \"FE\", slab = label)",
      "print(fit)",
      "info <- cumsum(1 / se^2); tt <- info / ris; K <- length(tt)",
      "## ---- Lan-DeMets O'Brien-Fleming-type boundary, total spending, exact at every look ----",
      "## per-side cumulative spend a(t)/2 = upper tail of N(0,1) at z_{1-a/2}/sqrt(t) (computed as an upper tail, so a",
      "## spend of 1e-24 at a very early look is not lost to 1 - pnorm() cancellation); all of a/2 is spent at t >= 1",
      "cum_side <- ifelse(tt >= 1, alpha_b / 2, pnorm(qnorm(1 - alpha_b / 2) / sqrt(pmin(tt, 1)), lower.tail = FALSE))",
      "inc <- pmax(0, diff(c(0, cum_side)))",
      "S <- outer(tt, tt, function(a, b) sqrt(pmin(a, b) / pmax(a, b)))",
      "alg <- function(d) if (d <= 20) Miwa(steps = 1024) else GenzBretz(maxpts = 1e6, abseps = 1e-12, releps = 0)",
      "b <- rep(Inf, K)",
      "kend <- if (any(tt >= 1)) which(tt >= 1)[1] else K   # no alpha is spent after the first look with t >= 1",
      "for (k in seq_len(kend)) {",
      "  if (!(inc[k] > 0)) next",
      "  prev <- which(is.finite(b[seq_len(k - 1)]))   # a look that spends nothing restricts nothing: integrating it out is exact",
      "  ## P(upper crossing at k and none before) = P(Z_k > c) - P(Z_k > c, an earlier crossing); the second term is at most the",
      "  ## two-sided alpha already spent, 2 * sum(inc[prev]); when that is <= 1e-9 x inc[k] (very early looks) the univariate",
      "  ## quantile is exact to a relative 1e-9 in probability, so it is used instead of a multivariate integral of ~0",
      "  if (!length(prev) || 2 * sum(inc[prev]) <= 1e-9 * inc[k]) { b[k] <- qnorm(inc[k], lower.tail = FALSE); next }",
      "  ix <- c(prev, k)",
      "  ## Miwa replaces the infinite upper limit by 1000 and warns each time; that changes no probability, so only that warning is muffled",
      "  b[k] <- withCallingHandlers(uniroot(function(x) as.numeric(pmvnorm(lower = c(-b[prev], x), upper = c(b[prev], Inf),",
      "    sigma = S[ix, ix], algorithm = alg(length(ix)))) - inc[k], c(0, 40), tol = 1e-12)$root,",
      "    warning = function(w) if (grepl(\"Approximating +/-Inf\", conditionMessage(w), fixed = TRUE)) invokeRestart(\"muffleWarning\"))",
      "}",
      "bnd <- b[K]; i <- K",
      "while (!is.finite(bnd) && i > 1) { i <- i - 1; bnd <- b[i] }   # after the RIS: the final boundary",
      "print(data.frame(study = label, cum_info = info, t = tt, boundary = b), row.names = FALSE)",
      "## ---- the numbers the page displays ----",
      "page <- list(k = " + num(p.k) + ", ris = " + num(p.ris) + ", info = " + num(p.info) + ", pct = " + num(p.pct) +
        ", z = " + num(p.z) + ", mu = " + num(p.mu) + ", lo = " + num(p.lo) + ", hi = " + num(p.hi) + ")",
      "cat(\"\\n---- R vs page ----\\n\")",
      "chk(\"k\", length(est), page$k, 0)",
      "chk(\"RIS\", ris, page$ris, 1)",
      "chk(\"current information\", info[K], page$info, 1)",
      "chk(\"information (% of RIS)\", 100 * info[K] / ris, page$pct, 1)",
      "chk(\"cumulative Z\", fit$zval, page$z, 2)",
      "chk(\"pooled mu (FE)\", as.numeric(fit$b), page$mu, 3)",
      "chk(\"95% CI lower\", fit$ci.lb, page$lo, 3)",
      "chk(\"95% CI upper\", fit$ci.ub, page$hi, 3)"
    ];
    if (hasB) L.push(
      "page_b <- list(bnd = " + num(p.bnd) + ", crossed = " + (p.crossed ? "TRUE" : "FALSE") + ", tlo = " + num(p.tlo) + ", thi = " + num(p.thi) + ")",
      "chk(\"OF boundary (now)\", bnd, page_b$bnd, 2)",
      "chk(\"crossed (1 = yes)\", as.numeric(abs(fit$zval) > bnd), as.numeric(page_b$crossed), 0)",
      "chk(\"TSA-adjusted CI lower\", as.numeric(fit$b) - bnd * fit$se, page_b$tlo, 3)",
      "chk(\"TSA-adjusted CI upper\", as.numeric(fit$b) + bnd * fit$se, page_b$thi, 3)"
    );
    else L.push("cat(\"The page shows no monitoring boundary for this input, so the boundary, 'Crossed?' and TSA-adjusted CI are not compared.\\n\")");
    L.push("verdict()");
    return L.join("\n") + "\n";
  }

  function download(text, name) {
    var blob = new Blob([text], { type: "text/x-r;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }

  var NOTHING = "Nothing to check: enter at least one study and a valid RIS setup.";
  var STALE = "R result discarded: the analysis on the page changed while R was running, so the verdict R returned (for the earlier analysis) is not shown. Press Verify in R here again.";
  // attach({ getState, mount, filename }) — getState() returns the buildScript state or null.
  function attach(opts) {
    var verifyGen = 0;
    var host = document.querySelector(opts.mount);
    if (!host) return false;
    var bs = "padding:.45rem .85rem;border:1px solid var(--border-strong);background:var(--panel);color:var(--ink);border-radius:6px;cursor:pointer;font:inherit;font-size:.85rem";
    host.innerHTML = '<h2 style="margin-top:1rem">Check in R</h2>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
      '<button type="button" id="rcheck-dl" style="' + bs + '" title="Download an R script that recomputes RIS, the fixed-effect pool, the cumulative Z and the exact O\'Brien-Fleming boundary (metafor + mvtnorm) and compares every displayed number">Download R script</button>' +
      '<button type="button" id="rcheck-webr" style="' + bs + '" title="Run the same R script in this page (WebR; the first run loads R, a few minutes)">Verify in R here (WebR)</button></div>' +
      '<div id="rcheck-status" class="hint" role="status" style="margin-top:.4rem;font-size:.8rem;color:var(--muted)"></div>' +
      '<pre id="rcheck-out" style="white-space:pre-wrap;font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:.5rem;max-height:28rem;overflow:auto;display:none"></pre>';
    var status = host.querySelector("#rcheck-status"), out = host.querySelector("#rcheck-out");
    host.querySelector("#rcheck-dl").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = NOTHING; return; }
      download(buildScript(st), opts.filename || "tsa-r-check.R");
      status.textContent = "R script downloaded. Run it with Rscript --vanilla; its last line says MATCH n/n or MISMATCH.";
    });
    host.querySelector("#rcheck-webr").addEventListener("click", function () {
      var st = opts.getState();
      if (!st) { status.textContent = NOTHING; return; }
      if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") { status.textContent = "WebR runner (../shared/webr-runner.js) did not load; use Download R script instead."; return; }
      var script = buildScript(st), btn = host.querySelector("#rcheck-webr"), my = ++verifyGen;
      btn.disabled = true; out.style.display = "none"; out.textContent = "";
      global.AlmWebR.runR({ script: script, packages: ["metafor", "mvtnorm"], onStatus: function (s) { status.textContent = s; } }).then(function (r) {
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
  global.AlmTsaRCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
