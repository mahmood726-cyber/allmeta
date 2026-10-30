/* shared/alm-features.js — feature panel host for the paper 2-19 apps.
 *
 *   AlmFeatures.register(app, spec)     register (or MERGE into) an app's feature spec. A later call for the
 *                                       same app adds/overrides only the blocks it provides (paper, title,
 *                                       entry, text, verify, share); blocks it omits are kept. The panel
 *                                       (re)renders when a block arrives after the first mount.
 *   AlmFeatures.registerModule(key, m)  a tab implementation: key in entry|text|verify|share,
 *                                       m = {label?, render(panelEl, ctx)}; ctx = {app, spec, block, host}.
 *                                       Modules that load before this file push [key, m] onto
 *                                       window.AlmFeaturesPending; it is drained here.
 *   AlmFeatures.get(app)                the merged spec (or null).
 *   AlmFeatures.revision(app)           hash of JSON.stringify(liveAdapter.currentState()) for the app's
 *                                       verify adapter -- the SAME value Verify in R stores in
 *                                       AlmFeaturesState.verify.revision, so F2 can tell whether the CURRENT
 *                                       state was verified. null when there is no live adapter/state.
 *   AlmFeatures.stateHash(obj)          the hash used for revisions (deterministic, synchronous).
 *   AlmFeatures.open(app, key)          expand the panel and select a tab (used by modules to surface news).
 *
 * Mounts into <div id="alm-features"> (optional data-app="<app>"): a collapsible section with an
 * accessible tablist "Data entry · Report text · Verify in R · Share" (roving tabindex, arrow/Home/End
 * keys, aria-selected/aria-controls). A tab is shown only when both its module and the spec block exist.
 * window.AlmFeaturesState = {entryLog:[], provenance:[], verify:{revision, passed, rows, versions}}.
 *
 * Plain IIFE: window.AlmFeatures + module.exports (node-testable; no DOM work happens without document).
 */
