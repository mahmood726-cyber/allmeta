/* hub/shared/plot-presets.js - journal size presets, colour-blind/greyscale export modes and a
 * minimum-font check for hub/shared/plot-export.js (opt-in via opts.presets). No analysis code.
 * Browser (window.alm.plotPresets) and Node (module.exports, for the unit tests).
 *
 * Journal presets carry the page they were read from, the date it was read and short verbatim
 * fragments that state each number; hub/shared/tests/addons-a3-presets.test.mjs refuses any
 * preset whose numbers are not found in its own fragments. Nothing here is from memory. A journal
 * that states no width has widthMm null: the chosen width is kept and only the resolution is set.
 * Requirements change: re-read the source pages before relying on a preset for a submission.
 *
 * Colour modes act ONLY on the export clone (never on the page): "default" changes nothing;
 * "okabe-ito" maps each distinct chromatic colour, in document order, to the Okabe-Ito palette
 * (hex values as printed by R 4.6.0 grDevices::palette.colors(palette = "Okabe-Ito"), black and
 * grey omitted, yellow last for contrast on white); neutral colours (black, white, greys) are kept.
 * "greyscale" replaces every colour by the grey of equal BT.709-weighted value
 * (0.2126 R + 0.7152 G + 0.0722 B on the stored sRGB values - an approximation, not a
 * colour-managed conversion). Raster <image> content is not recoloured (reported as a warning).
 */
