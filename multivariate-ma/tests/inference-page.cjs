'use strict';
// Page-level checks of the inference panel (linkedom). Lane p18fix review finding P2-3.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const app = path.resolve(__dirname, '..');
function page() {
  const { window, document } = parseHTML(fs.readFileSync(path.join(app, 'index.html'), 'utf8'));
  window.matchMedia = () => ({ matches: false });
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  const ctx = vm.createContext({ window, document, console, matchMedia: window.matchMedia,
    setTimeout, clearTimeout, URL, Blob, navigator: {}, performance: { now: () => Date.now() } });
  for (const s of document.querySelectorAll('script')) {
    const src = s.getAttribute('src');
    if (src && /alm-validate\.js$|a11y-landmarks\.js$/.test(src)) continue;
    vm.runInContext(src ? fs.readFileSync(path.join(app, src), 'utf8') : s.textContent, ctx);
  }
  return { window, document };
}
test('P2-3 a fit that throws clears the inference panel instead of keeping the previous dataset', () => {
  const { window: w, document: d } = page();
  assert.ok(w._almLastMvInference(), 'example data populates the panel');
  assert.equal(d.getElementById('inf-het-body').children.length, 3);
  w.AlmMvPlus = undefined;
  w.AlmMultivariate.fit = () => { throw new Error('REML fit did not produce finite results.'); };
  d.getElementById('f-data').value = 'a,.1,.2,.3,.4,0\nb,.2,.2,.4,.4,0';
  w.AlmMvPage.run();
  assert.equal(d.getElementById('headline').textContent, 'REML fit did not produce finite results.');
  assert.equal(w._almLastMvInference(), null);
  for (const id of ['inf-het-body', 'inf-fe-body', 'inf-re-body', 'inf-joint-body', 'inf-fit-body']) assert.equal(d.getElementById(id).innerHTML, '', id);
  assert.match(d.getElementById('inf-status').textContent, /No fitted model/);
});
test('P2-2 an out-of-range level is refused visibly and marks the input invalid', () => {
  const { window: w, document: d } = page();
  const inp = d.getElementById('inf-level');
  inp.value = '99.95'; w.AlmMvInferenceUI.render();
  assert.match(d.getElementById('inf-status').textContent, /^Refused: Confidence level must be a number from 1 to 99\.9/);
  assert.equal(inp.getAttribute('aria-invalid'), 'true');
  assert.equal(d.getElementById('inf-het-body').children.length, 0);
  inp.value = '97.5'; w.AlmMvInferenceUI.render();
  assert.equal(inp.getAttribute('aria-invalid'), null);
  assert.equal(w._almLastMvInference().level, 97.5);
});
