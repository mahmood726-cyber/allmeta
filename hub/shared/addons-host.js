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
      suspended,
      // Standard panels (wave A): sensitivity (when desc.sensitivity), methods text,
      // interpretation draft and R script (when desc.rExport.live). Each renders on first
      // opening only and states plainly when the module it needs is not on the page.
      standard() {
        const made = {};
        if (desc.sensitivity) made.sensitivity = api.panel('sensitivity', 'Sensitivity analysis', (content, d) => {
          if (!alm.sensitivityPanel) return note(content, 'Sensitivity analysis is not available on this page.');
          alm.sensitivityPanel.render(content, Object.assign({ app: d.app, suspended }, d.sensitivity));
        });
        made.methods = api.panel('methods', 'Methods text', (content, d) => {
          if (!alm.reportText || typeof alm.reportText.methods !== 'function') return note(content, 'Methods text is not available on this page yet.');
          textBlock(content, alm.reportText.methods(d.describe()));
        });
        made.interpretation = api.panel('interpretation', 'Interpretation (draft)', (content, d) => {
          if (!alm.reportText || typeof alm.reportText.interpret !== 'function') return note(content, 'The interpretation draft is not available on this page yet.');
          textBlock(content, alm.reportText.interpret(d.describe(), d.displayed()));
        });
        if (desc.rExport.live) made.rScript = api.panel('r-script', 'R script', (content, d) => {
          if (!alm.rExport) return note(content, 'R script export is not available on this page.');
          note(content, 'Downloads an R script that re-runs this analysis with the R code used by "Validate this analysis in R", then compares R’s numbers with the values on this page and prints PASS or FAIL.');
          const button = document.createElement('button'); button.type = 'button'; button.id = 'alm-addon-' + d.app + '-r-download';
          button.textContent = 'Download R script'; content.append(button);
          const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); content.append(status);
          const exporter = alm.rExport.attach({ app: d.app, live: d.rExport.live, readable: d.rExport.readable });
          button.addEventListener('click', async () => {
            if (suspended()) return;
            button.disabled = true; status.textContent = 'Preparing the R script…';
            try { await exporter.download(); status.textContent = 'R script downloaded.'; }
            catch (error) { status.textContent = 'R script not created: ' + error.message; }
            finally { button.disabled = false; }
          });
        });
        return made;
      }
    };
    function note(content, text) { const p = document.createElement('p'); p.textContent = text; content.append(p); }
    function textBlock(content, text) {
      if (typeof text !== 'string') throw new TypeError('Panel text must be a string');
      text.split(/\n{2,}/).forEach(part => note(content, part));
    }
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