(function (global) {
  'use strict';
  var RETRIEVED = '2026-10-18';
  var F1000 = 'https://f1000research.com/for-authors/article-guidelines/research-articles';
  var BMJ = 'https://authors.bmj.com/writing-and-formatting/formatting-your-paper/';
  var LANCET = 'https://www.thelancet.com/pb-assets/Lancet/authors/tl-info-for-authors.pdf';
  var JAMA = 'https://jamanetwork.com/journals/jama/pages/instructions-for-authors';
  var PLOS = 'https://journals.plos.org/plosone/s/figures';

  // Built-in sizes (unchanged from plot-export.js; not journal claims).
  var SIZES = [{ id: 'single', label: '85 mm', widthMm: 85 }, { id: 'double', label: '170 mm', widthMm: 170 }];

  // evidence: [field, fragment, index] - the fragment must occur verbatim in quote; the number at
  // position index inside the fragment (after unit conversion: cm x 10, inches x 25.4) must equal
  // the preset value.
  var JOURNALS = [
    { id: 'f1000-75', journal: 'F1000Research', label: 'F1000Research, one column (75 mm, 600 dpi)', widthMm: 75, dpi: 600, minFontPt: 8,
      source: { url: F1000, retrieved: RETRIEVED, section: 'Figure formats - Line art',
        quote: ['text is at least 8pt', 'between 75-150 mm width', 'a resolution of at least 600dpi'],
        evidence: [['widthMm', 'between 75-150 mm width', 0], ['dpi', 'at least 600dpi', 0], ['minFontPt', 'at least 8pt', 0]],
        note: '600 dpi is the stated minimum for line art supplied as TIFF when a vector or source file cannot be sent.' } },
    { id: 'f1000-150', journal: 'F1000Research', label: 'F1000Research, two columns (150 mm, 600 dpi)', widthMm: 150, dpi: 600, minFontPt: 8,
      source: { url: F1000, retrieved: RETRIEVED, section: 'Figure formats - Line art',
        quote: ['text is at least 8pt', 'between 75-150 mm width', 'a resolution of at least 600dpi'],
        evidence: [['widthMm', 'between 75-150 mm width', 1], ['dpi', 'at least 600dpi', 0], ['minFontPt', 'at least 8pt', 0]],
        note: '600 dpi is the stated minimum for line art supplied as TIFF when a vector or source file cannot be sent.' } },
    { id: 'bmj-line-art', journal: 'The BMJ', label: 'The BMJ, line art (1200 dpi; width as chosen)', widthMm: null, dpi: 1200, minFontPt: null,
      source: { url: BMJ, retrieved: RETRIEVED, section: 'File types',
        quote: ['a minimum resolution of 300 dpi is required, except for line art which should be 1200 dpi'],
        evidence: [['dpi', 'line art which should be 1200 dpi', 0]],
        note: 'The page states no figure width. 1200 dpi at 170 mm is about 8000 pixels wide.' } },
    { id: 'lancet-107', journal: 'The Lancet', label: 'The Lancet (107 mm, 300 dpi)', widthMm: 107, dpi: 300, minFontPt: null,
      source: { url: LANCET, retrieved: RETRIEVED, section: 'Figures (Information for Authors, August 2026 edition)',
        quote: ['All images must have a minimum resolution of 300 dpi,', 'width 107 mm'],
        evidence: [['widthMm', 'width 107 mm', 0], ['dpi', 'minimum resolution of 300 dpi', 0]],
        note: 'The same document asks for editable vector files for non-photographic line work; a raster export may not satisfy that.' } },
    { id: 'jama-line', journal: 'JAMA', label: 'JAMA, line drawings (600 ppi; width as chosen)', widthMm: null, dpi: 600, minFontPt: null,
      source: { url: JAMA, retrieved: RETRIEVED, section: 'Figures - Table of Figure Requirements, line drawings',
        quote: ['Required minimum resolution for publication: ≥600 ppi'],
        evidence: [['dpi', '≥600 ppi', 0]],
        verification: 'summarised-fetch',
        note: 'The page is behind a bot check, so the raw text could not be re-read here; this fragment came from two summarised fetches that agreed. The table states no width. Re-read the page before relying on it.' } },
    { id: 'plos-column', journal: 'PLOS ONE', label: 'PLOS ONE, text column (132 mm, 300 dpi)', widthMm: 132, dpi: 300, minFontPt: 8,
      source: { url: PLOS, retrieved: RETRIEVED, section: 'Figure specifications',
        quote: ['make it no wider than 5.2 inches (13.2 cm)', 'Resolution 300 – 600 dpi', 'Symbol font only in 8-12 point'],
        evidence: [['widthMm', '(13.2 cm)', 0], ['dpi', '300 – 600 dpi', 0], ['minFontPt', 'in 8-12 point', 0]],
        note: 'PLOS ONE accepts TIFF or EPS only.' } },
    { id: 'plos-page', journal: 'PLOS ONE', label: 'PLOS ONE, full page width (190.5 mm, 300 dpi)', widthMm: 190.5, dpi: 300, minFontPt: 8,
      source: { url: PLOS, retrieved: RETRIEVED, section: 'Figure specifications - Dimensions table',
        quote: ['Maximum width 19.05 7.5 2250', 'Resolution 300 – 600 dpi', 'Symbol font only in 8-12 point'],
        evidence: [['widthMm', 'Maximum width 19.05', 0], ['dpi', '300 – 600 dpi', 0], ['minFontPt', 'in 8-12 point', 0]],
        note: 'Table columns are centimetres, inches and pixels at 300 dpi. PLOS ONE accepts TIFF or EPS only.' } }
  ];
  // Fragments whose unit is centimetres (the dimensions table header) although the fragment has no unit.
  var CM_FRAGMENTS = { 'Maximum width 19.05': true };

  var OKABE_ITO = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442'];
  var COLOUR_MODES = [['default', 'As shown'], ['okabe-ito', 'Colour-blind safe (Okabe-Ito)'], ['greyscale', 'Greyscale']];
  var HOUSE_MIN_FONT_PT = 6;

  function numbersIn(fragment) {
    var out = [], re = /\d+(?:\.\d+)?/g, m;
    while ((m = re.exec(fragment))) out.push(Number(m[0]));
    return out;
  }
  function evidenceValue(fragment, index) {
    var n = numbersIn(fragment)[index];
    if (n === undefined) return NaN;
    if (/\bcm\b/.test(fragment) || CM_FRAGMENTS[fragment]) return Math.round(n * 10 * 1e6) / 1e6;
    if (/inch/.test(fragment)) return Math.round(n * 25.4 * 1e6) / 1e6;
    return n;
  }
  // Returns a list of problems (empty when the preset is fully sourced).
  function checkPreset(p) {
    var problems = [];
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id)) return ['invalid id'];
    var s = p.source;
    if (!s || !/^https:\/\/[^\s]+$/.test(s.url || '')) problems.push(p.id + ': source URL missing');
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved || '')) problems.push(p.id + ': retrieved date missing');
    if (!s || !Array.isArray(s.quote) || !s.quote.length) { problems.push(p.id + ': quote missing'); return problems; }
    if (!(p.dpi > 0 && Number.isInteger(p.dpi))) problems.push(p.id + ': dpi must be a positive integer');
    if (!(p.widthMm === null || p.widthMm > 0)) problems.push(p.id + ': widthMm must be null or positive');
    var text = s.quote.join(' … ');
    var fields = { widthMm: p.widthMm, dpi: p.dpi, minFontPt: p.minFontPt };
    Object.keys(fields).forEach(function (field) {
      if (fields[field] === null || fields[field] === undefined) return;
      var ev = (s.evidence || []).filter(function (e) { return e[0] === field; });
      if (!ev.length) { problems.push(p.id + ': no evidence for ' + field); return; }
      ev.forEach(function (e) {
        if (text.indexOf(e[1]) < 0) problems.push(p.id + ': fragment not in quote: ' + e[1]);
        else if (evidenceValue(e[1], e[2]) !== fields[field]) problems.push(p.id + ': ' + field + ' ' + fields[field] + ' is not stated by "' + e[1] + '"');
      });
    });
    return problems;
  }
  function byId(id) { for (var i = 0; i < JOURNALS.length; i++) if (JOURNALS[i].id === id) return JOURNALS[i]; return null; }

  // ---- colours -------------------------------------------------------------------------------
  function parseColour(value) {
    var v = String(value).trim().toLowerCase(), m;
    if ((m = /^#([0-9a-f]{3})$/.exec(v))) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: null };
    if ((m = /^#([0-9a-f]{6})$/.exec(v))) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: null };
    if ((m = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*(?:\.\d+)?)\s*)?\)$/.exec(v)))
      return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a: m[4] === undefined ? null : m[4] };
    if (v === 'white') return { r: 255, g: 255, b: 255, a: null };
    if (v === 'black') return { r: 0, g: 0, b: 0, a: null };
    return null;
  }
  function hex(c) { return '#' + [c.r, c.g, c.b].map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function format(c, a) {
    if (a === null) return hex(c);
    return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + a + ')';
  }
  function isNeutral(c) { return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) <= 12; }
  function grey(c) { var y = Math.round(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b); return { r: y, g: y, b: y }; }

  var COLOUR_PROPS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
  // Recolours an export clone in place. Returns {changed, mapped:[[from,to]...], warnings:[...]}.
  function applyColourMode(svg, mode) {
    var result = { changed: 0, mapped: [], warnings: [] };
    if (!mode || mode === 'default') return result;
    if (mode !== 'okabe-ito' && mode !== 'greyscale') throw new RangeError('Unknown colour mode: ' + mode);
    var assigned = new Map();
    function convert(value) {
      var c = parseColour(value);
      if (!c) return null;
      var out;
      if (mode === 'greyscale') out = grey(c);
      else {
        if (isNeutral(c)) return null;
        var key = hex(c);
        if (!assigned.has(key)) {
          var i = assigned.size;
          if (i === OKABE_ITO.length) result.warnings.push('More than ' + OKABE_ITO.length + ' distinct colours: Okabe-Ito colours are reused.');
          assigned.set(key, OKABE_ITO[i % OKABE_ITO.length]);
          result.mapped.push([key, OKABE_ITO[i % OKABE_ITO.length]]);
        }
        out = parseColour(assigned.get(key));
      }
      return format(out, c.a);
    }
    var nodes = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll('*')));
    nodes.forEach(function (el) {
      if (el.localName === 'image') result.warnings.push('Embedded raster images are not recoloured.');
      COLOUR_PROPS.forEach(function (prop) {
        var v = el.getAttribute(prop);
        if (v !== null) { var n = convert(v); if (n !== null && n !== v) { el.setAttribute(prop, n); result.changed++; } }
      });
      var style = el.getAttribute('style');
      if (style) {
        var changed = false;
        var next = style.split(';').map(function (decl) {
          var i = decl.indexOf(':');
          if (i < 0) return decl;
          var prop = decl.slice(0, i).trim().toLowerCase(), val = decl.slice(i + 1);
          if (COLOUR_PROPS.indexOf(prop) < 0) return decl;
          var n = convert(val);
          if (n === null || n === val.trim()) return decl;
          changed = true; result.changed++;
          return decl.slice(0, i + 1) + n;
        }).join(';');
        if (changed) el.setAttribute('style', next);
      }
    });
    result.warnings = result.warnings.filter(function (w, i, a) { return a.indexOf(w) === i; });
    return result;
  }

  // ---- fonts ---------------------------------------------------------------------------------
  function fontPx(el) {
    var style = el.getAttribute('style') || '', m = /(?:^|;)\s*font-size\s*:\s*([\d.]+)px/i.exec(style);
    if (m) return Number(m[1]);
    var attr = el.getAttribute('font-size');
    if (attr && /^[\d.]+(px)?$/.test(attr.trim())) return parseFloat(attr);
    return null;
  }
  // Smallest printed text size (points) in an export clone whose user-space width is
  // viewBoxWidth, printed widthMm wide. Text with no readable size is counted as unknown.
  function minFont(svg, viewBoxWidth, widthMm) {
    var minPt = Infinity, texts = 0, unknown = 0;
    var scale = widthMm / viewBoxWidth * 72 / 25.4;
    Array.prototype.forEach.call(svg.querySelectorAll('text, tspan'), function (el) {
      if (!el.textContent || !el.textContent.trim()) return;
      if (el.localName === 'tspan' && el.parentNode && el.parentNode.localName === 'text' && fontPx(el) === null) return;
      texts++;
      var px = fontPx(el);
      if (px === null) { unknown++; return; }
      minPt = Math.min(minPt, px * scale);
    });
    return { minPt: texts && minPt !== Infinity ? minPt : null, texts: texts, unknown: unknown };
  }
  function fontWarning(info, preset) {
    if (!info || info.minPt === null) return '';
    var limit = preset && preset.minFontPt ? preset.minFontPt : HOUSE_MIN_FONT_PT;
    if (info.minPt >= limit - 1e-9) return '';
    return 'Smallest text is ' + info.minPt.toFixed(1) + ' pt at this width; ' +
      (preset && preset.minFontPt ? preset.journal + ' asks for at least ' + limit + ' pt.' : 'below ' + limit + ' pt may be hard to read.');
  }

  var api = {
    RETRIEVED: RETRIEVED, SIZES: SIZES, JOURNALS: JOURNALS, OKABE_ITO: OKABE_ITO, COLOUR_MODES: COLOUR_MODES,
    HOUSE_MIN_FONT_PT: HOUSE_MIN_FONT_PT, byId: byId, checkPreset: checkPreset, evidenceValue: evidenceValue,
    parseColour: parseColour, applyColourMode: applyColourMode, minFont: minFont, fontWarning: fontWarning
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.alm = window.alm || {}; window.alm.plotPresets = api; }
})(typeof window !== 'undefined' ? window : globalThis);
