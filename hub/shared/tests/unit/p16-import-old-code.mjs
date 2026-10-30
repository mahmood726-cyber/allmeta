// Reproduce the delivered API deletion without a sibling checkout or git.
// Only temporary files are changed; the restored regression suite is unmodified.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const shared = 'shared/ma-comparisons-v1.js';
let source = readFileSync(new URL(shared, root), 'utf8').replace(/\r\n/g, '\n');
function reverse(before, after) {
  assert.equal(source.split(before).length, 2, 'Reverse exactly one API restoration hunk');
  source = source.replace(before, after);
}
reverse(`    return toContrastsDetailed(env, opts).rows;
  }

  /** Same rows as toContrasts, plus named continuous pairs omitted for missing
   * or invalid sample sizes. Storage validation intentionally keeps n optional.
   */
  function toContrastsDetailed(env, opts) {
`, '');
reverse(`    var result = { rows: out, omissions: [] };
    if (!env || !Array.isArray(env.studies)) return result;`,
  '    if (!env || !Array.isArray(env.studies)) return out;');
reverse('    if (!isOR && !isRR && !isMD && !isSMD) return result;',
  '    if (!isOR && !isRR && !isMD && !isSMD) return out;');
reverse(`            if (!(isFiniteNumber(cx.n) && cx.n > 0 && isFiniteNumber(cy.n) && cy.n > 0)) {
              result.omissions.push({
                study: s.id, treatment1: cx.treatment, treatment2: cy.treatment,
                reason: "Both arms need a finite sample size (n) greater than 0."
              });
              continue;
            }`,
  '            if (!(isFiniteNumber(cx.n) && cx.n > 0 && isFiniteNumber(cy.n) && cy.n > 0)) continue;');
reverse('    return result;\n  }', '    return out;\n  }');
reverse('    toContrastsDetailed: toContrastsDetailed,\n', '');
const digest = createHash('sha256').update(source).digest('hex');
assert.equal(digest, '52c278b571c2fdb9a3fc386baf7b8a23cf2191b32550e044d75024cd9222781b',
  'Reproduce the exact delivered LF shared source');

const work = mkdtempSync(join(tmpdir(), 'p16-import-old-code-'));
const suite = 'hub/shared/tests/unit/p04-r8-extraction-import.test.mjs';
for (const file of [shared, 'shared/nma-multiarm-v1.js', 'nma/index.html', suite]) {
  const target = join(work, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(new URL(file, root), target);
}
writeFileSync(join(work, shared), source);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(work, suite)],
  { cwd: work, encoding: 'utf8', env: {}, timeout: 30000 });
if (result.error) throw result.error;
const output = result.stdout + result.stderr;
writeFileSync(join(work, 'old-import.tap'), output);
assert.equal(result.status, 1, output);
const failures = [...output.matchAll(/^not ok \d+ - (.+)\r?$/gm)].map(m => m[1].trim()).sort();
assert.deepEqual(failures, [
  ...['MD', 'SMD'].flatMap(measure => [
    `plant P04-R8: ${measure} conversion returns named omissions without mutating the envelope`,
    `plant P04-R8: ${measure} button refuses a partial import and preserves existing inputs and storage`,
    `plant P04-R8: ${measure} automatic import refuses missing n before analysing or saving a subset`,
    `control P04-R8: complete ${measure} imports both studies automatically and by button`,
  ]),
  'plant P04-R8: a partly convertible three-arm study reports each missing pair and is refused',
  'plant P04-R8: an entirely unconvertible bus names the missing study instead of loading the demo',
  'plant P04-R8: correcting sample sizes clears the refusal and imports every study',
  ...['OR', 'RR'].flatMap(measure => ['complete binary', 'zero-cell'].map(kind =>
    `control P04-R8: ${measure} ${kind} import retains the contrast`)),
].sort(), 'Exactly the missing-API failures must reproduce');
for (const summary of ['tests 18', 'pass 3', 'fail 15', 'cancelled 0', 'skipped 0', 'todo 0']) {
  assert.ok(output.includes(`# ${summary}\n`) || output.includes(`# ${summary}\r\n`), summary);
}
console.log(output.split(/\r?\n/).filter(line => /^(not ok |ok |# (tests|pass|fail|cancelled|skipped|todo) )/.test(line)).join('\n'));
console.log('PASS: exact delivered source reproduced 15 missing-API failures and passed all 3 unaffected controls; SHA-256=' + digest);
console.log('Temporary evidence:', work);
