/* bma-tau-priors/r-check.js -- "Download R script" + in-page "Verify in R (WebR)" for this page (lane pa8).
 * Recomputes the averaged posterior, per-prior weights, means, SEs and tau^2 modes by integrate() in base R;
 * bayesmeta (the P47 pack reference) adds a descriptive check when installed. */
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

  // Base R re-derivation of the model the page fits (flat prior on mu; six priors on tau; weights
  // proportional to the marginal likelihood), by R's adaptive quadrature (integrate, rel.tol 1e-12)
  // on the tau scale and root finding (uniroot) for the quantiles of the averaged posterior -- the
  // same construction as the P47 pack's R reference, which takes the tau posterior from bayesmeta 3.5.
  // Base R only, so the same script runs in WebR; bayesmeta, if installed, adds a descriptive check.
  var BMA_R = [
    "logLm <- function(t) {   # log marginal likelihood of tau with mu integrated out (flat prior), vectorised in t",
    "  V <- outer(t^2, v, \"+\"); W <- 1 / V; sw <- rowSums(W); mh <- rowSums(W * rep(yi, each = length(t))) / sw",
    "  -0.5 * rowSums(log(2 * pi * V)) - 0.5 * rowSums(W * (rep(yi, each = length(t)) - mh)^2) + 0.5 * log(2 * pi / sw) }",
    "condm <- function(t) {   # mu | tau, y ~ N(m(tau), s2(tau))",
    "  W <- 1 / outer(t^2, v, \"+\"); sw <- rowSums(W); list(m = rowSums(W * rep(yi, each = length(t))) / sw, s2 = 1 / sw) }",
    "lIG <- function(t) ifelse(t > 0, log(2) + log(t) + 0.1 * log(0.1) - lgamma(0.1) - 1.1 * log(t^2) - 0.1 / t^2, -Inf)",
    "MODELS <- list(   # density of tau; tail a: p(tau) ~ tau^-a as tau -> Inf; zero: density positive at tau = 0",
    "  list(name = \"halfNormal(0.5)\",    ld = function(t) log(sqrt(2 / pi) / 0.5) - t^2 / (2 * 0.25), tail = Inf, upper = Inf, zero = TRUE),",
    "  list(name = \"halfNormal(1.0)\",    ld = function(t) log(sqrt(2 / pi)) - t^2 / 2, tail = Inf, upper = Inf, zero = TRUE),",
    "  list(name = \"halfCauchy(0.5)\",    ld = function(t) log(2 / pi / 0.5) - log(1 + (t / 0.5)^2), tail = 2, upper = Inf, zero = TRUE),",
    "  list(name = \"halfCauchy(1.0)\",    ld = function(t) log(2 / pi) - log(1 + t^2), tail = 2, upper = Inf, zero = TRUE),",
    "  list(name = \"invGamma(0.1, 0.1)\", ld = lIG, tail = 1.2, upper = Inf, zero = FALSE),",
    "  list(name = \"uniform(5)\",         ld = function(t) ifelse(t <= 5, log(1 / 5), -Inf), tail = Inf, upper = 5, zero = TRUE))",
    "qint <- function(f, br) { s <- 0",
    "  for (i in seq_len(length(br) - 1)) s <- s + integrate(f, br[i], br[i + 1], rel.tol = 1e-12, abs.tol = 0, subdivisions = 5000L)$value",
    "  s }",
    "fit_one <- function(M) {",
    "  ## break points: quantiles of the tau posterior located on a fine grid in log(tau), so integrate() sees the mass",
    "  u <- seq(-30, if (is.finite(M$upper)) log(M$upper) else 340, by = 0.02); t <- exp(u)",
    "  g <- logLm(t) + M$ld(t); c0 <- max(g[is.finite(g)]); cw <- cumsum(exp(g + u - c0)); cw <- cw / cw[length(cw)]",
    "  q <- t[findInterval(c(0.001, 0.05, 0.25, 0.5, 0.75, 0.95, 0.999), cw) + 1]",
    "  br <- sort(unique(c(0, q[q > 0 & q < M$upper], M$upper)))",
    "  f <- function(t) { r <- exp(logLm(t) + M$ld(t) - c0); r[!is.finite(r)] <- 0; r }",
    "  Z <- qint(f, br)",
    "  mean_mu <- qint(function(t) f(t) * condm(t)$m, br) / Z",
    "  var_finite <- is.finite(M$upper) || (2 - (k - 1) - M$tail) < -1   # posterior variance of mu exists?",
    "  sd_mu <- if (var_finite) sqrt(qint(function(t) { cm <- condm(t); f(t) * (cm$s2 + cm$m^2) }, br) / Z - mean_mu^2) else Inf",
    "  mode2 <- if (M$zero) 0 else {   # posterior mode of tau^2 (density on the tau^2 scale)",
    "    ## the page's search: log(tau^2) on [1e-8, 100]; a maximum at the top end raises it x1e4 (at most 11",
    "    ## times), at the bottom end lowers it x1e-20 (to 1e-300); no interior maximum -> NaN, still rising -> 0",
    "    lg <- function(lx) { x <- exp(lx); r <- logLm(sqrt(x)) + M$ld(sqrt(x)) - log(2 * sqrt(x)); r[is.na(r)] <- -Inf; r }",
    "    lo <- log(1e-8); hi <- log(100); LO_MIN <- log(1e-300); nUp <- 0",
    "    for (pass in 1:40) { gx <- lo + (0:4000) * (hi - lo) / 4000; gv <- lg(gx); bi <- which.max(gv)",
    "      if (bi == 4001 && nUp < 11) { hi <- hi + log(1e4); nUp <- nUp + 1 }",
    "      else if (bi == 1 && is.finite(gv[1]) && lo > LO_MIN) lo <- max(LO_MIN, lo - log(1e20)) else break }",
    "    if (bi == 4001) NaN else if (bi == 1 && is.finite(gv[1]) && lo <= LO_MIN) 0 else",
    "      exp(optimize(lg, c(gx[max(1, bi - 1)], gx[min(4001, bi + 1)]), maximum = TRUE, tol = 1e-12)$maximum) }",
    "  list(name = M$name, mu = mean_mu, sd = sd_mu, mode2 = mode2, logZ = c0 + log(Z), f = f, Z = Z, br = br) }",
    "v <- vi; k <- length(yi)",
    "fits <- lapply(MODELS, fit_one)",
    "lz <- sapply(fits, `[[`, \"logZ\"); w <- exp(lz - max(lz)); w <- w / sum(w)",
    "mu_bma <- sum(w * sapply(fits, `[[`, \"mu\"))",
    "sds <- sapply(fits, `[[`, \"sd\")",
    "se_bma <- if (all(is.finite(sds[w > 0]))) sqrt(sum(w * (sds^2 + sapply(fits, `[[`, \"mu\")^2)) - mu_bma^2) else Inf",
    "Fm <- function(x) sum(sapply(seq_along(fits), function(j) { F <- fits[[j]]",
    "  w[j] * qint(function(t) { cm <- condm(t); F$f(t) * pnorm((x - cm$m) / sqrt(cm$s2)) }, F$br) / F$Z }))",
    "sc <- 10 * max(sqrt(condm(1e-13)$s2), 1e-7)",
    "qroot <- function(p) uniroot(function(x) Fm(x) - p, mu_bma + c(-1, 1) * sc, extendInt = \"upX\", tol = 1e-13)$root",
    ""
  ].join("\n");

  function buildScript(c) {
    var p = c.page, s = c.rows, L = [];
    L.push("## allmeta bma-tau-priors -- R check of the numbers this page displayed");
    L.push("## Generated " + new Date().toISOString() + " from the inputs the page analysed (k = " + s.length + ").");
    L.push("## Run: Rscript bma-tau-priors-check.R   (base R; bayesmeta, if installed, adds a descriptive cross-check)");
    L.push("");
    L.push(R_HELPERS);
    L.push("label <- " + rStrVec(s.map(function (x) { return x.label; })));
    L.push("yi    <- " + rVec(s.map(function (x) { return x.yi; })));
    L.push("vi    <- " + rVec(s.map(function (x) { return x.vi; })));
    L.push("## values the page displayed (full precision; Inf = an SE the page shows as \"--\" because it does not exist)");
    L.push("page <- list(mu = " + rNum(p.muHat) + ", se = " + rNum(p.sePost) + ", lo = " + rNum(p.ci_lo) + ", hi = " + rNum(p.ci_hi) +
           ", k = " + rNum(s.length) + ", n_models = " + rNum(p.perModel.length) + ",");
    L.push("  name = " + rStrVec(p.perModel.map(function (m) { return m.name; })) + ",");
    L.push("  weight = " + rVec(p.perModel.map(function (m) { return m.weight; })) + ",");
    L.push("  mu_m = " + rVec(p.perModel.map(function (m) { return m.muHat; })) + ",");
    L.push("  se_m = " + rVec(p.perModel.map(function (m) { return m.sePost; })) + ",");
    L.push("  mode2 = " + rVec(p.perModel.map(function (m) { return m.tau2_mode; })) + ")");
    L.push("");
    L.push(BMA_R);
    L.push("cat(\"bma-tau-priors R check:\", k, \"studies;\", length(MODELS), \"tau priors\\n\")");
    L.push("chk(\"k (studies)\", k, page$k, 0)");
    L.push("chk(\"models\", length(fits), page$n_models, 0)");
    L.push("for (j in seq_along(fits)) { stopifnot(fits[[j]]$name == page$name[j])");
    L.push("  chk(paste(fits[[j]]$name, \"weight\"), w[j], page$weight[j])");
    L.push("  chk(paste(fits[[j]]$name, \"mu\"), fits[[j]]$mu, page$mu_m[j], half = 5e-5)   # mu, SE, tau^2 mode, CrI: shown to 4 decimals");
    L.push("  chk(paste(fits[[j]]$name, \"SE\"), fits[[j]]$sd, page$se_m[j], half = 5e-5)");
    L.push("  chk(paste(fits[[j]]$name, \"tau^2 mode\"), fits[[j]]$mode2, page$mode2[j], half = 5e-5) }");
    L.push("chk(\"BMA mu\", mu_bma, page$mu, half = 5e-5)");
    L.push("chk(\"BMA SE (post)\", se_bma, page$se, half = 5e-5)");
    L.push("chk(\"95% CrI low (2.5% quantile)\", qroot(0.025), page$lo, half = 5e-5)");
    L.push("chk(\"95% CrI hi (97.5% quantile)\", qroot(0.975), page$hi, half = 5e-5)");
    L.push("## Descriptive, not counted above: the per-prior posterior mean of mu from bayesmeta's own tau posterior");
    L.push("## (the P47 pack's reference construction), when bayesmeta is installed.");
    L.push("if (requireNamespace(\"bayesmeta\", quietly = TRUE)) {");
    L.push("  for (j in seq_along(MODELS)) { M <- MODELS[[j]]");
    L.push("    bm <- bayesmeta::bayesmeta(y = yi, sigma = sqrt(vi), tau.prior = function(t) exp(M$ld(t)))");
    L.push("    br <- fits[[j]]$br; d <- function(t) bm$dposterior(tau = t)");
    L.push("    mb <- qint(function(t) d(t) * bm$cond.moment(tau = t)[, \"mean\"], br)");
    L.push("    cat(sprintf(\"bayesmeta %-20s mean mu %.8f (base R %.8f, |diff| %.1e; descriptive)\\n\", M$name, mb, fits[[j]]$mu, abs(mb - fits[[j]]$mu))) }");
    L.push("  cat(\"bayesmeta\", as.character(packageVersion(\"bayesmeta\")), \"\\n\")");
    L.push("} else cat(\"bayesmeta not installed: descriptive cross-check skipped (it is not part of the MATCH count)\\n\")");
    L.push("cat(\"R:\", R.version.string, \"\\n\")");
    L.push("finish()");
    return L.join("\n") + "\n";
  }
  window.__almBMARScript = function () { var c = window.__almRCheckInputs && window.__almRCheckInputs(); return c ? buildScript(c) : null; };
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    attachRCheck({
      mount: "#per-model", filename: "bma-tau-priors-check.R",
      getInputs: function () { return window.__almRCheckInputs ? window.__almRCheckInputs() : null; },
      refuse: "Nothing to check: the page shows no result (it needs at least 2 studies).",
      buildScript: buildScript,
      packages: function () { return []; },
      webrNote: function () { return "bayesmeta is not in the pinned WebR repository, so its descriptive cross-check runs only in desktop R; the base-R recomputation below is the check."; },
    });
  });
})();
