// Verify the complete historical app, not just the denominator expression.
// Work with LF source regardless of the checkout's line endings. The retained
// historical digest was recorded with CRLF; reconstruct that serialization only
// for comparison with that immutable record.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appSource } from './p16-dl-harness.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifiedSources(source = appSource) {
  const fixed = source.replace(/\r\n/g, '\n');
  const patch = [
    '      // C and sumW both scale as inverse squared measurement units. Judge',
    '      // cancellation relative to sumW, so a change of units cannot zero tau2.',
    '      if (denom <= Number.EPSILON * sumW) return 0;',
  ].join('\n');
  assert.equal(fixed.split(patch).length, 2, 'Reverse exactly one production patch');
  const old = fixed.replace(patch, '      if (denom <= 1e-12) return 0;');
  const historicalSha256 = sha256(old.replace(/\n/g, '\r\n'));
  assert.equal(historicalSha256, 'ce9a05a6bcd468f1b8d5ce655bd7e793f50e0d20084e5f36fa7cc9b386b43d54',
    'Reconstructed source must match the recorded pre-fix app byte for byte');
  return { old, fixed, historicalSha256 };
}
