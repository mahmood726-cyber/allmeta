/* Journal figure presets. Presentation only: clone the app's SVG, never rerun an engine.
 * Values are memory-based suggestions for graphs/line art, not confirmed requirements.
 * Source URLs are places to check, not evidence that these values were fetched.
 * null means unknown. All entries must remain unverified pending source review.
 * Browser: AlmFigPresets; CommonJS: pure data/sizing helpers for independent tests.
 */
(function (global) {
  'use strict';
  const presets = [
    { id: 'f1000', name: 'F1000Research', width_mm: { single: 75, double: 150 }, min_dpi: 600,
      font_family: null, min_pt: 8, formats: ['eps', 'tiff'], tiff_compression: 'none',
      colour_notes: 'RGB or grayscale; white background. Graphs: EPS preferred; fallback TIFF must be uncompressed.',
      source_url: 'https://f1000research.com/for-authors/article-guidelines/clinical-practice-articles', verified: false },
    { id: 'bmj', name: 'BMJ', width_mm: { single: null, double: null }, min_dpi: 1200,
      font_family: null, min_pt: null, formats: ['tiff', 'eps', 'pdf'], tiff_compression: null,
      colour_notes: 'Colour online; print colour charges depend on the journal. Line art requires 1200 dpi; photographs 300 dpi.',
      source_url: 'https://authors.bmj.com/writing-and-formatting/formatting-your-paper/', verified: false },
    { id: 'lancet', name: 'The Lancet', width_mm: { single: null, double: null }, min_dpi: null,
      font_family: null, min_pt: null, formats: ['eps', 'pdf', 'svg'], tiff_compression: null,
      colour_notes: 'Supply editable vectors for redrawing. Forest plots/trial profiles use black and white; explain meaningful colour.',
      source_url: 'https://www.lancet.com/pb/assets/raw/Lancet/authors/artwork-guidelines.pdf', verified: false },
    { id: 'jama', name: 'JAMA', width_mm: { single: null, double: null }, min_dpi: null,
      font_family: null, min_pt: null, formats: ['eps', 'pdf'], tiff_compression: null,
      colour_notes: 'Graphs are recreated by the journal. Online-only figures have separate typography requirements; check article type.',
      source_url: 'https://jamanetwork.com/journals/jama/pages/instructions-for-authors/', verified: false },
    { id: 'nejm', name: 'NEJM', width_mm: { single: null, double: null }, min_dpi: null,
      font_family: null, min_pt: null, formats: ['eps', 'svg'], tiff_compression: null,
      colour_notes: 'Submit editable vectors for data visualizations; final figures are prepared with the production team.',
      source_url: 'https://www.nejm.org/author-center/new-manuscripts', verified: false },
    { id: 'plos', name: 'PLOS ONE', width_mm: { single: 132, double: 190.5 }, min_dpi: 300,
      font_family: 'Arial', min_pt: 8, formats: ['tiff', 'eps'], tiff_compression: 'lzw',
      colour_notes: 'RGB colour. Use 8–12 pt Arial, Times or Symbol and 300–600 dpi. 132 mm aligns to text; 190.5 mm is maximum width, not fixed columns.',
      source_url: 'https://journals.plos.org/plosone/s/figures', verified: false },
    { id: 'cochrane', name: 'Cochrane (RevMan-style)', width_mm: { single: null, double: null }, min_dpi: null,
      font_family: null, min_pt: null, formats: null, tiff_compression: null,
      colour_notes: 'RevMan images must be legible and at least 500 pixels wide. This preset preserves the app drawing; it does not recreate a RevMan plot.',
      source_url: 'https://www.cochrane.org/authors/handbooks-and-manuals/style-manual/tables-and-figures/figures', verified: false },
    { id: 'custom', name: 'Custom', width_mm: { single: null, double: null }, min_dpi: null,
      font_family: null, min_pt: null, formats: null, tiff_compression: null,
      colour_notes: 'User-defined export settings. No journal requirements are implied.',
      source_url: null, verified: false }
  ];
  const supported = ['svg', 'png', 'tiff', 'pdf'];
  function lint(items) {
    const errors = [], ids = new Set();
    for (const p of items) {
      if (!p.id || ids.has(p.id)) errors.push('Missing/duplicate preset id');
      ids.add(p.id);
      if (p.id === 'custom') {
        if (p.source_url !== null) errors.push('Custom must have a null source URL');
      } else if (!/^https:\/\/[^/\s]+\//.test(p.source_url || '')) errors.push(p.id + ': missing or unsafe source URL');
      if (p.verified !== false) errors.push(p.id + ': memory-based values must remain unverified');
      for (const n of [p.width_mm && p.width_mm.single, p.width_mm && p.width_mm.double, p.min_dpi, p.min_pt]) {
        if (n !== null && (!Number.isFinite(n) || n <= 0)) errors.push(p.id + ': invalid numeric requirement');
      }
      if (p.formats !== null && (!Array.isArray(p.formats) || !p.formats.length || p.formats.some(f => ![...supported, 'eps'].includes(f)))) errors.push(p.id + ': invalid formats');
      if (p.font_family !== null && (typeof p.font_family !== 'string' || !p.font_family.trim())) errors.push(p.id + ': invalid font');
      if (!p.colour_notes) errors.push(p.id + ': missing colour notes');
    }
    return errors;
  }
  function positive(n) {
    if (!Number.isFinite(n) || n <= 0) throw new Error('Size and resolution must be positive finite numbers.');
    return n;
  }
  function mmToPx(mm, dpi) { return Math.round(positive(mm) / 25.4 * positive(dpi)); }
  function settings(id, overrides) {
    const p = presets.find(p => p.id === id);
    if (!p) throw new Error('Unknown journal preset');
    const o = overrides || {}, column = o.column || 'single';
    if (!['single', 'double'].includes(column)) throw new Error('Unknown column');
    const widthMm = positive(o.widthMm === undefined ? (p.width_mm[column] || (column === 'double' ? 170 : 85)) : o.widthMm);
    const dpi = positive(o.dpi === undefined ? (p.min_dpi || 300) : o.dpi);
    if (!Number.isInteger(dpi)) throw new Error('Resolution must be a whole number.');
    if (p.min_dpi && dpi < p.min_dpi) throw new Error('Resolution is below the preset minimum of ' + p.min_dpi + ' dpi. Use Custom to override.');
    const minPt = o.minPt === undefined ? p.min_pt : o.minPt;
    if (minPt !== null && (!Number.isFinite(minPt) || minPt < 0)) throw new Error('Font size must be non-negative.');
    if (p.min_pt && minPt < p.min_pt) throw new Error('Font size is below the preset minimum. Use Custom to override.');
    return { widthMm, dpi, minPt, fontFamily: o.fontFamily === undefined ? p.font_family : o.fontFamily,
      widthIsDefault: o.widthMm === undefined && p.width_mm[column] === null,
      tiffCompression: p.tiff_compression || 'lzw' };
  }
  // Input is already a styled clone, with the exporter's original padded viewBox.
  function applySvg(svg, config) {
    const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('Invalid SVG dimensions');
    const width = positive(config.widthMm), min = (config.minPt || 0) * 25.4 / 72 * box[2] / width;
    svg.setAttribute('width', width + 'mm'); svg.setAttribute('height', (width * box[3] / box[2]) + 'mm');
    svg.querySelectorAll('text, tspan').forEach(el => {
      if (config.fontFamily) el.style.fontFamily = config.fontFamily;
      if (min) el.style.fontSize = Math.max(min, parseFloat(el.style.fontSize) || 0) + 'px';
    });
    return svg;
  }
  if (lint(presets).length) throw new Error(lint(presets).join('; '));
  presets.forEach(p => { Object.freeze(p.width_mm); if (p.formats) Object.freeze(p.formats); Object.freeze(p); });
  Object.freeze(presets);
  const api = { presets, lint, settings, mmToPx, applySvg, mount, register, scan };
  global.AlmFigPresets = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!global.document) return;
  const doc = global.document, self = doc.currentScript;
  const base = self && self.src;
  const loads = new Map(), mounted = new WeakMap(), instances = new WeakMap(), fields = new WeakMap();
  // An anchor click starts a download; it does not report transfer completion.
  // Keep its Blob URL alive for this document, including a bfcache round trip.
  // A fixed timer can cancel a large PDF before the browser has consumed it.
  const downloads = new Set();
  if (global.addEventListener) global.addEventListener('pagehide', event => {
    if (event.persisted) return;
    downloads.forEach(url => URL.revokeObjectURL(url)); downloads.clear();
  });
  function load(relative, available) {
    if (available()) return Promise.resolve();
    const url = new URL(relative, base).href;
    if (!loads.has(url)) loads.set(url, new Promise((resolve, reject) => {
      const script = doc.createElement('script'); script.src = url;
      if (self && self.nonce) script.nonce = self.nonce;
      script.onload = () => available() ? resolve() : reject(new Error('Export dependency unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('Could not load export dependency')); };
      doc.head.appendChild(script);
    }).catch(e => { loads.delete(url); throw e; }));
    return loads.get(url);
  }
  // Exporters register their source handles only. Their target is an identity/lifetime
  // key, never a UI mount: pinned results and chart bars must remain untouched.
  const registrations = new Map(), discovered = new Map();
  let auto = false, observer, scheduled = false, host, currentPanel, currentPlots = [];
  function register(opts) {
    if (opts.auto) auto = true;
    else if (opts.target) registrations.set(opts.target, opts);
    schedule();
  }
  function schedule() {
    if (scheduled || !doc.body || doc.readyState === 'loading') return;
    scheduled = true;
    (global.requestAnimationFrame || global.setTimeout)(scan);
  }
  function scan() {
    scheduled = false;
    if (!doc.body) return;
    if (!observer && global.MutationObserver) {
      observer = new global.MutationObserver(schedule);
      observer.observe(doc.body, { childList: true, subtree: true });
    }
    if (auto) {
      discovered.forEach((opts, svg) => { if (!svg.isConnected) discovered.delete(svg); });
      doc.querySelectorAll('svg').forEach(svg => {
        if (discovered.has(svg) || svg.hasAttribute('data-alm-noexport') ||
            svg.closest('.js-plotly-plot, .alm-xbar, .alm-dl, #alm-features, button, a')) return;
        const rect = svg.getBoundingClientRect();
        const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        const width = rect.width || parseFloat(svg.getAttribute('width')) || box[2] || 0;
        const height = rect.height || parseFloat(svg.getAttribute('height')) || box[3] || 0;
        if (width < 200 || height < 120) return;
        const name = svg.getAttribute('data-alm-export') || svg.id || 'chart-' + (discovered.size + 1);
        discovered.set(svg, { basename: name, plots: [{ id: name, name, getSvg: () => svg.isConnected ? svg : null }] });
      });
    }
    registrations.forEach((opts, target) => {
      if (!target.isConnected || (opts.isCurrent && !opts.isCurrent())) registrations.delete(target);
    });
    const entries = [...registrations.values(), ...discovered.values()], plots = [];
    // Do not call getSvg here: some apps revalidate/re-render in that callback.
    // Read the source only when the user requests an export.
    entries.forEach(opts => (opts.plots || []).forEach(plot => { plots.push({ plot, opts }); }));
    if (!entries.length) {
      if (host) host.remove();
      // A redraw can remove every SVG before the exporters register replacements.
      // Detach stale controls, but keep the host identity and its saved form so
      // the next mount restores the user's settings through the same WeakMap.
      currentPanel = null; currentPlots = []; return;
    }
    let features = doc.getElementById('alm-features');
    // Fallback for apps without feature modules: append after all existing content.
    // Never insert into main, a plot host, a footer, or a chart download bar.
    if (!features) {
      features = doc.createElement('div'); features.id = 'alm-features'; doc.body.appendChild(features);
    }
    if (features.closest('main, header, footer, .alm-xbar, .alm-dl')) return;
    if (!host) {
      host = doc.createElement('div'); host.id = 'alm-figpresets-host'; host.className = 'alm-preset-auto';
      host.setAttribute('role', 'region'); host.setAttribute('aria-label', 'Journal figure export');
    }
    if (host.parentNode !== features) features.appendChild(host);
    if (currentPanel && currentPanel.parentNode === host && plots.length === currentPlots.length &&
        plots.every((item, i) => item.plot === currentPlots[i].plot && item.opts === currentPlots[i].opts)) return;
    currentPlots = plots;
    currentPanel = mount({ target: host, plots: plots.map(({ plot, opts }) => ({ ...plot,
      basename: opts.basename, getReceiptInput: opts.getReceiptInput })) });
  }
  let serial = 0;
  function mount(opts) {
    const target = opts.target;
    if (!target) return;
    const previous = mounted.get(target);
    const state = previous && fields.get(previous).map(el => el.value);
    if (previous) previous.remove();
    const panel = doc.createElement('fieldset'); panel.className = 'alm-figpresets';
    const legend = doc.createElement('legend'); legend.textContent = 'Journal figure export'; panel.appendChild(legend);
    // An app redraw only replaces export handles. Keep the form's public identity
    // and values stable: live validation fingerprints every input outside its panel.
    const instance = previous ? instances.get(previous) : ++serial;
    instances.set(panel, instance);
    const inputs = []; fields.set(panel, inputs);
    function field(labelText, values, value, type) {
      const field = doc.createElement('span'); field.className = 'alm-figpresets-field';
      // These are export settings, not analysis inputs. A native tree boundary
      // keeps document-wide autosave selectors/indices and input fingerprints
      // unchanged, including when the panel loads during an in-flight R check.
      // Labels and controls share the same root; keyboard/AT access stays native.
      const root = field.attachShadow({ mode: 'open' });
      const css = doc.createElement('style');
      if (self && self.nonce) css.nonce = self.nonce;
      css.textContent = 'label{display:block}input,select{box-sizing:border-box;max-width:100%;font:inherit;color:CanvasText;background:Canvas}input{width:7rem}input:focus-visible,select:focus-visible{outline:2px solid currentColor;outline-offset:2px}';
      root.appendChild(css);
      const label = doc.createElement('label'), el = doc.createElement(values ? 'select' : 'input');
      el.id = 'alm-fig-' + instance + '-' + panel.children.length;
      label.htmlFor = el.id; label.textContent = labelText + ' ';
      if (values) values.forEach(([v, text]) => { const option = doc.createElement('option'); option.value = v; option.textContent = text; el.appendChild(option); });
      else { el.type = type || 'number'; if (el.type === 'number') el.step = 'any'; }
      // Keep option text out of the label while retaining the native for/id association.
      el.value = value; root.append(label, el); panel.appendChild(field); inputs.push(el); return el;
    }
    const warning = "Unverified — check the journal's current author guide";
    const journal = field('Journal preset', presets.map(p => [p.id, p.name + ' — ' + warning]), 'custom');
    const verification = doc.createElement('span'); verification.className = 'alm-figpresets-verification';
    panel.appendChild(verification);
    const column = field('Column width', [['single', 'Single / text column'], ['double', 'Double / full width']], 'single');
    const width = field('Preset width (mm)', null, '85');
    const dpi = field('Preset resolution (dpi)', null, '300');
    const font = field('Preset font family', null, '', 'text'); font.placeholder = 'Keep original font';
    const pt = field('Preset minimum font (pt)', null, '0');
    const format = field('Preset export format', supported.map(f => [f, f === 'pdf' ? 'PDF (raster image)' : f.toUpperCase()]), 'svg');
    const note = doc.createElement('p'), source = doc.createElement('a');
    source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Figure guidelines';
    const status = doc.createElement('p'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    panel.append(note, source);
    function refresh() {
      const p = presets.find(p => p.id === journal.value), s = settings(p.id, { column: column.value });
      width.value = s.widthMm; dpi.value = s.dpi; font.value = s.fontFamily || ''; pt.value = s.minPt || 0;
      verification.textContent = p.name + ': ' + warning;
      source.hidden = p.source_url === null;
      if (p.source_url) source.href = p.source_url;
      else source.removeAttribute?.('href');
      source.textContent = 'Check current figure guidelines';
      const known = p.formats ? p.formats.map(f => f.toUpperCase()).join(', ') : 'not established';
      note.textContent = "Please check the journal's current guidelines. These memory-based suggestions are unverified and do not establish compliance. " +
        'Unverified format suggestions for graphs: ' + known + '. EPS export is unavailable; SVG is an editable working file. PDF here contains a raster image. ' +
        (s.widthIsDefault ? 'Width uses an app default (85/170 mm), not a verified journal size. ' : '') +
        (!p.min_dpi ? 'Resolution defaults to 300 dpi; no journal minimum is established. ' : '') +
        'TIFF export compression: ' + s.tiffCompression + '. Unverified notes: ' + p.colour_notes;
      for (const option of format.options) option.textContent = option.value.toUpperCase() +
        (option.value === 'pdf' ? ' (raster image)' : '') +
        (p.formats && !p.formats.includes(option.value) ? ' (working format; not listed)' : '');
    }
    journal.addEventListener('change', refresh); column.addEventListener('change', refresh);
    if (state) { journal.value = state[0]; column.value = state[1]; }
    refresh();
    // Restore the user's overrides silently. Dispatching change here is an edit
    // even with bubbles:false, because document capture listeners still see it.
    if (state) inputs.forEach((el, i) => { el.value = state[i]; });
    let busy = false;
    for (const plot of opts.plots || []) {
      const button = doc.createElement('button'); button.type = 'button';
      button.textContent = 'Export ' + (plot.name || plot.id || 'chart') + ' with preset'; panel.appendChild(button);
      button.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        const controls = [...inputs, ...panel.querySelectorAll('button')];
        // An idle export form has no status yet. Publish one for this action;
        // loading presets alone must not add an empty legacy status competitor.
        status.setAttribute('role', 'status');
        controls.forEach(c => { c.disabled = true; }); status.textContent = 'Preparing figure…';
        try {
          const config = settings(journal.value, { column: column.value, widthMm: Number(width.value), dpi: Number(dpi.value), minPt: Number(pt.value), fontFamily: font.value });
          const fmt = format.value;
          if (!supported.includes(fmt)) throw new Error('Unsupported export format');
          await load('../hub/shared/plot-export.js', () => global.alm && global.alm.plotExport && global.alm.plotExport.artifact);
          if (fmt === 'tiff' && config.tiffCompression === 'none') await load('alm-zip.js', () => global.AlmZip);
          const blob = await global.alm.plotExport.artifact(plot, fmt, config.dpi, config.widthMm, plot.getReceiptInput || opts.getReceiptInput, config);
          const link = doc.createElement('a'); link.href = URL.createObjectURL(blob);
          downloads.add(link.href);
          link.download = String(plot.basename || opts.basename || 'figure').replace(/[^a-zA-Z0-9._-]/g, '_') + '-' + String(plot.id || 'chart').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + journal.value + '.' + fmt;
          doc.body.appendChild(link); link.click(); link.remove();
          status.textContent = 'Figure exported. Review labels and layout before submission.';
        } catch (error) { status.textContent = 'Export failed: ' + error.message; }
        finally { controls.forEach(c => { c.disabled = false; }); busy = false; }
      });
    }
    if (!(opts.plots || []).length) note.textContent += ' Journal export requires the app’s original SVG; this chart provides only a canvas.';
    panel.appendChild(status); target.appendChild(panel); mounted.set(target, panel);
    return panel;
  }
  const style = doc.createElement('style');
  if (self && self.nonce) style.nonce = self.nonce;
  style.textContent = '.alm-figpresets{margin:.5rem 0;padding:.6rem;min-width:0;font:12px/1.5 system-ui,sans-serif;text-align:left}.alm-figpresets-field{display:inline-block;vertical-align:top;max-width:calc(100% - .6rem);margin:.2rem .6rem .2rem 0}.alm-figpresets button{margin:.3rem;max-width:calc(100% - .6rem);white-space:normal}.alm-figpresets p{max-width:85ch;margin:.4rem 0}';
  doc.head.appendChild(style);
  (global.__almFigPresetQueue || []).splice(0).forEach(register);
  if (doc.addEventListener) doc.addEventListener('DOMContentLoaded', schedule);
})(typeof window !== 'undefined' ? window : globalThis);
