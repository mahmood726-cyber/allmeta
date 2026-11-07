// Reuse the unchanged regression suites against isolated parser variants.
// The raw-tab variant is an explicit defect injection, not a historical checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/rve-extras.js'), 'utf8');
const start = source.indexOf('  function sniffDelimiter(line) {');
const end = source.indexOf('\n  // Quote-aware split.', start);
assert.ok(start >= 0 && end > start, 'locate only the delimiter detector');

// Exact detector read from the supplied PR head before the pass-2 repair.
const reviewed = String.raw`  function sniffDelimiter(line) {
    // Count delimiters outside double quotes.
    var inQ = false, tab = 0, semi = 0, comma = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === "\t") tab++;
      else if (!inQ && ch === ";") semi++;
      else if (!inQ && ch === ",") comma++;
    }
    if (tab > 0) return "\t";
    if (semi > 0 && semi >= comma) return ";";
    return ",";
  }
`;
const rawTab = reviewed.replace('    // Count delimiters outside double quotes.',
  '    if (line.indexOf("\\t") >= 0) return "\\t";\n    // Planted raw-tab priority from the original defect.');
const withDetector = detector => source.slice(0, start) + detector + source.slice(end);
const literalFailures = [
  'plant P15-R6 review: headerless tab preserves an embedded literal quote',
  'plant P15-R6 review: headerless semicolon preserves an embedded literal quote',
  'plant P15-R6 review: CSV counts commas after a semicolon and literal quote',
  ...['Study, "12 follow-up', 'Study; "12 follow-up'].map(label =>
    `plant P15-R6 review: TSV punctuation does not open quoting in ${JSON.stringify(label)}`),
];
const quotedTabFailures = [
  'plant P15-R6: headerless comma input preserves a quoted tab label',
  'plant P15-R6: headerless semicolon input preserves a quoted tab label',
  'plant P15-R6: escaped quotes keep tabs and punctuation inside a CSV label',
];
const suites = ['p15-r6-literal-quotes.test.mjs', 'p15-r6-quoted-tab.test.mjs'];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p15-parser-replay-'));
try {
  const unit = path.join(temp, 'hub/shared/tests/unit');
  fs.mkdirSync(unit, { recursive: true });
  fs.mkdirSync(path.join(temp, 'shared'));
  for (const suite of suites) {
    fs.copyFileSync(path.join(root, 'hub/shared/tests/unit', suite), path.join(unit, suite));
  }
  function run(label, parser, suite, total, expectedFailures) {
    fs.writeFileSync(path.join(temp, 'shared/rve-extras.js'), parser);
    const result = spawnSync(process.execPath,
      ['--test', '--test-reporter=tap', path.join(unit, suite)], { cwd: temp, encoding: 'utf8' });
    assert.ifError(result.error);
    const output = result.stdout + result.stderr;
    const statuses = [...result.stdout.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)];
    assert.equal(statuses.length, total, output);
    // TAP escapes backslashes and # in test names.
    const failures = statuses.filter(s => s[1] === 'not ok').map(s => s[2].replace(/\\([\\#])/g, '$1'));
    assert.deepEqual(failures, expectedFailures, output);
    assert.equal(result.status, expectedFailures.length ? 1 : 0, output);
    console.log(`${label}: ${suite}: ${total - failures.length} PASS, ${failures.length} expected FAIL`);
    for (const name of failures) console.log(`  observed FAIL: ${name}`);
  }
  run('supplied PR detector', withDetector(reviewed), suites[0], 17, literalFailures);
  run('supplied PR detector', withDetector(reviewed), suites[1], 6, []);
  run('planted original raw-tab priority', withDetector(rawTab), suites[1], 6, quotedTabFailures);
  run('repaired detector', source, suites[0], 17, []);
  run('repaired detector', source, suites[1], 6, []);

  // Compare the actual built-in inputs and complete fit objects, with no new
  // numerical reference or tolerance. This is JS-to-JS evidence, not R parity.
  const html = fs.readFileSync(path.join(root, 'rve-meta/index.html'), 'utf8');
  const small = html.match(/var SMALL_EXAMPLE = ("(?:[^"\\]|\\.)*");/);
  const corrdat = html.match(/<textarea\b[^>]*\bid="src"[^>]*>([\s\S]*?)<\/textarea>/);
  assert.ok(small && corrdat, 'both built-in examples are present');
  const variants = [source, withDetector(reviewed), withDetector(rawTab)].map(parser =>
    vm.runInNewContext(parser + '\nAlmRVEExtras;', {}));
  require(path.join(root, 'shared/stats-qt.js'));
  const RVE = require(path.join(root, 'shared/rve.js'));
  for (const [name, text] of [['small', JSON.parse(small[1])], ['corrdat', corrdat[1]]]) {
    const parsed = variants.map(api => JSON.parse(JSON.stringify(api.parseStudies(text))));
    for (const other of parsed.slice(1)) assert.deepEqual(other, parsed[0], `${name}: parsed inputs`);
    const fits = parsed.map(input => RVE.fitCORR(input.rows, { rho: 0.8 }));
    for (const other of fits.slice(1)) assert.deepEqual(other, fits[0], `${name}: full fit object`);
    console.log(`${name}: identical parsed inputs and complete fit objects across all three detectors`);
  }
} finally {
  assert.equal(path.dirname(fs.realpathSync(temp)), fs.realpathSync(os.tmpdir()),
    'cleanup is confined to the temporary directory created by this replay');
  fs.rmSync(temp, { recursive: true, force: true });
}
