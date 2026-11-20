/* nma-meta-reg/rcheck.js -- the page's two R user paths (app-local).
 * "Download R script" and "Verify in R (WebR)" run the SAME script, built from the inputs the page last
 * analysed (window.AlmRCheck.set(state) is called by the page's run()). The script recomputes every
 * displayed number in R, prints page value, R value and absolute difference, and ends with MATCH n/n or
 * MISMATCH. WebR runs through the unchanged shared/webr-runner.js (site-pinned packages, SHA-256 checked).
 */
(function (global) {
  "use strict";
  var FILENAME = "nma-meta-reg-check.R", PKGS = ["netmeta"], PKG_NOTE = "R netmeta::netmetareg";
  // ---- shared by this page's two R paths (download + in-page WebR); app-local copy ----
  var state = null, busy = false, gen = 0;   // gen: bumped on every set(), so a late R result can be recognised as stale
  function rnum(x) { return typeof x !== "number" || isNaN(x) ? "NA" : isFinite(x) ? String(x) : (x > 0 ? "Inf" : "-Inf"); }
  function rstr(s) { return JSON.stringify(String(s)); }
  function rvec(a, f) { return "c(" + a.map(f || rnum).join(", ") + ")"; }
  var HEAD = [
    "options(warn = 1, width = 250)",
    "cat(R.version.string, \"\n\")",
    ".chk <- data.frame(quantity = character(), page = numeric(), R = numeric(), tol = numeric(), stringsAsFactors = FALSE)",
    "# chk(): one displayed quantity -- the page's full-precision value, R's value, and the absolute tolerance.",
    "chk <- function(quantity, page, r, tol) {",
    "  r <- if (length(r) == 1 && is.numeric(r)) as.numeric(r) else NA_real_",
    "  .chk[nrow(.chk) + 1, ] <<- list(quantity, as.numeric(page), r, tol)",
    "}"
  ];
  var FOOT = [
    "# identical infinities (e.g. a log-likelihood at Q = 0) agree; anything else infinite does not",
    ".chk$abs_diff <- ifelse(is.infinite(.chk$page) & .chk$page == .chk$R & !is.na(.chk$R), 0, abs(.chk$page - .chk$R))",
    ".chk$ok <- !is.na(.chk$abs_diff) & .chk$abs_diff <= .chk$tol",
    "print(.chk, digits = 10, row.names = FALSE)",
    ".n <- nrow(.chk); .m <- sum(.chk$ok)",
    "# Honest verdict: MATCH only when R ran to the end AND every compared quantity is within its tolerance.",
    "if (!isTRUE(.done) || .n == 0) cat(sprintf(\"MISMATCH %d/%d (R did not complete the check)\n\", .m, .n)) else",
    "  if (.m == .n) cat(sprintf(\"MATCH %d/%d\n\", .m, .n)) else cat(sprintf(\"MISMATCH %d/%d\n\", .m, .n))"
  ];
  function wrap(header, body) {
    return header.concat(HEAD, [".done <- tryCatch({"], body.map(function (l) { return "  " + l; }),
      ["  TRUE", "}, error = function(e) { cat(\"R ERROR:\", conditionMessage(e), \"\n\"); FALSE })"], FOOT).join("\n") + "\n";
  }
  function el(id) { return document.getElementById(id); }
  function setStatus(t) { var s = el("rcheck-status"); if (s) s.textContent = t; }
  function mount(after) {
    if (typeof document === "undefined" || el("rcheck-panel")) return;
    var host = document.querySelector(after);
    if (!host) return;
    var sec = document.createElement("section");
    sec.className = "panel"; sec.id = "rcheck-panel"; sec.style.gridColumn = "1 / -1";
    sec.setAttribute("aria-label", "Check this result in R");
    sec.innerHTML = '<h2>Check in R</h2>' +
      '<p class="hint" style="margin:0 0 0.5rem">Both buttons use the same R script, generated from the inputs this page last analysed. It recomputes every displayed number with ' + PKG_NOTE + ', prints each next to the page\'s value and the absolute difference, and ends with <code>MATCH n/n</code> or <code>MISMATCH</code>.</p>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
      '<button type="button" id="btn-rscript" class="ghost">Download R script</button>' +
      '<button type="button" id="btn-verify-r" class="ghost">Verify in R (WebR)</button></div>' +
      '<p id="rcheck-status" class="hint" role="status" aria-live="polite" style="margin:0.5rem 0 0"></p>' +
      '<p id="rcheck-verdict" style="margin:0.4rem 0 0;font-weight:600"></p>' +
      '<pre id="rcheck-out" style="display:none;max-height:28rem;overflow:auto;font-size:0.78rem;white-space:pre;background:var(--accent-soft,#eef3f8);padding:0.6rem;border-radius:4px"></pre>';
    host.parentNode.insertBefore(sec, host.nextSibling);
    el("btn-rscript").addEventListener("click", download);
    el("btn-verify-r").addEventListener("click", verify);
    refresh();
  }
  function refresh() {
    var ok = !!state;
    ["btn-rscript", "btn-verify-r"].forEach(function (id) { var b = el(id); if (b) b.disabled = !ok || (id === "btn-verify-r" && busy); });
    if (!ok) setStatus("Run an analysis first: there is nothing to check in R yet.");
  }
  function set(s) {
    state = s || null; gen++;
    if (typeof document === "undefined") return;
    var o = el("rcheck-out"), v = el("rcheck-verdict");
    if (o) { o.style.display = "none"; o.textContent = ""; }
    // XREV-631 A3: tell the user to press Verify again only when there is an analysis to verify (the button is enabled)
    if (v) v.textContent = busy ? "The inputs changed while R was running; the result will be discarded." + (state ? " Press Verify in R again for the current analysis." : "") : "";
    if (!busy) setStatus("");
    refresh();
  }
  function current() { return state ? buildScript(state) : null; }
  function download() {
    var txt = current(); if (!txt) return;
    var blob = new Blob([txt], { type: "text/x-r;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = FILENAME;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    setStatus("Downloaded " + FILENAME + ": run it with Rscript --vanilla " + FILENAME + (PKGS.length ? " (needs " + PKGS.join(", ") + ")." : " (base R only)."));
  }
  async function verify() {
    var txt = current(); if (!txt || busy) return;
    var o = el("rcheck-out"), v = el("rcheck-verdict");
    if (!global.AlmWebR || typeof global.AlmWebR.runR !== "function") {
      v.textContent = "WebR could not be loaded on this page, so R was not run. Use Download R script instead.";
      return;
    }
    busy = true; refresh(); v.textContent = ""; o.style.display = "none";
    var g0 = gen, stale = function () { return gen !== g0; };
    try {
      var r = await global.AlmWebR.runR({ script: txt, packages: PKGS, onStatus: function (t) { if (!stale()) setStatus(t); } });
      if (stale()) {
        // R ran on an analysis the page no longer shows: never report its verdict next to the current one.
        v.textContent = "R finished on an earlier analysis: the inputs changed while R was running, so that result was discarded." + (state ? " Press Verify in R again." : "");
        setStatus("");
        return;
      }
      if (!r.ok) {
        var missing = /Package not in pinned repository: (\S+)/.exec(r.error || "");
        v.textContent = missing
          ? "R was not run: package " + missing[1] + " is not available in this site's WebR. Use Download R script and run it in R."
          : "R was not run: " + r.error;
        setStatus("");
        return;
      }
      var vers = Object.keys(r.versions || {}).map(function (k) { return k === "R" ? r.versions[k] : k + " " + r.versions[k]; }).join(", ");
      o.textContent = "# WebR session: " + vers + "\n" + r.stdout;
      o.style.display = "block";
      var line = r.stdout.split(/\r?\n/).filter(function (l) { return /^(MATCH|MISMATCH) /.test(l); }).pop();
      v.textContent = line ? "R (WebR): " + line : "R (WebR) printed no MATCH/MISMATCH line: the check did not complete.";
      setStatus("R finished (" + vers + ").");
    } catch (e) {
      // XREV-631 A3: an error from a run the user has since superseded belongs to the earlier analysis too
      v.textContent = stale()
        ? "R stopped on an earlier analysis: the inputs changed while R was running, so that error was discarded." + (state ? " Press Verify in R again." : "")
        : "R was not run: " + (e && e.message ? e.message : String(e));
    } finally { busy = false; refresh(); }
  }

  // state: { rows: [{studyId,trtA,trtB,yi,sei,covariate}] as parsed, treatments: [ref first], method, page: <AlmNmaMetaReg.fit result> }
  function buildScript(s) {
    var f = s.page, tr = s.treatments, m = s.method;
    var MULTI = "multi-arm contrast not involving study baseline";
    var nMulti = f.droppedRows.filter(function (r) { return r.reason === MULTI; }).length;
    var nInvalid = f.droppedRows.length - nMulti;
    // FE is closed form: 1e-9. REML/ML tau^2 comes from two different optimisers on a likelihood that can be
    // flat to 1e-10, so each quantity is compared at half a unit of the last digit the page displays
    // (4 dp: 5e-5, 3 dp: 5e-4); the printed abs_diff shows the actual agreement.
    function tl(dp) { return m === "FE" ? "1e-9" : String(0.5 * Math.pow(10, -dp)); }
    var body = [
      "suppressPackageStartupMessages(library(netmeta))",
      "cat(\"netmeta\", as.character(packageVersion(\"netmeta\")), \"(the pack validates against 3.7-0)\n\")",
      "# Contrast rows as analysed by the page: yi = effect of trtB relative to trtA, so treat1 = trtB, treat2 = trtA.",
      "d <- data.frame(",
      "  studlab = " + rvec(s.rows.map(function (r) { return r.studyId; }), rstr) + ",",
      "  trtA = " + rvec(s.rows.map(function (r) { return r.trtA; }), rstr) + ",",
      "  trtB = " + rvec(s.rows.map(function (r) { return r.trtB; }), rstr) + ",",
      "  yi   = " + rvec(s.rows.map(function (r) { return r.yi; })) + ",",
      "  sei  = " + rvec(s.rows.map(function (r) { return r.sei; })) + ",",
      "  x    = " + rvec(s.rows.map(function (r) { return r.covariate; })) + ", stringsAsFactors = FALSE)",
      "# The page's engine (shared/nma-meta-regression.js) does not analyse rows with a non-finite yi, sei or covariate,",
      "# sei <= 0, or trtA == trtB; R drops the same rows before the covariate shift and the fit (XREV-631 finding 2).",
      "input_n <- nrow(d)",
      "d <- d[is.finite(d$yi) & is.finite(d$sei) & d$sei > 0 & is.finite(d$x) & d$trtA != d$trtB, , drop = FALSE]",
      "cat(\"Invalid input rows excluded by the page and R:\", input_n - nrow(d), \"\\n\")",
      "trts <- " + rvec(tr, rstr) + "   # page order, reference first",
      "ref <- trts[1]; method <- " + rstr(m),
      "xpred <- " + rvec(f.predictions.map(function (q) { return q.x; })),
      "# As in the pack's validation (PREREG A2): netmetareg is given order-preserving codes T01, T02, ... because",
      "# make.names() can alter labels in its design columns; A5: the covariate is shifted by round(mean(x)), a pure",
      "# reparametrisation, and results are reported on the data scale.",
      "lab <- unique(c(d$trtA, d$trtB)); ord <- lab[order(gsub(\" \", \"_\", lab, fixed = TRUE), method = \"radix\")]",
      "code <- setNames(sprintf(\"T%02d\", seq_along(ord)), ord)",
      "shift <- round(mean(d$x))",
      "dd <- data.frame(studlab = d$studlab, treat1 = unname(code[d$trtB]), treat2 = unname(code[d$trtA]),",
      "  TE = d$yi, seTE = d$sei, covariate = d$x - shift, stringsAsFactors = FALSE)",
      "net <- netmeta(TE, seTE, treat1, treat2, studlab, data = dd, sm = \"MD\", reference.group = code[[ref]],",
      "  common = (method == \"FE\"), random = (method != \"FE\"))",
      "res <- netmetareg(net, covar = covariate, method.tau = method, reference.group = code[[ref]])",
      "print(res)",
      "b <- coef(res); V <- vcov(res); z <- qnorm(0.975)",
      "xbar <- mean(res$data$covariate) + shift   # mean covariate of the rows netmetareg used",
      "# slope coefficient name: \"T02:covariate\" (netmeta prints it with backticks in some versions)",
      "gn <- function(i) { g <- paste0(i, \":covariate\"); if (g %in% names(b)) g else paste0(\"`\", g, \"`\") }",
      "at <- function(t, x) { i <- code[[t]]; g <- gn(i); h <- x - shift",
      "  e <- b[[i]] + h * b[[g]]; se <- sqrt(V[i, i] + h^2 * V[g, g] + 2 * h * V[i, g]); c(e, se, e - z * se, e + z * se) }",
      "slope <- function(t) { g <- gn(code[[t]]); se <- sqrt(V[g, g]); c(b[[g]], se, b[[g]] - z * se, b[[g]] + z * se) }",
      "chk(\"rows used n\", " + rnum(f.n) + ", res$k, 0)",
      "chk(\"invalid input rows excluded\", " + nInvalid + ", input_n - nrow(d), 0)",
      "# the card shows only rows dropped as multi-arm contrasts not involving the study baseline",
      "chk(\"dropped multi-arm contrasts\", " + nMulti + ", nrow(d) - res$k, 0)",
      "chk(\"parameters p\", " + rnum(f.p) + ", res$p, 0)",
      "chk(\"treatments\", " + tr.length + ", length(unique(c(d$trtA, d$trtB))), 0)",
      "chk(\"QE\", " + rnum(f.QE) + ", res$QE, 1e-9)",
      "chk(\"QE df\", " + rnum(f.QEdf) + ", res$k - res$p, 0)",
      "chk(\"x-bar (covariate mean)\", " + rnum(f.xMean) + ", xbar, 1e-9)",
      "chk(\"tau^2\", " + rnum(f.tau2) + ", if (method == \"FE\") 0 else res$tau2, " + tl(4) + ")"
    ];
    var Q = ["estimate", "SE", "CI lower", "CI upper"], K = ["estimate", "se", "ci_lo", "ci_hi"];
    function four(prefix, obj, rexpr, dps) {
      body.push("r <- " + rexpr);
      K.forEach(function (k, j) { body.push("chk(" + rstr(prefix + " " + Q[j]) + ", " + rnum(obj[k]) + ", r[" + (j + 1) + "], " + tl(dps[j]) + ")"); });
    }
    tr.slice(1).forEach(function (t) {
      four("beta at x-bar " + t + " vs " + tr[0], f.beta_at_mean[t], "at(" + rstr(t) + ", xbar)", [4, 4, 3, 3]);
      four("gamma " + t + " vs " + tr[0], f.gamma[t], "slope(" + rstr(t) + ")", [4, 4, 3, 3]);
    });
    f.predictions.forEach(function (q, i) {
      tr.slice(1).forEach(function (t) {
        four("prediction x=" + q.x + " " + t + " vs " + tr[0], q.perTreatment[t], "at(" + rstr(t) + ", xpred[" + (i + 1) + "])", [3, 4, 3, 3]);
      });
    });
    return wrap([
      "# allmeta nma-meta-reg page: R check of the numbers the page displayed.",
      "# Generated by nma-meta-reg/rcheck.js from the page's current inputs; model netmeta::netmetareg(consistency = TRUE,",
      "# assumption = \"independent\"), the model the page fits. Run: Rscript --vanilla " + FILENAME + "   (needs netmeta)"
    ], body);
  }

  var api = { set: set, buildScript: buildScript, script: current, mount: mount, _state: function () { return state; } };
  global.AlmRCheck = api;
  if (typeof document !== "undefined") {
    if (document.readyState !== "loading") mount("main > section.panel:last-of-type");
    else document.addEventListener("DOMContentLoaded", function () { mount("main > section.panel:last-of-type"); });
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
