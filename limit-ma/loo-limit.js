/* Optional leave-one-out limit fits; same pure engine and REML refusal as plus.js.
 * Validated domain: 4 <= k <= 200. No deletion result is substituted on refusal. */
(function (g) {
  'use strict';
  const Z = 1.959963984540054, MAX_K = 200;
  const fields = ['study', 'dropped', 'limit_est', 'change', 'limit_se', 're_est', 'tau2', 'ci_low', 'ci_high', 'status', 'reason'];
  function check(rows) {
    if (rows.length < 4 || rows.length > MAX_K) throw Error('Leave-one-out requires 4–200 valid studies.');
  }
  function deletion(rows, i, full) {
    const kept = rows.filter((_, j) => j !== i);
    const row = {study: rows[i].label || 'Study ' + (i + 1), dropped: i + 1,
      limit_est: null, change: null, limit_se: null, re_est: null, tau2: null,
      ci_low: null, ci_high: null, status: 'refused', reason: ''};
    try {
      const fit = g.AlmLimitEngine.fit(kept);
      // metasens 1.5.3 performs this internal REML refit. Match plus.js:85.
      g.AlmLimitPlusMLStart(fit.te_limit, kept.map(r => r.se * r.se), 'REML');
      const lo = fit.limit_est - Z * fit.limit_se, hi = fit.limit_est + Z * fit.limit_se;
      const change = fit.limit_est - full;
      if (![lo, hi, change].every(Number.isFinite)) throw Error('Non-finite confidence interval or change.');
      Object.assign(row, {limit_est: fit.limit_est, change, limit_se: fit.limit_se,
        re_est: fit.re_est, tau2: fit.tau2, ci_low: lo, ci_high: hi, status: 'ok'});
    } catch (e) { row.reason = e.message; }
    return row;
  }
  function compute(rows) {
    check(rows);
    const full = g.AlmLimitEngine.fit(rows).limit_est;
    return {method: 'DL / beta0; REML convergence check', k: rows.length,
      full_limit_est: full, rows: rows.map((_, i) => deletion(rows, i, full))};
  }
  function csvCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    let s = String(value);
    // Guard untrusted labels/reasons, including whitespace-prefixed formulas.
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv(result) {
    return fields.join(',') + '\r\n' + result.rows.map(r => fields.map(f => csvCell(r[f])).join(',')).join('\r\n') + '\r\n';
  }
  let generation = 0, current = null;
  const el = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => n === null ? '—' : Number(n).toPrecision(10);
  function invalidate(preserveDisabled) {
    generation++; current = null;
    const last = g._almLastLimit();
    if (last) delete last.leave_one_out;
    if (!el('loo-body')) return;
    el('loo-body').innerHTML = ''; el('loo-plot').innerHTML = ''; el('loo-plot').setAttribute('hidden', '');
    el('loo-csv').disabled = true;
    if (!preserveDisabled) el('loo-run').disabled = false;
    el('loo-status').textContent = 'Not calculated for the current input.';
  }
  function render(result) {
    current = result;
    el('loo-body').innerHTML = result.rows.map(r => '<tr data-status="' + r.status + '"><th scope="row">' + esc(r.study) + '</th>' +
      ['limit_est','change','limit_se','re_est','tau2'].map(f => '<td>' + fmt(r[f]) + '</td>').join('') +
      '<td>' + (r.status === 'ok' ? 'ok' : 'refused: ' + esc(r.reason)) + '</td></tr>').join('');
    const refused = result.rows.filter(r => r.status === 'refused').length;
    el('loo-status').textContent = result.rows.length + '/' + result.k + ' deletions calculated; ' + refused + ' refused. Full limit estimate: ' + fmt(result.full_limit_est) + '.';
    el('loo-csv').disabled = false;
    plot(result);
  }
  function plot(result) {
    const good = result.rows.filter(r => r.status === 'ok'), svg = el('loo-plot');
    const values = [result.full_limit_est, ...good.flatMap(r => [r.ci_low, r.ci_high])];
    let low = Math.min(...values), high = Math.max(...values);
    // Scale first to keep finite inputs from overflowing coordinate arithmetic.
    const scale = Math.max(1, Math.abs(low), Math.abs(high));
    low /= scale; high /= scale;
    if (low === high) { low -= .5; high += .5; }
    const x = v => 180 + 480 * ((v / scale - low) / (high - low));
    const height = 65 + result.rows.length * 24;
    let markup = '<title>Leave-one-out limit estimates: dashed line is the full limit estimate</title>';
    markup += '<line x1="' + x(result.full_limit_est) + '" x2="' + x(result.full_limit_est) + '" y1="25" y2="' + (height - 35) + '" stroke="currentColor" stroke-dasharray="5 4"/>';
    result.rows.forEach((r, i) => {
      const y = 30 + 24 * i;
      markup += '<text x="4" y="' + (y + 4) + '" fill="currentColor" font-size="12"><title>' + esc(r.study) + '</title>' + esc(r.study.slice(0, 23)) + '</text>';
      if (r.status === 'ok') markup += '<g data-dropped="' + r.dropped + '"><line x1="' + x(r.ci_low) + '" x2="' + x(r.ci_high) + '" y1="' + y + '" y2="' + y + '" stroke="var(--accent)"/><circle cx="' + x(r.limit_est) + '" cy="' + y + '" r="3" fill="var(--accent)"/></g>';
      else markup += '<text x="180" y="' + (y + 4) + '" fill="currentColor" font-size="12">refused</text>';
    });
    for (let i = 0; i <= 4; i++) {
      const tick = (low + (high - low) * i / 4) * scale;
      markup += '<text x="' + (180 + 120 * i) + '" y="' + (height - 12) + '" text-anchor="middle" fill="currentColor" font-size="11">' + tick.toPrecision(4) + '</text>';
    }
    svg.setAttribute('viewBox', '0 0 710 ' + height); svg.innerHTML = markup; svg.removeAttribute('hidden');
  }
  function restore(last) {
    if (last && last.leave_one_out) render(last.leave_one_out);
    else invalidate();
  }
  g.AlmLimitLoo = {compute, csv, invalidate, restore, maxK: MAX_K};
  if (typeof document === 'undefined' || !el('loo-run')) return;
  el('src').addEventListener('input', () => invalidate());
  el('src').addEventListener('change', () => invalidate());
  el('loo-run').addEventListener('click', async function () {
    // Run the main analysis first so reference, input, and JSON export share a snapshot.
    el('btn-run').click();
    const token = generation, last = g._almLastLimit();
    try {
      const rows = g.AlmLimitEngine.parse(el('src').value); check(rows);
      if (!last) throw Error('Run a valid full analysis before leave-one-out.');
      el('loo-run').disabled = true;
      const result = {method: 'DL / beta0; REML convergence check', k: rows.length, full_limit_est: last.limit_est, rows: []};
      for (let i = 0; i < rows.length; i++) {
        if (token !== generation) return;
        result.rows.push(deletion(rows, i, result.full_limit_est));
        if (i % 5 === 4) {
          el('loo-status').textContent = (i + 1) + '/' + rows.length + ' deletions calculated…';
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      if (token !== generation) return;
      last.leave_one_out = result; render(result);
    } catch (e) { if (token === generation) el('loo-status').textContent = 'refused: ' + e.message; }
    finally { if (token === generation) el('loo-run').disabled = false; }
  });
  el('loo-csv').addEventListener('click', function () {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([csv(current)], {type: 'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'limit-ma-leave-one-out.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})(typeof window !== 'undefined' ? window : globalThis);
