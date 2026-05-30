/* hub/shared/chart-export-auto.js — zero-config chart export.
 *
 * Include this ONE script in an app and every chart (SVG or <canvas>) gets a
 * compact "⬇ SVG · PNG · PDF · JPG" download bar automatically. Re-scans on DOM
 * mutation so dynamically-rendered plots are covered too.
 *
 * Formats:
 *   - SVG : true vector (SVG sources only; computed styles inlined, viewBox padded)
 *   - PNG : 2× raster (transparent)
 *   - JPG : 2× raster on white
 *   - PDF : page sized to the chart (needs hub/shared/vendor/jspdf.min.js; the PDF
 *           button is hidden when jsPDF is absent)
 *
 * Skips: Plotly plots (they ship their own modebar download), inline icons
 * (anything < 200×120), elements marked data-alm-noexport, and anything already
 * wired. Opt a specific chart's filename via data-alm-export="my-name".
 *
 * Self-contained (no dependency on chart-download.js).
 */
(function () {
  "use strict";
  if (window.__almChartExportAuto) return;           // singleton
  window.__almChartExportAuto = true;

  var PAD = 12, MIN_W = 200, MIN_H = 120;
  var SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity',
    'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight',
    'font-style', 'text-anchor', 'dominant-baseline', 'color'];

  var styleInjected = false;
  function ensureStyle() {
    if (styleInjected) return; styleInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '.alm-xbar{display:block;text-align:right;margin:.1rem 0 .3rem;' +
      'font:600 11px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '.alm-xbar__lbl{color:var(--muted,#5c6470);font-weight:600;letter-spacing:.03em;margin-right:.2rem}' +
      '.alm-xbar button{padding:.22rem .5rem;margin-left:.3rem;border:1px solid var(--border,#cbd5e1);' +
      'border-radius:5px;background:var(--panel,#fff);color:var(--ink,#15181d);cursor:pointer;' +
      'font:inherit;display:inline-block}.alm-xbar button:hover{filter:brightness(.95)}';
    document.head.appendChild(s);
  }

  function inlineStyles(srcRoot, dstRoot) {
    var src = srcRoot.querySelectorAll('*'), dst = dstRoot.querySelectorAll('*');
    for (var i = 0; i < src.length; i++) {
      var cs = window.getComputedStyle(src[i]), decl = [];
      for (var j = 0; j < SVG_PROPS.length; j++) {
        var v = cs.getPropertyValue(SVG_PROPS[j]);
        if (v && v !== 'auto' && v !== 'normal') decl.push(SVG_PROPS[j] + ':' + v);
      }
      if (decl.length) {
        var ex = dst[i].getAttribute('style') || '';
        dst[i].setAttribute('style', ex + (ex ? ';' : '') + decl.join(';'));
      }
    }
  }

  function prepareSvg(src) {
    var clone = src.cloneNode(true);
    inlineStyles(src, clone);
    var vb = src.getAttribute('viewBox'), x, y, w, h;
    if (vb) { var p = vb.split(/[\s,]+/).map(Number); x = p[0]; y = p[1]; w = p[2]; h = p[3]; }
    else { var r = src.getBoundingClientRect(); x = 0; y = 0; w = r.width; h = r.height; }
    clone.setAttribute('viewBox', (x - PAD) + ' ' + (y - PAD) + ' ' + (w + 2 * PAD) + ' ' + (h + 2 * PAD));
    clone.removeAttribute('width'); clone.removeAttribute('height');
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return { svg: clone, w: w + 2 * PAD, h: h + 2 * PAD };
  }

  function serialize(svg) { return new XMLSerializer().serializeToString(svg); }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  // Rasterise a prepared SVG (or copy a canvas) to a PNG/JPEG blob.
  function rasterize(prep, mime, name, fill) {
    var svgText = serialize(prep.svg);
    var scale = (window.devicePixelRatio || 1) * 2;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(prep.w * scale));
    canvas.height = Math.max(1, Math.ceil(prep.h * scale));
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, prep.w, prep.h); }
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = function () {
      ctx.drawImage(img, 0, 0, prep.w, prep.h);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (b) { if (b) download(b, name); }, mime, 0.95);
    };
    img.onerror = function () { URL.revokeObjectURL(url); console.warn('[alm.chartExport] raster failed'); };
    img.src = url;
  }

  function canvasToBlob(srcCanvas, mime, name, fill) {
    var c = document.createElement('canvas');
    c.width = srcCanvas.width; c.height = srcCanvas.height;
    var ctx = c.getContext('2d');
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(srcCanvas, 0, 0);
    c.toBlob(function (b) { if (b) download(b, name); }, mime, 0.95);
  }

  function toPdf(getRaster, w, h, name) {
    var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDF) { console.warn('[alm.chartExport] jsPDF not loaded'); return; }
    getRaster(function (dataUrl) {
      var pdf = new JsPDF({ orientation: w > h ? 'l' : 'p', unit: 'pt', format: [w, h] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
      download(pdf.output('blob'), name);
    });
  }

  var hasPdf = function () { return !!((window.jspdf && window.jspdf.jsPDF) || window.jsPDF); };

  function makeBar(basename, isSvg, getSvgEl, getCanvasEl) {
    var bar = document.createElement('div');
    bar.className = 'alm-xbar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Download chart');
    var fmts = isSvg ? ['SVG', 'PNG', 'JPG', 'PDF'] : ['PNG', 'JPG', 'PDF'];
    var html = '<span class="alm-xbar__lbl" aria-hidden="true">⬇</span>';
    for (var i = 0; i < fmts.length; i++) {
      if (fmts[i] === 'PDF' && !hasPdf()) continue;
      html += '<button type="button" data-xfmt="' + fmts[i].toLowerCase() +
        '" aria-label="Download chart as ' + fmts[i] + '">' + fmts[i] + '</button>';
    }
    bar.innerHTML = html;

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-xfmt]'); if (!btn) return;
      var fmt = btn.getAttribute('data-xfmt');
      if (isSvg) {
        var el = getSvgEl(); if (!el) return;
        var prep = prepareSvg(el);
        if (fmt === 'svg') download(new Blob([serialize(prep.svg)], { type: 'image/svg+xml' }), basename + '.svg');
        else if (fmt === 'png') rasterize(prep, 'image/png', basename + '.png', null);
        else if (fmt === 'jpg') rasterize(prep, 'image/jpeg', basename + '.jpg', '#ffffff');
        else if (fmt === 'pdf') toPdf(function (cb) {
          var svgText = serialize(prep.svg), scale = 2;
          var cv = document.createElement('canvas');
          cv.width = Math.ceil(prep.w * scale); cv.height = Math.ceil(prep.h * scale);
          var cx = cv.getContext('2d'); cx.scale(scale, scale);
          cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, prep.w, prep.h);
          var im = new Image(), u = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
          im.onload = function () { cx.drawImage(im, 0, 0, prep.w, prep.h); URL.revokeObjectURL(u); cb(cv.toDataURL('image/png')); };
          im.src = u;
        }, prep.w, prep.h, basename + '.pdf');
      } else {
        var cv2 = getCanvasEl(); if (!cv2) return;
        if (fmt === 'png') canvasToBlob(cv2, 'image/png', basename + '.png', null);
        else if (fmt === 'jpg') canvasToBlob(cv2, 'image/jpeg', basename + '.jpg', '#ffffff');
        else if (fmt === 'pdf') toPdf(function (cb) {
          var t = document.createElement('canvas'); t.width = cv2.width; t.height = cv2.height;
          var tx = t.getContext('2d'); tx.fillStyle = '#ffffff'; tx.fillRect(0, 0, t.width, t.height); tx.drawImage(cv2, 0, 0);
          cb(t.toDataURL('image/png'));
        }, cv2.width, cv2.height, basename + '.pdf');
      }
    });
    return bar;
  }

  function appName() {
    var segs = location.pathname.split('/').filter(Boolean);
    var i = segs.length - 1;
    if (/\.html?$/i.test(segs[i] || '')) i--;          // drop index.html
    return (segs[i] || 'chart').replace(/[^a-z0-9_-]/gi, '') || 'chart';
  }

  function eligible(el) {
    if (el.__almExported) return false;
    if (el.hasAttribute('data-alm-noexport')) return false;
    if (el.closest('.js-plotly-plot, .alm-xbar, .alm-dl, button, a')) return false;
    var r = el.getBoundingClientRect();
    var w = r.width || parseFloat(el.getAttribute('width')) || 0;
    var h = r.height || parseFloat(el.getAttribute('height')) || 0;
    if (el.tagName.toLowerCase() === 'svg' && !w) {
      var vb = el.getAttribute('viewBox');
      if (vb) { var p = vb.split(/[\s,]+/).map(Number); w = p[2]; h = p[3]; }
    }
    return w >= MIN_W && h >= MIN_H;
  }

  function basenameFor(el, n) {
    var attr = el.getAttribute('data-alm-export');
    if (attr) return attr;
    var id = el.id ? '-' + el.id.replace(/[^a-z0-9_-]/gi, '') : (n ? '-' + n : '');
    return appName() + id;
  }

  function wire(el, idx) {
    if (!eligible(el)) return;
    el.__almExported = true;
    var isSvg = el.tagName.toLowerCase() === 'svg';
    var base = basenameFor(el, idx);
    var bar = makeBar(base, isSvg,
      function () { return el.isConnected ? el : null; },
      function () { return el.isConnected ? el : null; });
    // Insert the bar as a sibling immediately before the chart — does NOT re-parent
    // the chart, so grid/flex/positioned layouts are preserved.
    if (el.parentNode) el.parentNode.insertBefore(bar, el);
  }

  var scanScheduled = false;
  function scan() {
    scanScheduled = false;
    ensureStyle();
    var els = document.querySelectorAll('svg:not([data-alm-exported-done]), canvas:not([data-alm-exported-done])');
    var n = 0;
    els.forEach(function (el) { if (!el.__almExported) wire(el, n++); });
  }
  function scheduleScan() {
    if (scanScheduled) return; scanScheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(scan, 0);
  }

  function start() {
    scan();
    var obs = new MutationObserver(function () { scheduleScan(); });
    obs.observe(document.body, { childList: true, subtree: true });
    // also rescan shortly after load for async-rendered charts
    setTimeout(scan, 600); setTimeout(scan, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.alm = window.alm || {};
  window.alm.chartExportAuto = { scan: scan };
})();
