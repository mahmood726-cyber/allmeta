/* shared/alm-verify-r.js — "Verify in R" tab (F3). Verification only: no report prose here.
 *
 * Spec block: verify: { adapter: () => liveAdapter, plots: [{id, title, r, app, width_in?, height_in?}], rObjects }
 *   adapter() returns the app's AlmValidate adapter (its .live = {packages, currentState, buildScript,
 *   appValues, compare}) or the live object itself. plots[].r is R code (string, or function(state) -> string)
 *   run in the SAME R session after buildScript(state), so it can use the objects named in rObjects.
 *   plots[].app() returns the app's own SVG element for the side-by-side view.
 *
 * Flow: state = live.currentState(); script = live.buildScript(state); AlmWebR.runRPlots(...);
 * the single ALMJSON line is parsed exactly like shared/alm-validate.js and every quantity is compared
 * with AlmValidate.compare using the adapter's tolerance/kind. Records
 * AlmFeaturesState.verify = {revision, passed, rows, versions, packages, n, nPassed} where revision =
 * AlmFeatures.stateHash(state) (identical to AlmFeatures.revision(app) for the same state).
 *
 * STALE: after a run, edits to the app inputs (verify.inputs selector; debounced input/change events),
 * showing the tab, and every download re-check the state; a changed state marks summary, table and
 * download buttons STALE and the ZIP's truthcert.json carries stale + both revisions.
 * AlmFeatures.verifiedCurrent(app) is the check F2 should use (never verify.passed alone).
 *
 * TEST-ONLY HOOK: if window.__almVerifyPerturb = {key, delta} is set, delta is added to that app value
 * before comparing (used by the planted-defect test). It changes nothing unless set.
 */
