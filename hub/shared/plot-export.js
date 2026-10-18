/* Publication plot exports. Standalone browser IIFE; no numerical analysis code. */
(function () {
  'use strict';
  const PAD = 12;

  const selfScript = document.currentScript;
  const pdfUrl = selfScript && selfScript.src ? new URL('vendor/jspdf.min.js', selfScript.src).href : null;
  const scriptNonce = selfScript && selfScript.nonce;
  let pdfLoading;
  function loadPdf() {
    const available = () => (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (available()) return Promise.resolve(available());
    if (!pdfUrl) return Promise.reject(new Error('Cannot locate vendored jsPDF'));
    if (!pdfLoading) pdfLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfUrl;
      if (scriptNonce) script.nonce = scriptNonce;
      script.onload = () => available() ? resolve(available()) : reject(new Error('jsPDF unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('Could not load vendored jsPDF')); };
      document.head.appendChild(script);
    }).catch(error => { pdfLoading = null; throw error; });
    return pdfLoading;
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
      const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
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
      console.warn('[alm.plotExport] truthcert-export.js not loaded — export is NOT signed. '
        + 'Add <script src="../shared/truthcert-export.js"> before chart-download.js.');
      return svgText;
    }
    let input;
    try { input = getReceiptInput(); }
    catch (e) { console.warn('[alm.plotExport] getReceiptInput threw — export is NOT signed:', e); return svgText; }
    // No current analysis to bind (e.g. invalid input cleared the result) — export
    // plain, by design (better unstamped than a receipt for a stale/empty analysis).
    if (!input) return svgText;
    try {
      const res = await window.AlmTruthCertExport.buildReceipt(input);
      return window.AlmTruthCertExport.stampSVG(svgText, res);
    } catch (e) {
      console.warn('[alm.plotExport] signing failed — export is NOT signed:', e);
      return svgText;
    }
  }


  // TIFF uses MSB-first codes. The encoder dictionary leads the decoder by
  // one entry: decoder early-change at 511/1023/2047 means encoder next=512/1024/2048.
  function lzw(bytes) {
    const output = [];
    let buffer = 0, count = 0, bits = 9, next = 258, dict = new Map();
    function emit(code) {
      buffer = (buffer << bits) | code; count += bits;
      while (count >= 8) { count -= 8; output.push((buffer >>> count) & 255); }
      buffer &= (1 << count) - 1;
    }
    emit(256);
    if (bytes.length) {
      let prefix = bytes[0];
      for (let i = 1; i < bytes.length; i++) {
        const byte = bytes[i], key = prefix * 256 + byte;
        if (dict.has(key)) { prefix = dict.get(key); continue; }
        emit(prefix);
        dict.set(key, next++);
        if (next === (1 << bits) && bits < 12) bits++;
        if (next === 4096) { emit(256); dict = new Map(); next = 258; bits = 9; }
        prefix = byte;
      }
      emit(prefix);
      // The decoder inserts its last entry after the final data code, before EOI.
      if (next === (1 << bits) - 1 && bits < 12) bits++;
    }
    emit(257);
    if (count) output.push((buffer << (8 - count)) & 255);
    return new Uint8Array(output);
  }

  function tiff(rgb, width, height, dpi) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        rgb.length !== width * height * 3 || !Number.isInteger(dpi) || dpi <= 0) {
      throw new Error('Invalid RGB TIFF dimensions or resolution');
    }
    const compressed = lzw(rgb);
    const entries = 15, extra = 8 + 2 + entries * 12 + 4;
    const bitsOffset = extra, xRes = extra + 6, yRes = extra + 14, software = extra + 22;
    const strip = extra + 30;
    const bytes = new Uint8Array(strip + compressed.length), view = new DataView(bytes.buffer);
    bytes.set([73, 73, 42, 0]); view.setUint32(4, 8, true); view.setUint16(8, entries, true);
    let pos = 10;
    function tag(id, type, n, value) {
      view.setUint16(pos, id, true); view.setUint16(pos + 2, type, true);
      view.setUint32(pos + 4, n, true);
      if (type === 3 && n === 1) view.setUint16(pos + 8, value, true);
      else view.setUint32(pos + 8, value, true);
      pos += 12;
    }
    tag(256, 4, 1, width); tag(257, 4, 1, height); tag(258, 3, 3, bitsOffset);
    tag(259, 3, 1, 5); tag(262, 3, 1, 2); tag(273, 4, 1, strip);
    tag(277, 3, 1, 3); tag(278, 4, 1, height); tag(279, 4, 1, compressed.length);
    tag(282, 5, 1, xRes); tag(283, 5, 1, yRes); tag(284, 3, 1, 1);
    tag(296, 3, 1, 2); tag(305, 2, 8, software); tag(317, 3, 1, 1);
    [0, 2, 4].forEach(offset => view.setUint16(bitsOffset + offset, 8, true));
    [xRes, yRes].forEach(offset => { view.setUint32(offset, dpi, true); view.setUint32(offset + 4, 1, true); });
    bytes.set(new TextEncoder().encode('allmeta\0'), software);
    bytes.set(compressed, strip);
    return bytes;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function pngDpi(blob, dpi) {
    const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
    const chunk = new Uint8Array(21), cv = new DataView(chunk.buffer);
    cv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
    cv.setUint32(8, Math.round(dpi / 0.0254)); cv.setUint32(12, Math.round(dpi / 0.0254));
    chunk[16] = 1; cv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const parts = [bytes.subarray(0, 8)];
    let inserted = false;
    for (let pos = 8; pos < bytes.length;) {
      const end = pos + view.getUint32(pos) + 12;
      const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
      if (type === 'IDAT' && !inserted) { parts.push(chunk); inserted = true; }
      if (type !== 'pHYs') parts.push(bytes.subarray(pos, end));
      pos = end;
    }
    if (!inserted) throw new Error('PNG has no image data');
    return new Blob(parts, { type: 'image/png' });
  }

  async function artifact(plot, format, dpi, widthMm, getReceiptInput) {
    const src = await plot.getSvg();
    if (!src || src.localName !== 'svg') throw new Error('No SVG for ' + plot.name);
    const prepared = _prepareSvg(src);
    const [x, y, w, h] = prepared.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error('Invalid SVG dimensions');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x, y, width: w, height: h, fill: '#fff' }).forEach(([key, value]) => bg.setAttribute(key, value));
    prepared.insertBefore(bg, prepared.firstChild);
    prepared.setAttribute('width', widthMm + 'mm');
    prepared.setAttribute('height', (widthMm * h / w) + 'mm');
    const text = await _stamp(_serialize(prepared), getReceiptInput);
    if (format === 'svg') return new Blob([text], { type: 'image/svg+xml' });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(widthMm / 25.4 * dpi);
    canvas.height = Math.max(1, Math.round(canvas.width * h / w));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve; img.onerror = () => reject(new Error('SVG could not be rasterized')); img.src = url;
      });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } finally { URL.revokeObjectURL(url); }
    if (format === 'tiff') {
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const rgb = new Uint8Array(canvas.width * canvas.height * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4) { rgb[j++] = rgba[i]; rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2]; }
      return new Blob([tiff(rgb, canvas.width, canvas.height, dpi)], { type: 'image/tiff' });
    }
    if (format === 'pdf') {
      const JsPDF = await loadPdf(), heightMm = widthMm * h / w;
      const pdf = new JsPDF({ orientation: w > h ? 'l' : 'p', unit: 'mm', format: [widthMm, heightMm] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
      return pdf.output('blob');
    }
    const png = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed')), 'image/png'));
    return pngDpi(png, dpi);
  }

  const panelContracts = new WeakMap();
  let panelId = 0;
  function init(opts) {
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) throw new Error('Plot export target not found');
    const plots = opts.plots || [], ids = new Set();
    for (const plot of plots) {
      if (typeof plot.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(plot.id) || ids.has(plot.id) || typeof plot.getSvg !== 'function') throw new Error('Invalid or duplicate plot id/getSvg');
      ids.add(plot.id);
    }
    const basename = String(opts.basename || 'chart').replace(/[^a-zA-Z0-9._-]/g, '_');
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend'); legend.textContent = 'Download plots'; group.appendChild(legend);
    const help = document.createElement('p'); help.id = 'alm-plot-help-' + (++panelId);
    help.textContent = 'Choose plots and a format. Each plot downloads as a separate file. Resolution applies to raster exports; width is the printed width.';
    group.appendChild(help); group.setAttribute('aria-describedby', help.id);
    const checks = plots.map(plot => {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.checked = true; input.value = plot.id;
      label.append(input, document.createTextNode(plot.name || plot.id)); group.appendChild(label);
      return input;
    });
    function button(text, action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      b.addEventListener('click', action); group.appendChild(b); return b;
    }
    button('Select all', () => checks.forEach(c => { c.checked = true; }));
    button('Select none', () => checks.forEach(c => { c.checked = false; }));
    function select(labelText, values, initial) {
      const label = document.createElement('label'), el = document.createElement('select');
      label.textContent = labelText;
      el.id = 'alm-plot-' + panelId + '-' + labelText.replace(/ /g, '-').toLowerCase();
      label.htmlFor = el.id;
      values.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; el.appendChild(option); });
      el.value = initial; el.setAttribute('aria-describedby', help.id); group.append(label, el); return el;
    }
    const formats = [['png', 'PNG'], ['svg', 'SVG'], ['tiff', 'TIFF']];
    // The local vendor makes PDF available offline, loaded only when requested.
    if (pdfUrl || (window.jspdf && window.jspdf.jsPDF) || window.jsPDF) formats.push(['pdf', 'PDF']);
    const format = select('Format', formats, 'png');
    const resolution = select('Resolution', [['300', '300 dpi'], ['600', '600 dpi']], '300');
    const width = select('Physical width', [['85', '85 mm'], ['170', '170 mm']], '170');
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    format.addEventListener('change', () => { resolution.disabled = !['png', 'tiff'].includes(format.value); });
    // Keep the emitted message in closure state: neither arbitrary counts nor
    // edited error text can pass the validation contract.
    let emittedStatus = '';
    function report(message) { emittedStatus = message; status.textContent = message; }
    let busy = false;
    async function run(selected) {
      if (busy) return;
      if (!selected.length) { report('Select at least one plot.'); return; }
      busy = true;
      const fmt = format.value, dpi = fmt === 'pdf' ? 300 : Number(resolution.value), mm = Number(width.value);
      const controls = Array.from(group.querySelectorAll('input, select, button'));
      const disabled = controls.map(c => c.disabled); controls.forEach(c => { c.disabled = true; });
      report('Preparing downloads…');
      let count = 0;
      try {
        for (const plot of selected) {
          const blob = await artifact(plot, fmt, dpi, mm, opts.getReceiptInput);
          _download(blob, basename + '-' + plot.id + '.' + fmt); count++;
          if (count < selected.length) await new Promise(resolve => setTimeout(resolve, 200));
        }
        report('Downloaded ' + count + ' file(s)');
      } catch (error) { report('Downloaded ' + count + ' file(s). Export failed: ' + error.message); }
      finally { controls.forEach((c, i) => { c.disabled = disabled[i]; }); busy = false; }
    }
    button('Download selected', () => run(plots.filter((_, i) => checks[i].checked)));
    plots.forEach(plot => button('Download ' + (plot.name || plot.id), () => run([plot])));
    group.appendChild(status); target.replaceChildren(group);
    function staticPanel() {
      const clone = group.cloneNode(true);
      clone.lastElementChild.textContent = '';
      // Disabled and autosave's positional field key are runtime bookkeeping.
      // Neither changes visible text or the export controls' identity. All other
      // structure, attributes, labels and controls retain exact equality.
      clone.querySelectorAll('input, select, button').forEach(el => el.removeAttribute('disabled'));
      clone.querySelectorAll('input, select').forEach(el => el.removeAttribute('data-autosave-index'));
      return clone.outerHTML;
    }
    const originalPanel = staticPanel();
    panelContracts.set(group, () => group.lastElementChild === status &&
      status.children.length === 0 && status.textContent === emittedStatus &&
      staticPanel() === originalPanel);
    return group;
  }
  // Binary codec hooks allow independent conformance tests without a DOM canvas.
  init.statusContract = function (group) {
    const check = panelContracts.get(group);
    return !!check && check();
  };
  init._lzw = lzw;
  init._tiff = tiff;
  window.alm = window.alm || {};
  window.alm.plotExport = init;
})();
