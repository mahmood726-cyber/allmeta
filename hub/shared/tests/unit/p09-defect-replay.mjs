import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const root = new URL('../../../../', import.meta.url);
export const lf = text => text.replace(/\r\n/g, '\n');
export const page = lf(readFileSync(new URL('proportion-ma/index.html', root), 'utf8'));

// Reconstruct only the defects described in CXTASK.md's review. This is a
// mutation of the supplied PR head, NOT an authenticated historical checkout.
// All numerical code and all existing test assertions remain byte-identical.
export function plantLegacyDefects(source) {
  const start = source.indexOf('    function parseTable(text) {');
  const end = source.indexOf('    // --- inverse beta', start);
  assert.ok(start >= 0 && end > start, 'parser mutation anchors');
  let mutated = source.slice(0, start) + `    function parseTable(text) {
      var rows = [];
      text.trim().split(/\\n/).forEach(function (l, i) {
        var parts = l.split(/,/).map(function (s) { return s.trim(); });
        var x = parseInt(parts[0], 10), n = parseInt(parts[1], 10);
        if (!Number.isFinite(x) || !Number.isFinite(n) || n <= 0) return;
        if (x < 0 || x > n) return;
        rows.push({ x: x, n: n, label: parts[2] || ('Study ' + (i + 1)) });
      });
      return rows;
    }

` + source.slice(end);
  const refusalStart = mutated.indexOf('    function refuse(message) {');
  const refusalEnd = mutated.indexOf('    function run(options) {', refusalStart);
  assert.ok(refusalStart >= 0 && refusalEnd > refusalStart, 'refusal mutation anchors');
  mutated = mutated.slice(0, refusalStart) + mutated.slice(refusalEnd);
  function replaceOnce(before, after) {
    assert.equal(mutated.split(before).length, 2, 'unique mutation anchor: ' + before);
    mutated = mutated.replace(before, after);
  }
  replaceOnce(`      var rows;
      try { rows = parseTable(text); }
      catch (error) { refuse(error.message); return; }`,
    '      var rows = parseTable(text);');
  replaceOnce("        refuse('Need at least 2 studies.');",
    `        document.getElementById('res-body').innerHTML = '<tr><td colspan="5">Need at least 2 studies.</td></tr>';
        _lastResults = null;`);
  replaceOnce(`      var rows;
      try { rows = parseTable(document.getElementById('src').value); }
      catch (error) { return []; }`,
    "      var rows = parseTable(document.getElementById('src').value);");
  return mutated;
}

export function replayLegacyTests() {
  const directory = mkdtempSync(path.join(tmpdir(), 'p09-legacy-defects-'));
  const files = [
    'shared/ma-core.js', 'hub/shared/analysis-lifecycle.js',
    'hub/shared/tests/unit/p09-proportion-harness.mjs',
    'hub/shared/tests/unit/p09-dictate-input.test.mjs',
    'hub/shared/tests/unit/p09-dictate-refusal.test.mjs',
  ];
  for (const name of files) {
    const destination = path.join(directory, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(new URL(name, root), destination);
  }
  const oldPage = plantLegacyDefects(page);
  mkdirSync(path.join(directory, 'proportion-ma'));
  writeFileSync(path.join(directory, 'proportion-ma/index.html'), oldPage);
  const result = spawnSync(process.execPath, [
    '--test', '--test-reporter=tap', ...files.filter(name => name.endsWith('.test.mjs')),
  ], {
    cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 120000,
    // A child inheriting node:test's context refuses to run this second suite
    // recursively and exits 0 without executing assertions. Start an isolated
    // runner without reading or forwarding the parent process environment.
    // process.execPath is absolute; the copied tests use only Node builtins.
    env: {},
  });
  const log = path.join(directory, 'results.tap');
  writeFileSync(log, (result.stdout || '') + (result.stderr || ''));
  assert.ifError(result.error);
  assert.equal(result.status, 1, 'planted defects must fail the unchanged suites; see ' + log);
  const outcomes = [...result.stdout.matchAll(/^(not ok|ok) \d+ - (P09-D3 (plant|control): .+)$/gm)]
    .map(([, verdict, name, kind]) => ({ name, kind, passed: verdict === 'ok' }));
  assert.equal(outcomes.length, 29, 'every existing case must execute; see ' + log);
  assert.equal(new Set(outcomes.map(row => row.name)).size, 29);
  assert.equal(outcomes.filter(row => row.kind === 'plant').length, 23);
  assert.equal(outcomes.filter(row => row.kind === 'control').length, 6);
  for (const row of outcomes) assert.equal(row.passed, row.kind === 'control', row.name);
  const digest = text => createHash('sha256').update(lf(text), 'utf8').digest('hex');
  const evidence = {
    provenance: 'Reconstructed legacy defects; historical source unavailable',
    currentPageSha256LF: digest(page), mutantPageSha256LF: digest(oldPage),
    log, outcomes,
  };
  writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(replayLegacyTests(), null, 2));
}
