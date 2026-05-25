/**
 * shared/autosave.js — debounced autosave + on-load restore for any app.
 *
 * Why: users close tabs and lose work. The cross-app `ma-studies-v1` bus only
 * carries pasted study data; it does not preserve form context (model choice,
 * alpha, custom labels, sensitivity sliders, etc.). This module snapshots a
 * configurable set of form inputs (textareas, selects, inputs, checkboxes,
 * radios) to localStorage on every change (debounced), and offers a
 * "Restore draft?" toast on the next load.
 *
 * Storage key: `alm-autosave:<appKey>`. Holds:
 *   {
 *     savedAt: ISO-8601 string,
 *     values:  { [inputId|name]: <value> },
 *     version: 1
 *   }
 *
 * Quota: stays well under 5 KB per app. If a single input exceeds 100 KB
 * (e.g. a giant pasted dataset), it's skipped — the ma-studies bus is the
 * right channel for that.
 *
 * Public API:
 *   AlmAutosave.install({appKey, selectors, debounceMs, onRestore})
 *   AlmAutosave.clear(appKey)
 *   AlmAutosave.peek(appKey)  -> {savedAt, values} | null
 *
 * Test fixture: tests/test_autosave.py drives via node + jsdom.
 */
(function (global) {
  'use strict';

  const STORAGE_PREFIX = 'alm-autosave:';
  const VERSION = 1;
  const PER_FIELD_LIMIT = 100_000;
  const DEFAULT_DEBOUNCE = 600;

  function _key(appKey) { return STORAGE_PREFIX + String(appKey || 'default'); }

  function _now() { return new Date().toISOString(); }

  function _getStored(appKey) {
    try {
      const raw = global.localStorage && global.localStorage.getItem(_key(appKey));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object' || obj.version !== VERSION) return null;
      return obj;
    } catch (_) { return null; }
  }

  function _setStored(appKey, values) {
    try {
      const payload = JSON.stringify({ version: VERSION, savedAt: _now(), values });
      global.localStorage && global.localStorage.setItem(_key(appKey), payload);
      return true;
    } catch (e) {
      // Quota error or storage disabled — fail silently. Autosave is a nicety,
      // not a correctness feature, so don't surface the failure to the user.
      return false;
    }
  }

  function _readField(el) {
    if (!el || el.disabled) return undefined;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT') {
      const type = (el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return !!el.checked;
      if (type === 'file' || type === 'password') return undefined;  // never persist
      return el.value;
    }
    if (tag === 'TEXTAREA' || tag === 'SELECT') return el.value;
    return undefined;
  }

  function _writeField(el, value) {
    if (!el || value === undefined) return;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT') {
      const type = (el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        el.checked = !!value;
      } else if (type !== 'file' && type !== 'password') {
        el.value = String(value);
      }
    } else if (tag === 'TEXTAREA' || tag === 'SELECT') {
      el.value = String(value);
    }
    // Fire change events so any onchange-bound logic reacts to the restore.
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
  }

  function _fieldKey(el) {
    // Prefer id, fall back to name, then to a synthetic positional key.
    return el.id || el.name || ('idx:' + (el.dataset.autosaveIndex || ''));
  }

  function _resolveElements(selectors) {
    const out = [];
    const seen = new Set();
    (selectors || []).forEach(sel => {
      try {
        global.document.querySelectorAll(sel).forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);
          out.push(el);
        });
      } catch (_) {}
    });
    return out;
  }

  function _snapshot(elements) {
    const values = {};
    elements.forEach((el, i) => {
      if (!el.dataset.autosaveIndex) el.dataset.autosaveIndex = String(i);
      const v = _readField(el);
      if (v === undefined) return;
      const sv = typeof v === 'string' ? v : String(v);
      if (sv.length > PER_FIELD_LIMIT) return;
      values[_fieldKey(el)] = v;
    });
    return values;
  }

  function _restore(elements, values) {
    if (!values || typeof values !== 'object') return 0;
    let n = 0;
    elements.forEach(el => {
      const k = _fieldKey(el);
      if (Object.prototype.hasOwnProperty.call(values, k)) {
        _writeField(el, values[k]);
        n++;
      }
    });
    return n;
  }

  function _debounce(fn, ms) {
    let t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn(), ms);
    };
  }

  function _showRestoreToast(savedAt, onAccept, onDecline) {
    // Use the in-app Toast if present, else fall back to a styled inline div.
    if (global.Toast && typeof global.Toast.show === 'function') {
      // Best-effort: most Toast implementations don't return an actionable
      // handle, so we render our own inline banner regardless.
    }
    const doc = global.document;
    if (!doc || !doc.body) return;
    const banner = doc.createElement('div');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText =
      'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:var(--surface-raised,#1f2937);color:var(--text-primary,#f3f4f6);' +
      'border:1px solid var(--accent-500,#3b82f6);border-radius:10px;padding:10px 14px;' +
      'font:13px/1.4 system-ui,sans-serif;display:flex;gap:10px;align-items:center;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.18);max-width:480px;';
    const txt = doc.createElement('span');
    const ageMs = Date.now() - Date.parse(savedAt);
    const mins = Math.max(1, Math.round(ageMs / 60000));
    txt.textContent = `Draft from ${mins < 60 ? mins + ' min' : Math.round(mins/60) + ' h'} ago found. Restore?`;
    const yes = doc.createElement('button');
    yes.type = 'button';
    yes.textContent = 'Restore';
    yes.style.cssText = 'background:var(--accent-500,#3b82f6);color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;';
    const no = doc.createElement('button');
    no.type = 'button';
    no.textContent = 'Discard';
    no.style.cssText = 'background:transparent;color:var(--text-secondary,#9ca3af);border:1px solid var(--border-default,#374151);border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit;';
    yes.addEventListener('click', () => { try { onAccept(); } finally { banner.remove(); } });
    no.addEventListener('click', () => { try { onDecline(); } finally { banner.remove(); } });
    banner.appendChild(txt);
    banner.appendChild(yes);
    banner.appendChild(no);
    doc.body.appendChild(banner);
    // Auto-dismiss after 30 s
    setTimeout(() => { try { banner.remove(); } catch (_) {} }, 30_000);
  }

  function install(opts) {
    opts = opts || {};
    const appKey = String(opts.appKey || 'default');
    const selectors = Array.isArray(opts.selectors) && opts.selectors.length > 0
      ? opts.selectors
      : ['textarea', 'select', 'input[type=text]', 'input[type=number]',
         'input[type=checkbox]', 'input[type=radio]', 'input[type=range]'];
    const debounceMs = Number.isFinite(opts.debounceMs) ? Math.max(50, opts.debounceMs) : DEFAULT_DEBOUNCE;
    const doc = global.document;
    if (!doc || !global.localStorage) return { ok: false, reason: 'no-dom-or-storage' };

    // 1) Offer restore on load
    const stored = _getStored(appKey);
    if (stored && stored.values && Object.keys(stored.values).length > 0) {
      const els = _resolveElements(selectors);
      const doRestore = () => {
        const n = _restore(els, stored.values);
        if (typeof opts.onRestore === 'function') {
          try { opts.onRestore(n, stored.values); } catch (_) {}
        }
      };
      const discard = () => { try { global.localStorage.removeItem(_key(appKey)); } catch (_) {} };
      _showRestoreToast(stored.savedAt, doRestore, discard);
    }

    // 2) Wire change events
    const save = _debounce(() => {
      const els = _resolveElements(selectors);
      _setStored(appKey, _snapshot(els));
    }, debounceMs);

    selectors.forEach(sel => {
      doc.addEventListener('input', (ev) => { if (ev.target && ev.target.matches && ev.target.matches(sel)) save(); }, true);
      doc.addEventListener('change', (ev) => { if (ev.target && ev.target.matches && ev.target.matches(sel)) save(); }, true);
    });

    return { ok: true, appKey };
  }

  function clear(appKey) {
    try { global.localStorage.removeItem(_key(appKey)); return true; }
    catch (_) { return false; }
  }

  function peek(appKey) {
    const s = _getStored(appKey);
    if (!s) return null;
    return { savedAt: s.savedAt, values: s.values };
  }

  // Public API
  const api = { install, clear, peek, _key, _snapshot, _restore };
  global.AlmAutosave = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
