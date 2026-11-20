/* multiplicative-ma/rcheck.js -- the page's two R user paths (app-local).
 * "Download R script" and "Verify in R (WebR)" run the SAME script, built from the inputs the page last
 * analysed (window.AlmRCheck.set(state) is called by the page's run()). The script recomputes every
 * displayed number in R, prints page value, R value and absolute difference, and ends with MATCH n/n or
 * MISMATCH. WebR runs through the unchanged shared/webr-runner.js (site-pinned packages, SHA-256 checked).
 */
(function (global) {
  "use strict";
  var FILENAME = "multiplicative-ma-check.R", PKGS = ["metafor"], PKG_NOTE = "R metafor (rma FE and PM) and lm (UWLS)";
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

  // state: { yi, sei, labels, exp: bool, page: { fe:{mu,se,ciLo,ciHi}, pm:{mu,se,ciLo,ciHi,tau2,I2}, uwls:{mu,se,ciLo,ciHi,phi,df} } }
  function buildScript(s) {
    var p = s.page, body = [
      "suppressPackageStartupMessages(library(metafor))",
      "cat(\"metafor\", as.character(packageVersion(\"metafor\")), \"(the pack validates against 5.2-1)\n\")",
      "yi  <- " + rvec(s.yi) + "   # effects as analysed by the page (analysis scale)",
      "sei <- " + rvec(s.sei),
      "vi <- sei^2; k <- length(yi)",
      "fe <- rma(yi, vi, method = \"FE\")",
      "pm <- tryCatch(rma(yi, vi, method = \"PM\", control = list(tol = .Machine$double.eps^0.75, threshold = 1e-12, maxiter = 10000)),",
      "  error = function(e) rma(yi, vi, method = \"PM\", control = list(tol = .Machine$double.eps^0.75, threshold = 1e-12, maxiter = 10000, tau2.max = 1e8)))",
      "# Multiplicative / UWLS (Stanley & Doucouliagos 2015) = lm(yi ~ 1, weights = 1/vi), t_{k-1} interval.",
      "uw <- summary(lm(yi ~ 1, weights = 1 / vi))",
      "u_mu <- uw$coefficients[1, 1]; u_se <- uw$coefficients[1, 2]; tq <- qt(0.975, k - 1)",
      "phi <- fe$QE / (k - 1)",
      "print(fe); print(pm); print(uw$coefficients)",
      "chk(\"k studies\", " + s.yi.length + ", k, 0)",
      "chk(\"FE estimate\", " + rnum(p.fe.mu) + ", fe$beta[1], 1e-9)",
      "chk(\"FE SE\", " + rnum(p.fe.se) + ", fe$se, 1e-9)",
      "chk(\"FE CI lower\", " + rnum(p.fe.ciLo) + ", fe$ci.lb, 1e-9)",
      "chk(\"FE CI upper\", " + rnum(p.fe.ciHi) + ", fe$ci.ub, 1e-9)",
      "chk(\"PM tau^2\", " + rnum(p.pm.tau2) + ", pm$tau2, 1e-6)",
      "chk(\"PM estimate\", " + rnum(p.pm.mu) + ", pm$beta[1], 1e-6)",
      "chk(\"PM SE\", " + rnum(p.pm.se) + ", pm$se, 1e-6)",
      "chk(\"PM CI lower\", " + rnum(p.pm.ciLo) + ", pm$ci.lb, 1e-6)",
      "chk(\"PM CI upper\", " + rnum(p.pm.ciHi) + ", pm$ci.ub, 1e-6)",
      "chk(\"PM I^2 (%)\", " + rnum(p.pm.I2) + ", pm$I2, 1e-4)",
      "chk(\"UWLS estimate\", " + rnum(p.uwls.mu) + ", u_mu, 1e-9)",
      "chk(\"UWLS SE\", " + rnum(p.uwls.se) + ", u_se, 1e-9)",
      "chk(\"UWLS CI lower\", " + rnum(p.uwls.ciLo) + ", u_mu - tq * u_se, 1e-9)",
      "chk(\"UWLS CI upper\", " + rnum(p.uwls.ciHi) + ", u_mu + tq * u_se, 1e-9)",
      "chk(\"UWLS phi = Q/(k-1)\", " + rnum(p.uwls.phi) + ", phi, 1e-9)",
      "chk(\"UWLS df\", " + rnum(p.uwls.df) + ", k - 1, 0)"
    ];
    if (s.exp) {
      // The page shows exp(estimate) and exp(limits) to 3 dp, so no row may be looser than 5e-4.
      body.push("# The page displays exponentiated estimates and limits (Scale: exponentiate), to 3 decimal places.",
        "etol <- function(rel, x) min(5e-4, rel * max(1, exp(x)))");
      [["FE", p.fe, "fe$beta[1]", "fe$ci.lb", "fe$ci.ub", "1e-9"], ["PM", p.pm, "pm$beta[1]", "pm$ci.lb", "pm$ci.ub", "1e-6"],
       ["UWLS", p.uwls, "u_mu", "u_mu - tq * u_se", "u_mu + tq * u_se", "1e-9"]].forEach(function (m) {
        [["estimate", m[1].mu, m[2]], ["CI lower", m[1].ciLo, m[3]], ["CI upper", m[1].ciHi, m[4]]].forEach(function (q) {
          body.push("chk(" + rstr("exp " + m[0] + " " + q[0]) + ", " + rnum(Math.exp(q[1])) + ", exp(" + q[2] + "), etol(" + m[5] + ", " + q[2] + "))");
        });
      });
    }
    return wrap([
      "# allmeta multiplicative-ma page: R check of the numbers the page displayed.",
      "# Generated by multiplicative-ma/rcheck.js from the page's current inputs.",
      "# Run: Rscript --vanilla " + FILENAME + "   (needs metafor)"
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
