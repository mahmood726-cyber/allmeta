import test from 'node:test';
import { replayReports, assertReplay } from './p17-report-replay.mjs';

test('P17 replay control: all fifteen unchanged report assertions pass on the PR head', t => {
  const run = replayReports();
  t.diagnostic('Full TAP and source hashes: ' + run.directory);
  assertReplay(run);
  run.stdout.split('\n').filter(line => /^(not ok|ok) \d+ - /.test(line)).forEach(line => t.diagnostic(line));
});

test('P17 replay plant: missing methods callbacks fail all ten plants and pass all five controls', t => {
  const run = replayReports(true);
  t.diagnostic('Full TAP and source hashes: ' + run.directory);
  assertReplay(run, true);
  run.stdout.split('\n').filter(line => /^(not ok|ok) \d+ - /.test(line)).forEach(line => t.diagnostic(line));
});
