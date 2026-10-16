/* Cumulative + subgroup "Validate in R" adapter (shared/alm-validate.js widget).
 * Live: the CURRENT page analysis against self-hosted webR metafor (rma method="PM").
 * Replay: a declared, SHA-256-pinned deterministic subset of the archived metafor 5.2-1 corpus,
 * run through the page's own parser, engine, renderer and exports.
 * The page exposes only observation hooks (__almCumSubValidationRun/Snapshot/Restore and the
 * importer's warning records); nothing here changes a page calculation.
 */
(function () {
'use strict';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const STATS = ['mu', 'se', 'lo', 'hi', 'Q', 'piLo', 'piHi'];
const NOGROUP = 'No group column detected — add a 5th column to split studies.';
const NOGROUP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120"><rect width="400" height="120" fill="#fff"></rect><text x="200" y="60" text-anchor="middle" font-family="system-ui" font-size="13" fill="#5c6470">Subgroup view needs a group column.</text></svg>';
const VIEW_OPTIONS = [['cumulative', 'Cumulative MA'], ['subgroup', 'Subgroup analysis']];
const HEADINGS = { cumulative: 'Cumulative meta-analysis', subgroup: 'Subgroup analysis' };
const CUM_EXPORT = ['_schema', 'view', 'k', 'mu_final', 'se_final', 'lo_final', 'hi_final', 'tau2_final', 'Q_final', 'series'];
const CUM_SERIES = ['step', 'label', 'year', 'mu', 'se', 'lo', 'hi', 'tau2'];
const SUB_EXPORT = ['_schema', 'view', 'k', 'groups', 'overall_mu', 'overall_lo', 'overall_hi', 'overall_pi_lo', 'overall_pi_hi', 'overall_tau2', 'Q_bw', 'df_bw', 'I2_bw', 'pQ'];
const DRAFT_KEY = 'alm-autosave:cumulative-subgroup', SAVE_KEY = 'cumulative-subgroup-v1';
function field(x, k) { if (!x || !Object.hasOwn(x, k)) throw Error('Missing field ' + k); return x[k]; }

// ---- the page's own formatting and plotting rules (cumulative-subgroup/index.html) ----
function fmt(x, d) { if (!isFinite(x)) return '--'; return x.toFixed(d == null ? 3 : d); }
function niceTicks(lo, hi, n) {
  if (!(hi > lo)) return [lo];
  const r = hi - lo, s0 = r / Math.max(1, n);
  const m = Math.pow(10, Math.floor(Math.log10(s0))), nm = s0 / m;
  const step = nm < 1.5 ? m : (nm < 3 ? 2 * m : (nm < 7 ? 5 * m : 10 * m));
  const start = Math.ceil(lo / step) * step; const t = [];
  for (let v = start; v <= hi + 1e-9; v += step) t.push(v);
  return t;
}
function pooledText(p) { return fmt(p.mu) + ' [' + fmt(p.lo) + ', ' + fmt(p.hi) + ']'; }
function effectAxis(autoLo, autoHi, user) {
  const lo = user[0] != null ? user[0] : autoLo, hi = user[1] != null ? user[1] : autoHi;
  return [lo, hi];
}
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-9;
const attr = (el, n) => el && el.hasAttribute(n) ? Number(el.getAttribute(n)) : NaN;
function points(el) { return el && el.hasAttribute('points') ? el.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number)) : []; }
function svgRoot() { return document.querySelector('#svg-host svg'); }
function svgTexts(svg) { return svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : []; }

// Cumulative plot. check(quantity, app, expected, kind) records one comparison.
function cumulativePlot(series, title, user, check) {
  const svg = svgRoot(), k = series.length;
  const W = 720, H = 520, L = 180, R = 30, T = title ? 60 : 40, B = 70, plotW = W - L - R, plotH = H - T - B;
  let yLo = Infinity, yHi = -Infinity;
  for (const s of series) { if (s.lo < yLo) yLo = s.lo; if (s.hi > yHi) yHi = s.hi; }
  const yPad = (yHi - yLo) * 0.15 || 0.2; yLo -= yPad; yHi += yPad;
  if (yLo > 0) yLo = Math.min(yLo, 0);
  if (yHi < 0) yHi = Math.max(yHi, 0);
  [yLo, yHi] = effectAxis(yLo, yHi, user);
  const x = v => L + (v - 1) / (k - 1 || 1) * plotW, y = v => T + plotH - (v - yLo) / (yHi - yLo) * plotH;
  const circles = svg ? [...svg.querySelectorAll('circle')] : [];
  check('plot_circle_count', circles.length, k, 'exact');
  series.forEach((s, j) => { check('plot_circle_x', attr(circles[j], 'cx'), x(s.step), 'abs'); check('plot_circle_y', attr(circles[j], 'cy'), y(s.mu), 'abs'); });
  const line = points(svg && svg.querySelector('polyline'));
  check('plot_line_count', line.length, k, 'exact');
  series.forEach((s, j) => { check('plot_line_x', line[j] ? line[j][0] : NaN, x(s.step), 'abs'); check('plot_line_y', line[j] ? line[j][1] : NaN, y(s.mu), 'abs'); });
  const band = points(svg && svg.querySelector('polygon'));
  const bandExp = series.map(s => [x(s.step), y(s.hi)]).concat(series.map(s => [x(s.step), y(s.lo)]).reverse());
  check('plot_band_count', band.length, 2 * k, 'exact');
  bandExp.forEach((e, j) => { check('plot_band_x', band[j] ? band[j][0] : NaN, e[0], 'abs'); check('plot_band_y', band[j] ? band[j][1] : NaN, e[1], 'abs'); });
  const ticks = niceTicks(yLo, yHi, 6);
  const texts = (title ? [title] : []).concat(series.map(s => '+ ' + s.label + (s.year != null ? ' (' + s.year + ')' : '')), ['Cumulative study count'], ticks.map(t => fmt(t, 2)), ['Pooled effect (95% CI)']);
  check('plot_text', JSON.stringify(svgTexts(svg)), JSON.stringify(texts), 'exact');
  // Axis geometry: viewBox, plot frame, zero line, row labels, step ticks and effect ticks.
  let ok = !!svg && svg.getAttribute('viewBox') === '0 0 720 520' && !svg.hasAttribute('data-axis-refusal');
  if (ok) {
    const t = [...svg.querySelectorAll('text')], off = title ? 1 : 0;
    const frame = svg.querySelectorAll('rect')[1];
    ok = near(attr(frame, 'x'), L) && near(attr(frame, 'y'), T) && near(attr(frame, 'width'), plotW) && near(attr(frame, 'height'), plotH);
    const lines = [...svg.querySelectorAll('line')], zero = yLo < 0 && yHi > 0;
    const expLines = (zero ? [[L, y(0), L + plotW, y(0)]] : []).concat(series.map(s => [x(s.step), T + plotH, x(s.step), T + plotH + 3]), ticks.map(v => [L, y(v), L - 4, y(v)]));
    ok = ok && lines.length === expLines.length && expLines.every((e, i) => ['x1', 'y1', 'x2', 'y2'].every((n, m) => near(attr(lines[i], n), e[m])));
    series.forEach((s, j) => { ok = ok && near(attr(t[off + j], 'x'), L - 8) && near(attr(t[off + j], 'y'), T + plotH * (s.step / k) - 8 + 10); });
    ticks.forEach((v, j) => { const e = t[off + k + 1 + j]; ok = ok && near(attr(e, 'x'), L - 8) && near(attr(e, 'y'), y(v) + 3); });
    const cap = t[off + k]; ok = ok && near(attr(cap, 'x'), L + plotW / 2) && near(attr(cap, 'y'), T + plotH + 36);
  }
  check('plot_axis', ok, true, 'exact');
}

