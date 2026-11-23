/* shared/alm-straight-ui.js — F6 "Straight path" UI on top of shared/alm-straight.js (AlmStraight).
 *
 *   AlmStraightUI.mount(el, spec)    full panel (the feature-panel tab "Straight path"): fired advice grouped as
 *                                    Recommended analysis / Pitfalls / Uncertainty, each with a "Why?" toggle that
 *                                    shows the Handbook sections and the documented evidence (DOI links), plus the
 *                                    list of every rule checked. spec = {app, ctx: () => ctx}. Returns {refresh, destroy}.
 *   AlmStraightUI.notice(spec)       compact advisory notice inserted before spec.anchor (an element above the app's
 *                                    results) when any rule fires; dismissible (comes back only when the advice
 *                                    changes); never blocks anything. Returns {element, refresh}.
 *   AlmStraightUI.attach(spec)       what <app>/alm-straight.js calls: {app, ctx, anchor, watch:[selectors]} ->
 *                                    notice + re-check whenever a watched results element changes + registers the
 *                                    app's `straight` block with AlmFeatures (tab shown when the page has the panel).
 *   AlmStraightUI.last[app]          the last AlmStraight.evaluate result (read by the browser tests).
 *
 * Registers the tab module with AlmFeatures (extension tab after "Report text"); load after shared/alm-features.js
 * (or before it: the module is queued on AlmFeaturesPending) and before the app adapters. textContent only.
 */
