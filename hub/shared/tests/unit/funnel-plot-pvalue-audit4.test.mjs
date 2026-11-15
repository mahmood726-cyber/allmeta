// funnel-plot Egger p display (lane audit4). On the default example the Egger test gives
// p = 1.286e-4 (R 4.6.0: summary(lm(I(yi/sei) ~ I(1/sei))), t = -6.868, df = 8); the page
// printed "0.000" in the stat card and in the plot's Egger line - a p-value is never 0.
// A p below 0.001 must read "<0.001"; ordinary p keep three decimals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

function load(data) {
  const storage = data ? { 'funnel-plot-v1': JSON.stringify({ data, center: 'fe', nullVal: '0', title: 't', effect: 'Effect' }) } : {};
  return loadPage('funnel-plot/index.html', {
    shared: ['shared/ma-core.js', 'shared/trimfill.js', 'shared/doi-lfk.js'],
    pick: s => s.includes('"funnel-plot-v1"') && s.includes('function render()'),
    storage,
  });
}

test('funnel-plot: Egger p < 0.001 is shown as "<0.001", never "0.000"', () => {
  const p = load();
  const egg = p.ctx._almLastEgg();
  assert.ok(Math.abs(egg.p - 0.0001286271) < 1e-8, `egger p ${egg.p} vs R 0.0001286271`);
  const stats = text(p.el('stats-wrap').innerHTML), svg = text(p.el('svg-host').innerHTML);
  assert.doesNotMatch(stats + ' ' + svg, /0\.000\b/, stats);
  assert.match(stats, /p-value <0\.001/, stats);
  assert.match(svg, /p < 0\.001/, svg);
});

test('funnel-plot: an ordinary Egger p keeps three decimals (BCG, R p = 0.1909)', () => {
  const bcg = [[-0.8893, 0.5706], [-1.5854, 0.4411], [-1.3481, 0.6445], [-1.4416, 0.1414], [-0.2175, 0.2263],
    [-0.7861, 0.0831], [-1.6209, 0.4722], [0.012, 0.0632], [-0.4694, 0.2375], [-1.3713, 0.2702],
    [-0.3394, 0.1114], [0.4459, 0.7297], [-0.0173, 0.2672]].map((r, i) => `S${i + 1}, ${r[0]}, ${r[1]}`).join('\n');
  const p = load(bcg);
  assert.match(text(p.el('stats-wrap').innerHTML), /p-value 0\.191/);
  assert.match(text(p.el('svg-host').innerHTML), /p = 0\.191/);
});
