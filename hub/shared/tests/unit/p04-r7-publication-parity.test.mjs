import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../../../shared/nma-multiarm-v1.js';
import { jobsOf, runAll, checkDataset } from '../_nma_parity_check.mjs';

// Replay the existing publication gate, with its fixture and tolerances unchanged.
const fixture = JSON.parse(readFileSync(new URL('../_nma_parity_fixture.json', import.meta.url), 'utf8'));
for (const ds of fixture.datasets) {
  test(`control: unchanged publication parity ${ds.dataset}`, () => {
    const { bad, n } = checkDataset(ds, runAll(jobsOf(ds)));
    assert.ok(n >= ds.fits.length);
    assert.deepEqual(bad, []);
  });
}
