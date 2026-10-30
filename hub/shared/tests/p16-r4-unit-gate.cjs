// Explicit file entrypoint for wrappers that do not allow a wildcard command.
const fs = require('node:fs'), path = require('node:path');
const { runSuite } = require('./p16-r4-test-runner.cjs');
const root = path.resolve(__dirname, '../../..');
function tests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? tests(file) : entry.name.endsWith('.test.mjs') ? [file] : [];
  });
}
const { result } = runSuite(root, tests(path.join(__dirname, 'unit')).sort(), 'current-unit-gate');
process.exitCode = result.status === 0 ? 0 : 1;
