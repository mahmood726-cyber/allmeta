const path = require('node:path');
const { runSuite } = require('./p16-r4-test-runner.cjs');
const root = path.resolve(__dirname, '../../..');
const { result } = runSuite(root, ['hub/shared/tests/p16-r4-dom-replay.cjs'], 'current-full-page');
process.exitCode = result.status === 0 ? 0 : 1;
