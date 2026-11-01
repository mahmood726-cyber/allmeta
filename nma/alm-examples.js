/* Additional published example; leaves the original default intact. */
(function (global) {
  'use strict';
  const app = 'nma';
  if (typeof document !== 'undefined') global.AlmExamples.register(app);
  if (typeof module !== 'undefined') module.exports = { app };
})(typeof window !== 'undefined' ? window : globalThis);
