/* Within-subgroup cumulative meta-analysis (cumulative-subgroup app).
 *
 * For each subgroup, the cumulative path produced by the page's OWN cumulative engine
 * (window.__almCumulative: same parser, same ordering rule, same Paule-Mandel pool, same normal 95% CI,
 * same residual Q at the PM weights and the same t_{k-1} 95% prediction interval). Grouping follows the
 * page's subgroup rule: an empty group becomes "(ungrouped)" and groups are listed in JavaScript default
 * sort order. Ordering rule, applied inside each subgroup by the page engine: by year when every study in
 * that subgroup has a year (stable, ties keep row order), otherwise row order.
 *
 * Nothing here changes a page calculation; this file only calls the engine and draws/exports its output.
 * Exposes window.AlmSubgroupCumulative = { compute, renderSvg, toJson, toCsv, parseCsv, replay, replayCore, ... }.
 */
(function (global) {
'use strict';

const SCHEMA = 'cumsub-within-subgroup-v1';
const NOGROUP = 'No group column detected — add a 5th column to split studies.';
const FEW = 'Need ≥2 studies.';
const ORDER_RULE = 'Within each subgroup: by year when every study in the subgroup has a year (stable; ties keep row order), otherwise row order.';
const MAX_PANELS = 24, MAX_OVERLAY = 8;
const PALETTE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#8C6D31'];
const finite = x => typeof x === 'number' && Number.isFinite(x);

// ---------------------------------------------------------------- compute
function groupKey(s) { return s.group || '(ungrouped)'; }
function compute(studies, cumulativeFn) {
  if (!Array.isArray(studies) || studies.length < 2) return { refused: FEW, k: studies ? studies.length : 0, groups: [] };
  if (!studies.some(s => s.group)) return { refused: NOGROUP, k: studies.length, groups: [] };
  const by = Object.create(null);
  for (const s of studies) { const g = groupKey(s); (by[g] || (by[g] = [])).push(s); }
  const groups = Object.keys(by).sort().map(name => {
    const rows = by[name], c = cumulativeFn(rows);
    const order = c.sorted.map(r => studies.indexOf(r) + 1);
    const series = c.series.map((p, j) => ({ step: p.step, row: order[j], label: p.label, year: p.year, k: p.k,
      mu: p.mu, se: p.se, lo: p.lo, hi: p.hi, tau2: p.tau2, Q: p.Q, piLo: p.piLo, piHi: p.piHi }));
    return { name, k: rows.length, byYear: rows.every(s => s.year != null), order, series };
  });
  return { refused: null, k: studies.length, groups };
}

// ---------------------------------------------------------------- plot
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function n(x) { return Number.isFinite(x) ? +x.toFixed(2) : 0; }
function fmt(x, d) { return Number.isFinite(x) ? x.toFixed(d == null ? 3 : d) : '--'; }
function niceTicks(lo, hi, want) {
  if (!(hi > lo)) return [lo];
  const s0 = (hi - lo) / Math.max(1, want), m = Math.pow(10, Math.floor(Math.log10(s0))), r = s0 / m;
  const step = r < 1.5 ? m : r < 3 ? 2 * m : r < 7 ? 5 * m : 10 * m;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(Math.abs(v) < 1e-12 * step ? 0 : v);
  return out;
}
function intTicks(k, maxTicks) {
  if (k <= 1) return [1];
  let step = 1; const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const s of steps) { step = s; if (Math.floor((k - 1) / s) + 1 <= maxTicks) break; }
  const t = [1]; for (let v = step; v <= k; v += step) if (v > 1) t.push(v);
  return t;
}
function yRange(groups) {
  let lo = Infinity, hi = -Infinity;
  for (const g of groups) for (const s of g.series) { if (s.lo < lo) lo = s.lo; if (s.hi > hi) hi = s.hi; }
  if (!(hi > lo)) { lo = (finite(lo) ? lo : 0) - 1; hi = (finite(hi) ? hi : 0) + 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  if (lo > 0) lo = 0; if (hi < 0) hi = 0;
  return [lo, hi];
}
// Approximate text width for system-ui at a font size (conservative: 0.62 em per character).
function fitText(s, px, font) { const max = Math.max(4, Math.floor(px / (0.62 * font))); return s.length <= max ? s : s.slice(0, max - 1) + '…'; }

function refusalSvg(msg) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 90" width="480" height="90" role="img" aria-label="' + esc(msg) + '" data-subcum-refusal="1">' +
    '<rect width="480" height="90" fill="#fff"/><text x="240" y="50" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#5c6470">' + esc(msg) + '</text></svg>';
}

function renderSvg(res, opts) {
  opts = opts || {};
  if (!res || res.refused) return refusalSvg(res ? (res.refused === NOGROUP ? 'Within-subgroup paths need a group column.' : res.refused) : 'No analysis.');
  const mode = opts.mode === 'overlay' ? 'overlay' : 'multiples';
  if (mode === 'overlay' && res.groups.length > MAX_OVERLAY) return refusalSvg('Overlay shows up to ' + MAX_OVERLAY + ' subgroups (' + res.groups.length + ' here); use small multiples.');
  return mode === 'overlay' ? overlaySvg(res) : multiplesSvg(res);
}

function multiplesSvg(res) {
  const all = res.groups, shown = all.slice(0, MAX_PANELS), G = shown.length;
  const cols = Math.min(3, G), rows = Math.ceil(G / cols);
  const PW = 300, PH = 210, L = 46, R = 12, T = 28, B = 40, plotW = PW - L - R, plotH = PH - T - B;
  const head = all.length > G ? 22 : 0, W = cols * PW, H = head + rows * PH + 26;
  const [yLo, yHi] = yRange(shown), yt = niceTicks(yLo, yHi, 4);
  const p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="system-ui, sans-serif" role="img" aria-label="Within-subgroup cumulative meta-analysis, small multiples" data-subcum-mode="multiples">',
    '<rect width="' + W + '" height="' + H + '" fill="#fff"/>'];
  if (head) p.push('<text x="' + (W / 2) + '" y="15" text-anchor="middle" font-size="12" fill="#b05a1c" data-subcum-note="1">Showing the first ' + G + ' of ' + all.length + ' subgroups; every subgroup is in the JSON/CSV export.</text>');
  shown.forEach((g, i) => {
    const ox = (i % cols) * PW, oy = head + Math.floor(i / cols) * PH, k = g.series.length;
    const x = s => n(ox + L + (k > 1 ? (s - 1) / (k - 1) : 0.5) * plotW), y = v => n(oy + T + plotH - (v - yLo) / (yHi - yLo) * plotH);
    p.push('<g data-subcum-panel="' + i + '" data-group="' + esc(g.name) + '" data-k="' + k + '">');
    p.push('<title>' + esc(g.name + ' (k=' + g.k + ')') + '</title>');
    p.push('<text x="' + n(ox + L) + '" y="' + n(oy + 17) + '" font-size="12" font-weight="600" fill="#15181d" data-role="panel-title">' + esc(fitText(g.name + ' (k=' + g.k + ')', plotW + R, 12)) + '</text>');
    p.push('<rect x="' + n(ox + L) + '" y="' + n(oy + T) + '" width="' + plotW + '" height="' + plotH + '" fill="#fbfaf6" stroke="#d9d5cc"/>');
    if (yLo < 0 && yHi > 0) p.push('<line x1="' + n(ox + L) + '" y1="' + y(0) + '" x2="' + n(ox + L + plotW) + '" y2="' + y(0) + '" stroke="#7a8294" stroke-dasharray="3 3"/>');
    if (k > 1) p.push('<polygon points="' + g.series.map(s => x(s.step) + ',' + y(s.hi)).concat(g.series.map(s => x(s.step) + ',' + y(s.lo)).reverse()).join(' ') + '" fill="#e8f0f7" stroke="none"/>');
    else p.push('<line x1="' + x(1) + '" y1="' + y(g.series[0].lo) + '" x2="' + x(1) + '" y2="' + y(g.series[0].hi) + '" stroke="#2c5e8a" stroke-width="1.5" data-role="ci"/>');
    p.push('<polyline points="' + g.series.map(s => x(s.step) + ',' + y(s.mu)).join(' ') + '" fill="none" stroke="#2c5e8a" stroke-width="2"/>');
    for (const s of g.series) p.push('<circle cx="' + x(s.step) + '" cy="' + y(s.mu) + '" r="2.6" fill="#2c5e8a" data-step="' + s.step + '"/>');
    for (const t of yt) { p.push('<line x1="' + n(ox + L - 4) + '" y1="' + y(t) + '" x2="' + n(ox + L) + '" y2="' + y(t) + '" stroke="#15181d"/>'); p.push('<text x="' + n(ox + L - 6) + '" y="' + n(y(t) + 3.5) + '" text-anchor="end" font-size="10" fill="#3d434d" data-role="ytick">' + fmt(t, 2) + '</text>'); }
    for (const t of intTicks(k, 6)) { const xx = x(t), by = n(oy + T + plotH); p.push('<line x1="' + xx + '" y1="' + by + '" x2="' + xx + '" y2="' + n(by + 4) + '" stroke="#15181d"/>'); p.push('<text x="' + xx + '" y="' + n(by + 15) + '" text-anchor="middle" font-size="10" fill="#3d434d" data-role="xtick">' + t + '</text>'); }
    p.push('<text x="' + n(ox + L + plotW / 2) + '" y="' + n(oy + T + plotH + 30) + '" text-anchor="middle" font-size="10" fill="#5c6470" data-role="xlab">Studies accrued in subgroup</text>');
    p.push('</g>');
  });
  p.push('<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#15181d" data-role="caption">Pooled effect (PM random effects, 95% CI band) as studies accrue within each subgroup; shared vertical axis.</text>');
  p.push('</svg>');
  return p.join('');
}