function subgroupPlot(sub, title, user, check) {
  const svg = svgRoot(), groups = sub.groups, G = groups.length, o = sub.overall;
  const W = 900, rowH = 36, L = 200, R = 210, T = title ? 60 : 40, B = 80;
  const H = T + (G + 1) * rowH + 30 + B, plotW = W - L - R;
  let xLo = Infinity, xHi = -Infinity;
  for (const g of groups) { if (g.lo < xLo) xLo = g.lo; if (g.hi > xHi) xHi = g.hi; }
  if (o) { if (o.lo < xLo) xLo = o.lo; if (o.hi > xHi) xHi = o.hi; }
  if (!(xHi > xLo)) { xLo = -1; xHi = 1; }
  const pad = (xHi - xLo) * 0.1; xLo -= pad; xHi += pad;
  if (xLo > 0) xLo = Math.min(xLo, 0);
  if (xHi < 0) xHi = Math.max(xHi, 0);
  [xLo, xHi] = effectAxis(xLo, xHi, user);
  const x = v => L + (v - xLo) / (xHi - xLo) * plotW;
  const rects = svg ? [...svg.querySelectorAll('rect')].filter(r => r.getAttribute('fill') === '#2c5e8a') : [];
  check('plot_marker_count', rects.length, G, 'exact');
  const ci = svg ? [...svg.querySelectorAll('line')].filter(l => l.getAttribute('stroke-width') === '1') : [];
  check('plot_ci_count', ci.length, G, 'exact');
  groups.forEach((g, i) => {
    const yy = T + (i + 0.5) * rowH;
    check('plot_marker_x', attr(rects[i], 'x'), x(g.mu) - 5, 'abs'); check('plot_marker_y', attr(rects[i], 'y'), yy - 5, 'abs');
    check('plot_ci_x1', attr(ci[i], 'x1'), x(g.lo), 'abs'); check('plot_ci_x2', attr(ci[i], 'x2'), x(g.hi), 'abs'); check('plot_ci_y', attr(ci[i], 'y1'), yy, 'abs');
  });
  const oy = T + G * rowH + rowH / 2 + 10;
  const dia = points(svg && [...svg.querySelectorAll('polygon')].find(p => p.getAttribute('fill') === '#b05a1c'));
  const diaExp = [[x(o.lo), oy], [x(o.mu), oy - 6], [x(o.hi), oy], [x(o.mu), oy + 6]];
  check('plot_diamond_count', dia.length, 4, 'exact');
  diaExp.forEach((e, j) => { check('plot_diamond_x', dia[j] ? dia[j][0] : NaN, e[0], 'abs'); check('plot_diamond_y', dia[j] ? dia[j][1] : NaN, e[1], 'abs'); });
  const ticks = niceTicks(xLo, xHi, 6);
  const texts = (title ? [title] : []).concat(['Subgroup (k)', 'Pooled [95% CI]'], ...groups.map(g => [g.name + ' (k=' + g.k + ')', pooledText(g)]),
    ['All (k=' + o.k + ')', pooledText(o)], ticks.map(t => fmt(t, 2)), ['Effect', 'Between-subgroup Q = ' + fmt(sub.Q_bw, 2) + ' (df=' + sub.df_bw + '), p = ' + fmt(sub.pQ, 3) + '   |   I² diff = ' + fmt(sub.I2_bw, 1) + '%']);
  check('plot_text', JSON.stringify(svgTexts(svg)), JSON.stringify(texts), 'exact');
  let ok = !!svg && svg.getAttribute('viewBox') === '0 0 900 ' + H && !svg.hasAttribute('data-axis-refusal');
  if (ok) {
    const lines = [...svg.querySelectorAll('line')], axisY = oy + 22;
    const expLines = [[x(0), T - 5, x(0), T + G * rowH + 10]].concat(...groups.map((g, i) => [[x(g.lo), T + (i + 0.5) * rowH, x(g.hi), T + (i + 0.5) * rowH]]), [[L, axisY, L + plotW, axisY]], ticks.map(v => [x(v), axisY, x(v), axisY + 4]));
    ok = lines.length === expLines.length && expLines.every((e, i) => ['x1', 'y1', 'x2', 'y2'].every((n, m) => near(attr(lines[i], n), e[m])));
    const t = [...svg.querySelectorAll('text')], off = title ? 1 : 0;
    const pos = [[L - 8, T - 8], [L + plotW + 10, T - 8]].concat(...groups.map((g, i) => [[L - 8, T + (i + 0.5) * rowH + 4], [L + plotW + 10, T + (i + 0.5) * rowH + 4]]),
      [[L - 8, oy + 4], [L + plotW + 10, oy + 4]], ticks.map(v => [x(v), axisY + 16]), [[L + plotW / 2, axisY + 36], [W / 2, H - 18]]);
    ok = ok && t.length === off + pos.length && pos.every((e, i) => near(attr(t[off + i], 'x'), e[0]) && near(attr(t[off + i], 'y'), e[1]));
  }
  check('plot_axis', ok, true, 'exact');
}

// ---- exact displayed-state contracts ----
function cardsExpected(view, a) {
  const k = String(a.parsed.studies.length);
  if (!a.summary) return [['k', k]];
  if (view === 'cumulative') { const f = a.cum.series[a.cum.series.length - 1]; return [['k', k], ['Final pooled', pooledText(f)], ['Final τ²', fmt(f.tau2, 4)]]; }
  const s = a.sub, o = s.overall, out = [['k', k], ['Groups', String(s.groups.length)], ['Overall pooled', pooledText(o)]];
  if (o.piLo != null) out.push(['95% prediction interval', '[' + fmt(o.piLo) + ', ' + fmt(o.piHi) + ']']);
  out.push(['Q_bw (df=' + s.df_bw + ')', fmt(s.Q_bw, 2) + ', p=' + fmt(s.pQ, 3)], ['I² diff', fmt(s.I2_bw, 1) + '%']);
  return out;
}
function cardsOk(expected) {
  const wrap = document.getElementById('stats-wrap'), grid = wrap.children;
  if (grid.length !== 1 || grid[0].tagName !== 'DIV' || grid[0].className !== 'stats' || wrap.childNodes.length !== 1) return false;
  const cards = [...grid[0].childNodes];
  return cards.length === expected.length && cards.every((c, i) => c.nodeType === 1 && c.tagName === 'DIV' && c.className === 'stat' && c.childNodes.length === 2 &&
    [...c.childNodes].every((s, m) => s.nodeType === 1 && s.tagName === 'SPAN' && s.className === ['k', 'v'][m] && s.childNodes.length === 1 && s.firstChild.nodeType === 3 && s.textContent === expected[i][m]));
}
function headingOk(view) { const h = document.getElementById('preview-heading'); return h.childNodes.length === 1 && h.textContent === HEADINGS[view]; }
// Notes banner: hidden and empty, or exactly "Notes" + one list item per note, in order.
function bannerOk(notes) {
  const el = document.getElementById('warn-banner');
  if (!notes.length) return el.className === 'warn-banner' && el.innerHTML === '' && !el.checkVisibility();
  const c = [...el.childNodes];
  return el.className === 'warn-banner is-visible' && el.checkVisibility() && c.length === 2 && c[0].tagName === 'STRONG' && c[0].textContent === 'Notes' && c[0].children.length === 0 &&
    c[1].tagName === 'UL' && c[1].childNodes.length === notes.length && [...c[1].childNodes].every((li, i) => li.tagName === 'LI' && li.children.length === 0 && li.textContent === notes[i]);
}
function axisErrorText() { const e = document.querySelector('#alm-axis-mount [data-error]'); return e ? e.textContent : null; }
function statusOk(notes) { return bannerOk(notes) && axisErrorText() === ''; }
function controlsOk(view, title) {
  const sel = document.getElementById('f-view'), chosen = [...sel.selectedOptions];
  return JSON.stringify([...sel.options].map(o => [o.value, o.textContent])) === JSON.stringify(VIEW_OPTIONS) && sel.value === view && chosen.length === 1 &&
    chosen[0].value === view && chosen[0].textContent === VIEW_OPTIONS.find(o => o[0] === view)[1] && (title === null || document.getElementById('f-title').value === title);
}
// One effect axis (y of the cumulative plot, x of the subgroup plot); log is disabled (linear only).
const AXIS_LABELS = ['Effect axis', 'Effect axis axis minimum', 'Effect axis axis maximum'];
function axisInputs() { return [...document.querySelectorAll('#alm-axis-mount input')]; }
function axisRow() {
  const rows = [...document.querySelectorAll('#alm-axis-mount .alm-axis-row')];
  if (rows.length !== 1) return null;
  const r = rows[0], min = r.querySelector('[data-edge=min]'), max = r.querySelector('[data-edge=max]'), log = r.querySelector('[data-edge=log]');
  return { labels: [r.querySelector('label')?.textContent, min?.getAttribute('aria-label'), max?.getAttribute('aria-label')], min, max, log };
}
function axisOk(values) {
  const r = axisRow();
  return !!r && axisInputs().length === 3 && JSON.stringify(r.labels) === JSON.stringify(AXIS_LABELS) && !!r.log && r.log.disabled === true && r.log.checked === false &&
    (values === null || (r.min.value === values[0] && r.max.value === values[1]));
}
function setAxisDefault() { const r = axisRow(); if (r) { r.min.value = ''; r.max.value = ''; } const e = document.querySelector('#alm-axis-mount [data-error]'); if (e) e.textContent = ''; }
// The page reads a bound as the widget emits it: '' is automatic, otherwise Number(value) (Number trims).
function userAxis() { const r = axisRow(); const v = el => el.value.trim() === '' ? null : Number(el.value.trim()); return r ? [v(r.min), v(r.max)] : [null, null]; }

