(function () {
  const _STYLE = `.alm-dl{display:inline-flex;gap:.5rem;font:13px/1.4 system-ui,sans-serif}.alm-dl button{padding:.3rem .6rem;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer}`;
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

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) { console.warn('[alm.chartDownload] target not found'); return; }
    const getSvg = typeof opts.getSvg === 'function' ? opts.getSvg : () => null;
    const basename = opts.basename || 'chart';
    _ensureStyle();
    target.innerHTML = `
      <div class="alm-dl">
        <button type="button" data-fmt="png">PNG</button>
        <button type="button" data-fmt="svg">SVG</button>
        <button type="button" data-fmt="pdf">PDF</button>
      </div>`;
    target.querySelector('[data-fmt="svg"]').addEventListener('click', () => {
      const src = getSvg(); if (!src) { console.warn('[alm.chartDownload] no SVG'); return; }
      const prepared = _prepareSvg(src);
      _download(new Blob([_serialize(prepared)], { type: 'image/svg+xml' }), basename + '.svg');
    });
    // PNG and PDF handlers wired in Tasks 11-12.
  }
  init._prepareSvg = _prepareSvg;
  init._serialize = _serialize;

  window.alm = window.alm || {};
  window.alm.chartDownload = init;
})();
