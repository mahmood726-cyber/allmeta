/* nma-inconsistency plus panel UI and input usability.
 * Reads the page engine through AlmIncoPlusCore (pure); never calls the engine
 * with side effects and never writes the validated result regions. The only
 * calls to run() are the user's own: real-data example buttons, a model change,
 * a debounced input edit and Ctrl/Cmd+Enter.
 */
(function () {
  'use strict';
  const P = window.AlmIncoPlusCore;
  const $ = id => document.getElementById(id);
  // The same row checker for a restored analysis file (alm-features.js share set()), so it cannot be skipped silently.
  window.__almIncoParseIssues = parseIssues;
  if (!P || !$('alm-plus')) return;
  const E = { inputIssue: window.inputIssue, estimateTau2: window.estimateTau2, fitNMA: window.fitNMA, nodeSplit: window.nodeSplit, dbt: window.dbt };
  const fmt = P.fmt, fmtP = P.fmtP;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const later = (fn, ms) => (typeof window.setTimeout === 'function' ? window.setTimeout(fn, ms) : null);

  // ---- U-A 4: explain ignored lines without changing parse() ---------------
  // Same tokenizer and row rules as parse(); returns why each non-blank record is dropped.
  function parseIssues(text) {
    const records = []; let row = [], field = '', quoted = false, line = 1, start = 1, quoteLine = 0;
    for (let i = 0; i <= text.length; i++) {
      const c = i === text.length ? '\n' : text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = !quoted; if (quoted) quoteLine = line; }
      } else if (!quoted && (c === ',' || c === '\n')) {
        row.push(field.trim()); field = '';
        if (c === '\n') { records.push({ parts: row, line: start }); row = []; start = line + 1; }
      } else if (c !== '\r' || quoted) field += c;
      if (c === '\n') line++;
    }
    if (quoted) return { unterminated: quoteLine, ignored: [], extra: [] };
    const ignored = [], extra = [];
    records.forEach((r, i) => {
      const p = r.parts;
      if (p.every(x => x === '')) return;
      // Same decimal-only rule as the page parser (Number() would read 0x10 as 16).
      const decimal = v => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v || '') ? Number(v) : NaN;
      const te = decimal(p[2]), se = decimal(p[3]);
      let why = null;
      if (!p[0] || !p[1]) why = 'a treatment label is missing';
      else if (p[0] === p[1]) why = `both treatments are “${p[0]}”`;
      else if (!p[2] || !Number.isFinite(te)) why = i === 0 && p[2] && !Number.isFinite(te) && (p[3] === undefined || !Number.isFinite(se)) ? 'looks like a header' : `effect “${p[2] || ''}” is not a number`;
      else if (p[3] === undefined || p[3] === '') why = 'SE is missing';
      else if (!Number.isFinite(se)) why = `SE “${p[3] === undefined ? '' : p[3]}” is not a number`;
      else if (se <= 0) why = 'SE must be > 0';
      if (why) ignored.push({ line: r.line, record: i + 1, why });
      else if (p.length > 5 && p.slice(5).some(x => x !== '')) extra.push(r.line);
    });
    return { unterminated: 0, ignored, extra };
  }
  function issueMessage(text) {
    const r = parseIssues(text);
    if (r.unterminated) return `A quotation mark opened on line ${r.unterminated} is never closed, so no rows can be read. Close the quote (or remove it) and run again.`;
    const parts = [];
    if (r.ignored.length) parts.push(`${r.ignored.length} line${r.ignored.length > 1 ? 's' : ''} ignored: ` + r.ignored.slice(0, 6).map(x => `line ${x.line} ${x.why}`).join('; ') + (r.ignored.length > 6 ? `; and ${r.ignored.length - 6} more` : '') + '.');
    if (r.extra.length) parts.push(`Columns after the fifth are ignored (line${r.extra.length > 1 ? 's' : ''} ${r.extra.slice(0, 6).join(', ')}).`);
    return parts.join(' ');
  }

  // ---- U-A 1-3: examples, model change, live input, keyboard ---------------
  const src = $('src'), model = $('f-model'), msg = $('inco-input-msg');
  let shownText = null; // text of the analysis currently displayed
  function showInputMessage() {
    if (!msg) return;
    const text = src.value, parts = [issueMessage(text)];
    if (shownText !== null && text !== shownText) {
      const why = window.inputIssue(window.parse(text));
      parts.push(why ? `Results below are for the previous input (${why.replace(/\.$/, '')}). Press Run tests to analyse the current text anyway.` : 'Results below are for the previous input.');
    }
    msg.textContent = parts.filter(Boolean).join(' ');
  }
  const ex = $('inco-example');
  if (ex && Array.isArray(window.AlmIncoExamples)) {
    const holder = ex.querySelector('[data-examples]') || ex;
    for (const e of window.AlmIncoExamples) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'plus-btn'; b.textContent = e.label; b.dataset.example = e.id;
      b.addEventListener('click', () => {
        window.__almIncoLoad(e.text);
        const note = $('inco-example-note');
        if (note) note.textContent = `Loaded ${e.label}. ${e.note} Source: ${e.citation}`;
      });
      holder.append(b);
    }
  }
  if (model) model.addEventListener('change', () => window.run());
  let typing = null;
  if (src) {
    src.addEventListener('input', () => {
      if (typing !== null && typeof window.clearTimeout === 'function') window.clearTimeout(typing);
      typing = later(() => {
        typing = null;
        // Run refusals too, so the base result and observed plus/export state clear.
        if (src.value !== shownText) window.run();
        else showInputMessage();
      }, 500);
    });
    src.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); window.run(); }
    });
  }

  // ---- Plus analyses ---------------------------------------------------------
  const state = { gen: 0, rows: [], model: 'FE', base: null, compare: null, loo: null, busy: false, sort: { key: 'dQ', dir: 1 }, selected: null };
  let idleWaiters = [], pending = null; // pending: a refresh scheduled by a change to the validated region
  function settle() { state.busy = false; const w = idleWaiters; idleWaiters = []; w.forEach(f => f()); }
  function refresh() {
    const gen = ++state.gen;
    shownText = src.value;
    showInputMessage();
    state.rows = window.parse(src.value); state.model = model.value; state.selected = null;
    state.base = P.fitAll(E, state.rows, state.model);
    state.compare = state.base.status === 'ok' ? P.compare3(E, state.rows) : null;
    state.loo = null;
    renderInterpret(); renderGraph(); renderCompare(); renderLoo(); renderMethods();
    if (state.base.status !== 'ok') { setStatus('Sensitivity analysis not available: ' + state.base.reason); settle(); return; }
    state.busy = true;
    const plan = P.looPlan(E, state.rows, state.model), drops = [];
    setStatus(`Leave-one-study-out: 0/${plan.n} studies removed…`);
    const step = () => {
      if (gen !== state.gen) return;
      const t0 = Date.now();
      while (drops.length < plan.n && Date.now() - t0 < 40) drops.push(P.looDrop(E, plan, drops.length));
      if (drops.length < plan.n) { setStatus(`Leave-one-study-out: ${drops.length}/${plan.n} studies removed…`); if (later(step, 0) === null) step(); return; }
      state.loo = P.looFinish(plan, drops);
      setStatus(`Leave-one-study-out complete: ${plan.n} refits${state.model === 'FE' ? '' : ' (τ² re-estimated for each)'}.`);
      renderInterpret(); renderLoo(); renderMethods(); settle();
    };
    if (later(step, 0) === null) step();
  }
  function setStatus(t) { const s = $('plus-loo-status'); if (s) s.textContent = t; }

  function renderInterpret() {
    const ul = $('plus-interpret-list'); if (!ul) return;
    ul.innerHTML = P.interpret({ base: state.base, loo: state.loo }).map(t => `<li>${esc(t)}</li>`).join('');
  }
  function renderGraph() {
    const svg = $('plus-graph'), status = $('plus-graph-status'); if (!svg) return;
    const b = state.base, title = '<title id="plus-graph-t">Network of treatments and direct comparisons</title>';
    if (!b || b.status !== 'ok') { svg.innerHTML = title + '<desc>Not available.</desc>'; if (status) status.textContent = ''; return; }
    const edges = P.graphEdges(b, state.rows), trts = b.trts, n = trts.length, W = 600, H = 360, cx = W / 2, cy = H / 2, R = 125;
    const pos = Object.fromEntries(trts.map((t, i) => [t, [cx + R * Math.sin(2 * Math.PI * i / n), cy - R * Math.cos(2 * Math.PI * i / n)]]));
    const kmax = Math.max(...edges.map(e => e.k));
    const parts = [title, `<desc>${esc(n)} treatments and ${esc(edges.length)} directly compared pairs. Line width is proportional to the number of studies; red dashed lines are node-splits with p &lt; 0.05, blue solid lines node-splits with p ≥ 0.05 and grey dotted lines comparisons that cannot be split.</desc>`];
    for (const e of edges) {
      const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b], cls = e.p === null ? 'nosplit' : P.sig(e.p) ? 'flagged' : 'split';
      const label = `${e.comparison}: ${e.k} stud${e.k === 1 ? 'y' : 'ies'}; ` + (e.p === null ? 'cannot be split (no indirect path)' : `node-split p = ${fmtP(e.p)}`);
      parts.push(`<g class="plus-edge ${cls}" tabindex="0" role="img" aria-label="${esc(label)}" data-label="${esc(label)}"><line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="ln" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${(1.5 + 6 * e.k / kmax).toFixed(2)}"/></g>`);
    }
    for (const t of trts) {
      const [x, y] = pos[t], anchor = Math.abs(x - cx) < 1 ? 'middle' : x > cx ? 'start' : 'end', dx = anchor === 'start' ? 10 : anchor === 'end' ? -10 : 0, dy = y < cy - 1 ? -10 : y > cy + 1 ? 18 : 4;
      parts.push(`<circle class="plus-node" cx="${x}" cy="${y}" r="6"/><text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}" font-size="11" fill="currentColor">${esc(t.length > 28 ? t.slice(0, 27) + '…' : t)}</text>`);
    }
    svg.innerHTML = parts.join('');
    if (status) status.textContent = 'Focus or point at a line to read its comparison.';
  }
  function renderCompare() {
    const body = $('plus-cmp-body'), sum = $('plus-cmp-summary'); if (!body) return;
    const C = state.compare;
    if (!C || C.status !== 'ok') { body.innerHTML = ''; sum.textContent = C ? P.compareSummary(C) : ''; return; }
    const g = C.global, yes = ok => ok ? 'Same' : '<strong>Differs</strong>';
    const rows = [`<tr><th scope="row">τ²</th><td>${fmt(g.FE.tau2, 4)}</td><td>${fmt(g.DL.tau2, 4)}</td><td>${fmt(g.PM.tau2, 4)}</td><td>—</td></tr>`,
      `<tr><th scope="row">Global design-by-treatment</th>${P.MODELS.map(m => `<td>p ${fmtP(g[m].p)} <span class="plus-sub">(Q ${fmt(g[m].Q, 2)}, df ${g[m].df})</span></td>`).join('')}<td>${yes(C.globalAgree)}</td></tr>`];
    for (const s of C.splits) rows.push(`<tr><th scope="row">${esc(s.comparison)}</th>${P.MODELS.map(m => `<td>${s.p[m] === null ? '—' : 'p ' + fmtP(s.p[m])}</td>`).join('')}<td>${yes(s.agree)}</td></tr>`);
    body.innerHTML = rows.join('');
    sum.textContent = P.compareSummary(C);
  }
  const COLS = [
    ['study', 'Study removed'], ['tau2', 'τ²'], ['Q', 'Global Q'], ['dQ', 'ΔQ'], ['p', 'Global p'], ['nSplits', 'Node-splits'], ['nInconsistent', 'Splits p < 0.05'], ['change', 'What changes'],
  ];
  function sortValue(d, key) {
    if (key === 'study') return d.study;
    if (d.status !== 'ok') return null;
    return { tau2: d.tau2, Q: d.dbt.Q, dQ: d.dQ, p: d.dbt.p, nSplits: d.nSplits, nInconsistent: d.nInconsistent, change: (d.globalFlip ? 2 : 0) + (d.splitFlips.length ? 1 : 0) }[key];
  }
  function changeText(d) {
    if (d.status !== 'ok') return 'Not analysable: ' + d.reason;
    const t = [];
    if (d.globalFlip) t.push('global conclusion changes');
    if (d.splitFlips.length) t.push('split conclusion changes: ' + d.splitFlips.join(', '));
    if (!d.globalTestable && state.loo.base.dbt.p !== null) t.push('no loop left');
    else if (d.splitLost.length) t.push('no longer estimable: ' + d.splitLost.join(', '));
    return t.length ? t.join('; ') : 'No change';
  }
  function renderLoo() {
    const L = state.loo, head = $('plus-loo-head'), body = $('plus-loo-body'), sum = $('plus-loo-summary');
    if (!body) return;
    sum.textContent = L ? P.looSummary(L) : '';
    head.innerHTML = COLS.map(([k, label]) => `<th scope="col" aria-sort="${state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="plus-sort" data-sort="${k}">${esc(label)}</button></th>`).join('');
    if (!L || L.status !== 'ok') { body.innerHTML = ''; drawChart(); renderDetail(); return; }
    const key = state.sort.key, dir = state.sort.dir;
    const drops = [...L.drops].sort((a, b) => {
      const x = sortValue(a, key), y = sortValue(b, key);
      if (x === null || y === null) return (x === null) - (y === null) || a.index - b.index;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.index - b.index;
    });
    body.innerHTML = drops.map(d => {
      const flag = d.status === 'ok' && (d.globalFlip || d.splitFlips.length) ? ' class="plus-flag"' : '';
      const cells = d.status === 'ok' ? [fmt(d.tau2, 4), fmt(d.dbt.Q, 2), P.fmtSigned(d.dQ, 2), fmtP(d.dbt.p), String(d.nSplits), String(d.nInconsistent)] : ['—', '—', '—', '—', '—', '—'];
      return `<tr${flag} data-index="${d.index}"><th scope="row"><button type="button" class="plus-row" data-index="${d.index}" aria-pressed="${state.selected === d.index}">${esc(d.study)}</button></th>${cells.map(c => `<td>${esc(c)}</td>`).join('')}<td>${esc(changeText(d))}</td></tr>`;
    }).join('');
    drawChart(); renderDetail();
  }
  function renderDetail() {
    const box = $('plus-detail'); if (!box) return;
    const L = state.loo, d = L && L.status === 'ok' && state.selected !== null ? L.drops[state.selected] : null;
    if (!d) { box.innerHTML = '<p class="plus-sub">Select a study in the table to see its node-splits.</p>'; return; }
    if (d.status !== 'ok') { box.innerHTML = `<p>Without ${esc(d.study)}: ${esc(d.reason)}</p>`; return; }
    const fullP = new Map(L.base.nodeSplit.map(s => [s.comparison, s.p]));
    const rows = d.nodeSplit.map(s => `<tr><th scope="row">${esc(s.comparison)}</th><td>${fmt(s.direct.mean)} (${fmt(s.direct.se)})</td><td>${fmt(s.indirect.mean)} (${fmt(s.indirect.se)})</td><td>${fmt(s.diff)} (${fmt(s.seDiff)})</td><td>${fmt(s.z, 2)}</td><td>${fmtP(s.p)}</td><td>${fmtP(fullP.get(s.comparison))}</td></tr>`).join('');
    box.innerHTML = `<table class="plus-table"><caption>Node-splits without ${esc(d.study)} (τ² = ${fmt(d.tau2, 4)}; global Q = ${fmt(d.dbt.Q, 2)}, df ${d.dbt.df}, p ${fmtP(d.dbt.p)})</caption><thead><tr><th scope="col">Comparison</th><th scope="col">Direct (SE)</th><th scope="col">Indirect (SE)</th><th scope="col">Difference (SE)</th><th scope="col">z</th><th scope="col">p</th><th scope="col">p, all studies</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No comparison can be split without this study.</td></tr>'}</tbody></table>`;
  }
  function drawChart() {
    const svg = $('plus-dq'); if (!svg) return;
    const L = state.loo;
    if (!L || L.status !== 'ok') { svg.innerHTML = '<title>Change in global Q when each study is removed</title><desc>Not available.</desc>'; svg.setAttribute('viewBox', '0 0 600 40'); return; }
    const ds = L.drops, W = 600, padL = 170, padR = 50, rowH = 16, top = 24, H = top + ds.length * rowH + 30;
    const vals = ds.filter(d => d.status === 'ok').map(d => d.dQ);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
    const X = v => padL + (v - lo) / span * (W - padL - padR);
    const flips = ds.filter(d => d.status === 'ok' && d.globalFlip).map(d => d.study);
    const parts = [`<title>Change in global design-by-treatment Q when each study is removed</title>`,
      `<desc>${esc(ds.length)} studies. ΔQ ranges from ${fmt(lo, 2)} to ${fmt(hi, 2)}. ${flips.length ? 'Removing ' + esc(flips.join(', ')) + ' changes the global conclusion.' : 'No single removal changes the global conclusion.'}</desc>`,
      `<line x1="${X(0)}" y1="${top - 6}" x2="${X(0)}" y2="${top + ds.length * rowH}" stroke="currentColor" opacity="0.5"/>`];
    ds.forEach((d, i) => {
      const y = top + i * rowH, label = d.study.length > 26 ? d.study.slice(0, 25) + '…' : d.study;
      parts.push(`<text x="${padL - 6}" y="${y + 11}" text-anchor="end" font-size="10" fill="currentColor">${esc(label)}</text>`);
      if (d.status !== 'ok') { parts.push(`<text x="${X(0) + 4}" y="${y + 11}" font-size="10" fill="currentColor">not analysable</text>`); return; }
      const x0 = Math.min(X(0), X(d.dQ)), w = Math.max(1, Math.abs(X(d.dQ) - X(0)));
      parts.push(`<rect class="plus-bar${d.globalFlip ? ' flip' : ''}${state.selected === d.index ? ' sel' : ''}" data-index="${d.index}" x="${x0}" y="${y + 3}" width="${w}" height="${rowH - 6}"/>`);
    });
    parts.push(`<text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="currentColor">ΔQ (global Q without the study minus Q with all studies)</text>`);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = parts.join('');
  }
  function renderMethods() {
    const box = $('plus-methods-text'); if (!box) return;
    box.textContent = P.methodsText({ base: state.base, loo: state.loo, compare: state.compare }) || 'Run an accepted analysis to generate the text.';
  }

  // Graph edges: focus or hover announces the comparison.
  const gsvg = $('plus-graph');
  if (gsvg) for (const ev of ['focusin', 'mouseover']) gsvg.addEventListener(ev, e => {
    const g = e.target.closest ? e.target.closest('.plus-edge') : null, s = $('plus-graph-status');
    if (g && s) s.textContent = g.dataset.label;
  });
  // Delegated interaction (survives re-render).
  $('alm-plus').addEventListener('click', ev => {
    const t = ev.target.closest ? ev.target.closest('button,rect') : null;
    if (!t) return;
    if (t.classList.contains('plus-sort')) {
      const k = t.dataset.sort;
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: 1 };
      renderLoo(); const again = document.querySelector(`#plus-loo-head button[data-sort="${k}"]`); if (again) again.focus();
    } else if (t.classList.contains('plus-row') || t.classList.contains('plus-bar')) {
      const i = Number(t.dataset.index);
      state.selected = state.selected === i ? null : i;
      renderLoo();
      const again = document.querySelector(`#plus-loo-body button[data-index="${i}"]`); if (again && t.tagName.toLowerCase() === 'button') again.focus();
    } else if (t.id === 'plus-copy') copyMethods();
    else if (t.id === 'plus-r' || t.id === 'plus-r-loo') downloadScript(t.id === 'plus-r-loo');
  });
  function note(t) { const s = $('plus-report-status'); if (s) s.textContent = t; }
  function copyMethods() {
    const text = $('plus-methods-text').textContent;
    const done = () => note('Methods + Results copied to the clipboard.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => note('Copy failed; select the text and copy it manually.'));
    else note('Clipboard unavailable; select the text and copy it manually.');
  }
  function rScript(loo) {
    if (loo && (!state.loo || state.loo.status !== 'ok')) throw Error('Leave-one-out analysis is not finished yet.');
    return P.buildRScript({ rows: state.rows, base: state.base, loo: state.loo }, { loo });
  }
  function downloadScript(loo) {
    let text;
    try { text = rScript(loo); } catch (e) { note(e.message); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'nma-inconsistency-' + state.model + (loo ? '-loo' : '') + '.R';
    document.body.append(a); a.click(); a.remove();
    later(() => URL.revokeObjectURL(a.href), 1000);
    note('R script downloaded. Run it with Rscript; it prints "allmeta check: N/N quantities match" and exits with status 1 on any mismatch.');
  }

  // Any re-render of the validated global region (run, refusal, replay restore) refreshes the panel.
  const schedule = () => { if (pending !== null) return; pending = later(() => { pending = null; refresh(); }, 30); if (pending === null) refresh(); };
  if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe($('dbt'), { childList: true, subtree: true, characterData: true });

  window.AlmIncoPlus = {
    state: () => state, refresh, parseIssues, issueMessage, rScript,
    methodsText: () => P.methodsText({ base: state.base, loo: state.loo, compare: state.compare }),
    // Idle = no refresh scheduled and no leave-one-out computation running.
    whenIdle: () => new Promise(resolve => { if (!state.busy && state.base && pending === null) resolve(); else idleWaiters.push(resolve); }),
  };
  refresh();
})();