// Page template text and structure: every visible text node (with its element path) and every aria-label/title inside the page's
// landmarks (skip link, navigation, header, main, footer), outside the validation panel, in document order. Regions with their own
// exact checks (summary cards, preview heading, notes banner, plot, view selector, axis-row label and error, CSV warnings) and the
// user's data (textarea) are excluded. Overlays that shared scripts append to <body> (citation dialog, glossary tooltips, toasts) are
// not template; the autosave draft banner has its own exact contract.
const TEMPLATE_ROOTS = ['A', 'NAV', 'HEADER', 'MAIN', 'FOOTER'];
const TEXT_SKIP = '#alm-validate,#svg-host,#stats-wrap,#preview-heading,#warn-banner,textarea,script,style,#f-view,#alm-axis-mount [data-error],.alm-axis-row > label:first-of-type,#alm-csv-mount [data-section=warnings]';
function templateRoots() { return [...document.body.children].filter(e => TEMPLATE_ROOTS.includes(e.tagName)); }
function path(e, root) { const p = []; for (; e && e !== root; e = e.parentElement) p.push(e.tagName + [...e.parentElement.children].indexOf(e)); return [root.tagName, ...p.reverse()].join('>'); }
function pageText() {
  const texts = [], attrs = [];
  for (const root of templateRoots()) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (n.parentElement.closest(TEXT_SKIP)) continue; const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) texts.push([path(n.parentElement, root), t]); }
    for (const e of [root, ...root.querySelectorAll('[aria-label],[title]')]) if ((e.hasAttribute('aria-label') || e.hasAttribute('title')) && !e.closest('#alm-validate,#svg-host')) attrs.push([e.id || e.tagName, e.getAttribute('aria-label'), e.getAttribute('title')]);
  }
  return JSON.stringify({ roots: templateRoots().map(e => e.tagName), texts, attrs });
}
function draftBannerOk() {
  const banners = [...document.body.children].filter(e => e.tagName === 'DIV' && e.getAttribute('role') === 'status' && e.getAttribute('aria-live') === 'polite');
  if (banners.length === 0) return true;
  if (banners.length !== 1) return false;
  const c = [...banners[0].children];
  return c.length === 3 && c[0].tagName === 'SPAN' && /^Draft from [1-9]\d* (min|h) ago found\. Restore\?$/.test(c[0].textContent) && c[1].tagName === 'BUTTON' && c[1].textContent === 'Restore' &&
    c[2].tagName === 'BUTTON' && c[2].textContent === 'Discard' && banners[0].textContent === c[0].textContent + 'RestoreDiscard';
}
// CSV import warnings (hub/shared/csv-upload.js) equal the importer's own records for the last import exactly, as it renders them.
function csvWarningsOk() {
  const el = document.querySelector('#alm-csv-mount [data-section=warnings]');
  if (!el || el.children.length) return false;
  const records = window.__almCumSubImportWarnings;
  if (records === undefined) return el.textContent === '';
  return Array.isArray(records) && records.every(x => typeof x === 'string') && el.textContent === records.map(x => '• ' + x).join('\n');
}
const PAGE_TEXT = "{\"roots\":[\"A\",\"NAV\",\"HEADER\",\"MAIN\",\"FOOTER\"],\"texts\":[[\"A\",\"Skip to main content\"],[\"NAV>A0\",\"\u2190 allmeta\"],[\"HEADER>H10\",\"Cumulative + Subgroup Meta-Analysis\"],[\"HEADER>P1\",\"Two views on the same studies: cumulative pooled estimate as studies accrue (optionally by year), and subgroup pooled estimates with a between-subgroup Q test. Random-effects pooling via Paule-Mandel.\"],[\"MAIN>SECTION0>H20\",\"Studies\"],[\"MAIN>SECTION0>DIV1>DIV0>DIV0>LABEL0\",\"Upload CSV:\"],[\"MAIN>SECTION0>DIV1>DIV0>DIV0>SPAN1\",\"or paste below:\"],[\"MAIN>SECTION0>DIV1>DIV0>DIV2>BUTTON0\",\"Parse pasted text\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>SUMMARY0\",\"Expected CSV format\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH0\",\"column\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH1\",\"type\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH2\",\"required\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH3\",\"example\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD0\",\"label\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD1\",\"string\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD3\",\"Trial A\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD0\",\"estimate\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD1\",\"float\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD2\",\"yes\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD3\",\"-0.30\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD0\",\"SE\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD1\",\"float\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD2\",\"yes\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD3\",\"0.14\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR3>TD0\",\"year\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR3>TD1\",\"int\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR3>TD3\",\"2015\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR4>TD0\",\"group\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR4>TD1\",\"string\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>TABLE1>TBODY1>TR4>TD3\",\"Low-risk\"],[\"MAIN>SECTION0>DIV1>DIV0>DETAILS4>P2>BUTTON0\",\"Download sample CSV\"],[\"MAIN>SECTION0>FIELDSET2>LEGEND0\",\"Data\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>SPAN0\",\"CSV:\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>SPAN0>CODE0\",\"label, estimate, SE, year, group\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>DIV2>DIV0>SPAN0\",\"Try with:\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>DIV2>DIV0>SELECT1>OPTION0\",\"\u2014 pick a dataset \u2014\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>DIV2>DIV0>SELECT1>OPTION1\",\"BCG vaccine (Berkey 1995, log-RR)\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>DIV3>BUTTON0\",\"\ud83d\udcd1 Cite as\"],[\"MAIN>SECTION0>FIELDSET2>LABEL1>SPAN4\",\"Year and group are optional. If omitted, cumulative view uses the row order; subgroup view needs the group column.\"],[\"MAIN>SECTION0>FIELDSET3>LEGEND0\",\"Display\"],[\"MAIN>SECTION0>FIELDSET3>LABEL1>SPAN0\",\"View\"],[\"MAIN>SECTION0>FIELDSET3>LABEL2>SPAN0\",\"Plot title\"],[\"MAIN>SECTION0>DIV6>DIV0>DIV0>SPAN1\",\"min\"],[\"MAIN>SECTION0>DIV6>DIV0>DIV0>SPAN3\",\"max\"],[\"MAIN>SECTION0>DIV6>DIV0>DIV0>LABEL5\",\"log\"],[\"MAIN>SECTION0>DIV7>DIV0>BUTTON0\",\"Undo\"],[\"MAIN>SECTION0>DIV7>DIV0>BUTTON1\",\"Clear all\"],[\"MAIN>SECTION0>DIV7>DIV0>DIALOG2>P0\",\"Clear all data? This cannot be undone.\"],[\"MAIN>SECTION0>DIV7>DIV0>DIALOG2>FORM1>BUTTON0\",\"Cancel\"],[\"MAIN>SECTION0>DIV7>DIV0>DIALOG2>FORM1>BUTTON1\",\"Clear\"],[\"MAIN>SECTION0>DIV8>BUTTON0\",\"Download SVG\"],[\"MAIN>SECTION0>DIV8>BUTTON1\",\"Download PNG\"],[\"MAIN>SECTION0>DIV8>BUTTON2\",\"Download JSON\"],[\"MAIN>SECTION0>DIV8>BUTTON3\",\"Import JSON\"],[\"MAIN>SECTION0>DIV8>BUTTON4\",\"Load example\"],[\"MAIN>SECTION0>DIV8>BUTTON5\",\"\u2193 Shared\"],[\"MAIN>SECTION0>DIV8>BUTTON6\",\"\u2191 Shared\"],[\"MAIN>SECTION0>DIV8>BUTTON7\",\"Verify in R\"],[\"MAIN>SECTION0>DIV8>BUTTON8\",\"TruthCert receipt\"],[\"MAIN>SECTION0>DIV8>BUTTON9\",\"\ud83d\udd11 Key\"],[\"MAIN>SECTION0>DIV8>BUTTON10\",\"Export R script\"],[\"MAIN>SECTION0>DIV8>BUTTON11\",\"Validate (R)\"],[\"MAIN>SECTION0>DIV8>BUTTON12\",\"Reset\"],[\"MAIN>SECTION0>DIV9>DIV0>LABEL0>SPAN0\",\"Outcome name (for GRADE)\"],[\"MAIN>SECTION0>DIV9>DIV0>LABEL1>SPAN0\",\"Effect scale (GRADE export)\"],[\"MAIN>SECTION0>DIV9>DIV0>LABEL1>SELECT1>OPTION0\",\"linear (MD / SMD / log)\"],[\"MAIN>SECTION0>DIV9>DIV0>LABEL1>SELECT1>OPTION1\",\"ratio \u2014 exponentiate (OR / RR / HR)\"],[\"MAIN>SECTION0>DIV9>DIV0>BUTTON2\",\"\u2192 GRADE\"],[\"MAIN>SECTION1>DIV2>SPAN0\",\"Download chart:\"],[\"MAIN>SECTION1>DIV2>DIV1>DIV0>BUTTON0\",\"PNG\"],[\"MAIN>SECTION1>DIV2>DIV1>DIV0>BUTTON1\",\"SVG\"],[\"MAIN>SECTION1>DIV2>DIV1>DIV0>BUTTON2\",\"PDF\"],[\"MAIN>SECTION1>DIV3>SPAN0\",\"Export results:\"],[\"MAIN>SECTION1>DIV3>DIV1>DIV0>BUTTON0\",\"Methods+Results (.md)\"],[\"MAIN>SECTION1>DIV3>DIV1>DIV0>BUTTON1\",\".txt\"],[\"MAIN>SECTION1>DIV3>DIV1>DIV0>BUTTON2\",\"JSON\"],[\"MAIN>SECTION1>DIV3>DIV1>DIV0>BUTTON3\",\"CSV\"],[\"MAIN>SECTION1>DIV3>DIV1>DIV0>BUTTON4\",\"Data (.md)\"],[\"MAIN>SECTION1>DIV4>DIV0>SPAN0\",\"Continue with \u2192\"],[\"MAIN>SECTION1>DIV4>DIV0>BUTTON1\",\"Forest plot\"],[\"MAIN>SECTION1>DIV4>DIV0>BUTTON2\",\"Heterogeneity\"],[\"MAIN>SECTION1>DIV4>DIV0>BUTTON3\",\"TSA\"],[\"MAIN>SECTION1>DIV4>DIV0>BUTTON4\",\"Sequential MA (\u03b1-spending)\"],[\"MAIN>SECTION1>DIV4>DIV0>BUTTON5\",\"Verify in R (WebR)\"],[\"FOOTER>P0\",\"Subgroup between-group Q compares\"],[\"FOOTER>P0>STRONG0\",\"random-effects\"],[\"FOOTER>P0\",\"pooled estimates across groups (each group pooled with Paule-Mandel \u03c4\u00b2, per Borenstein 2009 \u00a719); Q_bw = \u03a3 w_g (\u03bc_g \u2212 M)\u00b2, df = G \u2212 1, where w_g = 1/SE(\u03bc_g)\u00b2 and the centre M = \u03a3 w_g \u03bc_g / \u03a3 w_g is the inverse-variance-weighted mean of the subgroup estimates (matches\"],[\"FOOTER>P0>CODE1\",\"meta::metagen\"],[\"FOOTER>P0\",\"Q.b.random). I\u00b2 of differences = max(0, 100\u00b7(Q \u2212 df)/Q).\"]],\"attrs\":[[\"NAV\",\"Back to allmeta hub\",null],[\"hub-back\",\"Back to allmeta hub\",null],[\"SECTION\",\"Input form\",null],[\"f-data\",\"Studies\",null],[\"alm-hero-mount\",\"Load a famous benchmark dataset\",null],[\"SELECT\",\"Load a benchmark dataset\",null],[\"alm-cite-btn\",null,\"Show suggested citations\"],[\"f-view\",\"View\",null],[\"f-title\",\"Plot title\",null],[\"INPUT\",\"Effect axis axis minimum\",null],[\"INPUT\",\"Effect axis axis maximum\",null],[\"LABEL\",null,\"Only linear effect coordinates are supported\"],[\"btn-bus-load\",null,\"Load studies from the shared MA bus\"],[\"btn-bus-save\",null,\"Push current studies to the shared MA bus\"],[\"btn-verify-in-r\",null,\"Push current studies to the shared bus and open WebR Validator pre-loaded with metafor \u2014 independent R verification in your browser.\"],[\"btn-truthcert\",null,\"Download an HMAC-signed TruthCert receipt of the current studies \u2014 re-verifiable offline with your signing key.\"],[\"btn-truthcert-key\",null,\"Set or generate the TruthCert signing key (shared across all allmeta apps).\"],[\"btn-validate-webr\",null,\"Save to bus and open the WebR validator\"],[\"file-import\",\"File import\",null],[\"INPUT\",\"Outcome name (for GRADE)\",null],[\"SELECT\",\"Effect scale (GRADE export)\",null],[\"BUTTON\",null,\"Push the pooled estimate (point + 95% CI, as displayed) to the GRADE SoF builder via the ma-pooled-v1 bus. Pick 'ratio' to exponentiate log effects so GRADE gets the natural-scale value.\"],[\"SECTION\",\"Preview\",null],[\"BUTTON\",null,\"Readable Methods + Results report (Markdown)\"],[\"BUTTON\",null,\"Readable Methods + Results report (plain text)\"],[\"DIV\",\"Continue this analysis with another tool\",null],[\"BUTTON\",null,\"Visualise individual study effects + pooled diamond\"],[\"BUTTON\",null,\"I\u00b2, \u03c4\u00b2, Q, prediction interval\"],[\"BUTTON\",null,\"Required information size + O'Brien-Fleming boundary\"],[\"BUTTON\",null,\"Adaptive boundaries across information looks\"],[\"BUTTON\",null,\"Independent R metafor cross-check\"]]}";
function pageTextOk() { return pageText() === PAGE_TEXT && draftBannerOk() && csvWarningsOk(); }

