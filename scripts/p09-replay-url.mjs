// Allow-listed entry point: node scripts/p09-replay-url.mjs
// Reintroduces the reviewed ignored-write-refusal defect; no git/history required.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const files = ['proportion-ma/index.html', 'shared/ma-core.js', 'hub/shared/url-state.js',
  'hub/shared/analysis-lifecycle.js', 'hub/shared/tests/unit/p09-r7-url-state.test.mjs'];
const temporary = mkdtempSync(join(tmpdir(), 'p09-url-replay-'));
try {
  for (const file of files) {
    let source = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    if (file === 'proportion-ma/index.html') {
      const start = source.indexOf('      // URL state\n');
      const end = source.indexOf('\n    }\n\n    var esc', start);
      assert.ok(start > 0 && end > start, 'locate the production URL write block');
      source = source.slice(0, start) + `      // URL state: reviewed legacy behavior ignores the writer's refusal.
      if (!(options && options.suppressURL) && window.alm && window.alm.urlState) {
        window.alm.urlState.write({ src: text, trans: trans, tau: tauEst });
      }` + source.slice(end);
      source = source.replace(/^.*id="share-data-note".*\n/m, '');
    }
    const target = join(temporary, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'hub/shared/tests/unit/p09-r7-url-state.test.mjs'],
    { cwd: temporary, encoding: 'utf8' });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  assert.equal(result.status, 1, 'the planted legacy defect must fail');
  assert.match(result.stdout, /# tests 9\b/);
  assert.match(result.stdout, /# pass 4\b/);
  assert.match(result.stdout, /# fail 5\b/);
  console.log('REPLAY VERIFIED: five unchanged regressions fail; four unchanged controls pass.');
  console.log('This is a behavior reconstruction, not an authenticated missing base checkout.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
