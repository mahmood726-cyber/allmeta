// Node mirror of the original pubbias "Validate in R" offline replay (validate/adapter.js, 2,113 checks).
// Loads the page's inline engine from <index.html>, then the unmodified shared/alm-validate.js and
// pubbias-tests/validate/adapter.js with a minimal window/document shim, and calls adapter.corpus.run().
// Run from the repository root: node pubbias-tests/validate/check-original.mjs [<index.html to test instead>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'), html = readFileSync(process.argv[2] || join(root, 'pubbias-tests/index.html'), 'utf8');
const a = html.indexOf('// ---- Engine (unchanged from pre-retrofit) ----'), b = html.indexOf('// ---- axis state ----');
if (a < 0 || b < a) throw Error('engine markers');
const names = ['parseTESE', 'trimFill', 'remlSlopeNeg', 'wls', 'parseBinary', 'eggerGeneric', 'beggMazumdar', 'petersTest', 'harbordTest', 'thompsonSharp'];
const stubEl = () => ({ appendChild() {}, append() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() {}, remove() {} }, style: {}, dataset: {} });
const doc = { getElementById: () => stubEl(), createElement: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], readyState: 'complete', addEventListener() {} };
const sandbox = { console, setTimeout, structuredClone, crypto: globalThis.crypto, TextEncoder, Blob, fetch: undefined, document: doc };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
sandbox.__almPubBiasEngine = vm.runInContext('(function(){' + html.slice(a, b) + '\nreturn {' + names.join(',') + '};})()', sandbox);
vm.runInContext(readFileSync(join(root, 'shared/alm-validate.js'), 'utf8'), sandbox);
sandbox.AlmValidate.mount = () => ({}); // UI mount not needed for the replay
vm.runInContext(readFileSync(join(root, 'pubbias-tests/validate/adapter.js'), 'utf8'), sandbox);
const ad = sandbox.AlmPubbiasValidationAdapter, loaded = {};
for (const f of ad.corpus.files) loaded[f.path] = JSON.parse(readFileSync(join(root, 'pubbias-tests', f.path), 'utf8'));
const r = await ad.corpus.run(loaded, () => {});
console.log(`ORIGINAL REPLAY ${r.passed}/${r.checks} checks pass; failed ${r.failed.length}; unexpected ${r.unexpected}`);
for (const f of r.failed) console.log('  ' + f.label);
