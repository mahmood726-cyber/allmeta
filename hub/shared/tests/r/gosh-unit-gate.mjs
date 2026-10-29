// File-based equivalent of the requested quick-gate glob, which RUN.txt rejected.
// Run every *.test.mjs recursively; never filter out failures or TODO tests.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../../../',import.meta.url));
function discover(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const path=join(dir,entry.name);
    return entry.isDirectory() ? discover(path) : entry.name.endsWith('.test.mjs') ? [path] : [];
  });
}
const files=discover(join(root,'hub/shared/tests/unit')).sort();
if (!files.length) throw Error('No quick-gate test files found');
console.log('Quick gate files:\n'+files.map(f=>relative(root,f)).join('\n'));
const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{
  cwd:root,encoding:'utf8',maxBuffer:32*1024*1024
});
if (result.error) throw result.error;
// Keep wrapper feedback small enough to retain totals and every failed/TODO name.
for (const line of result.stdout.split(/\r?\n/)) {
  if (/^(?:not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line)) console.log(line);
}
if (result.stderr) console.error(result.stderr);
if (result.status !== 0) console.error(result.stdout.slice(-16000));
console.log(`Quick gate exit=${result.status}; signal=${result.signal || 'none'}`);
process.exitCode = result.status ?? 1;
