/* hub/shared/sensitivity-panel.js - add-on panel showing the page's analysis re-pooled under the
 * other estimator x CI-method combinations, plus leave-one-out on demand (lane A6, wave A).
 *
 * Numbers come only from shared/sensitivity-v1.js (AlmSensitivity, lane A5, validated against
 * metafor 5.2-1) and only for combinations listed for the page's measure in
 * shared/sensitivity-v1.manifest.json. Both are loaded on first opening, relative to this
 * script; if either is missing the panel says so and shows nothing.
 *
 * Base-row identity guard: before anything is shown, the module's row for the page's own
 * configuration must equal the page's displayed result (AlmSensitivity.baseRowGuard). If it does
 * not, the panel refuses and shows no alternative numbers.
 * The panel never edits analysis controls; it re-checks suspension (validation running) after
 * every asynchronous step.
 */
(function (global) {
  'use strict';
  var selfScript = typeof document !== 'undefined' ? document.currentScript : null;
  var base = selfScript && selfScript.src ? selfScript.src : null;
  var ENGINE_URL = base ? new URL('../../shared/sensitivity-v1.js', base).href : null;
  var MANIFEST_URL = base ? new URL('../../shared/sensitivity-v1.manifest.json', base).href : null;
  var LABEL = { DL: 'DerSimonian-Laird', PM: 'Paule-Mandel', REML: 'REML', ML: 'ML', HE: 'Hedges', HS: 'Hunter-Schmidt', SJ: 'Sidik-Jonkman', EB: 'Empirical Bayes', FE: 'Common effect' };
  var TEST = { z: 'Wald (z)', knha: 'Knapp-Hartung (t)', adhoc: 'Knapp-Hartung, ad hoc (t)' };
  var loading = null, manifestCache = null;

  function loadEngine() {
    if (global.AlmSensitivity) return Promise.resolve(global.AlmSensitivity);
    if (!ENGINE_URL) return Promise.reject(new Error('the sensitivity module cannot be located'));
    if (!global.AlmMaCore) return Promise.reject(new Error('shared/ma-core.js is not loaded on this page'));
    if (!loading) loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = ENGINE_URL;
      if (selfScript && selfScript.nonce) s.nonce = selfScript.nonce;
      s.onload = function () { global.AlmSensitivity ? resolve(global.AlmSensitivity) : reject(new Error('the sensitivity module did not load')); };
      s.onerror = function () { s.remove(); reject(new Error('the sensitivity module is not installed')); };
      document.head.appendChild(s);
    }).catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function loadManifest(given) {
    if (given) return Promise.resolve(given);
    if (manifestCache) return Promise.resolve(manifestCache);
    if (!MANIFEST_URL) return Promise.reject(new Error('the manifest cannot be located'));
    return fetch(MANIFEST_URL, { redirect: 'error' }).then(function (r) {
      if (!r.ok) throw new Error('the sensitivity manifest is not installed');
      return r.json();
    }).then(function (m) { manifestCache = m; return m; });
  }

  function el(tag, text, parent, attrs) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function f(x, d) { return typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—'; }
  function table(parent, caption, head, rows) {
    var t = el('table', null, parent), c = el('caption', caption, t), tr = el('tr', null, el('thead', null, t));
    head.forEach(function (h) { el('th', h, tr, { scope: 'col' }); });
    var body = el('tbody', null, t);
    rows.forEach(function (r) { var row = el('tr', null, body); r.forEach(function (v) { el('td', v, row); }); });
    void c; return t;
  }

  // opts: {app, measure, base:{method,test}, data()->{yi,vi,labels?}, page()->{mu,se,tau2,...},
  //        suspended()->bool, scale?:{label, back(x)}, engine?, manifest?}
  function render(content, opts) {
    var status = el('p', 'Loading the sensitivity module…', content, { role: 'status', 'aria-live': 'polite' });
    var out = el('div', null, content);
    var suspended = typeof opts.suspended === 'function' ? opts.suspended : function () { return false; };
    function stop(message) { status.textContent = message; out.replaceChildren(); return null; }
    // Engine first, then manifest, so a missing module is reported as such (no race).
    var engineFirst = opts.engine ? Promise.resolve(opts.engine) : loadEngine();
    return engineFirst.then(function (engine) { return loadManifest(opts.manifest).then(function (m) { return [engine, m]; }); }).then(function (both) {
      var engine = both[0], manifest = both[1];
      if (suspended()) return stop('Paused while validation runs. Close and reopen this panel afterwards.');
      var d = opts.data(), page = opts.page();
      var baseRow = engine.fit(d.yi, d.vi, { method: opts.base.method, test: opts.base.test });
      var guard = engine.baseRowGuard(baseRow, page);
      if (!guard.pass) {
        var why = guard.diffs.map(function (x) { return x.key + (x.reason ? ' (' + x.reason + ')' : ': module ' + x.module + ', page ' + x.page); }).join('; ');
        return stop('Refused: the sensitivity module does not reproduce this page’s own result (' + why + '). No alternative results are shown.');
      }
      var combos = engine.listed(manifest, opts.measure);
      if (!combos.length) return stop('No estimator and CI combinations are validated for this measure (' + opts.measure + ').');
      var back = opts.scale && typeof opts.scale.back === 'function' ? opts.scale.back : null;
      var b = function (x) { return back && typeof x === 'number' ? back(x) : x; };
      var notes = [], rows = combos.map(function (c) {
        var r = engine.fit(d.yi, d.vi, c), mine = c.method === opts.base.method && c.test === opts.base.test;
        if (r.refused) return [LABEL[c.method], TEST[c.test], String(r.k), 'refused: ' + r.reason, '', '', '', ''];
        (r.warnings || []).forEach(function (w) { if (notes.indexOf(w) < 0) notes.push(w); });
        return [LABEL[c.method] + (mine ? ' (this page)' : ''), TEST[c.test], String(r.k), f(r.tau2, 4), f(b(r.mu), 3),
          f(b(r.ciLo), 3) + ' to ' + f(b(r.ciHi), 3), r.piLo === null ? '—' : f(b(r.piLo), 3) + ' to ' + f(b(r.piHi), 3), r.I2 === null ? '—' : f(r.I2, 1)];
      });
      out.replaceChildren();
      table(out, 'Pooled result under each validated estimator and CI method' + (back ? ' (' + opts.scale.label + ')' : ''),
        ['Estimator', 'CI method', 'k', 'τ²', 'Estimate', '95% CI', '95% PI', 'I² (%)'], rows);
      el('p', 'Numbers from shared/sensitivity-v1.js; only combinations that matched metafor ' + ((manifest.versions && manifest.versions.metafor) || '') +
        ' for ' + opts.measure + ' are listed. The row marked "this page" was checked against the page before display.' +
        (notes.length ? ' Notes: ' + notes.join('; ') + '.' : ''), out);
      var btn = el('button', 'Leave-one-out (this page’s estimator and CI method)', out, { type: 'button', id: 'alm-addon-' + opts.app + '-sens-loo' });
      var looOut = el('div', null, out);
      btn.addEventListener('click', function () {
        if (suspended()) { looOut.textContent = 'Paused while validation runs.'; return; }
        var l = engine.leaveOneOut(d.yi, d.vi, { method: opts.base.method, test: opts.base.test });
        looOut.replaceChildren();
        if (l.refused) { el('p', 'Refused: ' + l.reason, looOut); return; }
        table(looOut, 'Leave-one-out (' + LABEL[opts.base.method] + ', ' + TEST[opts.base.test] + ')', ['Omitted', 'k', 'Estimate', '95% CI', 'τ²', 'I² (%)'],
          l.rows.map(function (r) {
            var label = d.labels && d.labels[r.omitted] !== undefined ? String(d.labels[r.omitted]) : 'Study ' + (r.omitted + 1);
            return r.refused ? [label, String(r.k), 'refused: ' + r.reason, '', '', ''] :
              [label, String(r.k), f(b(r.mu), 3), f(b(r.ciLo), 3) + ' to ' + f(b(r.ciHi), 3), f(r.tau2, 4), r.I2 === null ? '—' : f(r.I2, 1)];
          }));
      });
      status.textContent = combos.length + ' validated combinations shown.';
      return { combos: combos.length, guard: guard };
    }).catch(function (e) { return stop('Sensitivity analysis is unavailable: ' + e.message + '.'); });
  }

  global.alm = global.alm || {};
  global.alm.sensitivityPanel = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