// ---- the declared conditional numerical rule (RESULTS_Q.md) ----
// tau2 is compared with R's PM tau2 at 1e-6 relative. When it passes, membership matches and the page reproduces the tau2 at which
// the conditional R closed forms were evaluated, mu/SE/CI/residual Q/PI are compared with those conditional references; otherwise
// with the strict R references. Between-subgroup statistics are conditional only when every group pool is.
function relOk(a, r, tol) { return finite(a) && finite(r) && Math.abs(a - r) / Math.max(1, Math.abs(r)) <= tol; }
function choose(p, rec, membersOk) {
  const c = rec.conditional;
  return c && membersOk && relOk(p && p.tau2, rec.tau2, 1e-6) && p.tau2 === c.tau2_app ? c : rec.strict;
}
function nanNull(x) { return typeof x === 'number' && Number.isNaN(x) ? null : x; }
function comparePool(prefix, p, rec, membersOk, check) {
  check(prefix + 'k', p && p.k, rec.k, 'exact');
  check(prefix + 'tau2', p && p.tau2, rec.tau2, 'tau2');
  const ref = choose(p, rec, membersOk);
  for (const q of STATS) check(prefix + q, p ? p[q] : undefined, ref[q], 'rel');
  return ref === rec.conditional;
}

// ---- replay ----
function quote(x) { return /[",\t\r\n]|^\s|\s$/.test(String(x)) ? '"' + String(x).replaceAll('"', '""') + '"' : String(x); }
function csvOf(c) {
  return c.te.map((y, j) => [String(j + 1), String(y), String(c.se[j]), c.view === 'cumulative' && c.values ? String(c.values[j] ?? '') : '', c.view === 'subgroup' ? quote(c.values[j] ?? '') : ''].join(',')).join('\n');
}
function expectedStudies(c) {
  return c.te.map((y, j) => {
    let year = null, group = null;
    if (c.view === 'cumulative' && c.values) { const v = parseFloat(String(c.values[j] ?? '')); year = Number.isFinite(v) ? v : null; }
    if (c.view === 'subgroup') group = c.values[j] == null || c.values[j] === '' ? null : String(c.values[j]);
    return { label: String(j + 1), est: y, se: c.se[j], year, group, v: c.se[j] * c.se[j] };
  });
}
function memberString(m) { return Array.isArray(m) ? m.join(',') : undefined; }

function compareConfig(c, r, a, check) {
  check('input', JSON.stringify({ studies: a.parsed && a.parsed.studies, warnings: a.parsed && a.parsed.warnings }), JSON.stringify({ studies: expectedStudies(c), warnings: [] }), 'exact');
  if (r.status === 'refused') {
    check('refusal_summary', a.summary, null, 'null');
    check('refusal_export', window._almLastCumSub(), null, 'null');
    check('refusal_plot', document.getElementById('svg-host').innerHTML, NOGROUP_SVG, 'exact');
    check('heading', headingOk(c.view), true, 'exact');
    check('summary_cards', cardsOk([['k', String(c.k)]]), true, 'exact');
    check('status_messages', statusOk([NOGROUP]), true, 'exact');
    check('controls', controlsOk(c.view, ''), true, 'exact');
    check('axis_controls', axisOk(['', '']), true, 'exact');
    check('page_text', pageTextOk(), true, 'exact');
    return;
  }
  if (!a.summary) throw Error('Unexpected page refusal: ' + c.key);
  const s = a.summary, ex = window._almLastCumSub();
  if (c.view === 'cumulative') {
    const series = a.cum ? a.cum.series : [];
    r.steps.forEach((rec, j) => {
      const p = series[j], pm = a.pools[j], mem = memberString(pm && pm.members), mok = mem === rec.members.join(',');
      check('cum_step', p && p.step, rec.step, 'exact'); check('cum_members', mem, rec.members.join(','), 'exact');
      check('cum_label', p && p.label, rec.label, 'exact'); check('cum_year', p ? p.year : undefined, rec.year, 'exact_or_null');
      comparePool('cum_', p, rec, mok, check);
    });
    check('export_fields', JSON.stringify(Object.keys(ex)) === JSON.stringify(CUM_EXPORT) && ex._schema === 'cumsub-results-v1' && Array.isArray(ex.series) && ex.series.every(e => JSON.stringify(Object.keys(e)) === JSON.stringify(CUM_SERIES)), true, 'exact');
    check('export_k', ex.k, c.k, 'exact'); check('export_view', ex.view, 'cumulative', 'exact');
    const last = r.steps[r.steps.length - 1], fp = series[series.length - 1];
    const fref = choose({ tau2: ex.tau2_final }, last, memberString(a.pools[series.length - 1] && a.pools[series.length - 1].members) === last.members.join(','));
    check('export_tau2_final', ex.tau2_final, last.tau2, 'tau2');
    for (const q of ['mu', 'se', 'lo', 'hi', 'Q']) check('export_' + q + '_final', ex[q + '_final'], fref[q], 'rel');
    check('export_series_count', Array.isArray(ex.series) ? ex.series.length : undefined, r.steps.length, 'exact');
    r.steps.forEach((rec, j) => {
      const e = Array.isArray(ex.series) ? ex.series[j] : undefined, pm = a.pools[j];
      check('export_step', e && e.step, rec.step, 'exact'); check('export_label', e && e.label, rec.label, 'exact'); check('export_year', e ? e.year : undefined, rec.year, 'exact_or_null');
      check('export_tau2', e && e.tau2, rec.tau2, 'tau2');
      const ref = choose(e, rec, memberString(pm && pm.members) === rec.members.join(','));
      for (const q of ['mu', 'se', 'lo', 'hi']) check('export_' + q, e ? e[q] : undefined, ref[q], 'rel');
    });
    check('heading', headingOk('cumulative'), true, 'exact');
    check('summary_cards', cardsOk(cardsExpected('cumulative', a)), true, 'exact');
    check('status_messages', statusOk([]), true, 'exact');
    check('controls', controlsOk('cumulative', ''), true, 'exact');
    check('axis_controls', axisOk(['', '']), true, 'exact');
    check('page_text', pageTextOk(), true, 'exact');
    cumulativePlot(series, '', [null, null], check);
    void fp;
    return;
  }
  const sub = a.sub || { groups: [] };
  check('group_count', sub.groups.length, r.groups.length, 'exact');
  let allCond = true;
  r.groups.forEach((rec, j) => {
    const g = sub.groups[j], pm = a.pools[j], mem = memberString(pm && pm.members), mok = mem === rec.members.join(',');
    check('group_name', g && g.name, rec.name, 'exact'); check('group_members', mem, rec.members.join(','), 'exact');
    if (!comparePool('group_', g, rec, mok, check)) allCond = false;
  });
  const om = memberString(a.pools[a.pools.length - 1] && a.pools[a.pools.length - 1].members);
  comparePool('overall_', sub.overall, r.overall, om === r.overall.members.join(','), check);
  const bref = allCond && r.between.conditional ? r.between.conditional : r.between.strict;
  check('df_bw', sub.df_bw, r.df_bw, 'exact');
  check('Q_bw', sub.Q_bw, bref.Q_bw, 'rel'); check('M_bw', sub.M_bw, bref.M_bw, 'rel');
  check('pQ', nanNull(sub.pQ), bref.pQ, 'abs'); check('I2_bw', finite(sub.I2_bw) ? sub.I2_bw / 100 : sub.I2_bw, bref.I2_bw / 100, 'abs');
  const oref = choose({ tau2: ex.overall_tau2 }, r.overall, om === r.overall.members.join(','));
  check('export_fields', JSON.stringify(Object.keys(ex)) === JSON.stringify(SUB_EXPORT) && ex._schema === 'cumsub-results-v1', true, 'exact');
  check('export_k', ex.k, c.k, 'exact'); check('export_view', ex.view, 'subgroup', 'exact'); check('export_groups', ex.groups, r.groups.length, 'exact');
  check('export_overall_tau2', ex.overall_tau2, r.overall.tau2, 'tau2');
  for (const [q, t] of [['mu', 'mu'], ['lo', 'lo'], ['hi', 'hi'], ['pi_lo', 'piLo'], ['pi_hi', 'piHi']]) check('export_overall_' + q, ex['overall_' + q], oref[t], 'rel');
  check('export_Q_bw', ex.Q_bw, bref.Q_bw, 'rel'); check('export_df_bw', ex.df_bw, r.df_bw, 'exact');
  check('export_I2_bw', finite(ex.I2_bw) ? ex.I2_bw / 100 : ex.I2_bw, bref.I2_bw / 100, 'abs'); check('export_pQ', nanNull(ex.pQ), bref.pQ, 'abs');
  check('heading', headingOk('subgroup'), true, 'exact');
  check('summary_cards', cardsOk(cardsExpected('subgroup', a)), true, 'exact');
  check('status_messages', statusOk([]), true, 'exact');
  check('controls', controlsOk('subgroup', ''), true, 'exact');
  check('axis_controls', axisOk(['', '']), true, 'exact');
  check('page_text', pageTextOk(), true, 'exact');
  subgroupPlot(sub, '', [null, null], check);
}

function preflight(corpus, refs) {
  if (!Array.isArray(corpus) || corpus.length !== CONTRACT.configurations || !Array.isArray(refs) || refs.length !== CONTRACT.configurations) throw Error('Configuration cardinality mismatch');
  const keys = new Set();
  corpus.forEach((c, i) => {
    const k = field(c, 'k'), r = refs[i];
    if (typeof c.key !== 'string' || keys.has(c.key)) throw Error('Duplicate/invalid configuration key');
    keys.add(c.key);
    if (!r || r.key !== c.key) throw Error('Reference coverage mismatch: ' + c.key);
    if (!['cumulative', 'subgroup'].includes(field(c, 'view'))) throw Error('Invalid view');
    for (const q of ['te', 'se']) { const v = field(c, q); if (!Array.isArray(v) || v.length !== k || v.some(x => !finite(x))) throw Error('Invalid source ' + q); }
    if (!Number.isInteger(k) || k < 2 || c.se.some(x => x <= 0)) throw Error('Invalid source rows');
    const vals = field(c, 'values');
    if (c.view === 'subgroup' && (!Array.isArray(vals) || vals.length !== k)) throw Error('Invalid group values');
    if (r.status === 'refused') { if (c.view !== 'subgroup' || vals.some(v => v != null && String(v) !== '') || !/no group column detected/.test(r.reason)) throw Error('Invalid refusal reference'); return; }
    if (r.status !== 'ok' || r.view !== c.view) throw Error('Invalid reference status');
    const pool = (p, n) => {
      for (const q of ['k', 'tau2']) if (!finite(field(p, q))) throw Error('Invalid reference ' + q);
      const m = field(p, 'members'); if (!Array.isArray(m) || m.length !== p.k || m.some(x => !Number.isInteger(x) || x < 1 || x > k) || new Set(m).size !== m.length || (n && m.length !== n)) throw Error('Invalid reference membership');
      for (const src of [field(p, 'strict'), ...(field(p, 'conditional') ? [p.conditional] : [])]) for (const q of STATS) { const v = field(src, q); if (!(finite(v) || (v === null && p.k < 2 && q.startsWith('pi')))) throw Error('Invalid reference ' + q); }
      if (p.conditional && !finite(field(p.conditional, 'tau2_app'))) throw Error('Invalid conditional tau2');
    };
    if (c.view === 'cumulative') { if (field(r, 'steps').length !== k) throw Error('Step cardinality mismatch'); r.steps.forEach((p, j) => { pool(p, j + 1); if (p.step !== j + 1) throw Error('Invalid step'); }); }
    else {
      const g = field(r, 'groups'); if (!Array.isArray(g) || !g.length) throw Error('Invalid groups');
      g.forEach(p => { pool(p); if (typeof field(p, 'name') !== 'string') throw Error('Invalid group name'); });
      if (g.reduce((n, p) => n + p.k, 0) !== k) throw Error('Group membership coverage mismatch');
      pool(field(r, 'overall'), k);
      if (field(r, 'df_bw') !== g.length - 1) throw Error('Invalid df');
      for (const src of [field(r, 'between').strict, ...(r.between.conditional ? [r.between.conditional] : [])]) for (const q of ['Q_bw', 'M_bw', 'pQ', 'I2_bw']) { const v = field(src, q); if (!(finite(v) || (q === 'pQ' && v === null && r.df_bw === 0))) throw Error('Invalid between ' + q); }
    }
  });
}

const CONTRACT = {"files":[{"path":"validate/corpus/corpus.json","sha256":"dac5806f456eb35518124d44b74e721f21c353abdb21287db533bc8f36616ea2","bytes":2754820},{"path":"validate/corpus/reference.json","sha256":"a0721e62d0b8862b9d68bbea3dba668060786810442b2ef2c124bdb55b91a8e5","bytes":12758668}],"checks":609398,"archived_checks":1615408,"configurations":1816,"cumulative_configurations":311,"subgroup_configurations":1499,"refused_configurations":6,"pools":28473,"rule":"All 1815 configurations with k <= 100 (including all 6 page-policy refusals and 22 of the 23 configurations holding the 34 residual-Q pools adjudicated under the conditional rule), plus the remaining such configuration (dat.mccurdy2020::001::subgroup::pairing, k = 1653), in corpus order","referenceVersions":{"R":"4.6.0","metafor":"5.2-1","metadat":"1.6-0"},"replay_quantities":["exact parsed input rows and parser warnings","every cumulative step and subgroup pool: membership, k, PM tau2, mu, SE, CI, residual Q and prediction interval","between-subgroup Q, centre, df, p and I2 difference","every exported results field (exact field list)","exact preview heading and summary-card labels/values","exact notes banner and axis error (refusal note exact in refused configurations)","exact view options/selection and empty plot title","exact default effect-axis controls during replay","plotted marks, CI band/lines, diamond and axis geometry against the page plotting rule, and every SVG text in order","every other visible text node and aria-label/title of the page template outside the validation panel, exactly; draft banner absent or exact; CSV warnings equal to the importer records"]};
const files = CONTRACT.files;
async function replay(loaded, progress) {
  const corpus = loaded[files[0].path], refs = loaded[files[1].path];
  preflight(corpus, refs);
  if (!window.alm?.urlState?.withoutWrites) throw Error('URL replay guard unavailable');
  const snap = __almCumSubValidationSnapshot(), draft = localStorage.getItem(DRAFT_KEY);
  const controls = [...document.querySelectorAll('input,textarea,select,button')].filter(x => !x.closest('#alm-validate')).map(x => [x, x.disabled]);
  const axisSaved = axisInputs().map(x => [x, x.value, x.checked]), axisErrorEl = document.querySelector('#alm-axis-mount [data-error]'), axisError = axisErrorEl?.textContent;
  let checks = 0, passed = 0; const failed = [], maxima = {}, refusals = [];
  return alm.urlState.withoutWrites(async () => {
    try {
      controls.forEach(([x]) => { if (!x.closest('#alm-axis-mount') || x.dataset.edge !== 'log') x.disabled = true; });
      setAxisDefault();
      for (let i = 0; i < corpus.length; i++) {
        const c = corpus[i], r = refs[i];
        if (r.status === 'refused') refusals.push(c.key);
        const a = __almCumSubValidationRun(csvOf(c), c.view, '', {});
        compareConfig(c, r, a, (quantity, app, ref, kind) => {
          let d;
          if (kind === 'null') d = { pass: app === null && ref === null, diff: app === null ? 0 : Infinity };
          else if (kind === 'exact_or_null') d = { pass: app === ref && (app === null || finite(app)), diff: app === ref ? 0 : Infinity };
          else if (kind === 'tau2') d = AlmValidate.compare(app, ref, 'rel', 1e-6);
          else d = AlmValidate.compare(app, ref, kind, 1e-9);
          checks++; if (d.pass) passed++; else failed.push({ id: c.key, quantity, app, ref, tol: kind === 'tau2' ? 1e-6 : ['exact', 'null', 'exact_or_null'].includes(kind) ? 0 : 1e-9, ...d });
          maxima[quantity] = Math.max(maxima[quantity] || 0, d.diff);
        });
        progress(`${c.key}: ${checks} checks`); if (i % 4 === 3) await new Promise(res => setTimeout(res, 0));
      }
    } finally {
      axisSaved.forEach(([x, v, ch]) => { x.value = v; x.checked = ch; }); if (axisErrorEl) axisErrorEl.textContent = axisError;
      __almCumSubValidationRestore(snap);
      if (draft === null) localStorage.removeItem(DRAFT_KEY); else localStorage.setItem(DRAFT_KEY, draft);
      controls.forEach(([x, d]) => { x.disabled = d; });
    }
    if (checks !== CONTRACT.checks) throw Error('Replay check cardinality mismatch: ' + checks);
    return { checks, passed, failed, maxima, refusals, summaryLines: [CONTRACT.rule, CONTRACT.replay_quantities.join('; '),
      `Declared deterministic subset: ${CONTRACT.configurations} configurations, ${checks} checks. Full archived comparison: ${CONTRACT.archived_checks} checks.`,
      'tau2: relative 1e-6. mu, SE, CI, residual Q, PI, Q_bw, M_bw: 1e-9 relative to max(1, |R|), under the declared conditional rule; pQ absolute 1e-9; I² difference absolute 1e-9 on the fraction scale. Plot coordinates absolute 1e-9. Display text, labels, membership and counts exact.'] };
  });
}

// ---- live: the current page analysis ----
function rnum(x) { if (x === null || x === undefined) return 'NA'; if (!finite(x)) throw Error('Non-finite value cannot be sent to R'); return String(x); }
function rstr(s) {
  if (s === null || s === undefined) return 'NA_character_';
  s = String(s);
  if (!s.isWellFormed() || s.includes('\u0000')) throw Error('Group or label text cannot be sent to R exactly');
  return JSON.stringify(s);
}
function currentState() {
  if (axisErrorText()) throw Error('Axis limits are invalid; correct or reset them before validating');
  let a; alm.urlState.withoutWrites(() => { a = __almCumSubValidationRun(); });
  if (a.axisRefusal || svgRoot()?.hasAttribute('data-axis-refusal')) throw Error('Axis limits are invalid (the page refused the plot); correct or reset them before validating');
  const view = document.getElementById('f-view').value, title = document.getElementById('f-title').value;
  if (!HEADINGS[view]) throw Error('Invalid view');
  if (!a.summary) throw Error('Page refused current analysis: ' + (a.parsed.studies.length < 2 ? 'need at least 2 valid studies' : 'subgroup view needs a group column'));
  const st = a.parsed.studies, k = st.length, ex = window._almLastCumSub(), user = userAxis();
  const values = [], kind = {}, tolerance = { default: 1e-9 };
  const add = (key, value, how = 'rel') => {
    if (how === 'exact') { if (typeof value === 'number' && !Number.isInteger(value)) throw Error('Invalid app ' + key); }
    else if (!(finite(value) || value === null)) throw Error('Invalid app ' + key);
    values.push({ key, label: key, value }); kind[key] = how === 'exact' ? 'exact' : how === 'abs' ? 'abs' : 'rel'; if (how === 'tau2') tolerance[key] = 1e-6;
  };
  const pool = (prefix, p, members) => { add(prefix + '.members', members, 'exact'); add(prefix + '.k', p.k, 'exact'); add(prefix + '.tau2', p.tau2, 'tau2'); for (const q of STATS) add(prefix + '.' + q, p[q]); };
  const notes = a.parsed.warnings.slice();
  let ta, am, groups = null;
  if (view === 'cumulative') {
    const series = a.cum.series;
    series.forEach((p, j) => pool('step.' + (j + 1), p, a.pools[j].members.join(',')));
    const rows = series.map((p, j) => a.pools[j].members[j]);
    add('series_rows', series.every((p, j) => p.step === j + 1 && p.label === st[rows[j] - 1].label && p.year === st[rows[j] - 1].year), 'exact');
    add('export.fields', JSON.stringify(Object.keys(ex)) === JSON.stringify(CUM_EXPORT) && ex._schema === 'cumsub-results-v1' && ex.view === 'cumulative' && ex.series.length === k &&
      ex.series.every((e, j) => JSON.stringify(Object.keys(e)) === JSON.stringify(CUM_SERIES) && e.step === series[j].step && e.label === series[j].label && e.year === series[j].year), 'exact');
    add('export.k', ex.k, 'exact'); add('export.tau2_final', ex.tau2_final, 'tau2');
    for (const q of ['mu', 'se', 'lo', 'hi', 'Q']) add('export.' + q + '_final', ex[q + '_final']);
    ex.series.forEach((e, j) => { add('export.step.' + (j + 1) + '.tau2', e.tau2, 'tau2'); for (const q of ['mu', 'se', 'lo', 'hi']) add('export.step.' + (j + 1) + '.' + q, e[q]); });
    ta = series.map(p => p.tau2); am = a.pools.map(p => p.members.join(','));
  } else {
    const sub = a.sub; groups = sub.groups.map(g => g.name);
    add('group_count', sub.groups.length, 'exact');
    sub.groups.forEach((g, j) => { add('group.' + (j + 1) + '.pos', j + 1, 'exact'); pool('group.' + (j + 1), g, a.pools[j].members.join(',')); });
    pool('overall', sub.overall, a.pools[a.pools.length - 1].members.join(','));
    add('df_bw', sub.df_bw, 'exact'); add('Q_bw', sub.Q_bw); add('M_bw', sub.M_bw); add('pQ', nanNull(sub.pQ), 'abs'); add('I2_bw_fraction', sub.I2_bw / 100, 'abs');
    add('export.fields', JSON.stringify(Object.keys(ex)) === JSON.stringify(SUB_EXPORT) && ex._schema === 'cumsub-results-v1' && ex.view === 'subgroup', 'exact');
    add('export.k', ex.k, 'exact'); add('export.groups', ex.groups, 'exact'); add('export.overall_tau2', ex.overall_tau2, 'tau2');
    for (const q of ['mu', 'lo', 'hi', 'pi_lo', 'pi_hi']) add('export.overall_' + q, ex['overall_' + q]);
    add('export.Q_bw', ex.Q_bw); add('export.df_bw', ex.df_bw, 'exact'); add('export.I2_bw_fraction', ex.I2_bw / 100, 'abs'); add('export.pQ', nanNull(ex.pQ), 'abs');
    ta = sub.groups.map(g => g.tau2).concat([sub.overall.tau2]); am = a.pools.map(p => p.members.join(','));
  }
  // Exact displayed state on the current page. The notes banner must hold exactly the parser's own warnings for this input.
  add('display.heading', headingOk(view), 'exact');
  add('display.summary_cards', cardsOk(cardsExpected(view, a)), 'exact');
  add('display.status_messages', statusOk(notes), 'exact');
  add('display.controls', controlsOk(view, null), 'exact');
  add('display.axis_controls', axisOk(null), 'exact');
  add('display.page_text', pageTextOk(), 'exact');
  let plotOk = true; const plotCheck = (q, app, ref, how) => { if (!(how === 'exact' ? app === ref : near(app, ref))) plotOk = false; };
  if (view === 'cumulative') cumulativePlot(a.cum.series, title, user, plotCheck); else subgroupPlot(a.sub, title, user, plotCheck);
  add('display.plot', plotOk, 'exact');
  adapter.live.compare.kind = kind; adapter.live.compare.tolerance = tolerance;
  return { view, k, yi: st.map(s => s.est), sei: st.map(s => s.se), year: st.map(s => s.year), group: st.map(s => s.group), groups, ta, am, values,
    note: 'Every value the page computes, shows or exports for the current input is compared with R. tau2: relative 1e-6 (PM). Others: 1e-9 relative to max(1, |R|) (pQ and I² difference absolute), evaluated at the page tau2 when it agrees with R to 1e-6 and membership matches (declared conditional rule). Paper metafor 5.2-1; live 4.8-0.' };
}
function buildScript(s) {
  return `
get <- function(x,k){stopifnot(k %in% names(x));x[[k,exact=TRUE]]}
yi <- c(${s.yi.map(rnum).join(',')}); vi <- c(${s.sei.map(rnum).join(',')})^2; k <- length(yi)
yr <- c(${s.year.map(rnum).join(',')}); grp <- c(${s.group.map(rstr).join(',')})
ta <- c(${s.ta.map(rnum).join(',')}); am <- c(${s.am.map(rstr).join(',')}); view <- '${s.view}'
ctl <- function(y) list(threshold=1e-12,maxiter=1000,tau2.max=if(length(y)>1)max(1,var(y)*100) else 1,tol=.Machine[['double.eps',exact=TRUE]]^0.75)
fit <- function(y,v,cy=y) metafor::rma(yi=y,vi=v,method='PM',test='z',control=ctl(cy))
pi_ <- function(mu,se,t,k) if(k>1) qt(.975,k-1)*sqrt(t+se^2) else NA_real_
strict <- function(m,y,v){mu<-as.numeric(coef(m));se<-get(m,'se');t<-get(m,'tau2');d<-pi_(mu,se,t,length(y));list(tau2=t,mu=mu,se=se,lo=get(m,'ci.lb'),hi=get(m,'ci.ub'),Q=sum((y-mu)^2/(v+t)),piLo=mu-d,piHi=mu+d)}
calc <- function(y,v,t){w<-1/(v+t);mu<-sum(w*y)/sum(w);se<-sqrt(1/sum(w));d<-pi_(mu,se,t,length(y));list(mu=mu,se=se,lo=mu-qnorm(.975)*se,hi=mu+qnorm(.975)*se,Q=sum(w*(y-mu)^2),piLo=mu-d,piHi=mu+d)}
out <- list(); conditioned <- logical()
pool <- function(prefix,m,ix,app_t,app_m){
 s <- strict(m,yi[ix],vi[ix]); key <- paste(ix,collapse=',')
 ok <- !is.na(app_t) && identical(app_m,key) && abs(app_t-s$tau2)<=1e-6*max(1,abs(s$tau2))
 v <- if(ok) calc(yi[ix],vi[ix],app_t) else s[c('mu','se','lo','hi','Q','piLo','piHi')]
 out[[paste0(prefix,'.members')]] <<- key; out[[paste0(prefix,'.k')]] <<- length(ix); out[[paste0(prefix,'.tau2')]] <<- s$tau2
 for(q in names(v)) out[[paste0(prefix,'.',q)]] <<- get(v,q)
 conditioned[[length(conditioned)+1]] <<- ok
 v
}
if(view=='cumulative'){
 ord <- if(all(is.finite(yr))) order(yr,seq_len(k)) else seq_len(k)
 fin <- NULL
 for(j in seq_len(k)){ix<-ord[seq_len(j)];fin<-pool(paste0('step.',j),fit(yi[ix],vi[ix],yi),ix,ta[j],am[j])}
 out[['series_rows']] <- TRUE; out[['export.fields']] <- TRUE; out[['export.k']] <- k; out[['export.tau2_final']] <- out[[paste0('step.',k,'.tau2')]]
 for(q in c('mu','se','lo','hi','Q')) out[[paste0('export.',q,'_final')]] <- get(fin,q)
 for(j in seq_len(k)) for(q in c('tau2','mu','se','lo','hi')) out[[paste0('export.step.',j,'.',q)]] <- out[[paste0('step.',j,'.',q)]]
} else {
 g <- ifelse(is.na(grp)|grp=='','(ungrouped)',grp); names_app <- c(${(s.groups || []).map(rstr).join(',')})
 rn <- sort(unique(g),method='radix'); out[['group_count']] <- length(rn); mus <- ses <- numeric(length(rn))
 for(j in seq_along(rn)){ix<-which(g==rn[j]);p<-match(rn[j],names_app);out[[paste0('group.',j,'.pos')]]<-if(is.na(p)) 0L else p
  v<-pool(paste0('group.',j),fit(yi[ix],vi[ix]),ix,if(is.na(p)) NA_real_ else ta[p],if(is.na(p)) '' else am[p]);mus[j]<-v$mu;ses[j]<-v$se}
 allc <- all(conditioned)
 if(!allc){for(j in seq_along(rn)){ix<-which(g==rn[j]);s<-strict(fit(yi[ix],vi[ix]),yi[ix],vi[ix]);mus[j]<-s$mu;ses[j]<-s$se}}
 ov <- pool('overall',fit(yi,vi),seq_len(k),ta[length(ta)],am[length(am)])
 df <- length(rn)-1; w <- 1/ses^2; M <- sum(w*mus)/sum(w); Q <- sum(w*(mus-M)^2)
 if(!allc){b<-metafor::rma(yi=mus,vi=ses^2,method='FE');Q<-get(b,'QE');M<-as.numeric(coef(b))}
 I2 <- if(df>0&&Q>0) max(0,100*(Q-df)/Q) else 0; pQ <- if(df>0) pchisq(Q,df,lower.tail=FALSE) else NA_real_
 out[['df_bw']] <- df; out[['Q_bw']] <- Q; out[['M_bw']] <- M; out[['pQ']] <- pQ; out[['I2_bw_fraction']] <- I2/100
 out[['export.fields']] <- TRUE; out[['export.k']] <- k; out[['export.groups']] <- length(rn); out[['export.overall_tau2']] <- out[['overall.tau2']]
 for(q in c('mu','lo','hi')) out[[paste0('export.overall_',q)]] <- get(ov,q)
 out[['export.overall_pi_lo']] <- ov$piLo; out[['export.overall_pi_hi']] <- ov$piHi
 out[['export.Q_bw']] <- Q; out[['export.df_bw']] <- df; out[['export.I2_bw_fraction']] <- I2/100; out[['export.pQ']] <- pQ
}
for(q in c('heading','summary_cards','status_messages','controls','axis_controls','page_text','plot')) out[[paste0('display.',q)]] <- TRUE
emit <- function(q){x<-get(out,q);stopifnot(length(x)==1);if(is.character(x)){stopifnot(grepl('^[0-9,]*$',x));paste0('"',x,'"')} else if(is.logical(x)) {if(x)'true' else 'false'} else if(is.na(x)) 'null' else {stopifnot(is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(names(out),emit,'')),collapse=','),'}\\n',sep='')
`;
}

const adapter = {
  app: 'cumulative-subgroup',
  paper: { checks: CONTRACT.archived_checks, repoUrl: 'https://github.com/mahmood726-cyber/allmeta', runLabel: 'Scope and R reproduction', runUrl: 'validate/README.md', packageVersions: { metafor: '5.2-1' } },
  live: { packages: ['metafor'], paperVersions: { metafor: '5.2-1' }, currentState, buildScript, appValues: s => s.values, compare: { tolerance: { default: 1e-9 }, kind: {} } },
  corpus: { files, mode: 'quick', quickChecks: CONTRACT.checks, run: replay },
  pageText
};
window.AlmCumSubValidationAdapter = adapter;
window.AlmCumSubValidation = AlmValidate.mount(document.getElementById('alm-validate'), adapter);
const scope = document.createElement('p');
scope.textContent = `Replay scope: ${CONTRACT.checks} checks / ${CONTRACT.configurations} configurations. ${CONTRACT.rule}. Includes ${CONTRACT.replay_quantities.join('; ')}. Full archived comparison: ${CONTRACT.archived_checks.toLocaleString('en-US')} checks; this button replays the declared subset.`;
document.getElementById('alm-validate').append(scope);
})();
