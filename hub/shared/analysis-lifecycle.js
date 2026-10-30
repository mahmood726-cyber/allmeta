/* UI lifecycle only: callers supply the existing run and its success evidence. */
(function () {
  'use strict';
  window.alm = window.alm || {};
  const starts = new WeakMap();
  window.alm.analysisLifecycle = function (run, succeeded, inputs, state) {
    const updated = document.getElementById('analysis-status');
    const stale = document.getElementById('analysis-stale');
    const snapshot = () => JSON.stringify([[...document.querySelectorAll(inputs)].map(el => [el.id, el.value, el.checked]), state ? state() : null]);
    let completed = null;
    const listeners = new Set(), before = new Set();
    const hide = () => { updated.hidden = true; if (stale) stale.hidden = true; };
    for (const type of ['input', 'change']) document.addEventListener(type, event => {
      if (event.target.matches(inputs) && snapshot() !== completed) { updated.hidden = true; if (stale) stale.hidden = false; }
    }, true);
    const wrapped = function () {
      for (const cancel of before) cancel();
      hide();
      completed = null;
      const result = run.apply(this, arguments);
      if (succeeded(result)) {
        completed = snapshot(); updated.hidden = false;
        for (const callback of [...listeners]) {
          // Observers must not change the original run's return/throw contract.
          try { callback(result); } catch (error) { console.error('Analysis completion observer failed', error); }
        }
      }
      else completed = null;
      return result;
    };
    wrapped.refresh = function () {
      if (completed !== null && snapshot() !== completed) {
        updated.hidden = true; if (stale) stale.hidden = false;
      }
    };
    // Successful synchronous runs only; returns an idempotent unsubscribe.
    wrapped.onComplete = function (callback) {
      if (typeof callback !== 'function') throw new TypeError('Completion callback must be a function');
      listeners.add(callback);
      return () => listeners.delete(callback);
    };
    starts.set(wrapped, before);
    return wrapped;
  };
  // Opt-in only. inputs is a CSS selector; ready is checked at event and run time.
  // The caller owns readiness (including any app-specific validation state).
  window.alm.analysisLifecycle.live = function (wrapped, options) {
    const {inputs, debounceMs = 400, ready = () => true, toggleId, defaultOn = false} = options || {};
    if (!starts.has(wrapped) || typeof inputs !== 'string' || !inputs.trim() ||
        typeof ready !== 'function' || !Number.isFinite(debounceMs) || debounceMs < 0 ||
        typeof toggleId !== 'string' || !toggleId.trim()) throw new TypeError('Invalid live analysis options');
    document.querySelectorAll(inputs); // Refuse invalid selectors before changing the DOM.
    const button = document.getElementById('btn-run');
    if (!button || document.getElementById(toggleId)) throw new Error('Live analysis needs #btn-run and a unique toggleId');
    const label = document.createElement('label'), toggle = document.createElement('input');
    toggle.type = 'checkbox'; toggle.id = toggleId; toggle.checked = Boolean(defaultOn);
    label.append(toggle, document.createTextNode(' Update results as I type'));
    button.after(label);
    const previous = button.getAttribute('data-alm-live');
    let timer = null, disposed = false;
    const cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    const allowed = () => !disposed && toggle.checked &&
      !(window.AlmValidate && window.AlmValidate.isRunning()) && ready();
    const mark = () => { button.setAttribute('data-alm-live', toggle.checked ? 'on' : 'off'); cancel(); };
    const edit = event => {
      if (!event.isTrusted || !event.target.matches(inputs)) return;
      cancel();
      if (allowed()) timer = setTimeout(() => {
        timer = null;
        if (allowed()) wrapped();
      }, debounceMs);
    };
    mark(); toggle.addEventListener('change', mark);
    for (const type of ['input', 'change']) document.addEventListener(type, edit, true);
    starts.get(wrapped).add(cancel);
    return {
      toggle,
      dispose() {
        if (disposed) return;
        disposed = true; cancel(); starts.get(wrapped).delete(cancel);
        for (const type of ['input', 'change']) document.removeEventListener(type, edit, true);
        toggle.removeEventListener('change', mark); label.remove();
        if (previous === null) button.removeAttribute('data-alm-live');
        else button.setAttribute('data-alm-live', previous);
      }
    };
  };
})();
