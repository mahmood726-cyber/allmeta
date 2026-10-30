// Execute the actual DOM snapshot, including structuredClone, before exporting R.
import './p16-test-deps.cjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { labels, plainLabels, rowsFor } from './p16-pair-identity-support.mjs';

const require = createRequire(import.meta.url);
const { harness } = require('../nma-inconsistency-dom.cjs');
const failures = [];
function check(name, assertion) {
  try { assertion(); } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}
for (const [kind, names] of [['plant', labels], ['control', plainLabels]]) {
  for (const model of ['FE', 'DL', 'PM']) {
    const name = `${kind}-${model}`;
    const { c, document } = harness();
    const text = rowsFor(names).map(r => [r.A, r.B, r.te, r.se, r.study]
      .map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n');
    document.getElementById('f-model').value = model;
    c.__almIncoLoad(text);
    const adapter = c.AlmIncoValidationAdapter, live = adapter.live;
    const before = JSON.stringify(adapter.snapshot()), snapshot = live.currentState();
    // Keep every assertion, but collect failures so one display mismatch cannot
    // prevent the other cases or their native-R checks from producing evidence.
    check(name, () => assert.equal(JSON.stringify(adapter.snapshot()), before, 'snapshot restores displayed state'));
    check(name, () => assert.ok(snapshot.values.filter(v => v.key.startsWith('display.')).every(v => v.value),
      JSON.stringify(snapshot.values.filter(v => v.key.startsWith('display.')))));
    check(name, () => assert.equal(new Set(snapshot.state.nodeSplit.map(s => s.pairKey)).size, 6,
      'all six identities survive the cloned live snapshot'));
    // The hosted validator serialises the snapshot before building its R script.
    // Only top-level serialisable pairKeys, never non-enumerable fit metadata, may cross.
    const script = live.buildScript(JSON.parse(JSON.stringify(snapshot)));
    const namesLine = script.match(/^names_app <- (.*)$/m)[1];
    const keys = [...namesLine.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(m => JSON.parse(m[0]));
    check(name, () => assert.equal(keys.length, 6));
    check(name, () => assert.equal(new Set(keys).size, 6));
    writeFileSync(join(tmpdir(), `p16-r3-live-${name}.R`), script);
    writeFileSync(join(tmpdir(), `p16-r3-live-${name}.json`), JSON.stringify({
      values: snapshot.values, rules: live.compare,
    }, null, 2));
    console.log(`P16_LIVE_SNAPSHOT ${name}: ${JSON.stringify({
      pairs: new Set(keys).size, display: snapshot.values.filter(v => v.key.startsWith('display.')),
      failures: failures.filter(f => f.startsWith(name + ':')),
    })}`);
  }
}
assert.deepEqual(failures, [], 'all six live snapshots must satisfy every original assertion');
