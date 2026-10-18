/* Opt-in add-on host. No panel reads or analysis work until opened. */
(function (global) {
  'use strict';
  const alm = global.alm = global.alm || {};
  const registrations = new Map();
  const suspended = () => !global.AlmValidate || typeof global.AlmValidate.isRunning !== 'function' || global.AlmValidate.isRunning();
  function register(desc) {
    if (!desc || !/^[a-z][a-z0-9-]*$/.test(desc.app) ||
        typeof desc.lifecycle !== 'function' || typeof desc.describe !== 'function' ||
        typeof desc.displayed !== 'function' || !(desc.sensitivity === null || typeof desc.sensitivity === 'object') ||
        !desc.rExport || !(desc.rExport.live === null || (desc.rExport.live && typeof desc.rExport.live === 'object'))) throw new TypeError('Invalid add-on descriptor');
    if (registrations.has(desc.app)) throw new Error('Add-ons already registered: ' + desc.app);
    const main = document.querySelector('body > main');
    if (!main) throw new Error('Add-ons require a body-level main');
    let aside = document.getElementById('alm-addons');
    if (aside && (aside.tagName !== 'ASIDE' || aside.parentElement !== document.body || !aside.hasAttribute('data-alm-addon'))) throw new Error('Add-on host id collision');
    if (!aside) {
      aside = document.createElement('aside'); aside.id = 'alm-addons';
      aside.setAttribute('data-alm-addon', ''); aside.setAttribute('aria-label', 'Analysis add-ons');
      main.after(aside);
    }
    const panels = new Map();
    const api = {
      // Factories are synchronous, local DOM work. No polling of currentState.
      panel(id, title, render) {
        if (!/^[a-z][a-z0-9-]*$/.test(id) || typeof render !== 'function' || panels.has(id)) throw new TypeError('Invalid or duplicate panel');
        const details = document.createElement('details'); details.id = 'alm-addon-' + desc.app + '-' + id;
        const summary = document.createElement('summary'); summary.textContent = title;
        const content = document.createElement('div'); details.append(summary, content); aside.append(details);
        let rendered = false;
        const open = () => {
          if (suspended()) return false;
          if (!rendered) { render(content, desc); rendered = true; }
          details.open = true;
          return true;
        };
        details.addEventListener('toggle', () => { if (details.open && !open()) details.open = false; });
        panels.set(id, details);
        return { element: details, open };
      },
      run(fn) { if (suspended()) return false; fn(desc); return true; },
      suspended
    };
    // Block controls of already-open panels while validation owns page state.
    for (const type of ['click', 'input', 'change', 'keydown', 'submit']) {
      aside.addEventListener(type, event => {
        if (suspended()) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    }
    registrations.set(desc.app, api);
    return api;
  }
  alm.addons = { register };
})(typeof window !== 'undefined' ? window : globalThis);
