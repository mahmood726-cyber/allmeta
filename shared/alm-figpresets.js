/* Journal figure presets. Presentation only: clone the app's SVG, never rerun an engine.
 * null means not established from the linked source, NOT a journal requirement.
 * Values are for graphs/line art. All entries deliberately remain unverified:
 * article type, production stage and current guidance still need author review.
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
      source_url: 'https://authors.bmj.com/writing-and-formatting/formatting-your-paper/', verified: false }
  ];
  const supported = ['svg', 'png', 'tiff', 'pdf'];
  function lint(items) {
    const errors = [], ids = new Set();
    for (const p of items) {
      if (!p.id || ids.has(p.id)) errors.push('Missing/duplicate preset id');
      ids.add(p.id);
      if (!/^https:\/\/[^/\s]+\//.test(p.source_url || '')) errors.push(p.id + ': missing or unsafe source URL');
      if (typeof p.verified !== 'boolean') errors.push(p.id + ': missing verified flag');
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
  const api = { presets, lint, settings, mmToPx, applySvg, mount };
  global.AlmFigPresets = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!global.document) return;
  const doc = global.document, self = doc.currentScript;
  const base = self && self.src;
  const loads = new Map(), mounted = new WeakMap();
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
  let serial = 0;
  function mount(opts) {
    const target = opts.target;
    if (!target) return;
    const previous = mounted.get(target);
    if (previous) previous.remove();
    const panel = doc.createElement('fieldset'); panel.className = 'alm-figpresets';
    const legend = doc.createElement('legend'); legend.textContent = 'Journal figure export'; panel.appendChild(legend);
    const instance = ++serial;
    function field(labelText, values, value, type) {
      const field = doc.createElement('span'); field.className = 'alm-figpresets-field';
      const label = doc.createElement('label'), el = doc.createElement(values ? 'select' : 'input');
      el.id = 'alm-fig-' + instance + '-' + panel.children.length;
      label.htmlFor = el.id; label.textContent = labelText + ' ';
      if (values) values.forEach(([v, text]) => { const option = doc.createElement('option'); option.value = v; option.textContent = text; el.appendChild(option); });
      else { el.type = type || 'number'; if (el.type === 'number') el.step = 'any'; }
      // Keep option text out of the label while retaining the native for/id association.
      el.value = value; field.append(label, el); panel.appendChild(field); return el;
    }
    const journal = field('Journal preset', presets.map(p => [p.id, p.name]), 'custom');
    const column = field('Column width', [['single', 'Single / text column'], ['double', 'Double / full width']], 'single');
    const width = field('Preset width (mm)', null, '85');
    const dpi = field('Preset resolution (dpi)', null, '300');
    const font = field('Preset font family', null, '', 'text'); font.placeholder = 'Keep original font';
    const pt = field('Preset minimum font (pt)', null, '0');
    const format = field('Preset export format', supported.map(f => [f, f === 'pdf' ? 'PDF (raster image)' : f.toUpperCase()]), 'svg');
    const note = doc.createElement('p'), source = doc.createElement('a');
    source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Figure guidelines';
    const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    panel.append(note, source);
    function refresh() {
      const p = presets.find(p => p.id === journal.value), s = settings(p.id, { column: column.value });
      width.value = s.widthMm; dpi.value = s.dpi; font.value = s.fontFamily || ''; pt.value = s.minPt || 0;
      source.href = p.source_url;
      source.textContent = p.id === 'custom' ? 'Reference guidelines (Custom settings are your own)' : 'Figure guidelines';
      const known = p.formats ? p.formats.map(f => f.toUpperCase()).join(', ') : 'not established';
      note.textContent = "Please check the journal's current guidelines. These settings do not establish compliance. " +
        'Guideline formats for graphs: ' + known + '. EPS export is unavailable; SVG is an editable working file. PDF here contains a raster image. ' +
        (s.widthIsDefault ? 'Width uses an app default (85/170 mm), not a verified journal size. ' : '') +
        (!p.min_dpi ? 'Resolution defaults to 300 dpi; no journal minimum is established. ' : '') +
        'TIFF compression: ' + s.tiffCompression + '. ' + p.colour_notes;
      for (const option of format.options) option.textContent = option.value.toUpperCase() +
        (option.value === 'pdf' ? ' (raster image)' : '') +
        (p.formats && !p.formats.includes(option.value) ? ' (working format; not listed)' : '');
    }
    journal.addEventListener('change', refresh); column.addEventListener('change', refresh); refresh();
    let busy = false;
    for (const plot of opts.plots || []) {
      const button = doc.createElement('button'); button.type = 'button';
      button.textContent = 'Export ' + (plot.name || plot.id || 'chart') + ' with preset'; panel.appendChild(button);
      button.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        const controls = Array.from(panel.querySelectorAll('input, select, button'));
        controls.forEach(c => { c.disabled = true; }); status.textContent = 'Preparing figure…';
        try {
          const config = settings(journal.value, { column: column.value, widthMm: Number(width.value), dpi: Number(dpi.value), minPt: Number(pt.value), fontFamily: font.value });
          const fmt = format.value;
          if (!supported.includes(fmt)) throw new Error('Unsupported export format');
          await load('../hub/shared/plot-export.js', () => global.alm && global.alm.plotExport && global.alm.plotExport.artifact);
          if (fmt === 'tiff' && config.tiffCompression === 'none') await load('alm-zip.js', () => global.AlmZip);
          const blob = await global.alm.plotExport.artifact(plot, fmt, config.dpi, config.widthMm, opts.getReceiptInput, config);
          const link = doc.createElement('a'); link.href = URL.createObjectURL(blob);
          link.download = String(opts.basename || 'figure').replace(/[^a-zA-Z0-9._-]/g, '_') + '-' + String(plot.id || 'chart').replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + journal.value + '.' + fmt;
          doc.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 1500); status.textContent = 'Figure exported. Review labels and layout before submission.';
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
  style.textContent = '.alm-figpresets{margin:.5rem 0;padding:.6rem;min-width:0;font:12px/1.5 system-ui,sans-serif;text-align:left}.alm-figpresets-field{display:inline-block;margin:.2rem .6rem .2rem 0}.alm-figpresets input{width:7rem}.alm-figpresets button{margin:.3rem}.alm-figpresets p{max-width:85ch;margin:.4rem 0}';
  doc.head.appendChild(style);
  (global.__almFigPresetQueue || []).splice(0).forEach(mount);
})(typeof window !== 'undefined' ? window : globalThis);
