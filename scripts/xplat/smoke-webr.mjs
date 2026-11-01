// Supplemental WASM evidence when a sandbox cannot launch a browser.
// Uses the unchanged shared runner, its manifest and hashes, and actual webR.
// Page state is from smoke-live's DOM stubs, NOT a Playwright export.
// Node requires ws (set NODE_PATH to an existing install) and
// --experimental-vm-modules for the runner's dynamic import.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createLiveServer } from './live-server.mjs';
import { apps } from './live-browser.mjs';

const root = new URL('../../', import.meta.url);
const require = createRequire(import.meta.url);
const { WebR, ChannelType } = require(fileURLToPath(new URL('r-shiny/shinylive/webr/webr.cjs', root)));
const server = createLiveServer(fileURLToPath(root));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const instances = [];
try {
  process.env.ALM_LIVE_DIAGNOSTIC_ORIGIN = origin + '/';
  await import('./smoke-live.mjs');
  const context = vm.createContext({ console, URL, fetch, crypto, Uint8Array,
    location: { origin },
    document: { currentScript: { src: origin + '/shared/webr-runner.js' } } });
  // Use webR's Node distribution. Boot files and the bundled library image
  // load from disk: Node's synchronous XHR requires child processes denied by
  // this sandbox. Package archives still go through the runner's HTTP/hash path.
  // This does not verify the browser's HTTP image mount or DOM.
  const module = new vm.SyntheticModule(['WebR', 'ChannelType'], function() {
    this.setExport('WebR', class extends WebR {
      constructor(options) {
        super({ ...options, baseUrl: fileURLToPath(new URL('r-shiny/shinylive/webr/', root)) });
        instances.push(this);
      }
      async init() {
        await super.init();
        const image = fileURLToPath(new URL('r-shiny/shinylive/webr/library.data.gz', root)).replaceAll('\\', '/');
        await this.evalRVoid(`webr::mount('/tmp/alm-bundled-library', ${JSON.stringify(image)}); .libPaths(c(.libPaths(), '/tmp/alm-bundled-library'))`);
      }
    });
    this.setExport('ChannelType', ChannelType);
  }, { context });
  await module.link(() => {});
  await module.evaluate();
  const code = await readFile(new URL('shared/webr-runner.js', root), 'utf8');
  await new vm.Script(code, { importModuleDynamically: () => module }).runInContext(context);
  new vm.Script(await readFile(new URL('shared/alm-validate.js', root), 'utf8')).runInContext(context);
  const { compare } = context.AlmValidate;
  for (const app of apps) {
    const data = JSON.parse(await readFile(new URL(`validation/live/node-smoke/${app}.json`, root), 'utf8'));
    const result = await context.AlmWebR.runR(data);
    if (app === 'rve-meta') {
      assert.equal(result.ok, false);
      assert.match(result.error, /Package not in pinned repository: (robumeta|clubSandwich)/);
      console.log(`NODE WEBR ${app}: expected refusal: ${result.error}`);
      continue;
    }
    assert.equal(result.ok, true, result.error);
    const records = result.stdout.split(/\r?\n/).filter(line => line.startsWith('ALMJSON:'));
    if (records.length !== 1) {
      const shelter = await new instances[0].Shelter();
      try { console.error('R diagnostic:', (await shelter.captureR(data.script, { captureStreams: true, captureConditions: true })).output); }
      finally { await shelter.purge(); }
    }
    assert.equal(records.length, 1, result.stdout);
    const ref = JSON.parse(records[0].slice(8));
    assert.deepEqual(Object.keys(ref).sort(), data.appValues.map(v => v.key).sort());
    const misses = values => values.filter(v => !compare(v.value, ref[v.key],
      data.compare.kind[v.key] || 'abs', data.compare.tolerance[v.key] ?? data.compare.tolerance.default).pass);
    assert.deepEqual(misses(data.appValues), []);
    const planted = structuredClone(data.appValues);
    const target = planted.find(v => /^(split\.0\.direct|mu1|components_0_est)$/.test(v.key));
    target.value *= 1.001;
    assert.deepEqual(misses(planted).map(v => v.key), [target.key]);
    console.log(`NODE WEBR ${app} ${data.appValues.length}/${data.appValues.length}; planted ${target.key} failed`, result.versions);
    console.log(result.stdout.split(/\r?\n/).filter(line => line.startsWith('SERIALIZER')).join('\n'));
  }
} finally {
  for (const w of instances) await w.close();
  await new Promise(resolve => server.close(resolve));
}
