import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p11-csv-labels.test.mjs';
const dependencies = [suite, 'influence/index.html', 'hub/shared/csv-upload.js',
  'hub/shared/analysis-lifecycle.js', 'shared/ma-core.js',
  'shared/diagnostic-plots.js', 'influence/influence-extra.js'];
const lf = text => text.replace(/\r\n/g, '\n');
const sha256LF = bytes => createHash('sha256').update(lf(bytes.toString('utf8'))).digest('hex');

// The review identified precisely these eight added lines. Fail closed if the
// patch changes: this is a reconstructed pre-guard source, not a historical checkout.
const guard = String.raw`      // Native input has one study per line; decoded label newlines would become records.
      if (rows.some(function (r) { return /[\r\n]/.test(r.study); })) {
        window.__almRestore({}); // Clear input and stale results through the normal run lifecycle.
        var error = document.getElementById('input-error');
        error.textContent = 'CSV import refused: study labels cannot contain line breaks. Replace label line breaks with spaces and import again.';
        error.hidden = false;
        return;
      }
`;

for (const newline of ['LF', 'CRLF']) {
  test(`P11 evidence: unchanged assertions distinguish pre-guard and fixed source (${newline})`, t => {
    const sources = new Map(dependencies.map(path => [path, readFileSync(new URL(path, root))]));
    const fixed = lf(sources.get('influence/index.html').toString('utf8'));
    assert.equal(fixed.split(guard).length, 2, 'Remove exactly one known eight-line guard');
    assert.equal(guard.split('\n').length - 1, 8);
    const old = fixed.replace(guard, '');
    const parent = resolve(tmpdir());
    const temporary = mkdtempSync(join(parent, 'p11-old-source-'));
    // Validate the absolute deletion target before using recursive cleanup.
    const child = relative(parent, resolve(temporary));
    assert.ok(child && !isAbsolute(child) && child !== '..' && !child.startsWith('..' + '/') && !child.startsWith('..' + '\\'));
    try {
      for (const [path, bytes] of sources) {
        const target = join(temporary, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      }
      // Preserve all 126 original test lines, including their raw checkout bytes.
      assert.deepEqual(readFileSync(join(temporary, suite)), sources.get(suite));
      const execute = source => {
        const checkout = newline === 'CRLF' ? source.replace(/\n/g, '\r\n') : source;
        writeFileSync(join(temporary, 'influence/index.html'), checkout);
        assert.equal(sha256LF(Buffer.from(checkout)), sha256LF(Buffer.from(source)));
        const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
          cwd: temporary, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
          // A nested runner must not inherit the parent's node:test context.
          // These built-in-only tests need no inherited environment values.
          env: {},
        });
        assert.ifError(run.error);
        assert.equal(run.signal, null);
        return run;
      };
      const before = execute(old);
      const after = execute(fixed);
      t.diagnostic(JSON.stringify({ newline, node: process.version,
        hashesLF: Object.fromEntries([...sources].map(([path, bytes]) => [path, sha256LF(bytes)])),
        reconstructedOldHtmlSha256LF: sha256LF(Buffer.from(old)),
        before: { exit: before.status }, after: { exit: after.status } }));
      // Retain TAP assertion evidence in the wrapper output, not in the source tree.
      t.diagnostic('RECONSTRUCTED OLD SOURCE\n' + before.stdout + before.stderr);
      t.diagnostic('FIXED SOURCE\n' + after.stdout + after.stderr);
      assert.equal(before.status, 1, before.stdout + before.stderr);
      assert.equal(after.status, 0, after.stdout + after.stderr);
      for (const ending of ['LF', 'CRLF', 'CR']) {
        const name = `plant P11-R2: quoted ${ending} label cannot inject an analysis study`;
        const block = before.stdout.split(`# Subtest: ${name}\n`)[1]?.split('# Subtest:')[0];
        assert.ok(block, `Missing old-source result: ${name}`);
        assert.match(block, /not ok \d+ - plant P11-R2:/);
        assert.match(block, /Multiline import must be refused; analysed rows:/);
        assert.match(block, /code: 'ERR_ASSERTION'/);
        assert.match(block, /expected: 0/);
        assert.match(block, /actual: 4/);
        assert.ok(after.stdout.includes(`ok ${['LF', 'CRLF', 'CR'].indexOf(ending) + 1} - ${name}`));
      }
      for (const name of [
        'control P11-R2: quoted comma and escaped quote preserve three studies and numerical results',
        'control P11-R2: literal backslash-n in a single-line label remains accepted',
      ]) {
        assert.ok(before.stdout.includes(`- ${name}\n`), `Missing old-source control: ${name}`);
        assert.ok(after.stdout.includes(`- ${name}\n`), `Missing fixed-source control: ${name}`);
        assert.ok(!before.stdout.includes(`not ok 4 - ${name}`) && !before.stdout.includes(`not ok 5 - ${name}`));
      }
      for (const [run, passed, failed] of [[before, 2, 3], [after, 5, 0]]) {
        assert.match(run.stdout, /^# tests 5$/m);
        assert.ok(run.stdout.includes(`# pass ${passed}\n`));
        assert.ok(run.stdout.includes(`# fail ${failed}\n`));
        assert.match(run.stdout, /^# skipped 0$/m);
        assert.match(run.stdout, /^# cancelled 0$/m);
        assert.match(run.stdout, /^# todo 0$/m);
      }
      for (const [path, bytes] of sources) {
        assert.deepEqual(readFileSync(new URL(path, root)), bytes, `Replay must not change ${path}`);
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
