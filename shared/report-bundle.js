/**
 * shared/report-bundle.js — generate a self-contained HTML report from an
 * analysis run.
 *
 * Why: TruthCert signs the inputs; this archives the WHOLE analysis as a
 * single offline-viewable file that can be cited, archived, or emailed.
 * Output:
 *   - 1 file, no external dependencies (CSS inlined, plot SVGs inlined)
 *   - Opens in any browser, prints cleanly
 *   - Embeds AlmBuildInfo (version + sha), seed, timestamp at top
 *   - Includes a copy-pasteable R script (when supplied)
 *   - Vancouver-formatted citations for the methods used
 *
 * The output filename is `allmeta-<appKey>-<YYYYMMDD>-<seed8>.html` so
 * users can identify it later. Triggers a browser download via Blob URL.
 *
 * Public API:
 *   AlmReport.buildHtml(opts)           -> string  (the HTML body)
 *   AlmReport.exportBundle(opts)        -> filename triggered as download
 *   AlmReport.attachExportButton({...}) -> wires a button to exportBundle
 */
(function (global) {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _isoNow() { return new Date().toISOString(); }

  function _inlineSvg(elOrSelector) {
    const el = typeof elOrSelector === 'string'
      ? global.document.querySelector(elOrSelector)
      : elOrSelector;
    if (!el) return '';
    // Plotly stores its rendered chart in a child <svg class="main-svg">;
    // a generic <svg> is one we wrote ourselves. Try the Plotly path first.
    const svg = el.querySelector ? (el.querySelector('svg.main-svg') || el.querySelector('svg') || (el.tagName === 'svg' ? el : null)) : null;
    if (!svg) return '';
    return svg.outerHTML;
  }

  function _inlineCanvas(elOrSelector) {
    const el = typeof elOrSelector === 'string'
      ? global.document.querySelector(elOrSelector)
      : elOrSelector;
    if (!el) return '';
    const canvas = el.tagName === 'CANVAS' ? el : (el.querySelector && el.querySelector('canvas'));
    if (!canvas || typeof canvas.toDataURL !== 'function') return '';
    try {
      const data = canvas.toDataURL('image/png');
      return `<img src="${data}" alt="Plot" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px;">`;
    } catch (_) { return ''; }
  }

  function _inlinePlot(selOrEl) {
    return _inlineSvg(selOrEl) || _inlineCanvas(selOrEl);
  }

  function _kvTable(obj) {
    if (!obj || typeof obj !== 'object') return '';
    const rows = Object.keys(obj).map(k => {
      const v = obj[k];
      const disp = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
      return `<tr><th>${_esc(k)}</th><td>${_esc(disp)}</td></tr>`;
    }).join('');
    return `<table class="kv">${rows}</table>`;
  }

  function _studiesTable(studies) {
    if (!Array.isArray(studies) || studies.length === 0) return '<p><em>No studies provided.</em></p>';
    const cols = Object.keys(studies[0]);
    const head = '<tr>' + cols.map(c => `<th>${_esc(c)}</th>`).join('') + '</tr>';
    const body = studies.map(s => '<tr>' + cols.map(c => `<td>${_esc(s[c])}</td>`).join('') + '</tr>').join('');
    return `<table class="data">${head}${body}</table>`;
  }

  function _citationsBlock(citations) {
    if (!Array.isArray(citations) || citations.length === 0) return '';
    const items = citations.map(c => {
      const txt = c.vancouver || c.text || '';
      return `<li>${_esc(txt)}</li>`;
    }).join('');
    return `<section><h2>Method papers</h2><ol class="cites">${items}</ol></section>`;
  }

  function _provenanceBlock(opts) {
    const bi = (global.AlmBuildInfo && typeof global.AlmBuildInfo === 'object') ? global.AlmBuildInfo : {};
    const rows = {
      app: opts.appKey || bi.app || 'allmeta',
      version: bi.version || 'unknown',
      sha: bi.sha || 'unknown',
      builtAt: bi.builtAt || '',
      generatedAt: _isoNow(),
      seed: opts.seed != null ? String(opts.seed) : '(not stochastic)',
      seedSource: opts.seedSource || (opts.seed != null ? 'auto' : ''),
      url: bi.url || '',
    };
    return `<section><h2>Provenance</h2>${_kvTable(rows)}<p class="prov-note">Cite this analysis by quoting the values above. The SHA pins the exact code path; the seed (if shown) pins the stochastic component.</p></section>`;
  }

  function _stylesBlock() {
    return `<style>
:root { --fg:#1f2937; --muted:#6b7280; --line:#e5e7eb; --bg:#ffffff;
        --accent:#2563eb; --accent-bg:#dbeafe; }
@media (prefers-color-scheme: dark) {
  :root { --fg:#f3f4f6; --muted:#9ca3af; --line:#374151; --bg:#0b1220;
          --accent:#60a5fa; --accent-bg:#1e3a8a; }
}
body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
       color:var(--fg); background:var(--bg); max-width:880px; margin:32px auto; padding:0 22px 80px; }
h1 { font-size:24px; letter-spacing:-0.01em; margin:0 0 4px; }
h2 { font-size:17px; margin-top:32px; border-bottom:1px solid var(--line); padding-bottom:6px; }
.sub { color:var(--muted); margin:0 0 22px; font-size:13px; }
section { margin: 22px 0; }
.kv, .data { border-collapse:collapse; font-size:13px; width:100%; }
.kv th, .kv td { padding:6px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
.kv th { color:var(--muted); font-weight:600; width:32%; font-family:ui-monospace,SFMono-Regular,monospace; }
.data th, .data td { padding:6px 10px; border:1px solid var(--line); text-align:left; font-size:12px; }
.data th { background:var(--accent-bg); color:var(--fg); font-weight:600; }
.cites { font-size:13px; padding-left:22px; }
.cites li { margin-bottom:8px; }
.r-block { background:#0f172a; color:#e2e8f0; padding:16px 18px; border-radius:8px;
           font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-x:auto;
           white-space:pre; }
.plot-frame { margin:18px 0; border:1px solid var(--line); border-radius:8px; padding:14px; background:var(--bg); }
.plot-frame svg { width:100%; height:auto; }
.prov-note { color:var(--muted); font-size:12px; margin-top:8px; }
@media print {
  body { margin:0; max-width:none; padding:18px; }
  h2 { page-break-after:avoid; }
  .plot-frame { break-inside:avoid; }
}
.hdr { display:flex; justify-content:space-between; gap:16px; align-items:baseline; flex-wrap:wrap; }
.alm-mark { color:var(--accent); font-weight:700; }
</style>`;
  }

  function buildHtml(opts) {
    opts = opts || {};
    const title = _esc(opts.title || 'allmeta analysis report');
    const subtitle = _esc(opts.subtitle || '');
    const inputsHtml = opts.inputs ?
      ('<section><h2>Inputs</h2>' +
        (opts.inputs.options ? '<h3 style="font-size:14px;margin:8px 0 4px;color:var(--muted)">Options</h3>' + _kvTable(opts.inputs.options) : '') +
        (opts.inputs.studies ? '<h3 style="font-size:14px;margin:16px 0 4px;color:var(--muted)">Studies</h3>' + _studiesTable(opts.inputs.studies) : '') +
      '</section>')
      : '';
    const resultsHtml = opts.results ?
      ('<section><h2>Results</h2>' + _kvTable(opts.results) + '</section>')
      : '';

    let plotsHtml = '';
    if (Array.isArray(opts.plots) && opts.plots.length > 0) {
      const parts = opts.plots.map(sel => {
        const inlined = _inlinePlot(sel);
        if (!inlined) return '';
        return `<div class="plot-frame">${inlined}</div>`;
      }).filter(Boolean);
      if (parts.length > 0) plotsHtml = `<section><h2>Plots</h2>${parts.join('')}</section>`;
    }

    const citesHtml = _citationsBlock(opts.citations);

    const rScriptHtml = (typeof opts.rScript === 'string' && opts.rScript.trim().length > 0)
      ? `<section><h2>R script (re-computation)</h2><pre class="r-block">${_esc(opts.rScript)}</pre></section>`
      : '';

    const provHtml = _provenanceBlock(opts);

    return [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="UTF-8">',
      `<title>${title} — allmeta report</title>`,
      _stylesBlock(),
      '</head><body>',
      `<header class="hdr"><div><h1>${title}</h1>${subtitle ? `<p class="sub">${subtitle}</p>` : ''}</div><div class="alm-mark">allmeta</div></header>`,
      inputsHtml,
      resultsHtml,
      plotsHtml,
      citesHtml,
      rScriptHtml,
      provHtml,
      '</body></html>',
    ].join('\n');
  }

  function _filenameFor(opts) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seedTag = (opts && opts.seed != null) ? String(opts.seed).slice(0, 8) : 'noseed';
    const app = (opts && opts.appKey) ? opts.appKey : 'analysis';
    return `allmeta-${app}-${date}-${seedTag}.html`;
  }

  function exportBundle(opts) {
    const html = buildHtml(opts || {});
    const blob = new global.Blob([html], { type: 'text/html;charset=utf-8' });
    const url = global.URL.createObjectURL(blob);
    const a = global.document.createElement('a');
    a.href = url;
    a.download = _filenameFor(opts);
    global.document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { a.remove(); } catch (_) {}
      try { global.URL.revokeObjectURL(url); } catch (_) {}
    }, 0);
    return a.download;
  }

  function attachExportButton(opts) {
    opts = opts || {};
    const btn = typeof opts.btn === 'string' ? global.document.querySelector(opts.btn) : opts.btn;
    if (!btn) return null;
    const getter = typeof opts.getBundle === 'function' ? opts.getBundle : null;
    if (!getter) return null;
    btn.addEventListener('click', () => {
      let bundle;
      try { bundle = getter(); } catch (e) { console.error('getBundle threw:', e); return; }
      if (!bundle) return;
      try { exportBundle(bundle); } catch (e) { console.error('exportBundle failed:', e); }
    });
    return btn;
  }

  const api = { buildHtml, exportBundle, attachExportButton, _filenameFor, _esc };
  global.AlmReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
