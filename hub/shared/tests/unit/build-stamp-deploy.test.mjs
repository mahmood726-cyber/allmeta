// Exports must never claim a commit that is not the one served. shared/build-info.js sat 203
// commits behind main, because a commit cannot contain its own SHA: a stamped copy in git names
// another commit at best and goes on naming it. So git holds an unstamped copy and pages.yml
// stamps only the deployed one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const script = fileURLToPath(new URL('scripts/regen_build_info.py', root));
const committedPath = fileURLToPath(new URL('shared/build-info.js', root));
const python = process.platform === 'win32' ? 'python' : 'python3';
const load = source => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return JSON.parse(JSON.stringify(context.AlmBuildInfo));
};
const regen = (...args) => spawnSync(python, [script, ...args], { encoding: 'utf8' });
const SHA = '0123456789abcdef0123456789abcdef01234567';

test('the committed stamp claims no commit', () => {
  const info = load(read('shared/build-info.js'));
  assert.equal(info.sha, '0'.repeat(40));
  assert.equal(info.shortSha, '0000000');
  assert.equal(info.builtAt, '1970-01-01T00:00:00Z');
});

test('stamping a build output names exactly that commit and leaves the committed file alone', t => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-stamp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = read('shared/build-info.js'), out = join(dir, 'build-info.js');
  const run = regen('--sha', SHA, '--out', out);
  assert.equal(run.status, 0, run.stderr);
  const info = load(readFileSync(out, 'utf8'));
  assert.equal(info.sha, SHA);
  assert.equal(info.shortSha, SHA.slice(0, 7));
  assert.ok(Date.parse(info.builtAt) > Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(info.version, read('CITATION.cff').match(/^version:\s*"?([^"\s]+)"?\s*$/m)[1]);
  assert.equal(read('shared/build-info.js'), before);
});

test('the stamp refuses the committed file and anything that is not a full SHA', t => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-stamp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'build-info.js');
  for (const args of [
    ['--sha', SHA, '--out', committedPath],
    ['--sha', SHA],
    ['--out', out],
    ['--sha', SHA.slice(0, 7), '--out', out],
    ['--sha', '0'.repeat(40), '--out', out],
  ]) {
    const run = regen(...args);
    assert.equal(run.status, 1, `${args.join(' ')}: ${run.stdout}${run.stderr}`);
    assert.doesNotMatch(run.stderr, /Traceback/);
  }
});

test('pages.yml stamps the site with the deployed commit before uploading it, and verifies it', () => {
  const workflow = read('.github/workflows/pages.yml');
  const build = workflow.indexOf('run: |\n          mkdir -p _site'.replace('\n', workflow.includes('\r\n') ? '\r\n' : '\n'));
  const stamp = workflow.indexOf('regen_build_info.py --sha "$GITHUB_SHA" --out _site/shared/build-info.js');
  const check = workflow.indexOf('grep -qF "sha: \\"$GITHUB_SHA\\"" _site/shared/build-info.js');
  const upload = workflow.indexOf('actions/upload-pages-artifact');
  assert.ok(build >= 0 && build < stamp && stamp < check && check < upload);
  // Stamped in the artifact only: a job that could push would be a commit loop.
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /git (commit|push)/);
});
