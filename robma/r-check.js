/* robma/r-check.js -- "Download R script" + in-page "Verify in R (WebR)" for this page (lane pa8).
 * Recomputes the four-model sub-ensemble the page displays with the deterministic base-R reference
 * the P56 pack validates it against; prints R next to each page value and MATCH n/n or MISMATCH. */
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

  // The deterministic reference the P56 pack validates this page against, in base R: the four
  // effect x heterogeneity models (mu ~ N(0, 1), tau ~ Half-Normal(0, 1), prior 1/4 each), log
  // marginal likelihoods with mu integrated in closed form and tau by integrate() split at the mode.
  // Base R only, so the same script runs in WebR. (The separate "Download full RoBMA R script"
  // button is the publication-bias ensemble by MCMC: a different, larger model.)
  var ORACLE_R = [
    "S0 <- 1; TAUSD <- 1   # prior SD of mu, prior scale of tau (as the page states)",
    "lse <- function(x) { m <- max(x); if (!is.finite(m)) return(m); m + log(sum(exp(x - m))) }",
    "l0 <- function(y, v, t2) sum(dnorm(y, 0, sqrt(v + t2), log = TRUE))",
    "lC <- function(y, v, t2) { w <- 1 / (v + t2); A <- sum(w) + 1 / S0^2; B <- sum(w * y)",
    "  c(l = sum(dnorm(y, 0, sqrt(v + t2), log = TRUE)) - 0.5 * log(S0^2 * A) + B^2 / (2 * A), m = B / A) }",
    "lprior_tau <- function(tau) log(2) + dnorm(tau, 0, TAUSD, log = TRUE)",
    "int_tau <- function(g, rel = 1e-12) {   # log of the integral of exp(g(tau)) over [0, Inf)",
    "  gv <- Vectorize(g); grid <- c(0, 10^seq(-6, 2, length.out = 4001)); gg <- gv(grid)",
    "  if (all(!is.finite(gg))) return(-Inf)",
    "  j <- which.max(gg); M <- gg[j]; md <- grid[j]",
    "  if (j > 1 && j < length(grid)) { o <- optimize(gv, c(grid[j - 1], grid[j + 1]), maximum = TRUE, tol = 1e-12)",
    "    if (o$objective > M) { M <- o$objective; md <- o$maximum } }",
    "  f <- function(t) exp(gv(t) - M)",
    "  a <- if (md > 0) integrate(f, 0, md, rel.tol = rel, abs.tol = 0, subdivisions = 2000L)$value else 0",
    "  b <- integrate(f, md, Inf, rel.tol = rel, abs.tol = 0, subdivisions = 2000L)$value",
    "  M + log(a + b) }",
    "v <- sei^2",
    "lml <- c(H0FE = l0(yi, v, 0), H1FE = lC(yi, v, 0)[[\"l\"]],",
    "         H0RE = int_tau(function(t) l0(yi, v, t^2) + lprior_tau(t)),",
    "         H1RE = int_tau(function(t) lC(yi, v, t^2)[[\"l\"]] + lprior_tau(t)))",
    "mH1FE <- lC(yi, v, 0)[[\"m\"]]",
    "## E[mu | H1RE]: the conditional mean may change sign, so integrate its positive and negative parts",
    "lpos <- int_tau(function(t) { z <- lC(yi, v, t^2); z[[\"l\"]] + lprior_tau(t) + log(max(z[[\"m\"]], 0)) })",
    "lneg <- int_tau(function(t) { z <- lC(yi, v, t^2); z[[\"l\"]] + lprior_tau(t) + log(max(-z[[\"m\"]], 0)) })",
    "mH1RE <- (if (is.finite(lpos)) exp(lpos - lml[[\"H1RE\"]]) else 0) - (if (is.finite(lneg)) exp(lneg - lml[[\"H1RE\"]]) else 0)",
    "lp <- lml + log(0.25); post <- exp(lp - lse(lp))",
    "logBFe <- lse(lml[c(\"H1FE\", \"H1RE\")]) - lse(lml[c(\"H0FE\", \"H0RE\")])",
    "logBFh <- lse(lml[c(\"H0RE\", \"H1RE\")]) - lse(lml[c(\"H0FE\", \"H1FE\")])",
    ""
  ].join("\n");

  function buildScript(c) {
    var p = c.page, L = [];
    L.push("## allmeta robma -- R check of the numbers this page displayed (four-model sub-ensemble)");
    L.push("## Generated " + new Date().toISOString() + " from the inputs the page analysed (k = " + c.yi.length + ").");
    L.push("## Run: Rscript robma-check.R   (base R only; no packages needed)");
    L.push("");
    L.push(R_HELPERS);
    L.push("yi  <- " + rVec(c.yi));
    L.push("sei <- " + rVec(c.sei));
    L.push("## values the page displayed (full precision; marginal likelihoods and Bayes factors on the log scale)");
    L.push("page <- list(logml = " + rVec([p.logMarginal.H0FE, p.logMarginal.H1FE, p.logMarginal.H0RE, p.logMarginal.H1RE]) +
           ", post = " + rVec([p.postProb.H0FE, p.postProb.H1FE, p.postProb.H0RE, p.postProb.H1RE]) +
           ", logBFe = " + rNum(p.logBfEffect) + ", logBFh = " + rNum(p.logBfHetero) +
           ", pEff = " + rNum(p.pInclEffect) + ", pHet = " + rNum(p.pInclHetero) + ", muMA = " + rNum(p.muMA) + ")");
    L.push("");
    L.push(ORACLE_R);
    L.push("cat(\"robma R check:\", length(yi), \"studies; models H0FE H1FE H0RE H1RE\\n\")");
    L.push("## The page shows the marginal likelihoods as exp(log value) to 4 significant digits and each BF as");
    L.push("## exp(log BF) to 2 decimals (4 significant digits from 1e21 up): half a displayed unit, on the log scale.");
    L.push("half_sig4 <- function(L) { l10 <- L / log(10); 5e-4 / 10^(l10 - floor(l10)) }");
    L.push("half_bf <- function(L) if (!is.finite(L)) 5e-4 else if (L >= log(1e21)) half_sig4(L) else 0.005 / exp(L)");
    L.push("for (j in 1:4) chk(paste(\"log marginal lik.\", names(lml)[j]), lml[[j]], page$logml[j], half = half_sig4(page$logml[j]))");
    L.push("for (j in 1:4) chk(paste(\"posterior prob.\", names(lml)[j]), post[[j]], page$post[j])");
    L.push("chk(\"log BF10 (effect)\", logBFe, page$logBFe, half = half_bf(page$logBFe))");
    L.push("chk(\"log BF (heterogeneity)\", logBFh, page$logBFh, half = half_bf(page$logBFh))");
    L.push("chk(\"P(effect)\", post[[\"H1FE\"]] + post[[\"H1RE\"]], page$pEff)");
    L.push("chk(\"P(tau > 0)\", post[[\"H0RE\"]] + post[[\"H1RE\"]], page$pHet)");
    L.push("chk(\"model-averaged effect\", post[[\"H1FE\"]] * mH1FE + post[[\"H1RE\"]] * mH1RE, page$muMA, half = 5e-5)   # shown to 4 decimals");
    L.push("cat(sprintf(\"BF10 = %.2f, BF(heterogeneity) = %.2f (as displayed: exp of the log BFs)\\n\", exp(logBFe), exp(logBFh)))");
    L.push("cat(\"R:\", R.version.string, \"\\n\")");
    L.push("finish()");
    return L.join("\n") + "\n";
  }
  window.__almRoBMARScript = function () { var c = window.__almRCheckInputs && window.__almRCheckInputs(); return c ? buildScript(c) : null; };
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    attachRCheck({
      mount: "#r-note", filename: "robma-check.R",
      getInputs: function () { return window.__almRCheckInputs ? window.__almRCheckInputs() : null; },
      refuse: "Nothing to check: the page needs at least 2 studies.",
      buildScript: buildScript,
      packages: function () { return []; },
    });
  });
})();
