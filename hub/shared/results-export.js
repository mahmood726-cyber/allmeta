(function () {
  const _STYLE = `.alm-export{display:inline-flex;gap:.5rem;font:13px/1.4 system-ui,sans-serif}.alm-export button{padding:.3rem .6rem;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer}`;
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
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
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

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) { console.warn('[alm.resultsExport] target not found'); return; }
    const basename = opts.basename || 'results';
    const getResults = typeof opts.getResults === 'function' ? opts.getResults : () => ({});
    _ensureStyle();
    target.innerHTML = `
      <div class="alm-export">
        <button type="button" data-action="json">Download JSON</button>
        <button type="button" data-action="csv">Download CSV</button>
        <button type="button" data-action="md">Download Markdown</button>
      </div>`;
    target.querySelector('[data-action="json"]').addEventListener('click', () => {
      const r = getResults();
      _download(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }), basename + '.json');
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
