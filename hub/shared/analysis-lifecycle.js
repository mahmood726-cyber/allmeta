/* UI lifecycle only: callers supply the existing run and its success evidence. */
(function () {
  'use strict';
  window.alm = window.alm || {};
  window.alm.analysisLifecycle = function (run, succeeded, inputs, state) {
    const updated = document.getElementById('analysis-status');
    const stale = document.getElementById('analysis-stale');
    const snapshot = () => JSON.stringify([[...document.querySelectorAll(inputs)].map(el => [el.id, el.value, el.checked]), state ? state() : null]);
    // completed: inputs of the last successful run. attempted: inputs of the last run, successful or refused.
    // A change event that only commits an input already run (e.g. textarea blur after an auto-run) is not stale.
    let completed = null, attempted = null;
    const hide = () => { updated.hidden = true; if (stale) stale.hidden = true; };
    for (const type of ['input', 'change']) document.addEventListener(type, event => {
      if (!event.target.matches(inputs)) return;
      const now = snapshot();
      if (now !== completed && now !== attempted) { updated.hidden = true; if (stale) stale.hidden = false; }
    }, true);
    const wrapped = function () {
      hide();
      completed = null; attempted = null;
      const result = run.apply(this, arguments);
      attempted = snapshot();
      if (succeeded(result)) { completed = attempted; updated.hidden = false; }
      else completed = null;
      return result;
    };
    wrapped.refresh = function () {
      if (completed !== null && snapshot() !== completed) {
        updated.hidden = true; if (stale) stale.hidden = false;
      }
    };
    return wrapped;
  };
})();
