import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../../../.github/workflows/features.yml', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../features-sof.spec.mjs', import.meta.url), 'utf8');
const checker = readFileSync(new URL('../rchecks/sof.R', import.meta.url), 'utf8');

function gate(source) {
  const job = source.match(/^  sof-r:\r?\n[\s\S]*?(?=^  [\w-]+:|$(?![\s\S]))/m)?.[0];
  assert.ok(job, 'SoF needs an independently enforced browser-to-R CI gate');
  assert.match(job, /r-lib\/actions\/setup-r@v2/);
  assert.match(job, /playwright test .*features-sof\.spec\.mjs .*--output="\$\{\{ runner\.temp \}\}\/sof-test-results"/);
  assert.match(job, /set -o pipefail/);
  assert.match(job, /Rscript rchecks\/sof\.R "\$\{\{ runner\.temp \}\}\/sof-test-results\/rchecks\/sof\/page\.csv"/);
  assert.match(job, /grep -Fx 'PLANT_DETECTED'/);
  assert.match(job, /grep -Fx 'R_CHECK_PASS'/);
  assert.ok(job.indexOf('playwright test') < job.indexOf('Rscript rchecks/sof.R'));
  assert.doesNotMatch(job, /continue-on-error|if: always\(\)[\s\S]*Rscript/);
}

test('SoF CI checks browser evidence in R and requires the plant and success markers', () => {
  gate(workflow);
  for (const command of [/^  sof-r:[\s\S]*?(?=^  [\w-]+:)/m,
    /^.*Rscript rchecks\/sof\.R.*$/m, /^.*grep -Fx 'PLANT_DETECTED'.*$/m,
    /^.*grep -Fx 'R_CHECK_PASS'.*$/m, /^.*set -o pipefail.*$/gm]) {
    const plant = workflow.replace(command, '');
    assert.notEqual(plant, workflow);
    assert.throws(() => gate(plant));
  }
});

test('SoF evidence follows the Playwright output directory and R accepts its explicit path', () => {
  const check = (browser, r) => {
    assert.match(browser, /join\(testInfo\.project\.outputDir, 'rchecks', 'sof', 'page\.csv'\)/);
    assert.match(browser, /rmSync\(rcheckOutput\(testInfo\), \{ force: true \}\)/);
    assert.match(browser, /writeFileSync\(rcheckOutput\(testInfo\),/);
    assert.match(r, /input <- if \(length\(args\) == 1L\) args\[1\] else/);
  };
  check(spec, checker);
  assert.throws(() => check(spec.replace('testInfo.project.outputDir', "'rchecks-out'"), checker));
  assert.throws(() => check(spec, checker.replace('input <- if (length(args) == 1L) args[1] else', 'input <-')));
});
