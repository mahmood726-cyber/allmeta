// Execute the unchanged probe with the documented pre-existing URL stub repaired
// in memory. No application code, expected values or on-disk harness is changed.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'numeric-probe.cjs'), 'utf8');
const oldStub = 'urlState:Object.assign(noop,{read:()=>null,write:noop})';
assert.equal(source.split(oldStub).length, 2, 'match exactly the documented incomplete stub');
const repaired = source.replace(oldStub, 'urlState:Object.assign(noop,{read:()=>null,write:()=>true,isSuspended:()=>false})');
vm.runInNewContext(repaired, { require, __dirname, console,
  process: { argv: ['node', 'numeric-probe.cjs', path.join(__dirname, '../index.html')] } },
  { filename: 'numeric-probe.cjs (URL stub repaired in memory)' });
