// Expected to exit nonzero: run the unchanged assertions on the pre-repair PR head.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { read, sources } from './p09-replay-harness.mjs';

const replaceOnce = (source, repaired, historical) => {
  assert.equal(source.split(repaired).length, 2, 'repair reversal must match exactly once');
  return source.replace(repaired, historical);
};
const verify = (source, expected, label) => {
  assert.equal(createHash('sha256').update(source).digest('hex'), expected, label + ' pre-repair LF SHA-256');
};
const repairedRun = [
  '      run: function (options) {',
  '        var savedAxis = _axisState;',
  '        try {',
  '          // Published-corpus DOM checks use the default automatic linear plot.',
  '          if (options && options.corpus) _axisState = {};',
  '          run({suppressURL:true});',
  '        } finally { _axisState = savedAxis; }',
  '      }, parse: parseTable,'
].join('\n');
const page = replaceOnce(read('proportion-ma/index.html'), repairedRun,
  '      run: function () { run({suppressURL:true}); }, parse: parseTable,');
verify(page, '383cdb8353c670d803379efea5e7baafa694e0d70331c017eceabfcd80e81f66', 'page');
sources.page = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function drawForest('));
sources.adapter = replaceOnce(sources.adapter,
  "['res-body','het','forest','k-warn','forest-axis-error']",
  "['res-body','het','forest','k-warn']");
sources.adapter = replaceOnce(sources.adapter,
  "api.run({corpus:true});const a=api.snapshot(),status=a?'ok':'refused';",
  "api.run();const a=api.snapshot(),status=a?'ok':'refused';");
verify(sources.adapter, '269e98130b7bc1a9732011cc059fb1fa73f160cd9fa43a1e9ef8d3df43a92b74', 'adapter');
console.log('P09 historical sources match both recorded pre-repair LF hashes.');
await import('./p09-replay.test.mjs');
