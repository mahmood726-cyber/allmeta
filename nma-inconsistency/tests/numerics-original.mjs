// Run the identical regression assertions against the immutable pre-fix source.
// Deliberately outside unit/*.test.mjs: its defects are expected to fail.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { useOriginalForReproduction } from './numerics-harness.mjs';
const source = readFileSync(new URL('./fixtures/p16-original-source.json', import.meta.url));
assert.equal(createHash('sha256').update(source).digest('hex'), 'c4e2f59a0f96da8264bd3de141acfc8236bf610192cb0587e0fcebaf1ac91b19');
useOriginalForReproduction(JSON.parse(source));
await import('../../hub/shared/tests/unit/p16-numerics.test.mjs');
