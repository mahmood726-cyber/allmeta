/* First-run guidance for the pinned U4 ranking worker. */
(function () {
  'use strict';
  var B = window.ScreenBridge, UX = window.ScreenUX, W = window.ScreenWorkflow;
  var $ = function (id) { return document.getElementById(id); };
  if (!B || !UX || !W || !$('ux-strip')) return;
  var busy = false;

  function dataset() { return B.eligible().filter(function (r) { return !r.dup; }); }
  function slotName(s) { return s.mode === 'dual' ? (s.active === 'r2' ? 'r2' : 'r1') : 'r1'; }

  function progressText(s, rows) {
    var slot = slotName(s), p = UX.progress(rows.map(function (r) { return W.stageData(r, s.stage)[slot] || {}; }));
    var undecided = rows.filter(function (r) { var d = (W.stageData(r, s.stage)[slot] || {}).d; return !d; }).length;
    var who = s.mode === 'dual' ? ' (' + slot.toUpperCase() + ')' : '';
    var since = p.anyRelevant ? String(p.sinceLastRelevant) : '— (none relevant yet)';
    return 'Screened' + who + ' ' + p.screened + ' · Relevant found ' + p.relevant +
      ' · Irrelevant since last relevant ' + since + ' · Undecided ' + undecided +
      (p.untimed ? ' · ' + p.untimed + ' imported decision(s) without timestamps counted first' : '');
  }

  function update() {
    var s = B.state(), strip = $('ux-strip');
    if (!s || !s.records || !s.records.length) { strip.hidden = true; return; }
    strip.hidden = false;
    var rows = dataset();
    $('ux-progress').textContent = progressText(s, rows);
    var g = UX.gate(rows.map(B.label)), ranked = rows.some(function (r) { return r.rankScore != null; });
    var btn = $('ux-start-ai'), gateEl = $('ux-gate');
    btn.disabled = !g.met;
    btn.hidden = g.met && ranked;
    btn.textContent = s.rank && s.rank.run ? 'Update AI ranking' : 'Start AI ranking';
    $('ux-auto-wrap').hidden = !g.met;
    if (!g.met) gateEl.textContent = g.text;
    else if (ranked) gateEl.textContent = 'AI ranking is current' + (s.sort === 'rankcore' ? '; records are ordered by the local ranker.' : '. Choose “U4 AI ranking” in Sort to use it.');
    else if (!busy) gateEl.textContent = g.text;
  }

  $('ux-start-ai').addEventListener('click', function () {
    var s = B.state();
    // Show undecided records first, then fit the pinned U4 model.
    s.filter = 'undecided'; s.cursor = 0;
    var f = $('f-filter'); if (f) f.value = 'undecided';
    B.save();
    busy = true;
    $('ux-gate').textContent = 'Training locally in this browser…';
    window.ScreenRankUI.start();
    B.render();
  });
  // Mirror U4 training progress and errors.
  var hy = $('rank-status');
  if (hy && window.MutationObserver) new MutationObserver(function () {
    if (!busy) return;
    $('ux-gate').textContent = hy.textContent;
    if (/Training locally/.test(hy.textContent)) return;
    busy = false;
    // Success: show the settled state. Failure messages stay visible until the next change.
    if (dataset().some(function (r) { return r.rankScore != null; })) update();
  }).observe(hy, {childList: true, characterData: true, subtree: true});
  window.addEventListener('screen-state', update);
  update();
})();
