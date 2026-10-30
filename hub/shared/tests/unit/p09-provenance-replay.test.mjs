import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const suiteUrl = new URL('./p09-export-provenance.test.mjs', import.meta.url);
const pageUrl = new URL('../../../../proportion-ma/index.html', import.meta.url);
const suite = readFileSync(suiteUrl, 'utf8');

// Run the existing assertions verbatim. Only the four ESM imports and the
// module URL need adapting to register their callbacks in an isolated VM.
const imports = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { readFileSync } from 'node:fs';",
  "import vm from 'node:vm';"
];
let replaySuite = suite;
for (const statement of imports) {
  assert.equal(replaySuite.split(statement).length, 2, `one import: ${statement}`);
  replaySuite = replaySuite.replace(statement, '');
}
assert.equal(replaySuite.split('import.meta.url').length, 2, 'one suite URL');
replaySuite = replaySuite.replace('import.meta.url', 'suiteUrl');

function omitBuildSnapshot(html) {
  // This is the documented pre-fix omission, planted in memory in today's
  // source. It is not a historical-checkout replay: no baseline was supplied.
  const snapshot = /      \/\/ Snapshot the producing build so later exports retain this analysis's identity\.\r?\n      var buildInfo = window\.AlmBuildInfo \|\| \{\};\r?\n/g;
  const build = /        build: \{\r?\n          version: buildInfo\.version \|\| null,\r?\n          sha: buildInfo\.sha \|\| null,\r?\n        \},\r?\n/g;
  assert.equal([...html.matchAll(snapshot)].length, 1, 'one snapshot declaration to remove');
  assert.equal([...html.matchAll(build)].length, 1, 'one build field to remove');
  return html.replace(snapshot, '').replace(build, '');
}

function cases(plant) {
  const registered = [];
  vm.runInNewContext(replaySuite, {
    test: (name, run) => registered.push({ name, run }),
    assert, vm, URL, Blob, console, suiteUrl: suiteUrl.href,
    readFileSync(url, encoding) {
      const source = readFileSync(url, encoding);
      return plant && url.href === pageUrl.href ? omitBuildSnapshot(source) : source;
    }
  }, { filename: suiteUrl.pathname });
  assert.equal(registered.length, 17, 'replay every existing P09 assertion');
  assert.equal(registered.filter(({ name }) => name.startsWith('P09-R6 plant:')).length, 7);
  assert.equal(registered.filter(({ name }) => name.startsWith('P09-R6 control:')).length, 10);
  return registered;
}

test('P09 replay: the documented build omission fails seven plants and passes ten controls', async t => {
  for (const { name, run } of cases(true)) {
    await t.test(name, async child => {
      if (name.startsWith('P09-R6 plant:')) {
        await assert.rejects(run, error => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.equal(error.actual, undefined, 'failure is the missing build identity');
          assert.notEqual(error.expected, undefined);
          assert.equal(error.operator, name.includes('unavailable') ? 'deepStrictEqual' : 'strictEqual');
          child.diagnostic(`Observed planted-defect failure: ${error.message}`);
          return true;
        });
      } else {
        await run();
      }
    });
  }
});

test('P09 replay control: shipped source passes the same seventeen assertions', async t => {
  for (const { name, run } of cases(false)) await t.test(name, run);
});
