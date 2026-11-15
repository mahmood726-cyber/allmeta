// workbench I² display contract (lane audit4). The headline, the heterogeneity tile and
// the report must show ONE definition of I² for the point and its 95% CI. The CI is the
// Q-profile CI of the τ²-based I² (metafor confint), so the displayed point must be the
// τ²-based I² too (metafor rma I2), not the Q-based (Q-df)/Q.
// Before the fix BCG showed "92.1% [81.9, 97.7]": Q-based point, τ²-based bracket.
// References: R 4.6.0, metafor 5.2.1, rma(yi, sei = sei, method = "PM"); confint()
// (lane audit4 run/wbi2.R, out/wbi2_R.txt).
// The oracle-pinned Q-based value stays available as pool.I2 (workbench-parity.spec.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const BCG = [[-0.8893, 0.5706], [-1.5854, 0.4411], [-1.3481, 0.6445], [-1.4416, 0.1414], [-0.2175, 0.2263],
  [-0.7861, 0.0831], [-1.6209, 0.4722], [0.012, 0.0632], [-0.4694, 0.2375], [-1.3713, 0.2702],
  [-0.3394, 0.1114], [0.4459, 0.7297], [-0.0173, 0.2672]];
const R = { I2: 92.3182301964, I2lo: 81.8926670085, I2hi: 97.674149369, I2Q: 92.0993766805 };

function load() {
  const data = BCG.map((r, i) => `S${i + 1}, ${r[0]}, ${r[1]}`).join('\n');
  return loadPage('workbench/index.html', {
    shared: ['shared/ma-core.js', 'shared/heterogeneity-ci.js'],
    pick: s => s.includes('"workbench-v1"'),
    storage: { 'workbench-v1': JSON.stringify({ data, title: 'BCG' }) },
  });
}

test('workbench: pooled I² point uses the same (τ²-based) definition as its Q-profile CI', () => {
  const p = load();
  const pool = p.ctx.__almWorkbench(BCG.map(r => ({ est: r[0], se: r[1] })));
  assert.ok(Math.abs(pool.I2tau - R.I2) < 1e-4, `I2tau ${pool.I2tau} vs metafor ${R.I2}`);
  assert.ok(Math.abs(pool.I2Lo - R.I2lo) < 0.05 && Math.abs(pool.I2Hi - R.I2hi) < 0.05, `CI ${pool.I2Lo}, ${pool.I2Hi}`);
  assert.ok(pool.I2tau >= pool.I2Lo && pool.I2tau <= pool.I2Hi);
  assert.ok(Math.abs(pool.I2 - R.I2Q) < 1e-6, `oracle-pinned Q-based I2 must be unchanged: ${pool.I2}`);
});

test('workbench: headline, tile and tile caption display the τ²-based I² with its CI', () => {
  const p = load();
  const head = text(p.el('headline').innerHTML);
  assert.match(head, /92\.3% \[81\.9, 97\.7\]/, head);
  assert.doesNotMatch(head, /92\.1%/, 'Q-based point must not be paired with the τ²-based CI');
  assert.match(text(p.el('tile-het').innerHTML), /92\.3%\s+\[81\.9, 97\.7\]/);
  assert.match(p.el('tile-het-stat').textContent, /I²=92\.3%/);
});
