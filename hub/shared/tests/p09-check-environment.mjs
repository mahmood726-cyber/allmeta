import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
console.log('Node', process.version);
for (const name of ['@playwright/test', '@axe-core/playwright']) {
  try { console.log(name, require.resolve(name)); }
  catch (error) { console.log(name, error.code); }
}
