/* correlation-ma/plus-ui.js — the "plus" panel (body-level <section id="alm-plus">) and usability helpers
 * (#f-tools, #f-notice, live summary, forest accessibility). All numbers come from AlmCorrPlus (plus-core.js),
 * which calls AlmMaCore.pool on the rows the page itself accepted (window._almLastCorrMA().studies).
 * The page's own parser, estimator, headline, table and forest are untouched.
 */
(function () {
  "use strict";
  var P = window.AlmCorrPlus;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var fmt = P.fmt;
  var state = { test: "z", benchmark: "cohen", loo: null, sens: null, looKey: null };
  var EXAMPLE_TEXT = null;

  // ---------- U1: rejected-row notice (same rules, same order of tests as the page parser) ----------
  function classify(text) {
    var accepted = [], rejected = [];
    String(text || "").split(/\r?\n/).forEach(function (line, i) {
      var t = line.trim(); if (!t || t.charAt(0) === "#") return;
      var p = t.split(/\s*,\s*/);
      if (p.length < 3) { rejected.push({ line: i + 1, text: t, reason: "fewer than 3 comma-separated fields" }); return; }
      if (!p[p.length - 1].trim() || !p[p.length - 2].trim()) { rejected.push({ line: i + 1, text: t, reason: "missing or malformed numeric field" }); return; }
      var n = Number(p[p.length - 1]), r = Number(p[p.length - 2]);
      if (isNaN(n) || isNaN(r)) { rejected.push({ line: i + 1, text: t, reason: "missing or malformed numeric field" }); return; }
      if (!isFinite(n) || !isFinite(r)) { rejected.push({ line: i + 1, text: t, reason: "nonfinite numeric field" }); return; }
      if (r <= -1 || r >= 1) { rejected.push({ line: i + 1, text: t, reason: "|r| >= 1" }); return; }
      if (n <= 3) { rejected.push({ line: i + 1, text: t, reason: "n <= 3" }); return; }
      accepted.push({ line: i + 1 });
    });
    return { accepted: accepted.length, rejected: rejected };
  }
  var _rejected = [];
  window._almCorrRejected = function () { return _rejected.slice(); };
  function renderNotice() {
    var c = classify($("f-data").value), el = $("f-notice");
    _rejected = c.rejected;
    if (!el) return;
    if (!c.rejected.length) { el.textContent = ""; el.hidden = true; return; }
    el.hidden = false;
    var items = c.rejected.slice(0, 20).map(function (x) { return "<li>Line " + x.line + " (" + esc(x.text) + "): " + esc(x.reason) + "</li>"; }).join("");
    el.innerHTML = "<strong>" + c.rejected.length + " row" + (c.rejected.length === 1 ? " was" : "s were") + " excluded</strong> (" + c.accepted + " accepted)." +
      "<ul>" + items + "</ul>" + (c.rejected.length > 20 ? "<p>… and " + (c.rejected.length - 20) + " more.</p>" : "");
  }

  // ---------- U2: Load example / Clear / Convert tabs or semicolons ----------
  function convertDelimited(text) {
    return String(text || "").split(/\r?\n/).map(function (line) {
      var t = line.trim();
      if (!t || t.charAt(0) === "#" || !/[\t;]/.test(t)) return line;
      var f = t.split(/\s*[\t;]\s*/);
      if (f.length < 3) return line;
      var dec = function (s) { return /^[+-]?\d*,\d+$/.test(s) ? s.replace(",", ".") : s; };
      return f.slice(0, f.length - 2).join(" ") + ", " + dec(f[f.length - 2]) + ", " + dec(f[f.length - 1]);
    }).join("\n");
  }
  function setData(text) {
    var ta = $("f-data");
    if (ta.disabled) return; // inert while the validation replay owns the inputs
    ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function syncToolState() {
    var dis = $("f-data").disabled;
    document.querySelectorAll("#f-tools button, #alm-plus button, #alm-plus input, #alm-plus select").forEach(function (b) { b.disabled = dis; });
  }

  // ---------- A: sensitivity table ----------
  function currentStudies() {
    var last = window._almLastCorrMA && window._almLastCorrMA();
    return last ? last.studies.map(function (s) { return { label: s.label, r: s.r, n: s.n }; }) : null;
  }
  function currentMethod() { return $("f-method").value; }
  var _plus = null;
  window._almCorrPlus = function () { return _plus; };

  function cellText(c) {
    if (!c.applicable) return { est: "not applicable", pi: "—", tau2: "—", tau: "—", i2: "—", q: "—" };
    return {
      est: fmt(c.r) + " [" + fmt(c.r_lo) + ", " + fmt(c.r_hi) + "]",
      pi: c.r_pi_lo != null ? "[" + fmt(c.r_pi_lo) + ", " + fmt(c.r_pi_hi) + "]" : "—",
      tau2: c.method === "FE" ? "0 (fixed)" : fmt(c.tau2_z, 4),
      tau: c.method === "FE" ? "0 (fixed)" : fmt(c.tau_z, 4),
      i2: c.I2 != null ? fmt(c.I2, 1) + "%" : "—",
      q: fmt(c.Q, 2) + " (" + c.df + ")",
    };
  }
  function renderSensitivity() {
    var host = $("alm-plus-sens"), studies = currentStudies();
    if (!host) return;
    if (!studies) { _plus = null; host.innerHTML = "<p role='status'>Enter at least 2 studies (label, r, n) to see the sensitivity table.</p>"; renderProse(); return; }
    var sens = P.sensitivity(studies, { method: currentMethod(), test: state.test });
    state.sens = sens; _plus = sens;
    var rows = sens.cells.map(function (c) {
      var t = cellText(c), cur = c.method === sens.current.method && c.test === sens.current.test;
      var notes = [];
      if (c.applicable && c.narrower_than_wald) notes.push("HKSJ interval narrower than Wald (q < 1)");
      if (c.applicable && c.zero_width_ci) notes.push("zero-width CI: all effects identical");
      if (c.applicable && c.pi_equals_ci) notes.push("τ² = 0: PI equals this CI");
      if (!c.applicable) notes.push(c.reason);
      return "<tr" + (cur ? " class='plus-current' aria-current='true'" : "") + "><th scope='row'>" + esc(c.method) + "</th><td>" + esc(P.TEST_NAMES[c.test]) + (cur ? " <span class='plus-tag'>(current)</span>" : "") +
        "</td><td>" + t.est + "</td><td>" + t.pi + "</td><td>" + t.tau2 + "</td><td>" + t.tau + "</td><td>" + t.i2 + "</td><td>" + t.q + "</td><td>" + esc(notes.join("; ")) + "</td></tr>";
    }).join("");
    host.innerHTML = "<table class='plus-table'><caption>Sensitivity of the pooled correlation (k = " + sens.k + ") to the τ² estimator and the confidence-interval method. 95% PI = μ ± t(0.975, k − 1)·√(τ² + SE²), back-transformed to r.</caption>" +
      "<thead><tr><th scope='col'>Estimator</th><th scope='col'>CI method</th><th scope='col'>Pooled r [95% CI]</th><th scope='col'>95% PI (r)</th><th scope='col'>τ² (z)</th><th scope='col'>τ (z)</th><th scope='col'>I²</th><th scope='col'>Q (df)</th><th scope='col'>Notes</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table>";
    renderProse();
  }

  // ---------- C: leave-one-out ----------
  function looSvg(L) {
    var W = 560, rowH = 22, H = 40 + (L.rows.length + 1) * rowH + 30, Lm = 170, Rm = 30, pw = W - Lm - Rm;
    var lo = Math.min(L.full.r_lo, Math.min.apply(null, L.rows.map(function (r) { return r.r_lo; })));
    var hi = Math.max(L.full.r_hi, Math.max.apply(null, L.rows.map(function (r) { return r.r_hi; })));
    var pad = (hi - lo) * 0.05 || 0.05; lo = Math.max(-1, lo - pad); hi = Math.min(1, hi + pad);
    var x = function (v) { return Lm + (v - lo) / (hi - lo) * pw; };
    var p = ["<svg xmlns='http://www.w3.org/2000/svg' role='img' aria-label='Leave-one-out forest plot: pooled r with each study omitted, k = " + L.k + "' viewBox='0 0 " + W + " " + H + "' width='100%' style='max-width:" + W + "px' font-family='system-ui,sans-serif'>"];
    p.push("<title>Leave-one-out forest plot</title>");
    if (lo < 0 && hi > 0) p.push("<line x1='" + x(0) + "' y1='30' x2='" + x(0) + "' y2='" + (H - 30) + "' stroke='currentColor' stroke-opacity='0.6' stroke-dasharray='3,3'/>");
    p.push("<line x1='" + x(L.full.r) + "' y1='30' x2='" + x(L.full.r) + "' y2='" + (H - 30) + "' class='plus-loo-full'/>");
    L.rows.forEach(function (r, i) {
      var y = 40 + i * rowH;
      p.push("<text x='8' y='" + (y + 4) + "' font-size='11' fill='currentColor'>Omit " + esc(r.omitted).slice(0, 26) + "</text>");
      p.push("<line x1='" + x(r.r_lo) + "' y1='" + y + "' x2='" + x(r.r_hi) + "' y2='" + y + "' class='plus-loo-ci" + (r.changes_ci_excludes_0 ? " plus-loo-flag" : "") + "'/>");
      p.push("<circle cx='" + x(r.r) + "' cy='" + y + "' r='3.5' class='plus-loo-pt'/>");
    });
    [lo, (lo + hi) / 2, hi].forEach(function (t) { p.push("<text x='" + x(t) + "' y='" + (H - 12) + "' text-anchor='middle' font-size='10' fill='currentColor'>" + t.toFixed(2) + "</text>"); });
    p.push("<text x='" + (Lm + pw / 2) + "' y='" + (H - 0) + "' text-anchor='middle' font-size='10' fill='currentColor'>pooled r with the study omitted</text>");
    p.push("</svg>");
    return p.join("");
  }
  function renderLoo() {
    var host = $("alm-plus-loo"), studies = currentStudies();
    if (!host) return;
    if (!studies) { host.innerHTML = ""; state.loo = null; return; }
    var L = P.leaveOneOut(studies, currentMethod(), state.test);
    state.loo = L;
    if (_plus) _plus.loo = L;
    if (L.refused) { host.innerHTML = "<p role='status' class='plus-refusal'>" + esc(L.reason) + "</p>"; return; }
    var big = L.rows[L.largest_abs_delta_index - 1];
    var sum = "Full analysis: r = " + fmt(L.full.r) + " [" + fmt(L.full.r_lo) + ", " + fmt(L.full.r_hi) + "]; the CI " + (L.full.ci_excludes_0 ? "excludes" : "includes") + " 0. " +
      (L.n_changes_ci_excludes_0 ? L.n_changes_ci_excludes_0 + " omission" + (L.n_changes_ci_excludes_0 === 1 ? "" : "s") + " change whether the CI excludes 0. " : "No single omission changes whether the CI excludes 0. ") +
      "Largest change in r: omitting " + esc(big.omitted) + " (Δr = " + fmt(big.delta_r) + ").";
    var rows = L.rows.map(function (r) {
      return "<tr" + (r.changes_ci_excludes_0 ? " class='plus-flag'" : "") + "><th scope='row'>" + esc(r.omitted) + "</th><td>" + fmt(r.r) + " [" + fmt(r.r_lo) + ", " + fmt(r.r_hi) + "]</td><td>" +
        (r.r_pi_lo != null ? "[" + fmt(r.r_pi_lo) + ", " + fmt(r.r_pi_hi) + "]" : "—") + "</td><td>" + (r.method === "FE" ? "0 (fixed)" : fmt(r.tau2_z, 4)) + "</td><td>" + (r.I2 != null ? fmt(r.I2, 1) + "%" : "—") +
        "</td><td>" + fmt(r.delta_r) + "</td><td>" + (r.changes_ci_excludes_0 ? "omitting changes whether CI excludes 0" : "") + (r.omitted_index === L.largest_abs_delta_index ? (r.changes_ci_excludes_0 ? "; " : "") + "largest |Δr|" : "") + "</td></tr>";
    }).join("");
    host.innerHTML = "<p role='status'>" + sum + "</p>" + looSvg(L) +
      "<table class='plus-table'><caption>Leave-one-out (" + esc(P.METHOD_NAMES[L.method]) + ", " + esc(P.TEST_NAMES[L.test]) + "): each row omits one study. PI uses t(0.975, k − 2).</caption>" +
      "<thead><tr><th scope='col'>Omitted study</th><th scope='col'>Pooled r [95% CI]</th><th scope='col'>95% PI (r)</th><th scope='col'>τ² (z)</th><th scope='col'>I²</th><th scope='col'>Δr</th><th scope='col'>Flags</th></tr></thead><tbody>" + rows + "</tbody></table>";
  }

  // ---------- D: plain language + Methods ----------
  function currentCell() { return state.sens && !state.sens.refused ? P.find(state.sens.cells, state.sens.current.method, state.sens.current.test) : null; }
  function renderProse() {
    var host = $("alm-plus-prose"); if (!host) return;
    var c = currentCell();
    if (!c || !c.applicable) { host.innerHTML = c ? "<p>" + esc(c.reason) + ". Choose Wald z for the fixed-effect model.</p>" : ""; return; }
    var pl = P.plainLanguage(c, { benchmark: state.benchmark });
    var mt = P.methodsText(c, { text: (window.AlmCorrPlusScope && window.AlmCorrPlusScope.text) || "" });
    host.innerHTML = "<h3>In plain language</h3><p id='alm-plus-summary'>" + esc(pl.summary) + "</p><ul>" + pl.caveats.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      "<h3>Methods and Results text</h3><p id='alm-plus-methods'>" + esc(mt.methods) + "</p><p id='alm-plus-results'>" + esc(mt.results) + "</p>";
  }

  // ---------- B: R script ----------
  function download(name, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" }), url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }
  function rScriptNow() {
    var studies = currentStudies(), msg = $("alm-plus-rmsg");
    try {
      if (!studies) throw new Error("Enter at least 2 studies first.");
      var s = P.rScript(studies, { method: currentMethod(), test: state.test, loo: $("alm-plus-rloo").checked && studies.length >= 3 });
      download("correlation-ma-" + currentMethod() + "-" + state.test + ".R", s);
      if (msg) msg.textContent = "R script downloaded (" + currentMethod() + ", " + P.TEST_NAMES[state.test] + ").";
    } catch (e) { if (msg) msg.textContent = "Not exported: " + e.message.replace(/^rScript: /, ""); }
  }

  // ---------- U3/U4: live summary + forest accessibility ----------
  var liveTimer = null;
  function onHeadline() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { var l = $("alm-live"); if (l) l.textContent = $("headline").textContent; }, 500);
  }
  function labelForest() {
    var svg = document.querySelector("#forest-host svg"), last = window._almLastCorrMA && window._almLastCorrMA();
    if (!svg || !last) return;
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Forest plot of " + last.k + " studies on the r scale; pooled r = " + fmt(last.r) + " [" + fmt(last.r_lo) + ", " + fmt(last.r_hi) + "]");
  }

  var refreshTimer = null;
  function refresh() {
    renderNotice(); labelForest(); onHeadline();
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      renderSensitivity();
      if (state.loo) renderLoo();
    }, 0);
  }

  function mount() {
    var sec = $("alm-plus"); if (!sec || !P) return;
    EXAMPLE_TEXT = $("f-data").value; // the page preloads its example before this script runs
    sec.innerHTML =
      "<h2>Sensitivity, leave-one-out and reporting</h2>" +
      "<fieldset><legend>Confidence-interval method</legend>" +
      P.TESTS.map(function (t) { return "<label><input type='radio' name='alm-plus-test' value='" + t + "'" + (t === state.test ? " checked" : "") + "> " + esc(P.TEST_NAMES[t]) + "</label>"; }).join(" ") +
      "</fieldset>" +
      "<div id='alm-plus-sens'></div>" +
      "<p><button type='button' id='alm-plus-loo-btn'>Run leave-one-out</button></p><div id='alm-plus-loo'></div>" +
      "<p><button type='button' id='alm-plus-r'>Download R script</button> <label class='plus-inline'><input type='checkbox' id='alm-plus-rloo'> include leave-one-out</label> <span id='alm-plus-rmsg' role='status'></span></p>" +
      "<fieldset><legend>Benchmarks for describing |r|</legend><label><input type='radio' name='alm-plus-bench' value='cohen' checked> Cohen 1988 (.10 / .30 / .50)</label> " +
      "<label><input type='radio' name='alm-plus-bench' value='gignac'> Gignac &amp; Szodorai 2016 (.10 / .20 / .30)</label></fieldset>" +
      "<div id='alm-plus-prose'></div><div id='alm-plus-export'></div>" +
      "<div id='alm-live' class='plus-sr' aria-live='polite'></div>";
    sec.addEventListener("change", function (e) {
      if (e.target.name === "alm-plus-test") { state.test = e.target.value; renderSensitivity(); if (state.loo) renderLoo(); }
      if (e.target.name === "alm-plus-bench") { state.benchmark = e.target.value; renderProse(); }
    });
    $("alm-plus-loo-btn").addEventListener("click", function () { if (!$("f-data").disabled) renderLoo(); });
    $("alm-plus-r").addEventListener("click", function () { if (!$("f-data").disabled) rScriptNow(); });
    var tools = $("f-tools");
    if (tools) {
      tools.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        if (b.dataset.tool === "example") setData(EXAMPLE_TEXT);
        if (b.dataset.tool === "clear") setData("");
        if (b.dataset.tool === "convert") setData(convertDelimited($("f-data").value));
      });
    }
    $("f-data").addEventListener("input", refresh);
    $("f-method").addEventListener("change", refresh);
    new MutationObserver(syncToolState).observe($("f-data"), { attributes: true, attributeFilter: ["disabled"] });
    new MutationObserver(labelForest).observe($("forest-host"), { childList: true });
    if (window.alm && window.alm.resultsExport) {
      window.alm.resultsExport({ target: "#alm-plus-export", basename: "correlation-ma-sensitivity", getResults: function () { return _plus || {}; } });
    }
    refresh();
  }
  // Panel state for the in-page extras replay (validate/plus-adapter.js): it saves the user's choices
  // before replaying the pinned corpus through this panel and puts them back afterwards.
  function snapshot() { return { test: state.test, benchmark: state.benchmark, loo: !!state.loo }; }
  function restore(s) {
    state.test = s.test; state.benchmark = s.benchmark; state.loo = null;
    document.querySelectorAll("input[name='alm-plus-test']").forEach(function (r) { r.checked = r.value === s.test; });
    document.querySelectorAll("input[name='alm-plus-bench']").forEach(function (r) { r.checked = r.value === s.benchmark; });
    var host = $("alm-plus-loo"); if (host) host.innerHTML = "";
    renderSensitivity(); if (s.loo) renderLoo();
  }
  window.AlmCorrPlusUI = { classify: classify, convertDelimited: convertDelimited, refresh: refresh, snapshot: snapshot, restore: restore };
  if (document.readyState !== "loading") mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
