// Run the existing pinned numerical replay without editing its script or corpora.
// Its older URL-state stub lacks the page's isSuspended API; supply only that stub.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const replay = new URL('../../../../gosh/validate/replay-numeric.cjs', import.meta.url);
const source = readFileSync(replay, 'utf8');
const oldStub = 'read:()=>null,write:noop';
assert.equal(source.split(oldStub).length, 2, 'Expected exactly one legacy URL-state stub');
vm.runInNewContext(source.replace(oldStub, oldStub + ',isSuspended:()=>true'), {
  require: createRequire(replay),
  __dirname: dirname(fileURLToPath(replay)),
  process,
  console,
}, { filename: fileURLToPath(replay) });
