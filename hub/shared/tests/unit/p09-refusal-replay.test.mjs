import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const suiteURL = new URL('./p09-refusal.test.mjs', import.meta.url);
const pageURL = new URL('../../../../proportion-ma/index.html', import.meta.url);
const html = readFileSync(pageURL, 'utf8').replaceAll('\r\n', '\n');
const suite = readFileSync(suiteURL, 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(suiteURL.href));

function replay(page) {
  const results = [];
  vm.runInNewContext(suite, {
    assert, vm, URL,
    readFileSync(file, encoding) {
      return file.href === pageURL.href ? page : readFileSync(file, encoding);
    },
    test(name, run) {
      try {
        assert.equal(run(), undefined, 'These replayed tests must remain synchronous');
        results.push({ name, pass: true });
      } catch (error) {
        results.push({ name, pass: false, message: error.message });
      }
    },
  }, { filename: suiteURL.pathname });
  assert.equal(results.length, 7, 'Replay every existing P09 case');
  return results;
}

function reverseP09(page) {
  // Reconstruct the defect, not a historical checkout. No base tree or PR diff
  // is supplied with this job. Only the two documented P09 hunks are reversed.
  const replacements = [
    [
      `        document.getElementById('res-body').innerHTML = '<tr><td colspan="5"><span role="status" aria-live="polite">Need at least 2 studies.</span></td></tr>';\n        document.getElementById('forest').innerHTML = '';\n        document.getElementById('het').innerHTML = '';`,
      `        document.getElementById('res-body').innerHTML = '<tr><td colspan="5">Need at least 2 studies.</td></tr>';`,
    ],
    [
      `getSvg: function () { return _lastResults ? document.getElementById('forest') : null; }`,
      `getSvg: function () { return document.getElementById('forest'); }`,
    ],
  ];
  for (const [fixed, defective] of replacements) {
    assert.equal(page.split(fixed).length, 2, 'Each reversed hunk must match exactly once');
    page = page.replace(fixed, defective);
  }
  return page;
}

test('P09 replay control: all seven unchanged assertions pass on the supplied page', () => {
  const results = replay(html);
  assert.deepEqual(results.filter(result => !result.pass), []);
});

test('P09 replay plant: reversing only the refusal fixes fails five cases and preserves both controls', () => {
  const results = replay(reverseP09(html));
  assert.deepEqual(results.filter(result => !result.pass).map(result => result.name), [
    'P09-R4 plant: one-study refusal clears the previous forest',
    'P09-R4 plant: one-study refusal clears previous heterogeneity',
    'P09-R4 plant: one-study refusal makes the plot unavailable to export',
    'P09-R4 plant: refusal message remains visible in a polite status region',
    'P09-R4 plant: zero-study refusal also invalidates all rendered outputs',
  ]);
  assert.deepEqual(results.filter(result => result.pass).map(result => result.name), [
    'P09-R4 control: valid two-study fit renders and exposes current results and plot',
    'P09-R4 control: valid run after refusal restores fresh output and export availability',
  ]);
  console.log('P09 reconstructed defect: five assertion failures; both valid-run controls pass');
});
