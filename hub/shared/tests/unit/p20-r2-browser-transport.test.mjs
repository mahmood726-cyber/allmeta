import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { browserTransport, retargetSpec } from '../p20-r2-browser-transport.mjs';

const original = readFileSync(new URL('../evalue-parity.spec.mjs', import.meta.url), 'utf8');
const originalOrigin = 'http://localhost:8088';

test('plant P20-R2 runner: occupied legacy port does not select an unrelated server', async () => {
  const occupied = createServer();
  try {
    await new Promise((resolve, reject) => {
      // A server already using 8088 is also a valid reproduction of the failure.
      occupied.once('error', error => error.code === 'EADDRINUSE' ? resolve() : reject(error));
      occupied.listen(8088, '127.0.0.1', resolve);
    });
    const result = await browserTransport(original);
    assert.notEqual(result.port, 8088, 'must not select the occupied historical port');
    assert.equal(result.origin, `http://127.0.0.1:${result.port}`);
    assert.equal(result.source, retargetSpec(original, result.origin));
  } finally {
    if (occupied.listening) await new Promise(resolve => occupied.close(resolve));
  }
});

test('control P20-R2 runner: retargeting preserves every browser assertion and reference', () => {
  const origin = 'http://127.0.0.1:49152';
  const copied = retargetSpec(original, origin);
  assert.equal(copied.replace(origin, originalOrigin), original,
    'only the transport origin may differ from the repository spec');
});

test('control P20-R2 runner: unexpected browser URL declarations fail closed', () => {
  assert.throws(() => retargetSpec('', 'http://127.0.0.1:49152'), /exactly one/);
  assert.throws(() => retargetSpec(original + original, 'http://127.0.0.1:49152'), /exactly one/);
});
