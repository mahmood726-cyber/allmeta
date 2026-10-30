import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('meta-regression/index.html');
const fixture = JSON.parse(read('hub/shared/tests/fixtures/p08-axis-legacy.json'));
const suitePath = 'hub/shared/tests/unit/p08-axis-limits.test.mjs';
const lf = source => source.replace(/\r\n/g, '\n');

function replaceOnce(source, pattern, replacement) {
  assert.equal([...source.matchAll(new RegExp(pattern.source, 'g'))].length, 1,
    'source reconstruction must replace exactly one block');
  return source.replace(pattern, () => replacement);
}

function originalLoops(source) {
  let original = replaceOnce(lf(source),
    /    function niceTicks\(lo,hi,n\) \{[\s\S]*?\n    \}/, fixture.niceTicks);
  original = replaceOnce(original,
    /        \/\/ Sample by index:[^\n]*\n        const intervals = 200;\n        for \(let i = 0; i <= intervals; i\+\+\) \{\n          const xv = [^\n]+;/,
    fixture.sampling);
  assert.equal(createHash('sha256').update(original, 'utf8').digest('hex'), fixture.sha256LF,
    'reconstruction must match the unchanged LF hash of the supplied PR head');
  return original;
}

function runSuite(source, pattern) {
  const directory = mkdtempSync(join(tmpdir(), 'p08-axis-replay-'));
  try {
    for (const [path, content] of [
      ['meta-regression/index.html', source],
      ['hub/shared/analysis-lifecycle.js', read('hub/shared/analysis-lifecycle.js')],
      [suitePath, read(suitePath)],
    ]) {
      const destination = join(directory, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, 'utf8');
    }
    const args = ['--test', '--test-reporter=tap'];
    if (pattern) args.push('--test-name-pattern=' + pattern);
    args.push(join(directory, suitePath));
    const result = spawnSync(process.execPath, args, {
      cwd: directory, encoding: 'utf8', timeout: 30000, windowsHide: true,
      // An independent runner must not inherit node:test's recursive-run marker.
      // The absolute executable and suite paths need no inherited environment.
      env: {},
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'replay must complete, not be killed');
    const output = lf(result.stdout + result.stderr);
    assert.equal(result.status, 1, output);
    return {
      output,
      failures: [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1]),
    };
  } finally {
    // Delete only the exact temporary directory created for this replay.
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('p08-axis-replay-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('P08 provenance: LF and CRLF reconstruct the same recorded pre-fix source', () => {
  const normalized = lf(html);
  assert.equal(originalLoops(normalized), originalLoops(normalized.replace(/\n/g, '\r\n')));
  assert.throws(() => originalLoops(normalized + '\n<!-- unrelated change -->\n'),
    { code: 'ERR_ASSERTION' }, 'the unchanged hash must still reject unrelated edits');
});

test('P08-R1 replay: original loops time out on all five plants; ordinary axis controls pass', t => {
  const result = runSuite(originalLoops(html));
  const expected = [
    'P08-R1 plant: x adjacent representable bounds at one redraw and export within bounded work',
    'P08-R1 plant: x tiny bounds around zero redraw and export within bounded work',
    'P08-R1 plant: y adjacent representable bounds at one redraw and export within bounded work',
    'P08-R1 plant: y tiny bounds around zero redraw and export within bounded work',
    'P08-R1 plant: ticks stay finite, increasing and inside tiny or subnormal domains',
    // Pass 1 exposed this mislabeled control's five-versus-nine-tick assumption.
    // Keep its assertion unchanged and report its baseline failure explicitly.
    'P08-R1 control: ordinary tick domains retain their readable steps',
  ];
  assert.deepEqual(result.failures, expected, result.output);
  assert.equal([...result.output.matchAll(/code: 'ERR_SCRIPT_EXECUTION_TIMEOUT'/g)].length, 5,
    result.output);
  assert.match(result.output, /^# pass 10$/m);
  assert.match(result.output, /^# fail 6$/m);
  t.diagnostic('Supplied pre-fix head: 10 PASS, 6 FAIL (five VM timeouts and the known tick-count assertion).');
  for (const name of result.failures) t.diagnostic('Observed old-code FAIL: ' + name);
});

test('P08-R4 replay: ignored-axis mutation fails five original plants and passes three controls', t => {
  // This is a planted defect, not a claimed historical checkout. It reproduces
  // the original ignored-axis behavior while retaining the fixed bounded loops.
  const mutated = replaceOnce(lf(html),
    /    function buildSvg\(state, studies, fitted, axis\) \{/,
    '    function buildSvg(state, studies, fitted, axis) {\n      axis = null;');
  const result = runSuite(mutated, '^P08-R4 ');
  assert.deepEqual(result.failures, [
    'P08-R4 plant: axis callback immediately redraws the requested x/y domains',
    'P08-R4 plant: Run analysis retains requested domains and matching ticks',
    'P08-R4 plant: native and shared plot export use the edited domains',
    'P08-R4 plant: one automatic edge and clearing limits retain automatic geometry',
    'P08-R4 plant: narrowed domains clip marks while keeping axes outside the clip',
  ], result.output);
  assert.match(result.output, /^# pass 3$/m);
  assert.match(result.output, /^# fail 5$/m);
  t.diagnostic('Ignored-axis mutation: all five original plants FAIL; all three original controls PASS.');
  for (const name of result.failures) t.diagnostic('Observed mutation FAIL: ' + name);
});
