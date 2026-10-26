import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const controls = Object.fromEntries(['f-data', 'f-view', 'f-title'].map(id => [id, { value: 'original', dispatchEvent() {} }]));
  const axes = ['min', 'max'].map(() => ({ value: '', dispatchEvent() {} }));
  const context = {
    document: {
      getElementById: id => controls[id],
      querySelector: selector => axes[selector.includes('"min"') ? 0 : 1]
    },
    Event: class { constructor(type) { this.type = type; } }
  };
  vm.runInNewContext(readFileSync(new URL('../../../../cumulative-subgroup/alm-features.js', import.meta.url), 'utf8'), context);
  return { share: context.AlmCumSubFeatures.share, controls, axes };
}

// Number() accepts these strings, but input[type=number] sanitizes them to empty.
// A share link must fail atomically instead of silently dropping a bound.
test('share rejects axis strings that HTML number inputs cannot preserve', () => {
  for (const value of ['0x10', '0b10', '0o10', ' 1', '1 ', '+1', '1.']) {
    const { share } = fixture();
    const before = JSON.stringify(share.get());
    assert.throws(() => share.set({ data: 'new data', view: 'subgroup', title: 'new title', axis: [value, '20'] }), /axis limits/, value);
    assert.equal(JSON.stringify(share.get()), before, value + ' must not mutate any controls');
  }
});

test('share preserves empty, decimal and exponent axis bounds, including refused ranges', () => {
  for (const bounds of [['', ''], ['-.5', '2.5'], ['-1e+2', '2E-1'], ['2', '1']]) {
    const { share } = fixture();
    const state = { data: 'A, 0.1, 0.2', view: 'cumulative', title: 'Control', axis: bounds };
    share.set(state);
    assert.equal(JSON.stringify(share.get()), JSON.stringify(state));
  }
});
