/* GOSH exact all-subsets enumeration for k > 15: page controller (Web Worker, progress, cancel, density plot,
 * per-study with/without table). The engine is gosh/exact-enum.js. gosh/index.html calls
 *   AlmGoshExact.request({rows, model, apply, axes})  after its own (unchanged) sampled run for k > 15, and
 *   AlmGoshExact.request(null)                         for k <= 15 or refused input.
 * Validation runs of the page never call request(), so the pinned sampled replays are untouched.
 */
(function () {
  'use strict';
  // Conservative automatic workload limits, not a runtime guarantee; manual exact mode permits up to MAX_K.
  var AUTO_MAX_K = { FE: 26, DL: 25 };
  var ENGINE_MAX_K = 30;
  var NS_PER_SUBSET = { FE: 450, DL: 1000 }; // both passes; used only for the displayed estimate
  var el = function (id) { return document.getElementById(id); };
  var panel = el('alm-exact');
  if (!panel) return;
  panel.className = 'panel'; panel.style.gridColumn = '1 / -1'; panel.style.minWidth = '0';
  panel.innerHTML = '<style>#alm-exact table{border-collapse:collapse;font-size:.85rem}#alm-exact th,#alm-exact td{padding:.35rem .6rem;border-bottom:1px solid var(--border);white-space:nowrap;text-align:right}#alm-exact th:first-child{text-align:left}#alm-exact caption{text-align:left;padding:.5rem 0}#exact-progress{width:100%}</style>' +
    '<h2>Exact all-subsets enumeration (k &gt; 15)</h2>' +
    '<p id="exact-status" role="status" aria-live="polite">Applies when more than 15 studies are entered.</p>' +
    '<progress id="exact-progress" max="1" value="0" hidden></progress>' +
    '<p><button type="button" id="exact-run">Run exact enumeration</button> <button type="button" id="exact-cancel" hidden>Cancel</button></p>' +
    '<div style="overflow:auto"><table id="exact-summary"><caption>Exact summaries over every non-empty subset</caption><tbody></tbody></table></div>' +
    '<div style="overflow:auto"><table id="exact-perstudy"><caption>Per-study inclusion: mean over all subsets with and without each study (exact)</caption><thead></thead><tbody></tbody></table></div>';

  var worker = null, current = null, cache = null, seq = 0;
  function key(rows, model) { return JSON.stringify([model, rows.map(function (r) { return [r.te, r.se]; })]); }
  function fmt(x, d) { return Number.isFinite(x) ? x.toFixed(d) : '—'; }
  function estimateSeconds(k, model) { return Math.pow(2, k) * NS_PER_SUBSET[model] / 1e9; }
  function mode() { var m = el('enum-mode'); return m ? m.value : 'auto'; }

  function stop() {
    if (worker) { worker.terminate(); worker = null; }
    if (current && current.timer) clearTimeout(current.timer);
    current = null;
    el('exact-progress').hidden = true; el('exact-cancel').hidden = true;
  }
  function clearTables() { el('exact-summary').hidden = true; el('exact-perstudy').hidden = true; el('exact-summary').tBodies[0].replaceChildren(); el('exact-perstudy').tHead.replaceChildren(); el('exact-perstudy').tBodies[0].replaceChildren(); }

  function renderTables(res, rows) {
    el('exact-summary').hidden = false; el('exact-perstudy').hidden = false;
    var label = 'all 2^' + res.k + '-1 subsets (exact): ' + res.n_subsets.toLocaleString();
    el('exact-summary').caption.textContent = label;
    el('exact-perstudy').caption.textContent = 'Per-study with/without means over ' + label;
    var body = el('exact-summary').tBodies[0]; body.replaceChildren();
    var items = [['Subsets enumerated', res.n_subsets.toLocaleString() + ' of ' + res.expected_subsets.toLocaleString()],
      ['Estimate: median (q25, q75)', fmt(res.median_est, 4) + ' (' + fmt(res.q25_est, 4) + ', ' + fmt(res.q75_est, 4) + ')'],
      ['Estimate: mean [min, max]', fmt(res.mean_est, 4) + ' [' + fmt(res.min_est, 4) + ', ' + fmt(res.max_est, 4) + ']'],
      ['I² (%): median (q25, q75)', fmt(res.median_i2, 2) + ' (' + fmt(res.q25_i2, 2) + ', ' + fmt(res.q75_i2, 2) + ')'],
      ['I² (%): mean [min, max]', fmt(res.mean_i2, 2) + ' [' + fmt(res.min_i2, 2) + ', ' + fmt(res.max_i2, 2) + ']'],
      ['Subsets with I² = 0', res.zero_i2.toLocaleString()],
      ['Q: mean [min, max]', fmt(res.mean_q, 3) + ' [' + fmt(res.min_q, 3) + ', ' + fmt(res.max_q, 3) + ']']];
    if (res.model === 'DL') items.push(['DL τ²: mean [min, max]', fmt(res.mean_tau2, 4) + ' [' + fmt(res.min_tau2, 4) + ', ' + fmt(res.max_tau2, 4) + ']']);
    items.forEach(function (it) { var tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td'); th.scope = 'row'; th.textContent = it[0]; td.textContent = it[1]; tr.append(th, td); body.append(tr); });
    var head = el('exact-perstudy').tHead; head.replaceChildren();
    var hr = document.createElement('tr');
    ['Study', 'With: count', 'Without: count', 'With: mean estimate', 'Without: mean estimate', 'Difference: mean estimate', 'With: mean I²', 'Without: mean I²', 'Difference: mean I²'].forEach(function (t) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = t; hr.append(th); });
    head.append(hr);
    var pb = el('exact-perstudy').tBodies[0]; pb.replaceChildren();
    res.per_study.forEach(function (p, i) {
      var tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = (i + 1) + ': ' + rows[i].label; tr.append(th);
      [p.with_n.toLocaleString(), p.without_n.toLocaleString(), fmt(p.with_mean, 4), fmt(p.without_mean, 4), fmt(p.diff_mean, 4), fmt(p.with_i2, 2), fmt(p.without_i2, 2), fmt(p.diff_i2, 2)].forEach(function (v) { var td = document.createElement('td'); td.textContent = v; tr.append(td); });
      pb.append(tr);
    });
  }

  // Density plot in the page's GOSH frame (viewBox 600 x 420, plot area x 60..580, y 20..370). Each grid cell is a
  // rectangle whose opacity is log(1 + count) / log(1 + max count). Axis-control limits are honoured; cells outside
  // them are clipped.
  function renderDensity(res, axes) {
    var W = 600, H = 420, padL = 60, padR = 20, padT = 20, padB = 50, plotW = W - padL - padR, plotH = H - padT - padB;
    var g = res.grid, xMin = res.min_est, xMax = res.max_est;
    var pad = (xMax - xMin) * 0.1 || 0.1; xMin -= pad; xMax += pad;
    var yMin = 0, yMax = 100;
    if (axes && Array.isArray(axes.y)) { if (axes.y[0] !== null) yMin = axes.y[0]; if (axes.y[1] !== null) yMax = axes.y[1]; }
    if (axes && Array.isArray(axes.x)) { if (axes.x[0] !== null) xMin = axes.x[0]; if (axes.x[1] !== null) xMax = axes.x[1]; }
    if (![xMin,xMax,yMin,yMax,xMax-xMin,yMax-yMin].every(Number.isFinite) || !(xMax > xMin) || !(yMax > yMin)) return '';
    var X = function (v) { return padL + (v - xMin) / (xMax - xMin) * plotW; };
    var Y = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * plotH; };
    var parts = ['<defs><clipPath id="exact-clip"><rect x="60" y="20" width="520" height="350"/></clipPath></defs>'];
    parts.push('<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + plotH) + '" stroke="currentColor" opacity="0.5"/>');
    parts.push('<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (padL + plotW) + '" y2="' + (padT + plotH) + '" stroke="currentColor" opacity="0.5"/>');
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var v = yMin + f * (yMax - yMin); parts.push('<line x1="' + padL + '" y1="' + Y(v) + '" x2="' + (padL + plotW) + '" y2="' + Y(v) + '" stroke="currentColor" opacity="0.07"/><text x="' + (padL - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="currentColor" opacity="0.7">' + v.toFixed(0) + '%</text>'); });
    [xMin, (xMin + xMax) / 2, xMax].forEach(function (v) { parts.push('<line x1="' + X(v) + '" y1="' + (padT + plotH) + '" x2="' + X(v) + '" y2="' + (padT + plotH + 5) + '" stroke="currentColor" opacity="0.5"/><text x="' + X(v) + '" y="' + (padT + plotH + 18) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.7">' + v.toFixed(2) + '</text>'); });
    parts.push('<text x="' + (padL + plotW / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">Pooled effect</text>');
    parts.push('<text x="20" y="' + (padT + plotH / 2) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8" transform="rotate(-90 20 ' + (padT + plotH / 2) + ')">I&#178;</text>');
    var maxC = 0; for (var i = 0; i < g.counts.length; i++) if (g.counts[i] > maxC) maxC = g.counts[i];
    var dx = (g.x1 - g.x0) / g.nx, dy = (g.y1 - g.y0) / g.ny, lmax = Math.log1p(maxC), cells = 0;
    for (var iy = 0; iy < g.ny; iy++) for (var ix = 0; ix < g.nx; ix++) {
      var c = g.counts[iy * g.nx + ix]; if (!c) continue;
      var xa = X(g.x0 + ix * dx), xb = X(g.x0 + (ix + 1) * dx), ya = Y(g.y0 + (iy + 1) * dy), yb = Y(g.y0 + iy * dy);
      parts.push('<rect class="exact-cell" data-count="' + c + '" clip-path="url(#exact-clip)" x="' + xa.toFixed(2) + '" y="' + ya.toFixed(2) + '" width="' + Math.max(0.5, xb - xa).toFixed(2) + '" height="' + Math.max(0.5, yb - ya).toFixed(2) + '" fill="var(--accent)" fill-opacity="' + (0.08 + 0.92 * Math.log1p(c) / lmax).toFixed(3) + '"/>');
      cells++;
    }
    return parts.join('');
  }

  function finish(res, req) {
    cache = { key: req.key, result: res };
    el('exact-progress').hidden = true; el('exact-cancel').hidden = true;
    el('exact-status').textContent = 'Exact: all ' + res.n_subsets.toLocaleString() + ' non-empty subsets of k = ' + res.k + ' studies (' + res.model + '), streamed without storing them' +
      (res.timing ? ' in ' + ((res.timing.main_ms + res.timing.quantile_ms) / 1000).toFixed(1) + ' s' : '') + '. The scatter shows a 100 × 100 density of every subset.';
    renderTables(res, req.rows);
    show(res, req);
  }
  function show(res, req) {
    el('plot').innerHTML = renderDensity(res, req.axes ? req.axes() : null);
    var plotted = !!el('plot').innerHTML;
    el('plot-error').textContent = plotted ? '' : 'Plot cannot be displayed: invalid axis limits. Widen or reset the limits. Computed results are retained.';
    el('plot-note').textContent = plotted ? 'Exact enumeration: ' + res.n_subsets.toLocaleString() + ' subsets shown as a density (darker = more subsets).' : '';
    if (req.apply) req.apply(res);
  }

  function labelResult(result) {
    if (!result) return;
    var label = result.sampled ? 'random sample of ' + result.n_subsets.toLocaleString() :
      'all 2^' + result.k + '-1 subsets (exact): ' + result.n_subsets.toLocaleString();
    result.enumeration_label = label;
    var plot = el('plot');
    if (plot.innerHTML) plot.innerHTML = '<title>' + label + '</title><text x="60" y="12" font-size="10" fill="currentColor">' + label + '</text>' + plot.innerHTML;
    if (result.sampled) el('plot-note').textContent = label + '. ' + el('plot-note').textContent;
  }

  function startExact(req) {
    if (!req || req.rows.length > ENGINE_MAX_K) return;
    if (cache && cache.key === req.key) { stop(); finish(cache.result, req); return; }
    stop();
    var id = ++seq, t0 = Date.now();
    current = { id: id, req: req };
    el('exact-progress').hidden = false; el('exact-progress').value = 0; el('exact-cancel').hidden = false;
    el('exact-status').textContent = 'Exact enumeration of ' + (Math.pow(2, req.rows.length) - 1).toLocaleString() + ' subsets running; the sampled preview is shown until it finishes.';
    var payload = { cmd: 'run', id: id, te: req.rows.map(function (r) { return r.te; }), se: req.rows.map(function (r) { return r.se; }), model: req.model, quantiles: true };
    function progress(f) {
      if (!current || current.id !== id) return;
      el('exact-progress').value = f;
      var elapsed = (Date.now() - t0) / 1000, eta = f > 0.02 ? elapsed * (1 - f) / f : null;
      el('exact-status').textContent = 'Exact enumeration running: ' + Math.round(f * 100) + '%' + (eta !== null ? ', about ' + Math.ceil(eta) + ' s left' : '') + '. The sampled preview is shown until it finishes.';
    }
    function fail(msg) { if (!current || current.id !== id) return; stop(); el('exact-status').textContent = 'Exact enumeration failed (' + msg + '); the sampled result is shown.'; }
    try {
      worker = new Worker('exact-enum.js');
      worker.onmessage = function (ev) {
        var d = ev.data; if (!current || d.id !== id) return;
        if (d.type === 'progress') progress(d.fraction);
        else if (d.type === 'done') { var r = current.req; stop(); finish(d.result, r); }
        else if (d.type === 'error') fail(d.message);
      };
      worker.onerror = function (e) { e.preventDefault(); if (worker) { worker.terminate(); worker = null; } inPage(); };
      worker.postMessage(payload);
    } catch (e) { worker = null; inPage(); }
    // Fallback when Web Workers are unavailable (e.g. file:// pages): time-sliced in the page.
    function inPage() {
      if (!current || current.id !== id) return;
      var E = window.AlmGoshExactEngine, eng;
      try { eng = E.createEngine(payload.te, payload.se, payload.model); } catch (err) { fail(err.message); return; }
      var H = 0, pass = 0, n = eng.highCount, step = 1, tm = Date.now();
      (function slice() {
        if (!current || current.id !== id) return;
        var until = Date.now() + 40;
        try {
          while (Date.now() < until && pass < 2) {
            (pass === 0 ? eng.mainPass : eng.collectPass)(H, Math.min(n, H + step)); H += step;
            if (H >= n) { if (pass === 0) eng.planQuantiles(); pass++; H = 0; }
          }
        } catch (err) { fail(err.message); return; }
        if (pass < 2) { progress((pass + H / n) / 2); current.timer = setTimeout(slice, 0); return; }
        var res;
        try { res = eng.summary(eng.finishQuantiles()); } catch (err) { fail(err.message); return; }
        res.timing = { main_ms: Date.now() - tm, quantile_ms: 0 };
        var r = current.req; stop(); finish(res, r);
      })();
    }
  }

  // Called by the page after every run.
  function request(req) {
    if (!req) { stop(); pending = null; cache = null; clearTables(); el('exact-status').textContent = 'Applies when more than 15 studies are entered.'; el('exact-run').hidden = true; return; }
    var k = req.rows.length, m = mode();
    req.key = key(req.rows, req.model);
    pending = req;
    el('exact-run').hidden = false;
    if (k > ENGINE_MAX_K) { stop(); clearTables(); pending = null; el('exact-status').textContent = 'Exact enumeration supports up to ' + ENGINE_MAX_K + ' studies (over one billion subsets); larger workloads exceed the bounded integer/memory design. Showing random sampling.'; el('exact-run').hidden = true; return; }
    if (m === 'sample') { stop(); clearTables(); el('exact-status').textContent = 'Random sampling selected. Showing random sampling (labelled). Press "Run exact enumeration" to enumerate every subset.'; return; }
    if (cache && cache.key === req.key) { stop(); finish(cache.result, req); return; }
    if (current && current.req.key === req.key) { current.req = req; return; }
    stop(); clearTables();
    var est = estimateSeconds(k, req.model);
    if (m === 'exact' || (m === 'auto' && k <= AUTO_MAX_K[req.model])) { startExact(req); return; }
    el('exact-status').textContent = 'Auto: exact enumeration of ' + (Math.pow(2, k) - 1).toLocaleString() + ' subsets is estimated at about ' + Math.ceil(est) + ' s on a fast desktop, above the auto limit. ' +
      'Showing random sampling (labelled). Press "Run exact enumeration" to enumerate every subset.';
  }
  var pending = null;
  el('exact-run').hidden = true;
  el('exact-run').onclick = function () { if (pending) startExact(pending); };
  el('exact-cancel').onclick = function () { stop(); el('exact-status').textContent = 'Exact enumeration cancelled; the sampled result is shown.'; };

  ['src','model','n-sample','enum-mode'].forEach(function (id) {
    el(id).addEventListener('input', function () {
      if (!current) return;
      stop(); pending = null; clearTables(); el('exact-run').hidden = true;
      el('exact-status').textContent = 'Inputs changed; press Run analysis to start exact enumeration for the new inputs.';
    });
  });

  window.AlmGoshExact = { request: request, cancel: stop, labelResult: labelResult, renderDensity: renderDensity, AUTO_MAX_K: AUTO_MAX_K, get cached() { return cache; } };
  if (window.__almGoshExactReady) window.__almGoshExactReady();
})();
