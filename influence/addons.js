/* influence/addons.js - pilot wiring of the wave-A add-on panels (lane A6).
 * Loaded after validate/adapter.js. Reads only what the page already computed and displays;
 * never edits the analysis controls. The page fits an intercept-only REML random-effects
 * model with Wald (z) intervals on generic effects (effect, SE), so the sensitivity panel
 * uses measure family "GEN" and base configuration REML / z.
 */
(function () {
  'use strict';
  if (!window.alm || !window.alm.addons || !window.AlmInfluenceValidationAdapter) return;
  const studies = () => (window._almStudies && window._almStudies()) || [];
  const full = () => (window._almLastInfluence && window._almLastInfluence()) || null;
  const descriptor = {
    app: 'influence',
    lifecycle: () => document.getElementById('btn-run').click(),
    describe: () => ({ app: 'influence', model: 'random-effects', estimator: 'REML', test: 'z', measure: 'GEN',
      effect: 'generic effect sizes with standard errors', k: studies().length }),
    displayed: () => {
      const f = full();
      return f ? { k: studies().length, mu: f.mu, se: f.seMu, tau2: f.tau2, Q: f.Q, df: f.df } : null;
    },
    sensitivity: {
      measure: 'GEN', base: { method: 'REML', test: 'z' },
      data: () => { const s = studies(); return { yi: s.map(r => r.te), vi: s.map(r => r.se * r.se), labels: s.map(r => r.label) }; },
      page: () => { const f = full(); return f ? { k: studies().length, mu: f.mu, se: f.seMu, tau2: f.tau2, Q: f.Q } : {}; }
    },
    rExport: {
      live: window.AlmInfluenceValidationAdapter.live,
      // Idiomatic metafor for reading along; the reproduction check below it is what is compared.
      readable: state => [
        'library(metafor)',
        'dat <- data.frame(yi = c(' + state.yi.join(', ') + '), vi = c(' + state.vi.join(', ') + '))',
        'res <- rma(yi, vi, data = dat, method = "REML")',
        'print(res)',
        'print(leave1out(res))',
        'print(influence(res))'
      ].join('\n')
    }
  };
  const host = window.alm.addons.register(descriptor);
  host.standard();
  window.__almInfluenceAddons = { host, descriptor };
})();