(function (global) {
  'use strict';

  var PARTS = [
    { key: 'recommend', title: 'Recommended analysis', tag: 'Recommendation' },
    { key: 'pitfalls', title: 'Pitfalls', tag: 'Pitfall' },
    { key: 'uncertainty', title: 'Uncertainty', tag: 'Uncertainty' },
  ];
  var KIND = {
    named: 'Documented error in a named meta-analysis',
    survey: 'Published audit of meta-analyses',
    methods: 'Methods paper',
  };
  var serial = 0, last = {};

  function el(doc, tag, attrs, text, parent) {
    var n = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  function evaluate(spec) {
    var ctx = null;
    try { ctx = typeof spec.ctx === 'function' ? spec.ctx() : spec.ctx; } catch (e) { ctx = null; }
    var r = global.AlmStraight.evaluate(spec.app, ctx || {});
    last[spec.app] = r;
    return r;
  }

  function firedItems(r) {
    var out = [];
    PARTS.forEach(function (p) { r[p.key].forEach(function (it) { out.push({ part: p, item: it }); }); });
    return out;
  }

  function link(doc, href, text, parent) {
    var a = el(doc, 'a', { href: href, rel: 'noopener', target: '_blank' }, text, parent);
    return a;
  }

  // "Why?" toggle + the Handbook / evidence details it controls.
  function why(doc, li, item) {
    var id = 'alm-sp-why-' + (++serial);
    var btn = el(doc, 'button', { type: 'button', class: 'alm-sp-why', 'aria-expanded': 'false', 'aria-controls': id }, 'Why?', li);
    btn.setAttribute('aria-label', 'Why? Sources for ' + item.id);
    var box = el(doc, 'div', { id: id, class: 'alm-sp-detail' }, null, li);
    box.hidden = true;
    if (item.handbook.length) {
      el(doc, 'p', { class: 'alm-sp-dt' }, 'Guidance', box);
      var ul = el(doc, 'ul', null, null, box);
      item.handbook.forEach(function (h) { link(doc, h.url, h.label, el(doc, 'li', null, null, ul)); });
    } else {
      el(doc, 'p', { class: 'alm-sp-dt' }, 'Guidance: not covered by the Cochrane Handbook.', box);
    }
    if (item.evidence.length) {
      el(doc, 'p', { class: 'alm-sp-dt' }, 'Evidence', box);
      var ev = el(doc, 'ul', null, null, box);
      item.evidence.forEach(function (e) {
        var x = el(doc, 'li', { 'data-kind': e.kind }, null, ev);
        el(doc, 'span', { class: 'alm-sp-kind' }, (KIND[e.kind] || e.kind) + ': ', x);
        el(doc, 'span', null, e.citation + ', ', x);
        link(doc, 'https://doi.org/' + e.doi, 'doi:' + e.doi, x);
        if (e.note) el(doc, 'span', { class: 'alm-sp-note' }, ' — ' + e.note, x);
      });
    } else {
      el(doc, 'p', { class: 'alm-sp-dt' }, 'Evidence: an honest-uncertainty statement from the Handbook; no error example is cited.', box);
    }
    el(doc, 'p', { class: 'alm-sp-id' }, 'Rule ' + item.id, box);
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      box.hidden = !open;
    });
  }

  function itemLi(doc, ul, part, item, withTag) {
    var li = el(doc, 'li', { class: 'alm-sp-item', 'data-rule': item.id, 'data-part': part.key }, null, ul);
    var p = el(doc, 'p', { class: 'alm-sp-msg' }, null, li);
    if (withTag) el(doc, 'strong', null, part.tag + ': ', p);
    p.appendChild(doc.createTextNode(item.message));
    why(doc, li, item);
    return li;
  }

  function checkedText(c) {
    if (c.fired) return 'flagged';
    if (c.reason === 'not applicable') return 'not applicable' + (c.missing ? ' (needs: ' + c.missing.join(', ') + ')' : (c.detail ? ' (' + c.detail + ')' : ''));
    return 'not flagged' + (c.reason && c.reason !== 'not triggered' ? ' (' + c.reason + ')' : '');
  }

  // ---- full panel -------------------------------------------------------------------------------
  function mount(root, spec) {
    if (!root || !spec || typeof spec.app !== 'string') throw new Error('AlmStraightUI.mount: element and spec.app required');
    var doc = root.ownerDocument;
    var box = el(doc, 'section', { class: 'alm-straight', 'aria-label': 'Straight path: methods guidance for this analysis' });
    root.appendChild(box);
    function refresh() {
      var r = evaluate(spec);
      box.replaceChildren();
      el(doc, 'p', { class: 'alm-sp-intro' },
        'Advisory checks on this analysis’s own inputs, choices and results. They never block the analysis. Each check is linked to the Cochrane Handbook and, where one exists, to a published example of the error.', box);
      PARTS.forEach(function (p) {
        el(doc, 'h3', { class: 'alm-sp-h' }, p.title, box);
        if (!r[p.key].length) { el(doc, 'p', { class: 'alm-sp-none', 'data-part': p.key }, 'Nothing flagged.', box); return; }
        var ul = el(doc, 'ul', { class: 'alm-sp-list' }, null, box);
        r[p.key].forEach(function (it) { itemLi(doc, ul, p, it, false); });
      });
      var d = el(doc, 'details', { class: 'alm-sp-checked' }, null, box);
      el(doc, 'summary', null, 'Rules checked (' + r.checked.length + ')', d);
      var ul2 = el(doc, 'ul', null, null, d);
      r.checked.forEach(function (c) { el(doc, 'li', { 'data-rule': c.id, 'data-fired': c.fired ? 'true' : 'false' }, c.id + ': ' + checkedText(c), ul2); });
      return r;
    }
    refresh();
    return { element: box, refresh: refresh, destroy: function () { box.remove(); } };
  }

  // ---- compact notice above the results ---------------------------------------------------------
  function notice(spec) {
    var anchor = typeof spec.anchor === 'string' ? global.document.querySelector(spec.anchor) : spec.anchor;
    if (!anchor || !anchor.parentNode) return null;
    var doc = anchor.ownerDocument;
    var box = el(doc, 'div', { class: 'alm-straight-notice', role: 'note', 'aria-label': 'Straight path advice', 'data-app': spec.app });
    box.hidden = true;
    anchor.parentNode.insertBefore(box, anchor);
    var dismissed = null;
    function refresh() {
      var r = evaluate(spec), items = firedItems(r);
      var sig = items.map(function (x) { return x.item.id + '|' + x.item.message; }).join('\n');
      box.replaceChildren();
      box.setAttribute('data-fired', items.map(function (x) { return x.item.id; }).join(' '));
      if (!items.length || sig === dismissed) { box.hidden = true; return r; }
      dismissed = null;
      var head = el(doc, 'div', { class: 'alm-sp-head' }, null, box);
      el(doc, 'strong', null, 'Straight path', head);
      el(doc, 'span', { class: 'alm-sp-sub' }, ' · ' + items.length + ' advisory ' + (items.length === 1 ? 'note' : 'notes') + ' on this analysis (they never block it)', head);
      var x = el(doc, 'button', { type: 'button', class: 'alm-sp-dismiss', 'aria-label': 'Dismiss Straight path advice' }, 'Dismiss', head);
      x.addEventListener('click', function () { dismissed = sig; box.hidden = true; });
      var ul = el(doc, 'ul', { class: 'alm-sp-list' }, null, box);
      items.forEach(function (it) { itemLi(doc, ul, it.part, it.item, true); });
      if (global.AlmFeatures && global.AlmFeatures.get && global.AlmFeatures.get(spec.app) && global.document.getElementById('alm-features')) {
        var more = el(doc, 'button', { type: 'button', class: 'alm-sp-more' }, 'Open the Straight path tab', box);
        more.addEventListener('click', function () { global.AlmFeatures.open(spec.app, 'straight'); var t = global.document.getElementById('alm-f-tab-straight'); if (t) t.focus(); });
      }
      box.hidden = false;
      return r;
    }
    return { element: box, refresh: refresh };
  }

  // ---- adapter entry point ----------------------------------------------------------------------
  function attach(spec) {
    var doc = global.document;
    var handle = { notice: null, refresh: function () {} };
    var block = { ctx: spec.ctx };
    if (global.AlmFeatures && typeof global.AlmFeatures.register === 'function') global.AlmFeatures.register(spec.app, { straight: block });
    var timer = null;
    function refresh() {
      if (!handle.notice) handle.notice = notice(spec);
      if (handle.notice) handle.notice.refresh(); else evaluate(spec);
      if (block.__panel) block.__panel.refresh();
    }
    function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(function () { timer = null; refresh(); }, 40); }
    handle.refresh = refresh;
    function start() {
      refresh();
      if (typeof global.MutationObserver !== 'function') return;
      var mo = new global.MutationObserver(schedule);
      (spec.watch || []).forEach(function (sel) {
        var n = doc.querySelector(sel);
        if (n) mo.observe(n, { childList: true, subtree: true, characterData: true });
      });
      handle.observer = mo;
    }
    if (doc.readyState === 'complete') start();
    else global.addEventListener('load', start, { once: true });
    return handle;
  }

  // ---- feature-panel tab ------------------------------------------------------------------------
  var tabModule = {
    label: 'Straight path',
    extension: { label: 'Straight path', after: 'text' },
    render: function (panel, c) {
      return { onShow: function () {
        if (!panel.__almHandle) {
          try { panel.__almHandle = mount(panel, { app: c.app, ctx: c.block.ctx }); c.block.__panel = panel.__almHandle; }
          catch (e) { panel.textContent = 'Straight path could not be shown: ' + (e && e.message ? e.message : String(e)); }
        } else panel.__almHandle.refresh();
      } };
    },
    destroy: function (panel) { if (panel.__almHandle) panel.__almHandle.destroy(); panel.__almHandle = null; },
  };

  var api = { mount: mount, notice: notice, attach: attach, last: last, tabModule: tabModule };
  global.AlmStraightUI = api;
  if (global.AlmFeatures && typeof global.AlmFeatures.registerModule === 'function') global.AlmFeatures.registerModule('straight', tabModule);
  else (global.AlmFeaturesPending = global.AlmFeaturesPending || []).push(['straight', tabModule]);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
