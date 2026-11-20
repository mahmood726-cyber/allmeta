// rare-events-glmm: complete separation at the arm level must be refused, not fitted.
//   node --test rare-events-glmm/tests/separation.test.cjs
//
// Requirement (P30 Methods G5: "complete separation ... must be refused"; metafor 5.2.1
// rma.glmm refuses every case below for UM.FS, CM.EL and CM.AL with "Cannot fit ML model").
// When every informative study (double-zero / double-all-events studies set aside) has no
// events in the same arm, or events in every participant of the same arm, the odds-ratio
// MLE is infinite. Before this guard the engine returned ok:true with finite numbers that
// the page displayed: all control arms with zero events, UM.FS gave OR 353.9 [110.8, 1130.3]
// and the fixed-baseline (CM.AL slot) fit OR 8.71 [4.24, 17.89].
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const E = require("../../shared/rare-events-glmm.js");
const row = (a) => ({ events_T: a[0], n_T: a[1], events_C: a[2], n_C: a[3] });
const FITS = { "UM.FS": E.fitUnconditional, "CM.AL": E.fit, "CM.EL": E.fitConditionalExact };

const SEPARATED = {
  "all control arms 0 events": [[3, 50, 0, 50], [5, 60, 0, 60]],
  "all treatment arms 0 events": [[0, 50, 3, 50], [0, 60, 5, 60], [0, 40, 2, 40]],
  "all treatment arms 0 events, plus a double-zero study": [[0, 50, 3, 50], [0, 60, 5, 60], [0, 40, 0, 40]],
  "all treatment arms all events": [[50, 50, 30, 50], [60, 60, 41, 60]],
  "all control arms all events": [[30, 50, 50, 50], [41, 60, 60, 60]],
};

for (const [name, data] of Object.entries(SEPARATED)) {
  for (const [m, f] of Object.entries(FITS)) {
    test(m + " refuses: " + name, () => {
      const g = f(data.map(row));
      assert.strictEqual(g.ok, false, m + " returned ok with OR " + g.OR);
      assert.match(String(g.error), /separation/i);
    });
  }
}

test("not separated (the page's default example) still fits in every model", () => {
  const data = [[0, 250, 1, 248], [2, 500, 5, 510], [0, 180, 3, 182], [1, 320, 4, 325],
    [3, 600, 7, 605], [0, 95, 2, 98], [2, 450, 6, 445], [1, 210, 3, 215]].map(row);
  for (const [m, f] of Object.entries(FITS)) assert.strictEqual(f(data).ok, true, m);
});