(function (global) {
  'use strict';

  var BLOCKS = ['paper', 'title', 'entry', 'text', 'verify', 'share'];
  var TABS = [
    { key: 'entry', label: 'Data entry' },
    { key: 'text', label: 'Report text' },
    { key: 'verify', label: 'Verify in R' },
    { key: 'share', label: 'Share' },
  ];
  var specs = {}, order = [], modules = {}, hosts = {}, renderQueued = false;

  function ensureState() {
    var st = global.AlmFeaturesState && typeof global.AlmFeaturesState === 'object' ? global.AlmFeaturesState : {};
    if (!Array.isArray(st.entryLog)) st.entryLog = [];
    if (!Array.isArray(st.provenance)) st.provenance = [];
    if (!st.verify || typeof st.verify !== 'object') st.verify = { revision: null, passed: false, rows: [], versions: {} };
    global.AlmFeaturesState = st;
    return st;
  }

  // 64-bit (two 32-bit lanes) string hash; deterministic and synchronous so revision() can be called inline.
  function stateHash(obj) {
    var s = JSON.stringify(obj === undefined ? null : obj);
    var h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'rev-' + ('00000000' + (h2 >>> 0).toString(16)).slice(-8) + ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
  }

  function register(app, spec) {
    if (typeof app !== 'string' || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(app)) throw new Error('AlmFeatures.register: invalid app id');
    if (!spec || typeof spec !== 'object') throw new Error('AlmFeatures.register: spec must be an object');
    var cur = specs[app];
    if (!cur) { cur = specs[app] = { app: app }; order.push(app); Object.defineProperty(cur, '_versions', { value: {}, enumerable: false }); }
    BLOCKS.forEach(function (k) {
      if (spec[k] !== undefined) { cur[k] = spec[k]; cur._versions[k] = (cur._versions[k] || 0) + 1; }
    });
    queueRender();
    return cur;
  }

  function registerModule(key, mod) {
    if (!TABS.some(function (t) { return t.key === key; })) throw new Error('AlmFeatures.registerModule: unknown tab ' + key);
    if (!mod || typeof mod.render !== 'function') throw new Error('AlmFeatures.registerModule: render() required');
    modules[key] = mod;
    queueRender();
  }

  function get(app) { return specs[app] || null; }

  function liveAdapter(spec) {
    if (!spec || !spec.verify || typeof spec.verify.adapter !== 'function') return null;
    var a = spec.verify.adapter();
    if (!a) return null;
    return a.live && typeof a.live.currentState === 'function' ? a.live : (typeof a.currentState === 'function' ? a : null);
  }

  function revision(app) {
    var live = liveAdapter(specs[app]);
    if (!live) return null;
    try { return stateHash(live.currentState()); } catch (e) { return null; }
  }

  function queueRender() {
    if (typeof document === 'undefined' || renderQueued) return;
    renderQueued = true;
    var go = function () { renderQueued = false; renderAll(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
    else Promise.resolve().then(go);
  }

  function el(tag, attrs, text, parent) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function renderAll() {
    var mountEl = document.getElementById('alm-features');
    if (!mountEl || !order.length) return;
    var app = mountEl.getAttribute('data-app') || order[0];
    if (!specs[app]) return;
    renderHost(mountEl, app);
  }

  function buildHost(mountEl, app) {
    mountEl.replaceChildren();
    mountEl.classList.add('alm-features');
    var spec = specs[app];
    var headingId = 'alm-f-heading', bodyId = 'alm-f-body';
    mountEl.setAttribute('role', 'region');
    mountEl.setAttribute('aria-labelledby', headingId);
    var h = el('h2', { id: headingId, class: 'alm-f-heading' }, null, mountEl);
    var toggle = el('button', { type: 'button', class: 'alm-f-toggle', 'aria-expanded': 'false', 'aria-controls': bodyId }, null, h);
    var marker = el('span', { class: 'alm-f-marker', 'aria-hidden': 'true' }, '▸', toggle);
    var title = el('span', { class: 'alm-f-title' }, '', toggle);
    var body = el('div', { id: bodyId, class: 'alm-f-body' }, null, mountEl);
    body.hidden = true;
    var tablist = el('div', { role: 'tablist', 'aria-label': 'Analysis features' + (spec.title ? ': ' + spec.title : ''), class: 'alm-f-tablist' }, null, body);
    var panels = el('div', { class: 'alm-f-panels' }, null, body);
    var host = { app: app, mountEl: mountEl, toggle: toggle, marker: marker, title: title, body: body, tablist: tablist, panels: panels, tabs: {}, selected: null };
    toggle.addEventListener('click', function () { setExpanded(host, toggle.getAttribute('aria-expanded') !== 'true'); });
    tablist.addEventListener('keydown', function (e) {
      var keys = present(host);
      var i = keys.indexOf(host.selected), next = null;
      if (e.key === 'ArrowRight') next = keys[(i + 1) % keys.length];
      else if (e.key === 'ArrowLeft') next = keys[(i - 1 + keys.length) % keys.length];
      else if (e.key === 'Home') next = keys[0];
      else if (e.key === 'End') next = keys[keys.length - 1];
      if (next) { e.preventDefault(); select(host, next, true); }
    });
    hosts[app] = host;
    return host;
  }

  function present(host) {
    return TABS.map(function (t) { return t.key; }).filter(function (k) { return host.tabs[k]; });
  }

  function setExpanded(host, open) {
    host.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    host.marker.textContent = open ? '▾' : '▸';
    host.body.hidden = !open;
  }

  function select(host, key, focus) {
    host.selected = key;
    Object.keys(host.tabs).forEach(function (k) {
      var t = host.tabs[k], on = k === key;
      t.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tab.tabIndex = on ? 0 : -1;
      t.panel.hidden = !on;
    });
    if (focus && host.tabs[key]) host.tabs[key].tab.focus();
  }

  function renderHost(mountEl, app) {
    var spec = specs[app];
    var host = hosts[app] && hosts[app].mountEl === mountEl && mountEl.contains(hosts[app].body) ? hosts[app] : buildHost(mountEl, app);
    TABS.forEach(function (t) {
      var mod = modules[t.key], block = spec[t.key], cur = host.tabs[t.key];
      var want = !!(mod && block);
      var version = spec._versions[t.key] || 0;
      if (cur && (!want || cur.mod !== mod || cur.version !== version)) {
        cur.tab.remove(); cur.panel.remove(); delete host.tabs[t.key];
        if (cur.mod && typeof cur.mod.destroy === 'function') { try { cur.mod.destroy(cur.panel); } catch (e) { /* teardown best-effort */ } }
        cur = null;
      }
      if (want && !cur) {
        var label = mod.label || t.label;
        var tab = el('button', { type: 'button', role: 'tab', id: 'alm-f-tab-' + t.key, 'aria-controls': 'alm-f-panel-' + t.key, 'aria-selected': 'false', class: 'alm-f-tab', tabindex: '-1' }, label);
        var panel = el('div', { role: 'tabpanel', id: 'alm-f-panel-' + t.key, 'aria-labelledby': 'alm-f-tab-' + t.key, tabindex: '0', class: 'alm-f-panel' });
        panel.hidden = true;
        host.tabs[t.key] = { tab: tab, panel: panel, mod: mod, version: version, label: label };
        tab.addEventListener('click', function () { select(host, t.key, false); });
        try {
          mod.render(panel, { app: app, spec: spec, block: block, host: { open: function (key) { open(app, key || t.key); } } });
        } catch (e) {
          panel.replaceChildren();
          el('p', { class: 'alm-f-error', role: 'alert' }, label + ' could not be shown: ' + (e && e.message ? e.message : String(e)), panel);
        }
      }
    });
    // Keep DOM order = TABS order.
    present(host).forEach(function (k) { host.tablist.appendChild(host.tabs[k].tab); host.panels.appendChild(host.tabs[k].panel); });
    var keys = present(host);
    host.title.textContent = keys.length ? keys.map(function (k) { return host.tabs[k].label; }).join(' · ') : 'Analysis features';
    mountEl.hidden = !keys.length;
    select(host, keys.indexOf(host.selected) >= 0 ? host.selected : keys[0], false);
  }

  function open(app, key) {
    var host = hosts[app];
    if (!host) return false;
    setExpanded(host, true);
    if (key && host.tabs[key]) select(host, key, false);
    return true;
  }

  ensureState();
  var api = {
    register: register, registerModule: registerModule, get: get, revision: revision, stateHash: stateHash,
    open: open, liveAdapter: liveAdapter, blocks: BLOCKS.slice(), tabs: TABS.map(function (t) { return t.key; }),
  };
  global.AlmFeatures = api;
  var pending = global.AlmFeaturesPending;
  global.AlmFeaturesPending = { push: function (item) { registerModule(item[0], item[1]); } };
  if (Array.isArray(pending)) pending.forEach(function (item) { registerModule(item[0], item[1]); });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
