(function () {
  const _STYLE = `.alm-export{display:inline-flex;gap:.5rem;font:13px/1.4 system-ui,sans-serif}.alm-export button{padding:.3rem .6rem;border:1px solid var(--border,#cbd5e1);border-radius:6px;background:var(--panel,#fff);color:var(--ink,#15181d);cursor:pointer}@media (prefers-color-scheme:dark){.alm-export button{background:var(--panel,#23272c);color:var(--ink,#e7e4dc);border-color:var(--border,#3a4048)}}`;
  let _stylesInjected = false;
  const DANGEROUS = /^[=+@\t\r]/;

  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s); _stylesInjected = true;
  }
  function _download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function _csvEscape(v) {
    let s = (v == null) ? '' : String(v);
    if (DANGEROUS.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function _flatKVs(obj, prefix) {
    prefix = prefix || '';
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? prefix + '.' + k : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        out.push(..._flatKVs(v, path));
      } else if (Array.isArray(v)) {
        out.push([path, JSON.stringify(v)]);
      } else {
        out.push([path, v]);
      }
    }
    return out;
  }
  function _toCSV(obj) {
    const rows = [['key', 'value'], ..._flatKVs(obj)];
    return rows.map(r => r.map(_csvEscape).join(',')).join('\r\n');
  }
  function _mdEscape(v) {
    return String(v == null ? '' : v).replace(/\|/g, '\\|');
  }
  function _toMD(obj) {
    const rows = _flatKVs(obj);
    const keyW = Math.max(3, ...rows.map(r => String(r[0]).length));
    const valW = Math.max(5, ...rows.map(r => String(r[1]).length));
    const pad = (s, n) => String(s).padEnd(n);
    const lines = [
      '| ' + pad('key', keyW) + ' | ' + pad('value', valW) + ' |',
      '|' + '-'.repeat(keyW + 2) + '|' + '-'.repeat(valW + 2) + '|',
    ];
    for (const [k, v] of rows) {
      lines.push('| ' + pad(_mdEscape(k), keyW) + ' | ' + pad(_mdEscape(v), valW) + ' |');
    }
    return lines.join('\n');
  }

  // ---- Methods + Results prose report -----------------------------------
  // Auto-pulls the app's own descriptive copy (title, intro, footer/methods note)
  // — which already documents the method — and formats getResults() beneath it,
  // so any app wiring resultsExport gets a readable, citable report for free.
  function _grab(sel) {
    const el = document.querySelector(sel);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function _autoMeta(opts) {
    const title = opts.title || _grab('h1') || document.title || 'allmeta analysis';
    const desc = opts.description || _grab('header p') || _grab('main p') ||
      (document.querySelector('meta[name="description"]') || {}).content || '';
    let methods = opts.methods || _grab('.footer-note') || _grab('footer');
    if (typeof opts.methods === 'function') methods = opts.methods();
    return { title, desc, methods };
  }
  function _resultsBlock(obj, plain) {
    const rows = _flatKVs(obj).filter(([k]) => k !== '_schema');
    if (!rows.length) return '_(No results yet — run the analysis first, then export.)_';
    if (plain) return rows.map(([k, v]) => k + ': ' + (v == null ? '' : v)).join('\n');
    return _toMD(obj);
  }
  function _toReport(obj, opts, plain) {
    const m = _autoMeta(opts);
    const today = new Date().toISOString().slice(0, 10);
    const L = [];
    L.push((plain ? '' : '# ') + m.title);
    if (plain) L.push('='.repeat(m.title.length));
    L.push('');
    L.push((plain ? '' : '_') + 'Generated ' + today +
      ' with allmeta — browser-only evidence synthesis (https://github.com/).' + (plain ? '' : '_'));
    L.push('');
    L.push((plain ? 'METHODS' : '## Methods'));
    L.push('');
    if (m.desc) L.push(m.desc);
    if (m.methods && m.methods !== m.desc) { L.push(''); L.push(m.methods); }
    L.push('');
    L.push((plain ? 'RESULTS' : '## Results'));
    L.push('');
    L.push(_resultsBlock(obj, plain));
    L.push('');
    return L.join('\n');
  }

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) { console.warn('[alm.resultsExport] target not found'); return; }
    const basename = opts.basename || 'results';
    const getResults = typeof opts.getResults === 'function' ? opts.getResults : () => ({});
    // Optional: bind a verifiable TruthCert receipt to the JSON export.
    // getReceiptInput() -> { studies, method, results, label } for the current
    // analysis (or null to skip). Needs shared/ma-studies-v1.js +
    // shared/truthcert-export.js; degrades to an unsigned export (with a warn)
    // if signing was requested but the signer/input is unavailable.
    const getReceiptInput = typeof opts.getReceiptInput === 'function' ? opts.getReceiptInput : null;
    async function _maybeSign(r) {
      if (!getReceiptInput || !window.AlmTruthCertExport) {
        if (getReceiptInput && !window.AlmTruthCertExport)
          console.warn('[alm.resultsExport] truthcert-export.js not loaded — JSON export NOT signed.');
        return r;
      }
      let input;
      try { input = getReceiptInput(); } catch (e) { console.warn('[alm.resultsExport] getReceiptInput threw — JSON NOT signed:', e); return r; }
      if (!input) return r;
      try {
        const res = await window.AlmTruthCertExport.buildReceipt(input);
        return Object.assign({}, r, { _truthcert: res.signed ? res.receipt : res.manifest });
      } catch (e) { console.warn('[alm.resultsExport] signing failed — JSON NOT signed:', e); return r; }
    }
    _ensureStyle();
    target.innerHTML = `
      <div class="alm-export">
        <button type="button" data-action="report-md" title="Readable Methods + Results report (Markdown)">Methods+Results (.md)</button>
        <button type="button" data-action="report-txt" title="Readable Methods + Results report (plain text)">.txt</button>
        <button type="button" data-action="json">JSON</button>
        <button type="button" data-action="csv">CSV</button>
        <button type="button" data-action="md">Data (.md)</button>
      </div>`;
    target.querySelector('[data-action="report-md"]').addEventListener('click', () => {
      _download(new Blob([_toReport(getResults(), opts, false)], { type: 'text/markdown' }), basename + '-report.md');
    });
    target.querySelector('[data-action="report-txt"]').addEventListener('click', () => {
      _download(new Blob([_toReport(getResults(), opts, true)], { type: 'text/plain' }), basename + '-report.txt');
    });
    target.querySelector('[data-action="json"]').addEventListener('click', async () => {
      const out = await _maybeSign(getResults());
      _download(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), basename + '.json');
    });
    target.querySelector('[data-action="csv"]').addEventListener('click', () => {
      _download(new Blob([_toCSV(getResults())], { type: 'text/csv' }), basename + '.csv');
    });
    target.querySelector('[data-action="md"]').addEventListener('click', () => {
      _download(new Blob([_toMD(getResults())], { type: 'text/markdown' }), basename + '.md');
    });
  }

  window.alm = window.alm || {};
  window.alm.resultsExport = init;
})();
