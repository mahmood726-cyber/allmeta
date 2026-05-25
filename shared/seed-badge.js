/**
 * shared/seed-badge.js — surface the RNG seed used by stochastic analyses so
 * users can replay exactly.
 *
 * Why this matters: many apps already pin a seed (deterministic by input
 * hash, or user-specified) so two runs of the same data give the same
 * MCMC/bootstrap/ranking output. But the seed is hidden — users can't
 * cite "seed 12345" in their methods section because they don't know what
 * was used. This module:
 *
 *   1. AlmSeed.deriveFromInputs(payload) → 32-bit unsigned int seed
 *      (FNV-1a over canonical JSON; pure JS, deterministic across browsers)
 *
 *   2. AlmSeed.showBadge({container, seed, source, onCopy}) → DOM badge:
 *      [📌 Seed: 12345 (auto) 📋]
 *      The clipboard button copies the seed only. Re-render is idempotent.
 *
 *   3. AlmSeed.embedInExport(obj, seed, source) → returns a shallow-cloned
 *      object with a `seed` field added at the top level. Used by JSON
 *      / receipt exporters to make the seed part of the persisted record.
 *
 * Public API:
 *   AlmSeed.deriveFromInputs(any)            -> number
 *   AlmSeed.showBadge({...})                  -> DOM element
 *   AlmSeed.embedInExport(obj, seed, source)  -> object
 */
(function (global) {
  'use strict';

  // Deep-canonicalize so {a:1, b:2} and {b:2, a:1} hash to the same seed.
  function _canon(o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(_canon);
    const out = {};
    Object.keys(o).sort().forEach(k => { out[k] = _canon(o[k]); });
    return out;
  }

  // FNV-1a 32-bit. Fast, deterministic, no dependencies.
  function _fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function deriveFromInputs(payload) {
    const s = JSON.stringify(_canon(payload || {}));
    const seed = _fnv1a32(s);
    // Avoid 0 (some PRNGs treat 0 as "no seed → reseed from time").
    return seed === 0 ? 1 : seed;
  }

  function _copyToClipboard(text) {
    try {
      if (global.navigator && global.navigator.clipboard) {
        return global.navigator.clipboard.writeText(String(text));
      }
    } catch (_) {}
    // Fallback: hidden textarea
    try {
      const ta = global.document.createElement('textarea');
      ta.value = String(text);
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      global.document.body.appendChild(ta);
      ta.select();
      global.document.execCommand('copy');
      ta.remove();
    } catch (_) {}
    return Promise.resolve();
  }

  function _resolveContainer(c) {
    if (!c) return null;
    if (typeof c === 'string') return global.document.querySelector(c);
    return c;
  }

  function showBadge(opts) {
    opts = opts || {};
    const container = _resolveContainer(opts.container);
    if (!container) return null;
    const seed = opts.seed;
    const source = opts.source || 'auto';   // 'auto' | 'user' | 'fixed'
    const onCopy = typeof opts.onCopy === 'function' ? opts.onCopy : null;

    // Idempotent: remove previous badge if present.
    const old = container.querySelector(':scope > .alm-seed-badge');
    if (old) old.remove();

    const doc = global.document;
    const badge = doc.createElement('div');
    badge.className = 'alm-seed-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', `Run seed ${seed}, source ${source}. Click copy button to copy the seed.`);
    badge.style.cssText =
      'display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;' +
      'background:color-mix(in srgb, var(--accent-500, #2563eb) 10%, transparent);' +
      'border:1px solid var(--border-subtle, #e5e7eb);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'color:var(--text-primary, #1f2937);margin:6px 0;';

    const lbl = doc.createElement('span');
    lbl.textContent = `📌 Seed: ${seed} (${source})`;
    badge.appendChild(lbl);

    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.title = 'Copy seed to clipboard';
    copy.textContent = '📋';
    copy.style.cssText =
      'background:transparent;border:0;padding:2px 4px;cursor:pointer;color:inherit;font:inherit;';
    copy.addEventListener('click', function () {
      _copyToClipboard(String(seed));
      copy.textContent = '✓';
      setTimeout(() => { copy.textContent = '📋'; }, 1200);
      if (onCopy) try { onCopy(seed); } catch (_) {}
    });
    badge.appendChild(copy);

    container.appendChild(badge);
    return badge;
  }

  function embedInExport(obj, seed, source) {
    const out = obj && typeof obj === 'object' && !Array.isArray(obj)
      ? Object.assign({}, obj)
      : { result: obj };
    out.seed = Number.isFinite(seed) ? Math.floor(seed) : null;
    out.seedSource = source || 'auto';
    return out;
  }

  const api = { deriveFromInputs, showBadge, embedInExport, _fnv1a32, _canon };
  global.AlmSeed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
