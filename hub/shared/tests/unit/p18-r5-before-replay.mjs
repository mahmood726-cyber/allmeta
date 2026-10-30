// Replay the same assertions against retained old numerical source in a temporary tree.
// Expected old-code failures are checked by name; unexpected failures fail this runner.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const unit = 'hub/shared/tests/unit/';
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const source = read('shared/multivariate-ma.js');
const baseline = read('multivariate-ma/validate/diagnostic/baseline-engine.cjs');
function section(text, start, end) {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Source markers: ${start}, ${end}`);
  return text.slice(from, to);
}
const objStart = '  function _obj2(', objEnd = '\n  // Observational only:';
const currentObj = section(source, objStart, objEnd);
const reviewed = source.replace(currentObj, read(unit + 'p18-r5-reviewed-obj2.txt'));
const rankStart = '      // At a rank-one boundary', rankEnd = '      // Confirm the exact zero boundary';
// This is a numerical reconstruction, not a claim to possess the original PR base tree.
// Both restored blocks are actual source from the retained pre-diagnostic engine.
const prePR = source.replace(currentObj, section(baseline, objStart, '\n  function fit('))
  .replace(section(source, rankStart, rankEnd), section(baseline, rankStart, rankEnd));

const reviewFailures = [
  'plant P18-R5 review: R provenance survives a CRLF checkout',
  'plant P18-R5 review: representable PD margin survives rounded square roots',
  'plant P18-R5 review: scaled PD margin survives at binary exponent -700',
  'plant P18-R5 review: scaled PD margin survives at binary exponent 700',
  'plant P18-R5 review: Berkey preserves every pre-diagnostic fit field exactly',
  'plant P18-R5 review: weak identification preserves every pre-diagnostic fit field exactly'
];
const prePRFailures = [
  ...[1e-200, 1e200].flatMap(v => [
    `plant P18-R5: zero-effect bivariate objective remains finite at variance ${v}`,
    `plant P18-R5: correlated bivariate objective matches fresh R at scale ${v}`,
    `plant P18-R5: full zero-effect fit reaches G=0 at variance ${v}`
  ]),
  'plant P18-R5: rank polish tolerates a failed numerical profile',
  ...[2, 3, 6].map(n => `plant P18-R5: rank profile failure at call ${n}`)
];

function replay(label, engine, suites, expected, rawHash = false) {
  const scratch = mkdtempSync(join(tmpdir(), 'p18-r5-before-'));
  function write(path, text) {
    const destination = join(scratch, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  }
  try {
    write('shared/multivariate-ma.js', engine);
    for (const path of [
      unit + 'p18-r5-reference.R', unit + 'p18-r5-reference.json',
      'multivariate-ma/validate/diagnostic/baseline-engine.cjs',
      'multivariate-ma/validate/diagnostic/mutation-controls.cjs',
      'multivariate-ma/validate/diagnostic/controls.json'
    ]) write(path, read(path));
    for (const suite of suites) {
      let test = read(unit + suite);
      if (rawHash && suite === 'p18-r5-extreme-scale.test.mjs') {
        const canonical = ".update(script.toString().replace(/\\r\\n/g, '\\n'))";
        assert.ok(test.includes(canonical), 'The hash mutation must be exercised');
        test = test.replace(canonical, '.update(script)');
      }
      write(unit + suite, test);
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...suites.map(s => unit + s)], {
      cwd: scratch, encoding: 'utf8', shell: false, maxBuffer: 8 * 1024 * 1024
    });
    if (result.error) throw result.error;
    const output = result.stdout + result.stderr;
    const failures = Array.from(output.matchAll(/^not ok \d+ - (.+)$/gm), m => m[1]);
    console.log(`${label}: Node ${process.version}; child exit ${result.status}`);
    console.log(failures.map(name => `Observed old-code failure: ${name}`).join('\n'));
    console.log(output.split('\n').filter(line => /^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'));
    try {
      assert.equal(result.status, 1);
      assert.deepEqual(failures.sort(), expected.slice().sort());
      assert.match(output, /^# cancelled 0$/m);
      assert.match(output, /^# skipped 0$/m);
    } catch (error) {
      console.log(output);
      throw error;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

replay('Reviewed PR head', reviewed, ['p18-r5-extreme-scale.test.mjs', 'p18-r5-review.test.mjs'], reviewFailures, true);
replay('Pre-PR numerical blocks', prePR, ['p18-r5-extreme-scale.test.mjs'], prePRFailures);
