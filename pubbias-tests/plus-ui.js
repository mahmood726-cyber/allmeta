/* pubbias-tests #alm-plus user interface: PET-PEESE table, one-click leave-one-out sensitivity table,
 * full-data identity check against the main results table, CSV export. Computation: plus-engine.js. */
(function () {
  'use strict';
  const P = window.AlmPubbiasPlus, el = id => document.getElementById(id);
  const EXAMPLE = '4, 123, 11, 139\n6, 306, 29, 303\n3, 231, 11, 220\n62, 13598, 248, 12867\n33, 5069, 47, 5808\n180, 1541, 372, 1451\n8, 2545, 10, 629\n505, 88391, 499, 88391\n29, 7499, 45, 7277\n17, 1716, 65, 1665\n186, 50634, 141, 27338\n5, 2498, 3, 2341\n27, 16913, 29, 17854';
  const EXPLAIN = {
    'k-below-3': 'needs at least 3 studies',
    'loo-requires-k-4': 'leave-one-out needs at least 4 studies, so that every reduced data set keeps 3',
    'loo-k-above-100': 'leave-one-out is limited to 100 studies, the range validated against R',
    'reml-nonconvergence': 'REML did not converge',
    'trimfill-nonconvergence': 'trim-and-fill did not converge',
    'insufficient-informative-rows': 'fewer than 3 informative 2x2 rows',
    'singular-design': 'all standard errors are equal, so the regression is undefined',
    'alpha-tie': 'PET intercept p-value is within 1e-9 of 0.05, so the branch is not decided',
    'begg-undefined': 'rank correlation undefined',
    'undefined-regression': 'regression result undefined',
    'binary-row-mismatch': 'binary rows do not match the effect rows'
  };
  const explain = r => 'Refused: ' + (EXPLAIN[r] || r);
  const fmtNum = v => Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : v.toFixed(4);
  const fmtP = v => v < 1e-4 ? v.toExponential(2) : v.toFixed(4);
  const display = (key, v) => typeof v === 'string' ? v : Number.isInteger(v) && /k0|df/.test(key) ? String(v) : /(^|\.)(p|slopeP)$/.test(key) ? fmtP(v) : fmtNum(v);
  let state = null;

  function node(tag, parent, text, attrs) {
    const n = document.createElement(tag); if (text !== undefined) n.textContent = text;
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.append(n); return n;
  }
  // Every displayed number carries its key and full-precision value for the validation audit.
  function value(parent, key, v) {
    const s = node('span', parent, display(key, v)); s.dataset.plusKey = key; s.dataset.plusValue = String(v); return s;
  }
  function refusedCell(row, key, reason, span) {
    const td = node('td', row, explain(reason)); td.dataset.plusRefusal = key; td.dataset.plusReason = reason; if (span) td.colSpan = span; return td;
  }

  function currentRows() {
    const E = window.__almPubBiasEngine, binary = el('format').value === 'binary', text = el('src').value;
    const rows = (binary ? E.parseBinary : E.parseTESE)(text);
    const lines = text.trim() ? text.trim().split(/\n/).filter(l => l.trim()).length : 0;
    return { rows: rows.map(r => ({ te: r.te, se: r.se })), binary: binary ? rows : null, ignored: lines - rows.length };
  }

  function renderPP(full) {
    const body = el('plus-pp-body'); body.replaceChildren();
    for (const [key, label] of [['pet', 'PET (weighted lm, yi ~ SE)'], ['peese', 'PEESE (weighted lm, yi ~ variance)']]) {
      const r = full[key], tr = node('tr', body); node('th', tr, label, { scope: 'row' });
      if (r.status !== 'ok') { refusedCell(tr, 'full.' + key, r.reason, 7); continue; }
      for (const q of ['est', 'se']) value(node('td', tr), 'full.' + key + '.' + q, r.values[q]);
      const ci = node('td', tr); value(ci, 'full.' + key + '.ciLo', r.values.ciLo); ci.append(' to '); value(ci, 'full.' + key + '.ciHi', r.values.ciHi);
      for (const q of ['t', 'p', 'slopeT', 'slopeP']) value(node('td', tr), 'full.' + key + '.' + q, r.values[q]);
    }
    const c = full.conditional, tr = node('tr', body); node('th', tr, 'Conditional PET-PEESE', { scope: 'row' });
    if (c.status !== 'ok') refusedCell(tr, 'full.conditional', c.reason, 7);
    else {
      const td = node('td', tr); value(td, 'full.conditional.est', c.values.est);
      const b = node('span', td, ' (' + c.values.branch + ')'); b.dataset.plusBranch = 'full.conditional.branch'; b.dataset.plusValue = c.values.branch;
      node('td', tr, '');
      const ci = node('td', tr); value(ci, 'full.conditional.ciLo', c.values.ciLo); ci.append(' to '); value(ci, 'full.conditional.ciHi', c.values.ciHi);
      node('td', tr, 'Rule: PEESE when the PET intercept p < 0.05, otherwise PET', { colspan: '4' });
    }
  }

  const COLS = [
    ['egger', 'statistic', 'Egger t'], ['egger', 'p', 'Egger p'], ['egger', 'limit', 'PET estimate'],
    ['peese', 'est', 'PEESE estimate'], ['conditional', 'branch', 'Branch'],
    ['begg', 'tau', 'Begg tau'], ['begg', 'p', 'Begg p'],
    ['trimfill', 'k0', 'Trim-and-fill k0'], ['trimfill', 'side', 'Side'], ['trimfill', 'est', 'Trim-and-fill estimate'],
    ['peters', 'statistic', 'Peters t'], ['peters', 'p', 'Peters p'], ['harbord', 'statistic', 'Harbord t'], ['harbord', 'p', 'Harbord p']
  ];
  const FLAG_TEXT = { egger_flip: 'Egger p<0.05 changes', begg_flip: 'Begg p<0.05 changes', peters_flip: 'Peters p<0.05 changes', harbord_flip: 'Harbord p<0.05 changes', trimfill_k0_change: 'k0 changes', branch_change: 'PET-PEESE branch changes' };
  function cols(binary) { return COLS.filter(([m]) => binary || !['peters', 'harbord'].includes(m)); }
  function flagList(f) { return Object.entries(f || {}).filter(([, v]) => v === true).map(([k]) => FLAG_TEXT[k]); }

  function renderLOO(loo, binary) {
    const head = el('plus-loo-head'), body = el('plus-loo-body'), sum = el('plus-loo-summary');
    head.replaceChildren(); body.replaceChildren(); sum.replaceChildren();
    if (loo.status !== 'ok') { const p = node('p', sum, explain(loo.reason)); p.dataset.plusRefusal = 'loo'; p.dataset.plusReason = loo.reason; return; }
    const hr = node('tr', head); node('th', hr, 'Omitted', { scope: 'col' });
    for (const [, , label] of cols(binary)) node('th', hr, label, { scope: 'col' });
    node('th', hr, 'Flags', { scope: 'col' });
    const counts = {};
    for (const row of loo.values.rows) {
      const tag = row.omit === null ? 'none' : 'omit' + row.omit, tr = node('tr', body);
      tr.dataset.plusRow = tag;
      node('th', tr, row.omit === null ? 'None (all studies)' : 'Study ' + row.omit, { scope: 'row' });
      const done = new Set();
      for (const [m, q] of cols(binary)) {
        const r = row[m];
        if (r.status !== 'ok') { if (!done.has(m)) { refusedCell(tr, 'loo.' + tag + '.' + m, r.reason, cols(binary).filter(c => c[0] === m).length); done.add(m); } continue; }
        const td = node('td', tr);
        if (q === 'branch' || q === 'side') { const s = node('span', td, r.values[q]); s.dataset.plusKey = 'loo.' + tag + '.' + m + '.' + q; s.dataset.plusValue = r.values[q]; }
        else value(td, 'loo.' + tag + '.' + m + '.' + q, r.values[q]);
      }
      const list = flagList(row.flags), ft = node('td', tr, row.omit === null ? 'reference row' : list.length ? list.join('; ') : 'none');
      ft.dataset.plusFlags = tag; ft.dataset.plusValue = JSON.stringify(row.flags || null);
      if (list.length) { tr.classList.add('plus-flagged'); tr.dataset.flagged = 'true'; }
      for (const [k, v] of Object.entries(row.flags || {})) if (v === true) counts[k] = (counts[k] || 0) + 1;
    }
    const k = loo.values.rows.length - 1, flagged = loo.values.rows.filter(r => flagList(r.flags).length).length;
    const p = node('p', sum); p.dataset.plusSummary = 'loo';
    p.append(flagged + ' of ' + k + ' omissions change at least one conclusion' + (flagged ? ': ' : '.'));
    if (flagged) p.append(Object.entries(counts).map(([f, n]) => FLAG_TEXT[f] + ' (' + n + ')').join('; ') + '.');
    applyFilter();
  }
  function applyFilter() {
    const only = el('plus-only-flagged').checked;
    for (const tr of el('plus-loo-body').querySelectorAll('tr')) tr.hidden = only && tr.dataset.plusRow !== 'none' && tr.dataset.flagged !== 'true';
  }

  // Full-data identity with the main results table (same page engine; this makes the claim visible).
  function identity(result, binary) {
    const out = el('plus-identity'); out.replaceChildren();
    const last = window._almLastPubbias && window._almLastPubbias();
    if (result.loo.status !== 'ok') { out.textContent = 'Full-data identity check not shown: leave-one-out was refused.'; out.dataset.plusIdentity = 'not-applicable'; return null; }
    if (!last) {
      const why = /^Analysis unavailable/.test(document.getElementById('body').textContent) ? 'the main analysis was refused (' + document.getElementById('body').textContent.replace(/^Analysis unavailable: /, '') + ')' : 'the page needs at least 5 studies';
      out.textContent = 'Main results table not shown (' + why + '), so full-data identity is not applicable.'; out.dataset.plusIdentity = 'not-applicable'; return null;
    }
    const b = result.loo.values.rows[0], mism = [];
    const pairs = [['Egger t', b.egger, 'statistic', last.egger_t], ['Egger p', b.egger, 'p', last.egger_p], ['Begg tau', b.begg, 'tau', last.begg_tau], ['Begg p', b.begg, 'p', last.begg_p], ['trim-and-fill k0', b.trimfill, 'k0', last.tf_k0], ['trim-and-fill estimate', b.trimfill, 'est', last.tf_est]];
    for (const [label, r, q, v] of pairs) if (!(r.status === 'ok' && Object.is(r.values[q], v))) mism.push(label);
    // Peters and Harbord appear only in the table text (3 decimals): compare the rendered strings.
    if (binary) {
      const cells = [...document.querySelectorAll('#body tr')].map(tr => [...tr.cells].map(c => c.textContent));
      for (const [m, name] of [['peters', 'Peters (binary)'], ['harbord', 'Harbord (binary)']]) {
        const row = cells.find(c => c[0] === name), r = b[m];
        if (!row || r.status !== 'ok' || row[1] !== r.values.statistic.toFixed(3) || row[2] !== r.values.p.toFixed(3)) mism.push(name);
      }
    }
    out.dataset.plusIdentity = mism.length ? 'mismatch' : 'match';
    out.textContent = mism.length ? 'FAIL: the full-data row differs from the main results table for ' + mism.join(', ') + '.'
      : 'The full-data row equals the main results table exactly (same page engine): Egger, Begg, trim-and-fill' + (binary ? ', Peters and Harbord.' : '.');
    return mism;
  }

  function render(result, binary, note) {
    state = { result, binary };
    renderPP(result.full); renderLOO(result.loo, !!binary);
    el('plus-csv').disabled = result.loo.status !== 'ok';
    el('plus-k').textContent = 'k = ' + result.k + (binary ? ' (2x2 counts; Peters and Harbord included)' : ' (effect and SE)') + (note || '');
  }
  function run() {
    try {
      // Refresh the main table first so the identity check compares like with like.
      el('btn-run').click();
      const cur = currentRows();
      if (!cur.rows.length) throw Error('No valid studies in the input.');
      const t0 = performance.now(), result = P.compute(cur.rows, cur.binary);
      render(result, cur.binary, cur.ignored > 0 ? '; ' + cur.ignored + ' input line(s) ignored, as in the main table' : '');
      const mism = identity(result, !!cur.binary);
      el('plus-status').textContent = (result.loo.status === 'ok' ? 'Leave-one-out complete: ' + (result.loo.values.rows.length - 1) + ' omissions in ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s.' : 'PET-PEESE complete; ' + explain(result.loo.reason).toLowerCase() + '.') + (mism && mism.length ? ' Identity check FAILED.' : '');
      return result;
    } catch (e) {
      state = null;
      for (const id of ['plus-pp-body', 'plus-loo-head', 'plus-loo-body', 'plus-loo-summary', 'plus-identity']) el(id).replaceChildren();
      el('plus-csv').disabled = true; el('plus-status').textContent = 'Refused: ' + e.message;
      return null;
    }
  }
  function example() {
    el('format').value = 'binary'; el('src').value = EXAMPLE;
    return run();
  }
  function csv() {
    if (!state || state.result.loo.status !== 'ok') return null;
    const c = cols(!!state.binary), lines = [['omitted', ...c.map(([m, q]) => m + '_' + q), 'flags'].join(',')];
    for (const row of state.result.loo.values.rows) {
      lines.push([row.omit === null ? 'none' : row.omit, ...c.map(([m, q]) => row[m].status === 'ok' ? String(row[m].values[q]) : 'refused:' + row[m].reason), '"' + flagList(row.flags).join('; ') + '"'].join(','));
    }
    return lines.join('\n') + '\n';
  }
  function download() {
    const text = csv(); if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })), a = document.createElement('a');
    a.href = url; a.download = 'pubbias-leave-one-out.csv'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  el('plus-run').addEventListener('click', run);
  el('plus-example').addEventListener('click', example);
  el('plus-csv').addEventListener('click', download);
  el('plus-only-flagged').addEventListener('change', applyFilter);
  window.AlmPubbiasPlusUI = { run, example, render, csv, identity, display, explain, snapshot: () => state, EXAMPLE };
})();
