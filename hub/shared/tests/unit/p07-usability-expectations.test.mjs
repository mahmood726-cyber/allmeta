import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Inspect the actual spec's test.fail declarations without installing Playwright
// or opening a browser. Stop at navigation, before any browser assertions run.
const specURL = new URL('../multilevel-ma-usability.spec.mjs', import.meta.url);
const source = readFileSync(specURL, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/^import .* from .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(specURL.href));

async function expectedFailure(title, spec = source) {
  const cases = new Map();
  let reason = null;
  const register = (name, callback) => cases.set(name, callback);
  register.describe = Object.assign((_name, callback) => callback(), { configure() {} });
  register.fail = (condition, description) => { if (condition) reason = description; };
  vm.runInNewContext(spec, { test: register, URL }, { filename: specURL.pathname });
  assert.ok(cases.has(title), 'existing browser test remains registered: ' + title);
  const reachedNavigation = new Error('stop before browser work');
  await assert.rejects(cases.get(title)({ page: {
    on() {},
    async goto() { throw reachedNavigation; },
  } }, { annotations: [] }), error => error === reachedNavigation);
  return reason;
}

const fixedTitles = [
  '4 input error: k = 1',
  '4 input error: empty',
  '4 refusal does not leave the previous result on screen',
];
function assertExpectedPass(reason) {
  assert.equal(reason, null,
    'the fixed refusal behavior must not be reported as an unexpected pass');
}

for (const title of fixedTitles) {
  test('P07 CI: fixed requirement must be expected to pass: ' + title, async () => {
    assertExpectedPass(await expectedFailure(title));
  });
}

// Restore only the three obsolete annotations from the supplied PR head. The
// callbacks, inputs and assertions are identical in both variants. This is an
// in-memory planted defect, not a historical checkout or a browser replay.
let oldAnnotations = source;
for (const [anchor, replacement] of [
  [
    "    { name: 'k = 1', text: '1, 0.35, 0.12, A', want: /at least 3|need/i },",
    "    { name: 'k = 1', text: '1, 0.35, 0.12, A', want: /at least 3|need/i,\n" +
      "      known: 'ISSUE: no message; the previous data set\\'s pooled estimate stays on screen.' },",
  ],
  [
    "    { name: 'empty', text: '', want: /no studies|nothing entered|empty|enter (one|at least)/i },",
    "    { name: 'empty', text: '', want: /no studies|nothing entered|empty|enter (one|at least)/i,\n" +
      "      known: 'ISSUE: no message; the previous data set\\'s pooled estimate stays on screen.' },",
  ],
  [
    "  test('4 refusal does not leave the previous result on screen', async ({ page }) => {\n",
    "  test('4 refusal does not leave the previous result on screen', async ({ page }) => {\n" +
      "    test.fail(true, 'ISSUE: with <3 valid rows run() returns before touching #summary/#body/#forest, so the earlier pooled estimate is still displayed (exports are correctly cleared).');\n",
  ],
]) {
  assert.equal(oldAnnotations.split(anchor).length - 1, 1,
    'plant restores exactly one original annotation at each anchor');
  oldAnnotations = oldAnnotations.replace(anchor, replacement);
}

for (const title of fixedTitles) {
  test('P07 CI planted old annotation is caught: ' + title, async t => {
    const reason = await expectedFailure(title, oldAnnotations);
    assert.throws(() => assertExpectedPass(reason), {
      name: 'AssertionError',
      message: /the fixed refusal behavior must not be reported as an unexpected pass/,
    });
    t.diagnostic('Observed FAIL on the restored old expected-failure annotation.');
    assertExpectedPass(await expectedFailure(title));
    t.diagnostic('Observed PASS on the current spec for the same assertion.');
  });
}

for (const title of [
  '4 input error: non-numeric',
  '4 input error: negative SE',
  '4 input error: mismatched columns',
]) {
  test('P07 CI control: unresolved diagnostic keeps its expected failure: ' + title, async () => {
    const reason = await expectedFailure(title);
    assert.match(reason, /^ISSUE:/);
    assert.equal(await expectedFailure(title, oldAnnotations), reason);
  });
}

test('P07 CI control: successful core output remains expected to pass', async () => {
  assert.equal(await expectedFailure('3 core output in <=3 clicks from a fresh load'), null);
  assert.equal(await expectedFailure('3 core output in <=3 clicks from a fresh load', oldAnnotations), null);
});
