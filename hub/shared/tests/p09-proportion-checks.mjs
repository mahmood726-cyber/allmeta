import { run } from 'node:test';
import { fileURLToPath } from 'node:url';

// Keep every test name and result visible in the wrapper's bounded output.
// Use the same test files/assertions as the final unit-test gate.
let passed = 0, failed = 0;
for await (const event of run({
  files: ['unit/p09-proportion-range.test.mjs', 'unit/p09-proportion-r.test.mjs']
    .map(file => fileURLToPath(new URL(file, import.meta.url))),
  concurrency: false
})) {
  if (event.type === 'test:pass') {
    passed++;
    console.log('PASS ' + event.data.name);
  } else if (event.type === 'test:fail') {
    failed++;
    const error = event.data.details.error;
    const cause = error.cause || error;
    console.log('FAIL ' + event.data.name + ': ' + cause.message.split('\n')[0]);
  } else if (event.type === 'test:stderr') {
    console.error(event.data.message);
  }
}
console.log(JSON.stringify({ passed, failed }));
process.exitCode = failed ? 1 : 0;
