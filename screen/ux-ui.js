/* First-run guidance: live progress strip and one-button start for the existing local hybrid ranker.
   It only clicks the existing hybrid controls; ranking model, features and retraining cadence are unchanged.
   The counts are descriptive and carry no stopping or recall claim. */
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
    var g = UX.gate(rows.map(B.label)), ranked = rows.some(function (r) { return r.hybridScore != null; });
    var btn = $('ux-start-ai'), gateEl = $('ux-gate');
    btn.disabled = !g.met;
    btn.hidden = g.met && ranked;
    btn.textContent = s.hybrid && s.hybrid.run ? 'Update AI ranking' : 'Start AI ranking';
    $('ux-auto-wrap').hidden = !g.met;
    $('ux-auto').checked = !!(s.hybrid && s.hybrid.auto);
    if (!g.met) gateEl.textContent = g.text;
    else if (ranked) gateEl.textContent = 'AI ranking is current' + (s.sort === 'hybrid' ? '; records are ordered by the local ranker.' : '. Choose “Hybrid local ranking” in Sort to use it.');
    else if (!busy) gateEl.textContent = g.text;
  }

  $('ux-start-ai').addEventListener('click', function () {
    var s = B.state();
    // Show the undecided records first, then train the existing hybrid ranker (which sorts by its score).
    s.filter = 'undecided'; s.cursor = 0;
    var f = $('f-filter'); if (f) f.value = 'undecided';
    B.save();
    busy = true;
    $('ux-gate').textContent = 'Training locally in this browser…';
    $('hy-train').click();
    B.render();
  });
  // Mirror the existing hybrid status line (training progress, errors, stale results).
  var hy = $('hy-status');
  if (hy && window.MutationObserver) new MutationObserver(function () {
    if (!busy) return;
    $('ux-gate').textContent = hy.textContent;
    if (/Training locally/.test(hy.textContent)) return;
    busy = false;
    // Success: show the settled state. Failure messages stay visible until the next change.
    if (dataset().some(function (r) { return r.hybridScore != null; })) update();
  }).observe(hy, {childList: true, characterData: true, subtree: true});
  $('ux-auto').addEventListener('change', function () {
    var box = $('hy-auto'); if (!box) return;
    box.checked = $('ux-auto').checked;
    box.dispatchEvent(new Event('change'));
  });
  window.addEventListener('screen-state', update);
  update();
})();
