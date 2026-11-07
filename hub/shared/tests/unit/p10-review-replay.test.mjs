import test from 'node:test';
import { replay, verify } from '../p10-review-replay.mjs';

test('plant P10 review replay: unchanged suite rejects the reconstructed missing live container with three passing controls', () => {
  verify(replay({ plant: true }), true);
});

test('control P10 review replay: unchanged suite accepts the supplied page', () => {
  verify(replay(), false);
});
