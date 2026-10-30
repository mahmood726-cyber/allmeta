// Compact output keeps baseline assertion outcomes visible in runner feedback.
// Execute every unit test, without name filters or expected-failure handling.
import { run } from 'node:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discover(path);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : [];
  }).sort();
}

const files = discover(fileURLToPath(new URL('.', import.meta.url)));
let passed = 0, failed = 0, skipped = 0, todo = 0;
try {
  for await (const event of run({ files })) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data;
    if (data.skip) skipped++;
    if (data.todo) todo++;
    if (event.type === 'test:fail') {
      failed++;
      const error = data.details?.error;
      const message = error?.cause?.message || error?.message || 'No assertion details';
      console.log(`FAIL ${data.name}: ${message.split('\n')[0]}`);
    } else {
      passed++;
      // Other passing tests are included in the total; all failures are printed.
      if (/^(plant P19-R2:|control:)/.test(data.name)) console.log(`PASS ${data.name}`);
    }
  }
} catch (error) {
  failed++;
  console.error(`Runner failure: ${error.message}`);
}
console.log(`Unit gate: files=${files.length} passed=${passed} failed=${failed} skipped=${skipped} todo=${todo}`);
if (!files.length || !passed || failed || skipped || todo) process.exitCode = 1;
