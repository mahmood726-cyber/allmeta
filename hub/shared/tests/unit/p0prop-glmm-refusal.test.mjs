import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pageHarness} from '../fixtures/p0prop/page-harness.mjs';
import {valid, withBadRow} from '../fixtures/p0prop/cases.mjs';

// Synthetic fit for exercising UI state; no claim of statistical parity.
const fit = {status:'ok', values:{k:5, mu:-2, se:0.1, tau2:0.02,
  estimate:0.12, ciLo:0.10, ciHi:0.14, piLo:0.08, piHi:0.17}};
function setup() {
  const page = pageHarness(), {context, el} = page;
  // Only the table construction API used by the real GLMM renderer is stubbed.
  context.document.createElement = () => ({
    createTHead: () => ({insertRow: () => ({append(){}})}),
    createTBody: () => ({insertRow: () => ({dataset:{}, insertCell: () => ({})})}),
  });
  el('plus-result').replaceChildren = (...children) => {
    el('plus-result').innerHTML = children.length ? '<table>fit</table>' : '';
  };
  context.structuredClone = structuredClone;
  context.MutationObserver = class { observe() {} };
  for (const name of ['plus-core.js', 'plus-parity.js', 'plus-ui.js']) {
    vm.runInContext(fs.readFileSync(new URL('../../../../proportion-ma/'+name, import.meta.url),'utf8'), context);
  }
  page.run(valid);
  return page;
}
function refuseCSV(page) {
  const csv = 'events,total,label\n'+withBadRow('12.5,150,Bad study');
  page.widgets.csvUpload.onParse(page.widgets.csvUpload.parse(csv));
  assert.equal(page.context._almLastPropMA(), null);
}
function assertCleared(page) {
  assert.equal(page.el('plus-result').innerHTML, '', 'previous GLMM must not remain on screen');
  assert.equal(page.el('plus-export').disabled, true);
  assert.throws(() => page.context.AlmPropPlus.exported(), /Run the GLMM/);
}

test('plant: refused CSV invalidates the displayed GLMM and its export; valid control recovers', () => {
  const page = setup(), plus = page.context.AlmPropPlus;
  plus.render(fit, null, 'synthetic UI control');
  assert.deepEqual(JSON.parse(plus.exported()).result, fit);
  assert.equal(page.el('plus-export').disabled, false);
  refuseCSV(page);
  assertCleared(page);
  page.run(valid);
  plus.render(fit, null, 'synthetic UI control');
  assert.deepEqual(JSON.parse(plus.exported()).result, fit);
  assert.equal(page.el('plus-export').disabled, false);
});

test('plant: refused CSV cancels a pending GLMM result; a new valid fit still completes', async () => {
  const page = setup(), plus = page.context.AlmPropPlus;
  const response = {ok:true, stdout:'ALMJSON:'+JSON.stringify({status:fit.status,...fit.values}), versions:{metafor:'test'}};
  let complete;
  page.context.AlmWebR = {runR: () => new Promise(resolve => { complete = resolve; })};
  const pending = plus.run();
  assert.equal(typeof complete, 'function');
  refuseCSV(page);
  complete(response);
  await pending;
  assertCleared(page);
  page.context.AlmWebR.runR = async () => response;
  await plus.run();
  assert.deepEqual(JSON.parse(plus.exported()).result, fit);
  assert.equal(page.el('plus-export').disabled, false);
});

test('control: GLMM still displays its own insufficient-studies refusal', async () => {
  const page = setup();
  page.el('src').value = '1,10,A';
  page.context.AlmWebR = {runR: async () => ({ok:true,
    stdout:'ALMJSON:{"status":"refused","reason":"insufficient_studies"}', versions:{metafor:'test'}})};
  await page.context.AlmPropPlus.run();
  assert.deepEqual(JSON.parse(page.context.AlmPropPlus.exported()).result,
    {status:'refused',reason:'insufficient_studies'});
  assert.equal(page.el('plus-status').textContent, 'GLMM refused: insufficient_studies');
});
