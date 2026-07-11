(function () {
  const _STYLE = `.alm-dl{display:inline-flex;gap:.5rem;font:13px/1.4 system-ui,sans-serif}.alm-dl button{padding:.3rem .6rem;border:1px solid var(--border,#cbd5e1);border-radius:6px;background:var(--panel,#fff);color:var(--ink,#15181d);cursor:pointer}@media (prefers-color-scheme:dark){.alm-dl button{background:var(--panel,#23272c);color:var(--ink,#e7e4dc);border-color:var(--border,#3a4048)}}`;
  const PAD = 12;
  let _stylesInjected = false;

  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s); _stylesInjected = true;
  }

  function _inlineStyles(srcRoot, dstRoot) {
    const srcNodes = srcRoot.querySelectorAll('*');
    const dstNodes = dstRoot.querySelectorAll('*');
    for (let i = 0; i < srcNodes.length; i++) {
      const cs = window.getComputedStyle(srcNodes[i]);
      const declarations = [];
      const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray',
        'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size',
        'font-weight', 'font-style', 'text-anchor', 'dominant-baseline'];
      for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (v && v !== 'auto' && v !== 'normal') declarations.push(p + ':' + v);
      }
      if (declarations.length) {
        const existing = dstNodes[i].getAttribute('style') || '';
        dstNodes[i].setAttribute('style', existing + (existing ? ';' : '') + declarations.join(';'));
      }
    }
  }

  function _padViewBox(srcSvg, dstSvg) {
    const vb = srcSvg.getAttribute('viewBox');
    if (vb) {
      const [x, y, w, h] = vb.split(/\s+/).map(Number);
      dstSvg.setAttribute('viewBox', `${x - PAD} ${y - PAD} ${w + 2 * PAD} ${h + 2 * PAD}`);
    } else {
      const r = srcSvg.getBoundingClientRect();
      dstSvg.setAttribute('viewBox', `${-PAD} ${-PAD} ${r.width + 2 * PAD} ${r.height + 2 * PAD}`);
    }
    dstSvg.removeAttribute('width');
    dstSvg.removeAttribute('height');
  }

  function _prepareSvg(src) {
    const clone = src.cloneNode(true);
    _inlineStyles(src, clone);
    _padViewBox(src, clone);
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return clone;
  }

  function _serialize(svg) {
    return new XMLSerializer().serializeToString(svg);
  }

  function _download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Optionally bind a verifiable TruthCert receipt to the exported artifact.
  // opts.getReceiptInput() returns { studies, method, results, label } for the
  // current analysis (or null/undefined to skip). Requires shared/ma-studies-v1.js
  // + shared/truthcert-export.js to be loaded; if either is missing, or signing
  // throws, the export proceeds UNSTAMPED (never blocks the download).
  async function _stamp(svgText, getReceiptInput) {
    // App did not opt into signing — legitimate; export plain, no warning.
    if (!getReceiptInput) return svgText;
    // Opted in but the signer module isn't loaded — a wiring bug. Fail-open keeps
    // the download working, but NEVER silently: surface it so it can be fixed.
    if (!window.AlmTruthCertExport) {
      console.warn('[alm.chartDownload] truthcert-export.js not loaded — export is NOT signed. '
        + 'Add <script src="../shared/truthcert-export.js"> before chart-download.js.');
      return svgText;
    }
    let input;
    try { input = getReceiptInput(); }
    catch (e) { console.warn('[alm.chartDownload] getReceiptInput threw — export is NOT signed:', e); return svgText; }
    // No current analysis to bind (e.g. invalid input cleared the result) — export
    // plain, by design (better unstamped than a receipt for a stale/empty analysis).
    if (!input) return svgText;
    try {
      const res = await window.AlmTruthCertExport.buildReceipt(input);
      return window.AlmTruthCertExport.stampSVG(svgText, res);
    } catch (e) {
      console.warn('[alm.chartDownload] signing failed — export is NOT signed:', e);
      return svgText;
    }
  }

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) { console.warn('[alm.chartDownload] target not found'); return; }
    const getSvg = typeof opts.getSvg === 'function' ? opts.getSvg : () => null;
    const getReceiptInput = typeof opts.getReceiptInput === 'function' ? opts.getReceiptInput : null;
    const basename = opts.basename || 'chart';
    _ensureStyle();
    target.innerHTML = `
      <div class="alm-dl">
        <button type="button" data-fmt="png">PNG</button>
        <button type="button" data-fmt="svg">SVG</button>
        <button type="button" data-fmt="pdf">PDF</button>
      </div>`;
    target.querySelector('[data-fmt="svg"]').addEventListener('click', async () => {
      const src = getSvg(); if (!src) { console.warn('[alm.chartDownload] no SVG'); return; }
      const prepared = _prepareSvg(src);
      const svgText = await _stamp(_serialize(prepared), getReceiptInput);
      _download(new Blob([svgText], { type: 'image/svg+xml' }), basename + '.svg');
    });
    target.querySelector('[data-fmt="png"]').addEventListener('click', async () => {
      const src = getSvg(); if (!src) { console.warn('[alm.chartDownload] no SVG'); return; }
      const prepared = _prepareSvg(src);
      const svgText = await _stamp(_serialize(prepared), getReceiptInput);
      const vb = prepared.getAttribute('viewBox').split(/\s+/).map(Number);
      const [, , w, h] = vb;
      const scale = (window.devicePixelRatio || 1) * 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      const img = new Image();
      const blobURL = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(blobURL);
        canvas.toBlob(b => _download(b, basename + '.png'), 'image/png');
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(blobURL);
        console.warn('[alm.chartDownload] PNG load failed:', e);
      };
      img.src = blobURL;
    });
    target.querySelector('[data-fmt="pdf"]').addEventListener('click', async () => {
      const src = getSvg(); if (!src) { console.warn('[alm.chartDownload] no SVG'); return; }
      if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
        console.warn('[alm.chartDownload] jspdf not loaded; include hub/shared/vendor/jspdf.min.js before chart-download.js');
        return;
      }
      const prepared = _prepareSvg(src);
      const svgText = await _stamp(_serialize(prepared), getReceiptInput);
      const vb = prepared.getAttribute('viewBox').split(/\s+/).map(Number);
      const [, , w, h] = vb;
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      const img = new Image();
      const blobURL = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(blobURL);
        const pngDataUrl = canvas.toDataURL('image/png');
        const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        const pdf = new JsPDF({ orientation: w > h ? 'l' : 'p', unit: 'pt', format: [w, h] });
        pdf.addImage(pngDataUrl, 'PNG', 0, 0, w, h);
        const blob = pdf.output('blob');
        _download(blob, basename + '.pdf');
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(blobURL);
        console.warn('[alm.chartDownload] PDF load failed:', e);
      };
      img.src = blobURL;
    });
  }
  init._prepareSvg = _prepareSvg;
  init._serialize = _serialize;

  window.alm = window.alm || {};
  window.alm.chartDownload = init;
})();
