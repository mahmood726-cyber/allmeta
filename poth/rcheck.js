/* poth/rcheck.js -- the page's two R user paths (app-local).
 * "Download R script" and "Verify in R (WebR)" run the SAME script, built from the inputs the page last
 * analysed (window.AlmRCheck.set(state) is called by the page's run()). The script recomputes every
 * displayed number in R, prints page value, R value and absolute difference, and ends with MATCH n/n or
 * MISMATCH. WebR runs through the unchanged shared/webr-runner.js (site-pinned packages, SHA-256 checked).
 */
(function (global) {
  "use strict";
  var FILENAME = "poth-check.R", PKGS = [], PKG_NOTE = "base R (the POTH closed form)";
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
      '<p class="hint" style="margin:0 0 0.5rem">Both buttons use the same R script, generated from the inputs this page last analysed. From the values the page parsed it recomputes, with ' + PKG_NOTE + ', the SUCRA values, their mean and POTH shown on the page (not the ranking order, names or band text, and not with the poth package); it prints each next to the page\'s value and the absolute difference, and ends with <code>MATCH n/n</code> or <code>MISMATCH</code>.</p>' +
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

  // state: { tok: [first field of each analysed line, as typed], labels: [...],
  //          page: { n, pct, meanSucra, poth, sucra: [value after the page's % conversion] } }
  function buildScript(s) {
    var p = s.page;
    var body = [
      "tok <- " + rvec(s.tok, rstr) + "   # first field of each line, exactly as analysed by the page",
      "lab <- " + rvec(s.labels, rstr),
      "v <- as.numeric(sub(\"[[:space:]]*%$\", \"\", tok))",
      "# The page's rule: a trailing % or any value > 1 means every value is a percentage.",
      "pct <- any(grepl(\"%$\", tok)) || any(v > 1)",
      "s <- if (pct) v / 100 else v",
      "stopifnot(length(s) >= 2, all(is.finite(s)), all(s >= 0 & s <= 1))",
      "n <- length(s)",
      "# POTH (Wigle et al. 2025, Stat Med 44:e70176, doi:10.1002/sim.70176), written from the paper's definition:",
      "# S2 = (1/n) sum (SUCRA_i - 0.5)^2, S2max = (n+1) / (12 (n-1)), POTH = S2 / S2max.",
      "# The pack validates against the CRAN poth package 0.3-0, which is not in this site's WebR repository,",
      "# so both R paths use this closed form in base R.",
      "S2 <- mean((s - 0.5)^2); S2max <- (n + 1) / (12 * (n - 1)); poth_raw <- S2 / S2max",
      "# LIM-P23 F15: the page (shared/poth.js) reports POTH capped to [0, 1]; scores more spread than any",
      "# single ranking allows (e.g. rounded values) give poth_raw > 1. Apply the same stated cap and print both.",
      "poth <- min(1, max(0, poth_raw))",
      "if (poth_raw > 1) cat(sprintf(\"Uncapped POTH = %.6f > 1: these scores are more spread than any single ranking allows; POTH is capped at 1, as on the page.\n\", poth_raw))",
      "cat(sprintf(\"POTH = %.6f (n = %d treatments, mean SUCRA = %.6f)\n\", poth, n, mean(s)))",
      "chk(\"n treatments\", " + rnum(p.n) + ", n, 0)",
      "chk(\"percent input (1 = yes)\", " + (p.pct ? 1 : 0) + ", as.numeric(pct), 0)"
    ];
    p.sucra.forEach(function (x, i) {
      body.push("chk(paste(\"SUCRA\", lab[" + (i + 1) + "]), " + rnum(x) + ", s[" + (i + 1) + "], 1e-12)");
    });
    body.push("chk(\"mean SUCRA\", " + rnum(p.meanSucra) + ", mean(s), 1e-9)");
    body.push("chk(\"POTH\", " + rnum(p.poth) + ", poth, 1e-9)");
    return wrap([
      "# allmeta POTH page: R check of the numbers the page displayed.",
      "# Generated by poth/rcheck.js from the page's current inputs. Base R only.",
      "# Run: Rscript --vanilla " + FILENAME
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
