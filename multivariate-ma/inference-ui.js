/* multivariate-ma/inference-ui.js — renders the "Heterogeneity, fit statistics and further inference" panel
 * from multivariate-ma/inference.js. Values are read from the page's existing fit; nothing already displayed
 * elsewhere on the page changes. window._almLastMvInference() returns the values behind the tables. */
(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  function fmt(x, d) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(d == null ? 3 : d) : "—"; }
  function fmtP(p) { return (typeof p === "number" && isFinite(p)) ? (p < 1e-4 ? "< 0.0001" : p.toFixed(4)) : "—"; }
  var state = { parsed: null, fit: null, result: null };
  window._almLastMvInference = function () { return state.result; };

  function row(body, cells, header) {
    var tr = document.createElement("tr");
    cells.forEach(function (c, j) { var td = document.createElement(j === 0 && header ? "th" : "td"); if (j === 0 && header) td.setAttribute("scope", "row"); td.textContent = c; tr.appendChild(td); });
    body.appendChild(tr);
  }
  function clear() {
    ["inf-het-body", "inf-fe-body", "inf-re-body", "inf-joint-body", "inf-fit-body"].forEach(function (id) { el(id).innerHTML = ""; });
  }
  function render() {
    var status = el("inf-status"); clear(); state.result = null;
    var parsed = state.parsed, f = state.fit;
    if (!parsed || !f) { status.textContent = "No fitted model (enter at least two complete studies)."; return; }
    var L = el("inf-level").value, r = window.AlmMvInference.compute(parsed.rows, f, L);
    if (r.status !== "ok") { status.textContent = "Refused: " + r.reason; return; }
    state.result = r;
    var o = parsed.outcomes, lv = String(r.level);
    status.textContent = "k = " + r.k + " studies; confidence level " + lv + "%.";
    Array.prototype.forEach.call(document.querySelectorAll(".inf-lv"), function (s) { s.textContent = lv; });
    var hb = el("inf-het-body");
    ["Overall (both outcomes)", o[0], o[1]].forEach(function (name, j) { row(hb, [name, fmt(r.het.Q[j], 3), String(r.het.df[j]), fmtP(r.het.p[j]), fmt(r.het.I2[j], 1) + "%"], true); });
    var fb = el("inf-fe-body");
    [0, 1].forEach(function (j) { row(fb, [o[j], fmt(r.fe.mu[j], 4) + " [" + fmt(r.fe.lo[j], 4) + ", " + fmt(r.fe.hi[j], 4) + "]", fmt(r.fe.se[j], 4), fmt(r.fe.z[j], 3), fmtP(r.fe.p[j])], true); });
    var rb = el("inf-re-body");
    [0, 1].forEach(function (j) { row(rb, [o[j], fmt(r.re.mu[j], 4) + " [" + fmt(r.re.lo[j], 4) + ", " + fmt(r.re.hi[j], 4) + "]", "[" + fmt(r.pi.lo[j], 4) + ", " + fmt(r.pi.hi[j], 4) + "]"], true); });
    var jb = el("inf-joint-body");
    row(jb, ["Omnibus Wald test (both means = 0)", "QM = " + fmt(r.omnibus.QM, 3) + ", df = " + r.omnibus.df + ", p = " + fmtP(r.omnibus.p)], true);
    row(jb, ["Contrast " + o[0] + " − " + o[1], fmt(r.contrast.est, 4) + " [" + fmt(r.contrast.lo, 4) + ", " + fmt(r.contrast.hi, 4) + "], SE " + fmt(r.contrast.se, 4) + ", z = " + fmt(r.contrast.z, 3) + ", p = " + fmtP(r.contrast.p)], true);
    row(jb, ["Correlation of pooled means (random effects)", fmt(r.re.cor, 4)], true);
    row(jb, ["Correlation of pooled means (common effect)", fmt(r.fe.cor, 4)], true);
    var sb = el("inf-fit-body"), s = r.fitstats;
    row(sb, [fmt(s.logLik, 4), fmt(s.deviance, 4), fmt(s.AIC, 4), fmt(s.BIC, 4), fmt(s.AICc, 4), String(s.parms), String(s.dfRes)]);
  }
  function update(parsed, fit) { state.parsed = parsed || null; state.fit = fit || null; render(); }
  el("inf-level").addEventListener("input", render);
  el("inf-dl-r").addEventListener("click", function () {
    if (!state.result || !state.parsed || !window.AlmMvPage) return;
    window.AlmMvPage.download("multivariate-ma-inference.R", new Blob([window.AlmMvInference.rScript(state.parsed.rows, state.result.level)], { type: "text/plain" }));
  });
  el("inf-dl-json").addEventListener("click", function () {
    if (!state.result || !window.AlmMvPage) return;
    window.AlmMvPage.download("multivariate-ma-inference.json", new Blob([JSON.stringify(Object.assign({ _schema: "multivariate-ma-inference-v1", outcomes: state.parsed.outcomes }, state.result), null, 2)], { type: "application/json" }));
  });
  window.AlmMvInferenceUI = { update: update, render: render, fmt: fmt, fmtP: fmtP };
  if (window.AlmMvPage) { var c = window.AlmMvPage.current(); update(c.parsed, c.fit); }
})();
