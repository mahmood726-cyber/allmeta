// Independent entrypoint: aggregate replay failures cannot hide R1's outcomes.
require('./p16-r4-dom-runtime.cjs');
(async () => {
  const { defineTests } = await import('./unit/p16-r4-plus-cases.mjs');
  const { harness } = require('./nma-inconsistency-dom.cjs');
  defineTests(() => {
    const h = harness({ live: true }), clipboard = [];
    h.c.navigator = { clipboard: { writeText: async text => { clipboard.push(text); } } };
    return { ...h, clipboard };
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