(function (global) {
  'use strict';

  var XPLAT_URL = 'https://github.com/mahmood726-cyber/allmeta/actions/workflows/xplat-verify.yml';
  var DANGEROUS = /^[=+@\t\r]/;
  var scriptURL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;

  function el(tag, attrs, text, parent) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function csvCell(v) {
    var s = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (DANGEROUS.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function comparisonCsv(rows) {
    var head = ['quantity', 'key', 'app', 'R', 'abs_diff', 'tolerance', 'kind', 'result'];
    return [head.join(',')].concat(rows.map(function (r) {
      return [r.label, r.key, r.app, r.ref, r.absDiff, r.tol, r.kind, r.pass ? 'PASS' : 'FAIL' + (r.reason ? ' (' + r.reason + ')' : '')].map(csvCell).join(',');
    })).join('\n') + '\n';
  }

  // F1 provenance table: one row per extracted value per study (a study with no values still gets one row).
  var PROV_COLS = ['label', 'reference', 'doi', 'pmid', 'location', 'outcome', 'arm', 'timepoint', 'field', 'value', 'span_start', 'span_end', 'conversions', 'flags', 'confirmed'];
  function provenanceCsv(records) {
    var lines = [PROV_COLS.join(',')];
    (Array.isArray(records) ? records : []).forEach(function (rec) {
      if (!rec || typeof rec !== 'object') return;
      var choice = rec.choice && typeof rec.choice === 'object' ? rec.choice : {};
      var arm = choice['arm(s)'] !== undefined ? choice['arm(s)'] : (choice.arms !== undefined ? choice.arms : choice.arm);
      var conv = (Array.isArray(rec.conversions) ? rec.conversions : []).map(function (c) {
        return [c.field, c.formula, c.citation].filter(function (x) { return x !== undefined && x !== null && x !== ''; }).join(': ');
      }).join(' | ');
      var flags = (Array.isArray(rec.flags) ? rec.flags : []).map(function (f) { return f && f.code ? f.code : String(f); }).join(' | ');
      var values = Array.isArray(rec.values) && rec.values.length ? rec.values : [{}];
      values.forEach(function (v) {
        var span = Array.isArray(v.span) ? v.span : [];
        lines.push([rec.label, rec.reference, rec.doi, rec.pmid, rec.location, choice.outcome, arm, choice.timepoint,
          v.field, v.value, span[0], span[1], conv, flags, rec.confirmed === true ? 'yes' : 'no'].map(csvCell).join(','));
      });
    });
    return lines.join('\n') + '\n';
  }

  function fmt(v) {
    if (v === null) return 'null (unavailable)';
    if (v === undefined) return 'missing';
    if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toPrecision(12)) : String(v);
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  function fmtDiff(d) {
    if (d === null || d === undefined) return '';
    if (!Number.isFinite(d)) return '∞';
    return d === 0 ? '0' : d.toExponential(2);
  }

  function plotCode(p, state) {
    var code = typeof p.r === 'function' ? p.r(state) : p.r;
    if (typeof code !== 'string' || !code.trim()) throw new Error('Plot ' + p.id + ' has no R code');
    return code;
  }

  // Downloadable script = exactly what runs in webR, then the plots to PDF, then sessionInfo.
  function downloadScript(app, script, plots, state) {
    var out = ['# allmeta ' + app + ' -- Verify in R', '# Generated by allmeta (shared/alm-verify-r.js). Runs in R >= 4.3 with the packages below.', '', script, ''];
    plots.forEach(function (p) {
      out.push('# Plot: ' + (p.title || p.id), 'grDevices::pdf(' + JSON.stringify(app + '-' + p.id + '-R.pdf') + ', width = ' + (p.width_in || 8) + ', height = ' + (p.height_in || 6) + ')', plotCode(p, state), 'grDevices::dev.off()', '');
    });
    out.push('print(sessionInfo())', '');
    return out.join('\n');
  }

  var runnerPromise = null;
  function runner() {
    if (global.AlmWebR && typeof global.AlmWebR.runRPlots === 'function') return Promise.resolve(global.AlmWebR);
    if (!runnerPromise) runnerPromise = new Promise(function (resolve, reject) {
      if (!scriptURL) { reject(new Error('Local R runner unavailable')); return; }
      var s = document.createElement('script');
      s.src = new URL('webr-runner.js', scriptURL).href;
      s.onload = function () { resolve(global.AlmWebR); };
      s.onerror = function () { runnerPromise = null; reject(new Error('Local R runner unavailable')); };
      document.head.appendChild(s);
    });
    return runnerPromise;
  }

  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function serializeSvg(svgEl) {
    var clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(clone);
  }

  function appSvgClone(svgEl, title) {
    var clone = svgEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    clone.setAttribute('role', 'img');
    clone.setAttribute('aria-label', 'App plot: ' + title);
    return clone;
  }

  async function sha256Hex(bytes) {
    var buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function render(panel, ctx) {
    var app = ctx.app, spec = ctx.spec, block = ctx.block;
    var plots = Array.isArray(block.plots) ? block.plots : [];
    el('p', { class: 'alm-f-note' }, 'Re-runs this analysis in R (webR, inside this browser, no server) and compares every reported quantity with the app. Verification only.', panel);
    var button = el('button', { type: 'button', class: 'alm-f-btn alm-f-primary' }, 'Verify this analysis in R', panel);
    var status = el('p', { role: 'status', 'aria-live': 'polite', class: 'alm-f-note' }, 'Ready. The first run loads R in the browser (about 30 MB).', panel);
    var summary = el('p', { class: 'alm-f-summary', 'data-testid': 'verify-summary' }, null, panel);
    var missing = el('div', null, null, panel);
    var tableWrap = el('div', { class: 'alm-f-scroll', role: 'region', 'aria-label': 'Comparison of app and R values', tabindex: '0' }, null, panel);
    tableWrap.hidden = true;
    var versionsP = el('p', { class: 'alm-f-note' }, null, panel);
    var plotsBox = el('div', { class: 'alm-f-plots' }, null, panel);
    var downloads = el('div', { class: 'alm-f-downloads', role: 'group', 'aria-label': 'Verify in R downloads' }, null, panel);
    var scriptBox = el('div', null, null, panel);
    var consoleBox = el('div', null, null, panel);
    var sessionBox = el('div', null, null, panel);
    var staleBanner = el('p', { role: 'alert', class: 'alm-f-stale', 'data-testid': 'verify-stale' }, null, panel);
    staleBanner.hidden = true;
    panel.insertBefore(staleBanner, summary);
    var STALE_TEXT = 'These results are for an earlier version of the analysis. Run Verify in R again.';
    var lastRun = null, downloadButtons = [], isStale = false;
    var objectURLs = [];

    // Stale = the app's inputs or analysis state changed after the last completed run. Cheap input
    // fingerprint first (never re-runs the app); full=true also compares AlmFeatures.revision(app).
    function checkStale(full) {
      if (!lastRun) return false;
      var stale = global.AlmFeatures.inputsHash(app) !== lastRun.inputsHash;
      if (!stale && full) stale = global.AlmFeatures.revision(app) !== lastRun.revision;
      markStale(stale);
      return stale;
    }
    function markStale(stale) {
      isStale = !!stale;
      staleBanner.textContent = isStale ? STALE_TEXT : '';
      staleBanner.hidden = !isStale;
      if (lastRun) {
        summary.textContent = isStale ? 'STALE (earlier version of the analysis): ' + lastRun.summaryText : lastRun.summaryText;
        summary.setAttribute('data-stale', isStale ? 'true' : 'false');
        var cap = tableWrap.querySelector('caption');
        if (cap) cap.textContent = isStale ? 'STALE — ' + lastRun.captionText : lastRun.captionText;
        tableWrap.setAttribute('data-stale', isStale ? 'true' : 'false');
      }
      downloadButtons.forEach(function (d) { d.button.textContent = isStale ? d.label + ' (stale)' : d.label; });
      var v = global.AlmFeaturesState && global.AlmFeaturesState.verify;
      if (v && lastRun && v.revision === lastRun.revision) v.stale = isStale;
    }
    var staleTimer = null;
    function onAppEdit(e) {
      if (!lastRun || (e.target && e.target.closest && e.target.closest('#alm-features'))) return;
      clearTimeout(staleTimer);
      staleTimer = setTimeout(function () { checkStale(false); }, 250);
    }
    document.addEventListener('input', onAppEdit, true);
    document.addEventListener('change', onAppEdit, true);
    var running = false;

    function clearOutputs() {
      objectURLs.forEach(function (u) { URL.revokeObjectURL(u); }); objectURLs = [];
      [summary, missing, versionsP, plotsBox, downloads, scriptBox, consoleBox, sessionBox].forEach(function (n) { n.replaceChildren(); });
      summary.removeAttribute('data-result'); summary.removeAttribute('data-stale');
      tableWrap.replaceChildren(); tableWrap.hidden = true; tableWrap.removeAttribute('data-stale');
      lastRun = null; downloadButtons = []; isStale = false;
      staleBanner.textContent = ''; staleBanner.hidden = true;
    }

    function addDownload(label, fn) {
      var b = el('button', { type: 'button', class: 'alm-f-btn' }, label, downloads);
      downloadButtons.push({ button: b, label: label });
      b.addEventListener('click', function () {
        // Downloads stay allowed when stale, but the state is re-checked first so labels/receipt are honest.
        Promise.resolve().then(function () { checkStale(true); return fn(); }).catch(function (e) { status.textContent = 'Download failed: ' + (e && e.message ? e.message : String(e)); });
      });
      return b;
    }

    function showScript(text) {
      el('h3', null, 'R script (exactly what was run)', scriptBox);
      var copy = el('button', { type: 'button', class: 'alm-f-btn' }, 'Copy R script', scriptBox);
      el('pre', { role: 'region', 'aria-label': 'R script', tabindex: '0' }, text, scriptBox);
      copy.addEventListener('click', function () {
        var done = function (ok) { status.textContent = ok ? 'R script copied to the clipboard.' : 'Copy failed; select the script text and copy it manually.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        else done(false);
      });
    }

    function table(rows) {
      tableWrap.hidden = false;
      var t = el('table', null, null, tableWrap);
      el('caption', { class: 'alm-f-note' }, 'App value vs R value for every quantity; |diff| is relative (|App−R|/max(1,|R|)) when kind is rel.', t);
      var hr = el('tr', null, null, el('thead', null, null, t));
      ['Quantity', 'App', 'R', '|diff|', 'Tolerance', 'Kind', 'Result'].forEach(function (h) { el('th', { scope: 'col' }, h, hr); });
      var tb = el('tbody', null, null, t);
      rows.forEach(function (r) {
        var tr = el('tr', { 'data-key': r.key }, null, tb);
        el('th', { scope: 'row' }, r.label, tr);
        el('td', { class: 'alm-f-num' }, fmt(r.app), tr);
        el('td', { class: 'alm-f-num' }, fmt(r.ref), tr);
        el('td', { class: 'alm-f-num' }, fmtDiff(r.diff), tr);
        el('td', { class: 'alm-f-num' }, fmt(r.tol), tr);
        el('td', null, r.kind, tr);
        el('td', { 'data-result': r.pass ? 'pass' : 'fail' }, r.pass ? 'PASS' : 'FAIL' + (r.reason ? ' (' + r.reason + ')' : ''), tr);
      });
    }

    async function run() {
      if (running) return null;
      running = true; button.disabled = true;
      clearOutputs();
      var files = [], state, script, fullScript, live;
      try {
        var adapter = block.adapter && block.adapter();
        live = adapter && (adapter.live || adapter);
        if (!live || typeof live.currentState !== 'function' || typeof live.buildScript !== 'function') throw new Error('This app has no live R adapter.');
        var inputsAtRun = global.AlmFeatures.inputsHash(app);
        state = structuredClone(live.currentState());
        var revision = global.AlmFeatures.stateHash(state);
        var appValues = live.appValues(state);
        var comparison = structuredClone(live.compare);
        if (!Array.isArray(appValues) || !appValues.length) throw new Error('Adapter supplied no quantities to compare.');
        script = live.buildScript(state);
        fullScript = downloadScript(app, script, plots, state);
        files.push({ name: app + '-verify.R', string: fullScript });
        showScript(fullScript);
        addDownload('R script (.R)', function () { saveBlob(new Blob([fullScript], { type: 'text/x-r;charset=utf-8' }), app + '-verify.R'); });
        status.textContent = 'Preparing R...';
        var R = await runner();
        var r = await R.runRPlots({
          script: script, packages: live.packages || [],
          plots: plots.map(function (p) { return { id: p.id, code: plotCode(p, state), width_in: p.width_in || 8, height_in: p.height_in || 6 }; }),
          onStatus: function (s) { status.textContent = s; },
        });
        if (!r.ok) {
          var m = /Package not in pinned repository: ([A-Za-z][A-Za-z0-9.]*)/.exec(r.error || '');
          if (m) {
            summary.textContent = 'Not checked in the browser: R package ' + m[1] + ' is unavailable.';
            summary.setAttribute('data-result', 'fail');
            var p = el('p', { role: 'alert' }, 'R package ' + m[1] + ' is not available in the in-browser R used by allmeta, so this analysis cannot be checked in the browser. Download the R script and run it in R, or see the ', missing);
            var a = el('a', { href: XPLAT_URL, rel: 'noopener' }, 'cross-platform checks', p);
            a.target = '_blank';
            p.appendChild(document.createTextNode('.'));
            status.textContent = 'R package ' + m[1] + ' unavailable in browser R.';
            global.AlmFeaturesState.verify = { app: app, revision: revision, inputsHash: inputsAtRun, stale: false, passed: false, rows: [], versions: {}, packages: live.packages || [], n: 0, nPassed: 0, error: 'missing package ' + m[1] };
            return { ok: false, missingPackage: m[1] };
          }
          throw new Error(r.error || 'R failed');
        }
        var lines = r.stdout.split(/\r?\n/).filter(function (s) { return s.indexOf('ALMJSON:') === 0; });
        if (lines.length !== 1) throw new Error('R must emit exactly one ALMJSON record');
        var ref = JSON.parse(lines[0].slice(8));
        var perturb = global.__almVerifyPerturb;
        var rows = appValues.map(function (v) {
          var tol = comparison.tolerance[v.key] !== undefined ? comparison.tolerance[v.key] : comparison.tolerance.default;
          var kind = (comparison.kind || {})[v.key] || 'abs';
          var value = v.value;
          if (perturb && perturb.key === v.key && typeof value === 'number') value = value + Number(perturb.delta);
          var c = global.AlmValidate.compare(value, ref[v.key], kind, tol);
          var absDiff = typeof value === 'number' && typeof ref[v.key] === 'number' ? Math.abs(value - ref[v.key]) : null;
          return { key: v.key, label: v.label || v.key, app: value, ref: ref[v.key], tol: tol, kind: kind, diff: c.diff, absDiff: absDiff, pass: c.pass, reason: c.reason || null };
        });
        var nPassed = rows.filter(function (x) { return x.pass; }).length, passed = rows.length > 0 && nPassed === rows.length;
        summary.textContent = nPassed + ' of ' + rows.length + ' quantities match R — ' + (passed ? 'PASS' : 'FAIL: ' + (rows.length - nPassed) + ' outside tolerance or unavailable');
        summary.setAttribute('data-result', passed ? 'pass' : 'fail');
        table(rows);
        versionsP.textContent = 'R versions: ' + Object.keys(r.versions).map(function (k) { return k + ' ' + r.versions[k]; }).join('; ') + '.';
        // graphics: what the webR devices actually produced (device bitmap sizes, PDF bytes, SVG availability).
        var graphics = { cairo: r.cairo, plots: r.plots.map(function (p) {
          return { id: p.id, native: p.native, raster: { width: p.raster.width, height: p.raster.height, dpi: p.raster.dpi }, pdfBytes: p.pdf.length, svg: !!p.svg, svgReason: p.svgReason };
        }) };
        global.AlmFeaturesState.verify = { app: app, revision: revision, inputsHash: inputsAtRun, stale: false, passed: passed, rows: rows, versions: r.versions, packages: live.packages || [], n: rows.length, nPassed: nPassed, graphics: graphics };

        var csv = comparisonCsv(rows);
        files.push({ name: app + '-verify-comparison.csv', string: csv });
        files.push({ name: 'sessionInfo.txt', string: r.sessionInfo + '\n' });
        files.push({ name: 'console.txt', string: r.stdout + '\n' });
        addDownload('Comparison (.csv)', function () { saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), app + '-verify-comparison.csv'); });
        addDownload('sessionInfo.txt', function () { saveBlob(new Blob([r.sessionInfo + '\n'], { type: 'text/plain;charset=utf-8' }), 'sessionInfo.txt'); });
        addDownload('Console log (.txt)', function () { saveBlob(new Blob([r.stdout + '\n'], { type: 'text/plain;charset=utf-8' }), 'console.txt'); });

        for (var i = 0; i < r.plots.length; i++) {
          var rp = r.plots[i], def = plots.filter(function (p) { return p.id === rp.id; })[0] || { id: rp.id, title: rp.id };
          var title = def.title || def.id, base = app + '-' + rp.id;
          var pair = el('div', { class: 'alm-f-pair' }, null, el('div', null, null, plotsBox));
          var fig = el('figure', null, null, pair);
          var url = URL.createObjectURL(rp.png); objectURLs.push(url);
          el('img', { src: url, alt: 'R plot: ' + title + ' drawn by R in the browser' }, null, fig);
          el('figcaption', null, 'R: ' + title + ' (webR)', fig);
          var appSvg = def.app ? def.app() : null;
          if (appSvg) {
            var fig2 = el('figure', null, null, pair);
            fig2.appendChild(appSvgClone(appSvg, title));
            el('figcaption', null, 'App: ' + title, fig2);
          }
          var png300 = global.AlmZip.pngSetDpi(new Uint8Array(await rp.png300.arrayBuffer()), 300);
          var tiff = global.AlmZip.tiff({ width: rp.raster.width, height: rp.raster.height, rgba: rp.raster.rgba, dpi: 300 });
          files.push({ name: base + '-R-300dpi.png', bytes: png300 });
          files.push({ name: base + '-R.pdf', bytes: rp.pdf });
          files.push({ name: base + '-R-300dpi.tiff', bytes: tiff });
          (function (png300, tiff, pdf, rp, base, title, appSvg) {
            addDownload(title + ' PNG (300 dpi)', function () { saveBlob(new Blob([png300], { type: 'image/png' }), base + '-R-300dpi.png'); });
            addDownload(title + ' PDF', function () { saveBlob(new Blob([pdf], { type: 'application/pdf' }), base + '-R.pdf'); });
            addDownload(title + ' TIFF (300 dpi)', function () { saveBlob(new Blob([tiff], { type: 'image/tiff' }), base + '-R-300dpi.tiff'); });
            if (rp.svg) {
              files.push({ name: base + '-R.svg', string: rp.svg });
              addDownload(title + ' SVG', function () { saveBlob(new Blob([rp.svg], { type: 'image/svg+xml' }), base + '-R.svg'); });
            } else if (appSvg) {
              var appText = serializeSvg(appSvg);
              files.push({ name: base + '-app.svg', string: appText });
              addDownload(title + ' SVG — app plot (R SVG unavailable in browser)', function () { saveBlob(new Blob([appText], { type: 'image/svg+xml' }), base + '-app.svg'); });
            }
          })(png300, tiff, rp.pdf, rp, base, title, appSvg);
          if (!rp.svg) el('p', { class: 'alm-f-note' }, title + ': ' + rp.svgReason + '; the SVG download is the app’s own plot.', plotsBox);
        }

        el('h3', null, 'R console output', consoleBox);
        el('pre', { role: 'region', 'aria-label': 'R console output', tabindex: '0' }, r.stdout || '(no output)', consoleBox);
        var det = el('details', null, null, sessionBox);
        el('summary', null, 'R sessionInfo()', det);
        el('pre', { role: 'region', 'aria-label': 'R sessionInfo', tabindex: '0' }, r.sessionInfo, det);

        var zipButton = addDownload('Download everything (ZIP)', async function () {
          var all = files.slice();
          var prov = global.AlmFeaturesState && global.AlmFeaturesState.provenance;
          if (Array.isArray(prov) && prov.length) all.push({ name: 'provenance.csv', string: provenanceCsv(prov) });
          var manifest = [];
          for (var f of all) {
            var bytes = f.bytes || new TextEncoder().encode(f.string);
            manifest.push({ name: f.name, sha256: await sha256Hex(bytes), bytes: bytes.length });
          }
          var bi = global.AlmBuildInfo || {};
          var results = { app: app, paper: spec.paper || null, commit: bi.sha || 'unknown', version: bi.version || 'unknown', stateRevision: revision,
            R: r.versions.R, webR: r.versions.webR, packages: r.versions, passed: passed, nPassed: nPassed, n: rows.length, files: manifest };
          // Staleness at download time (checkStale(true) ran just before this). The current revision is only
          // computed when the inputs are unchanged: computing it re-runs the app, which must not happen for
          // edited-but-not-run inputs. The input fingerprints are always recorded.
          var currentInputs = global.AlmFeatures.inputsHash(app);
          results.stale = isStale;
          results.verifiedRevision = revision;
          results.currentRevision = currentInputs === inputsAtRun ? global.AlmFeatures.revision(app) : null;
          results.verifiedInputsHash = inputsAtRun;
          results.currentInputsHash = currentInputs;
          if (results.currentRevision === null) results.currentRevisionNote = 'inputs changed since the run; current revision not computed (would re-run the analysis)';
          var receipt;
          if (global.AlmTruthCertExport && typeof global.AlmTruthCertExport.buildReceipt === 'function') {
            receipt = global.AlmTruthCertExport.sidecarJSON(await global.AlmTruthCertExport.buildReceipt({ studies: [], method: 'Verify in R (webR)', label: app + '-verify-in-r', results: results }));
          } else {
            receipt = JSON.stringify({ signed: false, contentHash: null, reason: 'shared/truthcert-export.js not loaded', extra: { results: results } }, null, 2);
          }
          all.push({ name: 'truthcert.json', string: receipt });
          saveBlob(new Blob([global.AlmZip.zip(all)], { type: 'application/zip' }), app + '-verify-in-r.zip');
        });
        zipButton.classList.add('alm-f-primary');
        status.textContent = 'R finished: ' + nPassed + ' of ' + rows.length + ' quantities match.';
        var cap = tableWrap.querySelector('caption');
        lastRun = { revision: revision, inputsHash: inputsAtRun, summaryText: summary.textContent, captionText: cap ? cap.textContent : '' };
        checkStale(false); // inputs edited while R was running -> stale at once
        return { ok: true, passed: passed, rows: rows, versions: r.versions, revision: revision };
      } catch (e) {
        var msg = e && e.message ? e.message : String(e);
        summary.textContent = 'Not verified: ' + msg;
        summary.setAttribute('data-result', 'fail');
        status.textContent = 'R check did not complete.';
        if (global.AlmFeaturesState) global.AlmFeaturesState.verify = { app: app, revision: state ? global.AlmFeatures.stateHash(state) : null, stale: false, passed: false, rows: [], versions: {}, packages: live && live.packages || [], n: 0, nPassed: 0, error: msg };
        return { ok: false, error: msg };
      } finally { running = false; button.disabled = false; }
    }

    button.addEventListener('click', function () { run(); });
    return { onShow: function () { checkStale(true); } };
  }

  var mod = { label: 'Verify in R', render: render };
  var api = { comparisonCsv: comparisonCsv, provenanceCsv: provenanceCsv, PROVENANCE_COLUMNS: PROV_COLS, csvCell: csvCell, downloadScript: downloadScript, module: mod };
  global.AlmVerifyR = api;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') global.AlmFeatures.registerModule('verify', mod);
  else (global.AlmFeaturesPending = global.AlmFeaturesPending || []).push(['verify', mod]);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
