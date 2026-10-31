/* Additional published example; leaves the original default intact. */
(function (global) {
  'use strict';
  const app = 'heterogeneity';
  let pending;
  function prepare() {
    if (typeof global.AlmWebR?.buildMetaforScript === 'function') return Promise.resolve();
    if (!pending) pending = new Promise((resolve, reject) => {
      // The archived adapter uses this lazy helper to serialize its R recipe.
      // Loading the helper does not boot webR or run any statistical model.
      const script = document.createElement('script');
      script.src = new URL('../shared/webr-runner.js', document.baseURI).href;
      script.onload = () => typeof global.AlmWebR?.buildMetaforScript === 'function'
        ? resolve() : reject(Error('Local R script builder unavailable'));
      script.onerror = () => reject(Error('Local R script builder unavailable'));
      document.head.append(script);
    }).catch(error => { pending = null; throw error; });
    return pending;
  }
  if (typeof document !== 'undefined') global.AlmExamples.register(app, { prepare });
  if (typeof module !== 'undefined') module.exports = { app };
})(typeof window !== 'undefined' ? window : globalThis);