function overlaySvg(res) {
  const gs = res.groups, K = Math.max(...gs.map(g => g.series.length));
  const W = 760, L = 56, R = 200, T = 20, B = 50, H = 400, plotW = W - L - R, plotH = H - T - B;
  const [yLo, yHi] = yRange(gs), yt = niceTicks(yLo, yHi, 6);
  const x = s => n(L + (K > 1 ? (s - 1) / (K - 1) : 0.5) * plotW), y = v => n(T + plotH - (v - yLo) / (yHi - yLo) * plotH);
  const p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="system-ui, sans-serif" role="img" aria-label="Within-subgroup cumulative meta-analysis, overlaid paths" data-subcum-mode="overlay">',
    '<rect width="' + W + '" height="' + H + '" fill="#fff"/>',
    '<rect x="' + L + '" y="' + T + '" width="' + plotW + '" height="' + plotH + '" fill="#fbfaf6" stroke="#d9d5cc"/>'];
  if (yLo < 0 && yHi > 0) p.push('<line x1="' + L + '" y1="' + y(0) + '" x2="' + (L + plotW) + '" y2="' + y(0) + '" stroke="#7a8294" stroke-dasharray="3 3"/>');
  gs.forEach((g, i) => {
    const c = PALETTE[i];
    p.push('<g data-subcum-panel="' + i + '" data-group="' + esc(g.name) + '" data-k="' + g.series.length + '">');
    p.push('<title>' + esc(g.name + ' (k=' + g.k + ')') + '</title>');
    for (const s of g.series) p.push('<line x1="' + x(s.step) + '" y1="' + y(s.lo) + '" x2="' + x(s.step) + '" y2="' + y(s.hi) + '" stroke="' + c + '" stroke-opacity="0.35" stroke-width="1.2" data-role="ci"/>');
    p.push('<polyline points="' + g.series.map(s => x(s.step) + ',' + y(s.mu)).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2"/>');
    for (const s of g.series) p.push('<circle cx="' + x(s.step) + '" cy="' + y(s.mu) + '" r="2.8" fill="' + c + '" data-step="' + s.step + '"/>');
    p.push('</g>');
    const ly = T + 10 + i * 20;
    p.push('<line x1="' + (L + plotW + 14) + '" y1="' + ly + '" x2="' + (L + plotW + 34) + '" y2="' + ly + '" stroke="' + c + '" stroke-width="3"/>');
    p.push('<text x="' + (L + plotW + 40) + '" y="' + (ly + 4) + '" font-size="11" fill="#15181d" data-role="legend">' + esc(fitText(g.name + ' (k=' + g.k + ')', R - 44, 11)) + '</text>');
  });
  for (const t of yt) { p.push('<line x1="' + (L - 4) + '" y1="' + y(t) + '" x2="' + L + '" y2="' + y(t) + '" stroke="#15181d"/>'); p.push('<text x="' + (L - 6) + '" y="' + n(y(t) + 3.5) + '" text-anchor="end" font-size="10" fill="#3d434d" data-role="ytick">' + fmt(t, 2) + '</text>'); }
  for (const t of intTicks(K, 10)) { p.push('<line x1="' + x(t) + '" y1="' + (T + plotH) + '" x2="' + x(t) + '" y2="' + (T + plotH + 4) + '" stroke="#15181d"/>'); p.push('<text x="' + x(t) + '" y="' + (T + plotH + 16) + '" text-anchor="middle" font-size="10" fill="#3d434d" data-role="xtick">' + t + '</text>'); }
  p.push('<text x="' + (L + plotW / 2) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="11" fill="#15181d" data-role="xlab">Studies accrued within subgroup</text>');
  p.push('<text transform="translate(14,' + (T + plotH / 2) + ') rotate(-90)" text-anchor="middle" font-size="11" fill="#15181d" data-role="ylab">Pooled effect (95% CI)</text>');
  p.push('</svg>');
  return p.join('');
}

// ---------------------------------------------------------------- export
const CSV_COLS = ['group', 'group_k', 'by_year', 'step', 'row', 'label', 'year', 'k', 'mu', 'se', 'lo', 'hi', 'tau2', 'Q', 'pi_lo', 'pi_hi'];
function toJson(res) {
  if (!res || res.refused) return { _schema: SCHEMA, refused: res ? res.refused : 'No analysis.', groups: [] };
  return { _schema: SCHEMA, estimator: 'Paule-Mandel random effects (per subgroup, per step)', ci: 'normal 95%', pi: 't_{k-1} 95% (null for k < 2)',
    ordering_rule: ORDER_RULE, k: res.k, n_groups: res.groups.length,
    groups: res.groups.map(g => ({ name: g.name, k: g.k, by_year: g.byYear,
      series: g.series.map(s => ({ step: s.step, row: s.row, label: s.label, year: s.year, k: s.k, mu: s.mu, se: s.se, lo: s.lo, hi: s.hi, tau2: s.tau2, Q: s.Q, pi_lo: s.piLo, pi_hi: s.piHi })) })) };
}
// CSV: shortest round-trip number text (String), empty for null; text cells quoted when needed and guarded
// against spreadsheet formula injection with a leading apostrophe (removed again by parseCsv).
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v); if (/^[=+@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]|^\s|\s$|^'/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(res) {
  const lines = [CSV_COLS.join(',')];
  if (res && !res.refused) for (const g of res.groups) for (const s of g.series)
    lines.push([g.name, g.k, g.byYear, s.step, s.row, s.label, s.year, s.k, s.mu, s.se, s.lo, s.hi, s.tau2, s.Q, s.piLo, s.piHi].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false, quotedField = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') { q = true; quotedField = true; }
    else if (ch === ',') { row.push([f, quotedField]); f = ''; quotedField = false; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push([f, quotedField]); rows.push(row); row = []; f = ''; quotedField = false; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push([f, quotedField]); rows.push(row); }
  const head = rows.shift().map(c => c[0]);
  const unguard = s => /^'[=+@\t\r]/.test(s) ? s.slice(1) : s;
  const numCols = new Set(['group_k', 'step', 'row', 'year', 'k', 'mu', 'se', 'lo', 'hi', 'tau2', 'Q', 'pi_lo', 'pi_hi']);
  return rows.map(r => Object.fromEntries(head.map((h, j) => {
    const [v, quoted] = r[j];
    if (numCols.has(h)) return [h, v === '' ? null : Number(v)];
    if (h === 'by_year') return [h, v === 'true'];
    return [h, quoted ? unguard(v) : unguard(v)];
  })));
}

// ---------------------------------------------------------------- replay (separate, labelled tier)
// Pinned evidence: subcum/validate/corpus/{corpus,reference}.json, SHA-256 below and in subcum/validate/MANIFEST.json.
const EVIDENCE = { adjudicated: { path: 'subcum/validate/corpus/adjudicated.json', sha256: '35e8b3542ceec501b4a1138fbabdac7ff29523b2195c565482622e4f2efe517d' }, corpus: { path: 'subcum/validate/corpus/corpus.json', sha256: 'e22564def18c582ef227b9ed3222334f9e0a60b2a502808392778509dd13d6c2' }, reference: { path: 'subcum/validate/corpus/reference.json', sha256: '8eec0c68094c99bf9996f0c9b5c448c8f4b8a2a85b5408eb72166fef1dab56fb' } };
const TOL = { tau2: 1e-6, rel: 1e-9 };
function relOk(a, r, tol) { return finite(a) && finite(r) && Math.abs(a - r) / Math.max(1, Math.abs(r)) <= tol; }
function quote(x) { return /[",\t\r\n]|^\s|\s$/.test(String(x)) ? '"' + String(x).replaceAll('"', '""') + '"' : String(x); }
function csvOf(c) { return c.te.map((y, j) => [c.label[j], String(y), String(c.se[j]), c.year[j] == null ? '' : String(c.year[j]), c.group[j] == null ? '' : quote(c.group[j])].join(',')).join('\n'); }
function expectedStudies(c) { return c.te.map((y, j) => ({ label: c.label[j], est: y, se: c.se[j], year: c.year[j], group: c.group[j], v: c.se[j] * c.se[j] })); }
// UTF-16 code-unit order (the page sort rule), written out rather than delegated to Array.prototype.sort's default.
function utf16Less(a, b) { const m = Math.min(a.length, b.length); for (let i = 0; i < m; i++) { const d = a.charCodeAt(i) - b.charCodeAt(i); if (d) return d < 0; } return a.length < b.length; }
// Number of checks implied by the reference structure alone (never by a run).
function expectedChecks(reference) {
  let n = 0;
  for (const r of reference) {
    if (r.status === 'refused') { n += 4; continue; }
    n += 5; for (const g of r.groups) n += 2 + 13 * g.steps.length;
  }
  return n;
}
// Declared conditional rule (same rule as validate/README.md, RESULTS_Q.md): a pool listed in the pinned adjudication
// file may be compared with R's closed forms evaluated at the page's own tau2 ONLY when (i) the page's tau2 agrees with
// R's PM tau2 at 1e-6, (ii) it is bit-identical to the tau2 R evaluated the closed forms at, and (iii) membership matches.
// Every other pool is compared with the strict R reference. tau2 itself is always compared with R's PM tau2.
function adjKey(key, group, step) { return key + ' ' + group + ' ' + step; }
function replayCore(corpus, reference, deps) {
  const parse = deps.parse, cum = deps.cumulative, maxFail = deps.maxFailures || 200;
  const adj = new Map((deps.adjudicated || []).map(a => [adjKey(a.key, a.group, a.step), a]));
  let conditionalPools = 0;
  if (!Array.isArray(corpus) || !Array.isArray(reference) || corpus.length !== reference.length) throw Error('Evidence refused: corpus/reference length mismatch');
  reference.forEach((r, i) => {
    if (r.key !== corpus[i].key) throw Error('Evidence refused: key mismatch at ' + i);
    if (r.status !== 'ok' && r.status !== 'refused') throw Error('Evidence refused: R status ' + r.status + ' for ' + r.key);
    if (r.status === 'ok' && (!Array.isArray(r.groups) || r.groups.some(g => !Array.isArray(g.steps) || g.steps.length !== g.k))) throw Error('Evidence refused: malformed reference ' + r.key);
  });
  let checks = 0, passed = 0; const failures = [], refusals = [];
  let current = '', where = null;
  const check = (q, app, ref, kind) => {
    checks++;
    let ok;
    if (kind === 'exact') ok = app === ref;
    else if (kind === 'exact_or_null') ok = (app == null && ref == null) || app === ref;
    else if (kind === 'tau2') ok = relOk(app, ref, TOL.tau2);
    else if (kind === 'rel_or_null') ok = (app == null && ref == null) || relOk(app, ref, TOL.rel);
    else ok = relOk(app, ref, TOL.rel);
    if (ok) passed++; else if (failures.length < maxFail) failures.push({ key: current, group: where && where.group, step: where && where.step, quantity: q, app, ref });
  };
  for (let i = 0; i < corpus.length; i++) {
    const c = corpus[i], r = reference[i]; current = c.key;
    const parsed = parse(csvOf(c));
    check('input', JSON.stringify({ studies: parsed.studies, warnings: parsed.warnings }), JSON.stringify({ studies: expectedStudies(c), warnings: [] }), 'exact');
    const res = compute(parsed.studies, cum);
    if (r.status === 'refused') {
      refusals.push(c.key);
      check('refused', !!res.refused, true, 'exact');
      check('refusal_reason', res.refused, NOGROUP, 'exact');
      check('refusal_export', JSON.stringify(toJson(res).groups), '[]', 'exact');
      continue;
    }
    const appNames = res.groups.map(g => g.name), refNames = r.groups.map(g => g.name);
    check('group_names', JSON.stringify(appNames.slice().sort()), JSON.stringify(refNames.slice().sort()), 'exact');
    check('group_order', appNames.every((nm, j) => j === 0 || utf16Less(appNames[j - 1], nm)), true, 'exact');
    const svg = renderSvg(res, { mode: 'multiples' });
    check('svg_finite', /NaN|Infinity|undefined/.test(svg) ? 'non-finite' : 'ok', 'ok', 'exact');
    check('export_groups', toJson(res).groups.length, r.groups.length, 'exact');
    for (const rg of r.groups) {
      const g = res.groups.find(x => x.name === rg.name);
      check('group_k', g && g.k, rg.k, 'exact');
      check('group_by_year', g && g.byYear, rg.by_year, 'exact');
      rg.steps.forEach((rs, j) => {
        const s = g && g.series[j], mem = g ? g.order.slice(0, j + 1).join(',') : undefined;
        where = { group: rg.name, step: rs.step };
        const a = adj.get(adjKey(c.key, rg.name, rs.step));
        const useCond = !!(a && s && mem === rs.members.join(',') && a.members.join(',') === mem && relOk(s.tau2, rs.tau2, TOL.tau2) && s.tau2 === a.tau2_app);
        const ref = useCond ? a.conditional : rs; if (useCond) conditionalPools++;
        check('step', s && s.step, rs.step, 'exact');
        check('label', s && s.label, rs.label, 'exact');
        check('year', s ? s.year : undefined, rs.year, 'exact_or_null');
        check('k', s && s.k, rs.k, 'exact');
        check('members', mem, rs.members.join(','), 'exact');
        check('tau2', s && s.tau2, rs.tau2, 'tau2');
        for (const q of ['mu', 'se', 'lo', 'hi', 'Q']) check(q, s ? s[q] : undefined, ref[q], 'rel');
        check('piLo', s ? s.piLo : undefined, ref.piLo, 'rel_or_null');
        check('piHi', s ? s.piHi : undefined, ref.piHi, 'rel_or_null');
      });
      where = null;
    }
  }
  return { checks, passed, conditionalPools, adjudicated: adj.size, failed: checks - passed, expected: expectedChecks(reference), failures, refusals, configurations: corpus.length,
    groups: reference.reduce((a, r) => a + (r.groups ? r.groups.length : 0), 0), steps: reference.reduce((a, r) => a + (r.groups ? r.groups.reduce((b, g) => b + g.steps.length, 0) : 0), 0) };
}
async function sha256Hex(buf) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function loadPinned(base) {
  const out = {};
  for (const name of ['corpus', 'reference', 'adjudicated']) {
    const e = EVIDENCE[name], resp = await fetch(new URL(e.path, base), { cache: 'no-store' });
    if (!resp.ok) throw Error('Evidence refused: cannot load ' + e.path + ' (HTTP ' + resp.status + ')');
    const buf = await resp.arrayBuffer(), h = await sha256Hex(buf);
    if (h !== e.sha256) throw Error('Evidence refused: SHA-256 mismatch for ' + e.path);
    out[name] = JSON.parse(new TextDecoder().decode(buf));
  }
  return out;
}
async function replay(opts) {
  opts = opts || {};
  const deps = { parse: global.__almParseStudies, cumulative: global.__almCumulative };
  if (typeof deps.parse !== 'function' || typeof deps.cumulative !== 'function') throw Error('Page engine hooks missing');
  const ev = await loadPinned(opts.base || document.baseURI);
  deps.adjudicated = ev.adjudicated;
  const r = replayCore(ev.corpus, ev.reference, deps);
  if (r.checks !== r.expected) throw Error('Replay ran ' + r.checks + ' checks; the reference implies ' + r.expected);
  return r;
}

// ---------------------------------------------------------------- page UI
function mount() {
  const host = document.getElementById('alm-subcum-mount');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = '1';
  host.innerHTML =
    '<p class="subcum-lead">A cumulative path for each subgroup, computed with the same ordering rule, Paule-Mandel pool, 95% CI and t<sub>k−1</sub> prediction interval as the cumulative view. ' +
    'metafor::cumul and meta::metacum have no subgroup argument; this view is checked against an R loop over subgroups (Replay below).</p>' +
    '<div class="subcum-controls"><label class="subcum-inline"><span>Layout</span> <select id="subcum-mode" aria-label="Within-subgroup layout" style="width:auto">' +
    '<option value="multiples">Small multiples</option><option value="overlay">Overlaid paths</option></select></label></div>' +
    '<div id="subcum-svg" class="subcum-svg" style="margin-top:0.5rem;overflow-x:auto"></div>' +
    '<div class="actions"><button type="button" id="subcum-json">Download JSON</button><button type="button" id="subcum-csv">Download CSV</button>' +
    '<button type="button" id="subcum-svgdl">Download SVG</button><button type="button" id="subcum-replay" title="Replay the pinned R composite reference (per-subgroup rma PM + cumul) through this page">Replay R reference (within-subgroup)</button></div>' +
    '<p id="subcum-status" class="subcum-status" aria-live="polite"></p>';
  const modeEl = document.getElementById('subcum-mode');
  let timer = null;
  const refresh = () => {
    timer = null;
    const data = document.getElementById('f-data');
    if (!data || data.disabled) return;            // the main Validate replay is driving the page
    const parsed = global.__almParseStudies(data.value);
    const res = compute(parsed.studies, global.__almCumulative);
    global.__almSubCumLast = res;
    const box = document.getElementById('subcum-svg'); box.innerHTML = renderSvg(res, { mode: modeEl.value });
    const svg = box.querySelector('svg'); if (svg) { svg.style.width = '100%'; svg.style.maxWidth = Math.round(1.35 * Number(svg.getAttribute('width'))) + 'px'; svg.style.height = 'auto'; svg.style.display = 'block'; }
  };
  const schedule = () => { if (!timer) timer = setTimeout(refresh, 60); };
  const svgHost = document.getElementById('svg-host');
  if (svgHost) new MutationObserver(schedule).observe(svgHost, { childList: true });
  modeEl.addEventListener('change', schedule);
  const save = (text, type, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  document.getElementById('subcum-json').addEventListener('click', () => save(JSON.stringify(toJson(global.__almSubCumLast), null, 2), 'application/json', 'within-subgroup-cumulative.json'));
  document.getElementById('subcum-csv').addEventListener('click', () => save(toCsv(global.__almSubCumLast), 'text/csv', 'within-subgroup-cumulative.csv'));
  document.getElementById('subcum-svgdl').addEventListener('click', () => save(renderSvg(global.__almSubCumLast, { mode: modeEl.value }), 'image/svg+xml', 'within-subgroup-cumulative.svg'));
  const status = document.getElementById('subcum-status');
  document.getElementById('subcum-replay').addEventListener('click', async () => {
    status.textContent = 'Replaying the pinned R reference…';
    try {
      const r = await replay();
      status.textContent = 'Within-subgroup tier: ' + r.passed + '/' + r.checks + ' passed; ' + r.failed + ' failed (' + r.configurations + ' configurations, ' + r.groups + ' subgroups, ' + r.steps + ' steps, ' + r.refusals.length + ' refusals; ' + r.conditionalPools + ' pools under the declared conditional rule; metafor 5.2.1 R loop).';
      global.__almSubCumReplay = r;
    } catch (e) { status.textContent = 'Refused: ' + e.message; global.__almSubCumReplay = { error: e.message }; }
  });
  refresh();
}

global.AlmSubgroupCumulative = { SCHEMA, NOGROUP, ORDER_RULE, MAX_PANELS, MAX_OVERLAY, EVIDENCE, TOL, compute, renderSvg, toJson, toCsv, parseCsv,
  csvOf, expectedStudies, expectedChecks, replayCore, replay, loadPinned, utf16Less };
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
}
})(typeof window !== 'undefined' ? window : globalThis);
