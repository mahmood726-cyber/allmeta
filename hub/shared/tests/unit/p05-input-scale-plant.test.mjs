import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const suiteURL = new URL('./p05-input-scale.test.mjs', import.meta.url);
const pageURL = new URL('../../../../heterogeneity/index.html', import.meta.url);
const html = readFileSync(pageURL, 'utf8').replace(/\r\n/g, '\n');

// Reuse every existing assertion and production-code control unchanged. Only
// module bindings and the HTML read are injected into this in-memory replay.
// These are explicit defect plants, not a claimed copy of an unavailable base.
function replay(markup, expectedFailures) {
  let source = readFileSync(suiteURL, 'utf8');
  for (const declaration of [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import vm from 'node:vm';"
  ]) {
    assert.ok(source.includes(declaration), 'Replay must bind the original suite imports');
    source = source.replace(declaration, '');
  }
  assert.ok(source.includes('import.meta.url'), 'Replay must preserve the original suite location');
  source = source.replaceAll('import.meta.url', JSON.stringify(suiteURL.href));
  const cases = new Map();
  vm.runInNewContext(source, {
    test(name, fn) { cases.set(name, fn); },
    assert, vm, URL,
    readFileSync(file, encoding) {
      return file.href === pageURL.href ? markup : readFileSync(file, encoding);
    }
  }, { filename: suiteURL.pathname });
  assert.equal(cases.size, 5, 'Replay must run both regressions and all three controls');
  for (const [name, fn] of cases) {
    const expected = expectedFailures.find(([title]) => name === title);
    if (expected) {
      assert.throws(fn, { name: 'AssertionError', message: expected[1] }, name);
    } else {
      assert.doesNotThrow(fn, name);
    }
  }
  for (const [name] of expectedFailures) assert.ok(cases.has(name), 'The planted regression must execute');
}

const guidanceTest = 'P05-D4 regression: adjacent guidance states log-ratio inputs, log-effect SE and analysis-scale outputs';
const associationTest = 'P05-D4 regression: scale guidance is associated with the study input and preserves warning descriptions';

for (const [name, markup] of [['LF', html], ['CRLF', html.replace(/\n/g, '\r\n')]]) {
  test(`P05-D4 replay control: all existing assertions pass with ${name} HTML`, () => {
    replay(markup, []);
  });
}

test('P05-D4 plant: missing guidance fails both regressions and preserves all numerical controls', () => {
  const missingHelp = html.replace(/<span id="input-scale-help"[^>]*>[\s\S]*?<\/span>/, '');
  assert.notEqual(missingHelp, html, 'The missing-guidance defect must be planted');
  replay(missingHelp, [
    [guidanceTest, /must explain the natural-log scale/],
    [associationTest, /must reference adjacent ratio-scale guidance/]
  ]);
});

test('P05-D4 plant: unassociated guidance fails the accessibility regression only', () => {
  const unassociated = html.replace('aria-describedby="input-scale-help warn-banner"', 'aria-describedby="warn-banner"');
  assert.notEqual(unassociated, html, 'The missing-association defect must be planted');
  replay(unassociated, [[associationTest, /must reference adjacent ratio-scale guidance/]]);
});

test('P05-D4 plant: lost warning association fails the accessibility regression only', () => {
  const missingWarning = html.replace('aria-describedby="input-scale-help warn-banner"', 'aria-describedby="input-scale-help"');
  assert.notEqual(missingWarning, html, 'The lost-warning defect must be planted');
  replay(missingWarning, [[associationTest, /Validation warnings must remain associated/]]);
});
