/* bayesian-mcmc/r-check.js -- "Download R script" + in-page "Verify in R (WebR)" for this page (lane pa8).
 * Re-runs the page's seeded Gibbs sampler exactly in base R from the seed of the run on screen and
 * recomputes every summary shown; bayesmeta (the P47 pack reference) adds a descriptive check if installed. */
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
    "chk <- function(q, r, page, tol = 1e-6) {",
    "  r <- as.numeric(r); page <- as.numeric(page)",
    "  if (!is.finite(page) || !is.finite(r)) { ok <- (is.na(page) && is.na(r)) || identical(page, r); d <- NA_real_ }",
    "  else { d <- abs(r - page); ok <- d <= min(tol * max(1, abs(page)), 5e-4) }",
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

  // The page's sampler re-implemented exactly in base R: the same mulberry32 PRNG (32-bit integer
  // arithmetic done in exact doubles), the same Box-Muller normals, the same Gibbs updates for
  // theta and mu and the same adaptive log-scale Metropolis step for tau, started from the seed the
  // page used. So R reproduces the page's draws, and every summary is recomputed from them
  // (quantiles: linear interpolation = R type 7; R-hat: split chains; ESS: Geyer pairs, max lag 400).
  // mulberry32's state advances by the constant 0x6D2B79F5 per draw, so the n-th uniform depends
  // only on (seed, n) and all uniforms are computed vectorised up front.
  var SAMPLER_R = [
    ".xor32 <- function(a, b) bitwXor(a %/% 65536, b %/% 65536) * 65536 + bitwXor(a %% 65536, b %% 65536)",
    ".or32  <- function(a, b) bitwOr(a %/% 65536, b %/% 65536) * 65536 + bitwOr(a %% 65536, b %% 65536)",
    ".imul  <- function(a, b) { ah <- a %/% 65536; al <- a %% 65536; bh <- b %/% 65536; bl <- b %% 65536",
    "  (al * bl + ((ah * bl + al * bh) %% 65536) * 65536) %% 4294967296 }",
    "mulberry32_n <- function(seed, n) {               # the first n outputs of mulberry32(seed)",
    "  ## a_i = seed + i * 0x6D2B79F5 (mod 2^32), formed with the exact 16-bit split multiply: a plain double",
    "  ## product passes 2^53 near draw 4.9 million and would silently leave the page's stream",
    "  a <- (seed + .imul(1831565813, (1:n) %% 4294967296)) %% 4294967296",
    "  t <- .imul(.xor32(a, a %/% 32768), .or32(1, a))",
    "  t <- .xor32((t + .imul(.xor32(t, t %/% 128), .or32(61, t))) %% 4294967296, t)",
    "  .xor32(t, t %/% 16384) / 4294967296 }",
    "gibbs <- function(te, se, iter, burn, tauPrior, seed) {",
    "  k <- length(te); total <- iter + burn; per <- 2 * k + 5   # uniforms per iteration",
    "  u <- mulberry32_n(seed, total * per); dim(u) <- c(per, total)",
    "  i1 <- c(seq(1, 2 * k, by = 2), 2 * k + 1, 2 * k + 3)",
    "  SQ <- sqrt(-2 * log(1 - u[i1, , drop = FALSE])); CS <- cos(2 * pi * u[i1 + 1, , drop = FALSE])",
    "  UA <- log(u[per, ])",
    "  theta <- te; mu <- Reduce(`+`, theta, 0) / k; tau <- max(0.1, sqrt(Reduce(`+`, (theta - mu)^2, 0) / k))",
    "  muT <- numeric(iter); tauT <- numeric(iter); tauStep <- 0.3; accepted <- 0; se2 <- se^2",
    "  for (it in 0:(total - 1)) {",
    "    j <- it + 1; t2 <- tau^2",
    "    pv <- 1 / (1 / se2 + 1 / t2); pm <- pv * (te / se2 + mu / t2)",
    "    theta <- pm + sqrt(pv) * SQ[1:k, j] * CS[1:k, j]                     # theta_i | mu, tau, y_i",
    "    mpv <- 1 / (k / t2 + 1 / (1e3^2)); mpm <- mpv * (Reduce(`+`, theta, 0) / t2 + 0 / (1e3^2))",
    "    mu <- mpm + sqrt(mpv) * SQ[k + 1, j] * CS[k + 1, j]                   # mu | theta, tau; prior N(0, 1000^2)",
    "    eps <- 0 + tauStep * SQ[k + 2, j] * CS[k + 2, j]",
    "    tauProp <- tau * exp(eps); logJac <- log(tauProp / tau)",
    "    lp <- function(t) if (t <= 0) -Inf else Reduce(`+`, -0.5 * ((theta - mu) / t)^2 - log(t), 0) + -0.5 * (t / tauPrior)^2",
    "    if (UA[j] < lp(tauProp) - lp(tau) + logJac) { tau <- tauProp; accepted <- accepted + 1 }",
    "    if (it < 500) { if (accepted / (it + 1) > 0.5) tauStep <- tauStep * 1.05 else if (accepted / (it + 1) < 0.2) tauStep <- tauStep * 0.95 }",
    "    if (it >= burn) { muT[it - burn + 1] <- mu; tauT[it - burn + 1] <- tau }",
    "  }",
    "  list(mu = muT, tau = tauT, acceptance = accepted / total) }",
    "summ <- function(x) { q <- quantile(x, c(0.025, 0.975), type = 7, names = FALSE); c(mean = mean(x), sd = sd(x), lo = q[1], hi = q[2]) }",
    "rhat <- function(chs) { sp <- unlist(lapply(chs, function(c) { h <- trunc(length(c) / 2); list(c[seq_len(h)], c[(h + 1):length(c)]) }), recursive = FALSE)",
    "  m <- length(sp); n <- length(sp[[1]]); mn <- sapply(sp, mean); om <- sum(mn) / m",
    "  B <- n * sum((mn - om)^2) / (m - 1); W <- sum(sapply(seq_along(sp), function(i) sum((sp[[i]] - mn[i])^2) / (length(sp[[i]]) - 1))) / m",
    "  sqrt(((n - 1) * W / n + B / n) / W) }",
    "ess <- function(x) { n <- length(x); m <- sum(x) / n; v0 <- sum((x - m)^2) / n; if (v0 == 0) return(n)",
    "  d <- x - m; rho <- function(l) sum(d[1:(n - l)] * d[(1 + l):n]) / (n * v0)",
    "  s <- 0; lag <- 1; while (lag + 1 < min(n / 2, 400)) { p <- rho(lag) + rho(lag + 1); if (p <= 0) break; s <- s + p; lag <- lag + 2 }",
    "  n / (1 + 2 * s) }",
    ""
  ].join("\n");

  function buildScript(c) {
    var p = c.page, s = c.rows, L = [];
    L.push("## allmeta bayesian-mcmc -- R check of the numbers this page displayed");
    L.push("## Generated " + new Date().toISOString() + " from the inputs and seed of the run on screen (k = " + s.length + ").");
    L.push("## Run: Rscript bayesian-mcmc-check.R   (base R; bayesmeta, if installed, adds a descriptive cross-check)");
    L.push("");
    L.push(R_HELPERS);
    L.push("label <- " + rStrVec(s.map(function (x) { return x.label; })));
    L.push("te    <- " + rVec(s.map(function (x) { return x.te; })));
    L.push("se    <- " + rVec(s.map(function (x) { return x.se; })));
    L.push("iter <- " + rNum(c.iter) + "; burn <- " + rNum(c.burn) + "; tauPrior <- " + rNum(c.tauPrior) + "; chains <- " + rNum(c.chains));
    L.push("seed <- " + rNum(c.seed) + "   # the clock seed of the run on screen; chain c uses (seed + c * 0x9E3779B1) mod 2^32");
    L.push("## values the page displayed (full precision)");
    L.push("page <- list(mu = " + rVec([p.mu.mean, p.mu.sd, p.mu.lo, p.mu.hi]) + ", tau = " + rVec([p.tau.mean, p.tau.sd, p.tau.lo, p.tau.hi]) +
           ", pred = " + rVec([p.pred.mean, p.pred.sd, p.pred.lo, p.pred.hi]) +
           ", rhatMu = " + rNum(p.rhatMu) + ", rhatTau = " + rNum(p.rhatTau) + ", essMu = " + rNum(p.essMu) + ", essTau = " + rNum(p.essTau) + ")");
    L.push("");
    L.push(SAMPLER_R);
    L.push("t0 <- proc.time()[[3]]");
    L.push("chs <- lapply(0:(chains - 1), function(ci) gibbs(te, se, iter, burn, tauPrior, (seed + ci * 2654435761) %% 4294967296))");
    L.push("mu <- unlist(lapply(chs, `[[`, \"mu\")); tau <- unlist(lapply(chs, `[[`, \"tau\"))");
    L.push("## posterior predictive: one N(0, tau_s^2) draw per sample from a PRNG seeded (seed + 0x2545F491) mod 2^32");
    L.push("up <- mulberry32_n((seed + 625341585) %% 4294967296, 2 * length(mu))");
    L.push("pred <- mu + (0 + tau * sqrt(-2 * log(1 - up[c(TRUE, FALSE)])) * cos(2 * pi * up[c(FALSE, TRUE)]))");
    L.push("sm <- summ(mu); stau <- summ(tau); sp <- summ(pred); nm <- c(\"mean\", \"SD\", \"95% CrI lower\", \"95% CrI upper\")");
    L.push("cat(\"bayesian-mcmc R check:\", length(te), \"studies;\", chains, \"chain(s) x\", iter, \"iterations after\", burn, \"burn-in; seed\", seed, \"\\n\")");
    L.push("for (j in 1:4) chk(paste(\"mu\", nm[j]), sm[[j]], page$mu[j])");
    L.push("for (j in 1:4) chk(paste(\"tau\", nm[j]), stau[[j]], page$tau[j])");
    L.push("for (j in 1:4) chk(paste(\"predictive\", nm[j]), sp[[j]], page$pred[j])");
    L.push("chk(\"R-hat mu\", if (chains > 1) rhat(lapply(chs, `[[`, \"mu\")) else NA, page$rhatMu)");
    L.push("chk(\"R-hat tau\", if (chains > 1) rhat(lapply(chs, `[[`, \"tau\")) else NA, page$rhatTau)");
    L.push("chk(\"ESS mu\", ess(mu), page$essMu)");
    L.push("chk(\"ESS tau\", ess(tau), page$essTau)");
    L.push("cat(sprintf(\"(sampling in R took %.1f s)\\n\", proc.time()[[3]] - t0))");
    L.push("## Descriptive, not counted above: the exact posterior from bayesmeta (the R package the P47 pack");
    L.push("## validates this page against), same priors. The page's means should lie within a few Monte-Carlo SEs.");
    L.push("if (requireNamespace(\"bayesmeta\", quietly = TRUE)) {");
    L.push("  bm <- bayesmeta::bayesmeta(y = te, sigma = se, mu.prior.mean = 0, mu.prior.sd = 1000,");
    L.push("                             tau.prior = function(t) bayesmeta::dhalfnormal(t, scale = tauPrior))");
    L.push("  for (q in c(\"mu\", \"tau\")) { ex <- bm$summary[\"mean\", q]; pg <- if (q == \"mu\") page$mu[1] else page$tau[1]");
    L.push("    mcse <- (if (q == \"mu\") page$mu[2] / sqrt(page$essMu) else page$tau[2] / sqrt(page$essTau))");
    L.push("    cat(sprintf(\"bayesmeta %s: exact posterior mean %.6f, page %.6f, difference %.2f Monte-Carlo SEs (descriptive)\\n\", q, ex, pg, (pg - ex) / mcse)) }");
    L.push("  cat(\"bayesmeta\", as.character(packageVersion(\"bayesmeta\")), \"\\n\")");
    L.push("} else cat(\"bayesmeta not installed: descriptive cross-check skipped (it is not part of the MATCH count)\\n\")");
    L.push("cat(\"R:\", R.version.string, \"\\n\")");
    L.push("finish()");
    return L.join("\n") + "\n";
  }
  window.__almMCMCRScript = function () { var c = window.__almRCheckInputs && window.__almRCheckInputs(); return c ? buildScript(c) : null; };
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    attachRCheck({
      mount: "#status", filename: "bayesian-mcmc-check.R",
      getInputs: function () { return window.__almRCheckInputs ? window.__almRCheckInputs() : null; },
      refuse: "Nothing to check: run the sampler first (it needs at least 3 studies).",
      buildScript: buildScript,
      packages: function () { return []; },
      webrNote: function (c) { return "Re-running the page's sampler in R (" + c.chains + " x " + (c.iter + c.burn) + " iterations): this can take a minute or more in WebR. bayesmeta is not in the pinned WebR repository, so its descriptive cross-check runs only in desktop R."; },
    });
  });
})();
