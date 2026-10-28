// Read-only reproduction of the conflicting parser contracts in PR #256.
// Run from the tree root: node heterogeneity/tests/parser-ci-diagnostic.mjs
// This probe reports legacy-contract failures without changing inputs on disk.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const start = html.indexOf('    function parseStudies(text) {');
const end = html.indexOf('    function weightedSums(', start);
assert.ok(start >= 0 && end > start, 'locate the production parser');
const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);
const parse = text => JSON.parse(JSON.stringify(context.parseStudies(text)));
let failures = 0;
function check(name, run) {
  try {
    run();
    console.log('PASS: ' + name);
  } catch (error) {
    failures++;
    console.log('FAIL: ' + name + '\n' + error.message);
  }
}

const fixture = JSON.parse(read('../../hub/shared/tests/_heterogeneity_parity_fixture.json'));
const fixtureText = fixture.studies.map(([label, yi, se]) => `${label}, ${yi}, ${se}`).join('\n');
check('BCG parity input retains all studies (heterogeneity-metafor-parity.spec.mjs:31)', () => {
  assert.equal(parse(fixtureText).studies.length, fixture.studies.length);
});

const corpus = JSON.parse(read('../validate/corpus/corpus.json'));
check('every stored corpus input retains its study count (validate/adapter.js:83)', () => {
  const rejected = corpus.map(item => ({ id: item.id, expected: item.k, actual: parse(item.text).studies.length }))
    .filter(item => item.expected !== item.actual);
  assert.deepEqual(rejected, []);
});

const exampleDeclaration = html.match(/^    const EXAMPLE = .*;$/m);
assert.ok(exampleDeclaration, 'locate the built-in example');
const example = vm.runInNewContext(exampleDeclaration[0] + '\nEXAMPLE');
const rows = example.split('\n').filter(line => !line.startsWith('#'));
const relabelled = rows.map(line => 'Site A, ' + line).join('\n');
check('unquoted comma labels retain the example studies (usability-heterogeneity.spec.mjs:144)', () => {
  const result = parse(relabelled);
  assert.equal(result.studies.length, rows.length);
  assert.equal(result.studies[0].label, 'Site A, ' + rows[0].split(',')[0].trim());
});

check('control: the unchanged built-in example retains all eight studies', () => {
  const result = parse(example);
  assert.equal(result.studies.length, 8);
  assert.deepEqual(result.warnings, []);
});

check('control: decimal commas and extra columns still block the whole dataset', () => {
  for (const row of ['Jones 2020,-0.12,0,15', 'Jones 2020,-0,12,0.15',
    'Jones 2020,extra,-0.12,0.15', 'Jones 2020, extra, -0.12, 0.15']) {
    const result = parse(example + '\n' + row);
    assert.deepEqual(result.studies, []);
    assert.match(result.warnings.join(' '), /exactly.*3.*fields/);
  }
});

check('control: quoting corpus labels in memory preserves all labels and numerical tokens', () => {
  // A diagnostic of a possible migration, not a fallback parser or corpus rewrite.
  let count = 0;
  for (const item of corpus) {
    const expected = item.text.split('\n').map(line => {
      const cells = line.split(',').map(cell => cell.trim());
      const [yi, se] = cells.slice(-2);
      return { label: cells.slice(0, -2).join(', '), yi, se };
    });
    const text = expected.map(({ label, yi, se }) => '"' + label.replace(/"/g, '""') + '", ' + yi + ', ' + se).join('\n');
    const result = parse(text);
    assert.deepEqual(result.warnings, [], item.id);
    assert.equal(result.studies.length, item.k, item.id);
    result.studies.forEach((study, index) => {
      assert.equal(study.label, expected[index].label, item.id);
      assert.equal(study.est, Number(expected[index].yi), item.id);
      assert.equal(study.se, Number(expected[index].se), item.id);
    });
    count += result.studies.length;
  }
  console.log('Quoted-label control: ' + corpus.length + ' datasets; ' + count + ' studies. No files written.');
});

console.log('Legacy-contract failures: ' + failures);
process.exitCode = failures ? 1 : 0;
