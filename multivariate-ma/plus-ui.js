/* multivariate-ma plus panel UI (#alm-plus). Calculations live in plus.js (AlmMvPlus). */
(function () {
  'use strict';
  var P = window.AlmMvPlus, F = P.fmt, Z = P.Z;
  function el(id) { return document.getElementById(id); }
  var state = { parsed: null, res: null, sweep: null, grid: null };
  function td(tr, text, key, tag) { var c = document.createElement(tag || 'td'); c.textContent = text; if (key) c.setAttribute('data-q', key); tr.appendChild(c); return c; }
  function build() { return window.AlmBuildInfo && window.AlmBuildInfo.sha ? String(window.AlmBuildInfo.sha).slice(0, 12) : ''; }

  function renderComparison(parsed, res) {
    var body = el('plus-cmp-body'); body.replaceChildren();
    if (!res || res.status !== 'ok') { var tr = document.createElement('tr'), c = td(tr, 'Not available: ' + (res ? res.reason : 'no data')); c.colSpan = 8; body.appendChild(tr); return; }
    var f = res.fit;
    parsed.outcomes.forEach(function (o, j) {
      var a = document.createElement('tr');
      td(a, o, null, 'th').setAttribute('scope', 'row'); td(a, 'Multivariate (bivariate REML)');
      td(a, F.ci(f.mu[j], f.muSE[j]), 'mv.' + j + '.ci'); td(a, F.f4(f.muSE[j]), 'mv.' + j + '.se'); td(a, F.z(res.tests[j].z), 'mv.' + j + '.z'); td(a, F.p(res.tests[j].p), 'mv.' + j + '.p');
      td(a, F.sig4(f.G[j][j]), 'mv.' + j + '.tau2'); td(a, res.varRatio[j] === null ? '—' : F.f3(res.varRatio[j]), 'ratio.' + j);
      body.appendChild(a);
      var b = document.createElement('tr'), u = res.univariate[j];
      td(b, o, null, 'th').setAttribute('scope', 'row'); td(b, 'Univariate (REML, same studies)');
      if (u.status !== 'ok') { var c2 = td(b, 'Refused: ' + u.reason); c2.colSpan = 6; }
      else { td(b, F.ci(u.mu, u.se), 'uni.' + j + '.ci'); td(b, F.f4(u.se), 'uni.' + j + '.se'); td(b, F.z(u.z), 'uni.' + j + '.z'); td(b, F.p(u.p), 'uni.' + j + '.p'); td(b, F.sig4(u.tau2), 'uni.' + j + '.tau2'); td(b, '');
      }
      body.appendChild(b);
    });
  }

  function renderTexts() {
    var s = state; if (!s.parsed) return;
    var t = P.texts(s.parsed, s.res || { status: 'refused', reason: 'no data' }, s.sweep);
    el('plus-interpretation').textContent = t.interpretation; el('plus-methods').value = t.methods; el('plus-results').value = t.results;
  }

  function sweepHead(parsed) {
    var h = el('plus-sweep-head'); h.replaceChildren(); var tr = document.createElement('tr');
    ['ρw', 'Status', parsed.outcomes[0] + ' mean [95% CI]', parsed.outcomes[1] + ' mean [95% CI]', 'τ² ' + parsed.outcomes[0], 'τ² ' + parsed.outcomes[1], 'Between-study ρ', 'logLik'].forEach(function (x) { td(tr, x, null, 'th').setAttribute('scope', 'col'); });
    h.appendChild(tr);
  }
  function renderSweepTable() {
    var body = el('plus-sweep-body'); body.replaceChildren(); if (!state.sweep) return;
    sweepHead(state.parsed);
    state.sweep.forEach(function (s, i) {
      var tr = document.createElement('tr'); td(tr, String(s.rhoW), 'sweep.' + i + '.rhoW', 'th').setAttribute('scope', 'row');
      if (s.status !== 'ok') { td(tr, 'Refused', 'sweep.' + i + '.status'); var c = td(tr, s.reason, 'sweep.' + i + '.reason'); c.colSpan = 6; }
      else {
        var f = s.fit; td(tr, s.boundary ? 'ok (' + s.boundary + ')' : 'ok', 'sweep.' + i + '.status');
        td(tr, F.ci(f.mu[0], f.muSE[0]), 'sweep.' + i + '.ci0'); td(tr, F.ci(f.mu[1], f.muSE[1]), 'sweep.' + i + '.ci1');
        td(tr, F.sig4(f.G[0][0]), 'sweep.' + i + '.tau20'); td(tr, F.sig4(f.G[1][1]), 'sweep.' + i + '.tau21');
        td(tr, f.rho === null ? 'undefined' : F.f3(f.rho), 'sweep.' + i + '.rho'); td(tr, F.f3(f.logLik), 'sweep.' + i + '.logLik');
      }
      body.appendChild(tr);
    });
  }
  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 5, 10].map(function (m) { return m * mag; }).find(function (s) { return s >= raw; });
    var out = []; for (var v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
    var d = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); return out.map(function (x) { return { v: x, label: x.toFixed(d) }; });
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;'); }
  function sweepSVG(parsed, sw) {
    var ok = sw.filter(function (s) { return s.status === 'ok'; }); if (!ok.length) return '';
    var W = 680, H = 314, top = 48, bottom = 46, ph = H - top - bottom, pw = 270, lefts = [62, 62 + pw + 70];
    var dark = window.matchMedia && matchMedia('(prefers-color-scheme:dark)').matches, ink = dark ? '#e7e4dc' : '#15181d', frame = dark ? '#2f343a' : '#d9d5cc';
    var xlo = Math.min.apply(null, sw.map(function (s) { return s.rhoW; }).filter(Number.isFinite)), xhi = Math.max.apply(null, sw.map(function (s) { return s.rhoW; }).filter(Number.isFinite));
    if (!(xhi > xlo)) { xlo -= 0.1; xhi += 0.1; }
    var desc = 'Pooled mean and 95% CI of ' + esc(parsed.outcomes[0]) + ' and ' + esc(parsed.outcomes[1]) + ' against the assumed within-study correlation, ' + ok.length + ' fits; values are in the sweep table.';
    var p = ["<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + W + " " + H + "' width='" + W + "' height='" + H + "' font-family='system-ui,sans-serif' role='img' aria-labelledby='mv-sweep-title mv-sweep-desc'>",
      "<title id='mv-sweep-title'>Within-study correlation sensitivity</title><desc id='mv-sweep-desc'>" + desc + "</desc>",
      "<rect width='" + W + "' height='" + H + "' fill='" + (dark ? '#1c1f23' : '#fff') + "'/>"];
    [0, 1].forEach(function (j) {
      var L = lefts[j], lo = Math.min.apply(null, ok.map(function (s) { return s.fit.mu[j] - Z * s.fit.muSE[j]; })), hi = Math.max.apply(null, ok.map(function (s) { return s.fit.mu[j] + Z * s.fit.muSE[j]; }));
      var pad = (hi - lo) * 0.08 || 0.1; lo -= pad; hi += pad;
      var X = function (v) { return L + (v - xlo) / (xhi - xlo) * pw; }, Y = function (v) { return top + ph - (v - lo) / (hi - lo) * ph; };
      p.push("<g data-panel='" + j + "'><rect x='" + L + "' y='" + top + "' width='" + pw + "' height='" + ph + "' fill='none' stroke='" + frame + "'/>");
      if (lo < 0 && hi > 0) p.push("<line x1='" + L + "' x2='" + (L + pw) + "' y1='" + Y(0) + "' y2='" + Y(0) + "' stroke='" + ink + "' stroke-dasharray='3 3' stroke-opacity='.6'/>");
      niceTicks(xlo, xhi, 5).forEach(function (t) { p.push("<line data-axis='x' x1='" + X(t.v) + "' x2='" + X(t.v) + "' y1='" + (top + ph) + "' y2='" + (top + ph + 5) + "' stroke='" + ink + "'/><text x='" + X(t.v) + "' y='" + (top + ph + 16) + "' text-anchor='middle' font-size='10' fill='" + ink + "'>" + t.label + "</text>"); });
      niceTicks(lo, hi, 5).forEach(function (t) { p.push("<line data-axis='y' x1='" + (L - 5) + "' x2='" + L + "' y1='" + Y(t.v) + "' y2='" + Y(t.v) + "' stroke='" + ink + "'/><text x='" + (L - 7) + "' y='" + (Y(t.v) + 3) + "' text-anchor='end' font-size='10' fill='" + ink + "'>" + t.label + "</text>"); });
      var band = ok.map(function (s) { return X(s.rhoW) + ',' + Y(s.fit.mu[j] + Z * s.fit.muSE[j]); }).concat(ok.slice().reverse().map(function (s) { return X(s.rhoW) + ',' + Y(s.fit.mu[j] - Z * s.fit.muSE[j]); }));
      p.push("<polygon points='" + band.join(' ') + "' fill='#2c5e8a' fill-opacity='0.15' stroke='none'/>");
      p.push("<polyline points='" + ok.map(function (s) { return X(s.rhoW) + ',' + Y(s.fit.mu[j]); }).join(' ') + "' fill='none' stroke='#2c5e8a' stroke-width='1.6'/>");
      ok.forEach(function (s) { p.push("<circle cx='" + X(s.rhoW) + "' cy='" + Y(s.fit.mu[j]) + "' r='2.6' fill='#2c5e8a'/>"); });
      if (parsed.mode === 'rhoW' && parsed.rhoW >= xlo && parsed.rhoW <= xhi) p.push("<line x1='" + X(parsed.rhoW) + "' x2='" + X(parsed.rhoW) + "' y1='" + top + "' y2='" + (top + ph) + "' stroke='#b23a48' stroke-dasharray='4 3'/>");
      p.push("<text x='" + (L + pw / 2) + "' y='" + (H - 8) + "' text-anchor='middle' font-size='11' fill='" + ink + "'>Assumed within-study correlation ρw</text>");
      p.push("<text x='" + (L + pw / 2) + "' y='" + (top - 8) + "' text-anchor='middle' font-size='11' font-weight='600' fill='" + ink + "'>Pooled " + esc(parsed.outcomes[j]) + "</text></g>");
    });
    p.push("<g font-size='10' fill='" + ink + "'><line x1='" + (W - 250) + "' x2='" + (W - 234) + "' y1='12' y2='12' stroke='#2c5e8a' stroke-width='1.6'/><text x='" + (W - 230) + "' y='15'>Pooled mean</text><rect x='" + (W - 160) + "' y='7' width='14' height='10' fill='#2c5e8a' fill-opacity='.15'/><text x='" + (W - 142) + "' y='15'>95% CI</text>" +
      (parsed.mode === 'rhoW' ? "<line x1='" + (W - 96) + "' x2='" + (W - 96) + "' y1='6' y2='18' stroke='#b23a48' stroke-dasharray='4 3'/><text x='" + (W - 90) + "' y='15'>current ρw</text>" : '') + "</g>");
    p.push('</svg>'); return p.join('');
  }

  function update(parsed, res) {
    state.parsed = parsed; state.res = res; state.sweep = null;
    renderComparison(parsed, res); el('plus-sweep-plot').innerHTML = ''; el('plus-sweep-body').replaceChildren(); el('plus-sweep-head').replaceChildren();
    el('plus-status').textContent = res && res.status === 'ok' ? 'Sweep not run for the current data.' : 'Sweep unavailable: ' + (res ? res.reason : 'no data');
    renderTexts();
  }
  function runSweep() {
    if (!state.parsed) return null;
    var g = P.makeGrid(Number(el('plus-from').value), Number(el('plus-to').value), Number(el('plus-step').value));
    if (g.error) { el('plus-status').textContent = 'Refused: ' + g.error; return null; }
    if (state.parsed.rows.length < 2) { el('plus-status').textContent = 'Refused: at least two complete studies are required.'; return null; }
    state.grid = g.grid; state.sweep = P.sweep(state.parsed, g.grid);
    var ok = state.sweep.filter(function (s) { return s.status === 'ok'; }).length;
    el('plus-status').textContent = 'Sweep complete: ' + ok + ' of ' + g.grid.length + ' ρw values fitted' + (ok < g.grid.length ? '; ' + (g.grid.length - ok) + ' refused (see table).' : '.');
    el('plus-sweep-plot').innerHTML = sweepSVG(state.parsed, state.sweep); renderSweepTable(); renderTexts();
    return state.sweep;
  }
  function resultsJSON() {
    var s = state, last = window._almLastMultivariate ? window._almLastMultivariate() : null;
    return { _schema: 'multivariate-ma-plus-export-v1', build: build(), input: s.parsed && { mode: s.parsed.mode, rhoW: s.parsed.rhoW, outcomes: s.parsed.outcomes, rows: s.parsed.rows, omitted: s.parsed.omitted },
      result: last, univariate: s.res && s.res.univariate || null, varRatio: s.res && s.res.varRatio || null,
      sweep: s.sweep && s.sweep.map(function (x) { return x.status === 'ok' ? { rhoW: x.rhoW, status: 'ok', mu: x.fit.mu, muSE: x.fit.muSE, muVcov: x.fit.muVcov, G: x.fit.G, rho: x.fit.rho, logLik: x.fit.logLik, z: x.tests.map(function (t) { return t.z; }), p: x.tests.map(function (t) { return t.p; }), boundary: x.boundary } : x; }) || null };
  }
  function rScript() {
    var g = state.grid || P.makeGrid(Number(el('plus-from').value), Number(el('plus-to').value), Number(el('plus-step').value)).grid;
    return P.rScript(state.parsed, g, { build: build() });
  }
  var page = window.AlmMvPage;
  function copy(id, btn) { var t = el(id); t.select(); var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = btn.dataset.label; }, 1200); }; btn.dataset.label = btn.dataset.label || btn.textContent; if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, function () { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); } }
  el('plus-run').addEventListener('click', runSweep);
  el('plus-copy-methods').addEventListener('click', function (e) { copy('plus-methods', e.currentTarget); });
  el('plus-copy-results').addEventListener('click', function (e) { copy('plus-results', e.currentTarget); });
  el('plus-dl-r').addEventListener('click', function () { if (state.parsed && state.parsed.rows.length >= 2) page.download('multivariate-ma-analysis.R', new Blob([rScript()], { type: 'text/plain' })); });
  el('plus-dl-json').addEventListener('click', function () { page.download('multivariate-ma-results.json', new Blob([JSON.stringify(resultsJSON(), null, 2)], { type: 'application/json' })); });
  el('plus-dl-sweep-svg').addEventListener('click', function () { var s = el('plus-sweep-plot').innerHTML; if (s) page.download('multivariate-ma-sweep.svg', new Blob([s], { type: 'image/svg+xml' })); });
  el('plus-dl-sweep-png').addEventListener('click', function () { var s = el('plus-sweep-plot').innerHTML; if (s) page.svgPng(s, 'multivariate-ma-sweep.png'); });
  // Render a given result/sweep into the panel tables (validation replay; no recomputation).
  function renderFor(parsed, res, sw) { state.parsed = parsed; state.res = res; state.sweep = sw; renderComparison(parsed, res); renderSweepTable(); }
  function snapshot() { return { parsed: state.parsed, res: state.res, sweep: state.sweep, grid: state.grid }; }
  function restore(s) { state.parsed = s.parsed; state.res = s.res; state.sweep = s.sweep; state.grid = s.grid; if (s.parsed) { renderComparison(s.parsed, s.res); renderSweepTable(); el('plus-sweep-plot').innerHTML = s.sweep ? sweepSVG(s.parsed, s.sweep) : ''; renderTexts(); } }
  window.AlmMvPlusUI = { renderFor: renderFor, snapshot: snapshot, restore: restore, sweepSVG: sweepSVG, update: update, runSweep: runSweep, resultsJSON: resultsJSON, rScript: rScript, state: function () { return state; } };
  if (page) page.run();
})();
