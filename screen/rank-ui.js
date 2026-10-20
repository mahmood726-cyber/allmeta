/* U4 owns ranking only. The workflow remains the sole owner of decisions. */
(function () {
  'use strict';
  const B = ScreenBridge, $ = id => document.getElementById(id);
  let owner, signature = '', worker, request = 0, timer, vectorVersion = 0;
  const rows = () => B.eligible().filter(r => !r.dup);
  const snapshot = () => {
    const s = B.state();
    return JSON.stringify([s.mode, s.active, s.blind, s.stage, ScreenRankConfig, vectorVersion,
      rows().map(r => [r.id, r.title, r.abstract, B.label(r), B.undecided(r)])]);
  };
  function cancel() {
    clearTimeout(timer);
    if (worker) worker.terminate();
    worker = null; request++;
  }
  function train() {
    cancel();
    const s = B.state(), records = rows(), sig = snapshot();
    if (!ScreenUX.gate(records.map(B.label)).met) return;
    const labels = Object.create(null);
    records.forEach(r => { const l = B.label(r); if (l !== null) labels[r.id] = l; });
    const id = ++request;
    const w = new Worker('rank-worker.js'); worker = w;
    $('rank-status').textContent = 'Training locally in the U4 worker...';
    const finish = () => { w.terminate(); if (worker === w) worker = null; };
    w.onmessage = ({data}) => {
      if (worker !== w || id !== request || data.id !== id || s !== B.state() || sig !== snapshot()) {
        finish(); return;
      }
      if (data.error) { $('rank-status').textContent = data.error; finish(); return; }
      s.records.forEach(r => { r.rankScore = null; r.rankIndex = null; });
      const byId = new Map(records.map(r => [r.id, r]));
      data.result.ranked.forEach(item => {
        const r = byId.get(item.id); r.rankScore = item.score; r.rankIndex = item.index;
      });
      s.rank.run = {...data.result, elapsed: data.elapsed, worker: 'rank-worker.js'};
      s.sort = 'rankcore'; s.cursor = 0; $('f-sort').value = 'rankcore';
      $('rank-status').textContent = 'Ranked ' + data.result.ranked.length + ' undecided records with U4. Scores are priorities, not probabilities.';
      finish(); B.save(); B.render();
    };
    w.onerror = e => {
      if (worker === w) $('rank-status').textContent = 'U4 worker failed: ' + e.message;
      finish();
    };
    const embedding = window.ScreenHybridUI.rankEmbedding(ScreenRankConfig.embModel);
    w.postMessage({id, records: records.map(r => ({id:r.id,title:r.title,abstract:r.abstract,undecided:B.undecided(r)})), labels, embedding});
  }
  function refresh() {
    const s = B.state();
    if (!s.rank) s.rank = {enabled:false, run:null};
    const sig = snapshot();
    if (owner !== s || signature !== sig) {
      owner = s; signature = sig; cancel();
      s.records.forEach(r => { r.rankScore = null; r.rankIndex = null; });
      s.rank.run = null;
      $('rank-status').textContent = 'U4 ranking needs training for the current records and reviewer.';
      if (s.rank.enabled && ScreenUX.gate(rows().map(B.label)).met) timer = setTimeout(train, 0);
    }
  }
  window.ScreenRankUI = {stop() { B.state().rank.enabled = false; cancel(); }, start() {
    const s = B.state();
    s.rank.enabled = true;
    window.ScreenHybridUI.pauseRanking();
    if (s.hybrid) s.hybrid.auto = false;
    $('hy-auto').checked = false;
    s.autoRank = false; $('f-auto-rank').checked = false;
    B.save(); train();
  }};
  window.addEventListener('screen-state', refresh);
  window.addEventListener('screen-embeddings', () => { vectorVersion++; refresh(); });
  const advanced = $('rank-advanced-controls');
  ['hy-train', 'hy-auto', 'f-auto-rank'].forEach(id => {
    const el = $(id);
    advanced.appendChild(el.type === 'checkbox' ? el.closest('label') : el);
  });
  const status = document.createElement('p');
  status.id = 'rank-status'; status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  $('ux-strip').appendChild(status);
  refresh();
})();
