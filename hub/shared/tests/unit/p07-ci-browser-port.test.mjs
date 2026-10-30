import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const runnerURL = new URL('./p07-ci-browser.mjs', import.meta.url);
const source = readFileSync(runnerURL, 'utf8').replace(/\r\n/g, '\n');

// Execute the real runner with filesystem/process boundaries replaced. The OS
// supplies a free port while the default 8088 belongs to a different server.
// No npm install, browser, real listener or filesystem write is needed here.
async function configuration(text = source, availablePort = 49173) {
  let config, closed = false, requested;
  const socket = {
    once() { return socket; },
    listen(port, host, ready) { requested = {port, host}; ready(); },
    address() { return {port: availablePort}; },
    close(done) { closed = true; done(); },
  };
  const context = {
    assert, URL, dirname, join, fileURLToPath,
    cpSync() {}, mkdirSync() {}, symlinkSync() {},
    existsSync() { return true; },
    tmpdir() { return dirname(fileURLToPath(runnerURL)); },
    mkdtempSync(path) { return path + 'test'; },
    createRequire() { return {resolve: name => '/test/node_modules/' + name}; },
    createServer() { return socket; },
    writeFileSync(path, text) {
      config = vm.runInNewContext(text.replace('export default ', 'globalThis.config = '));
    },
    spawnSync() { return {status: 0}; },
    process: {execPath: '/test/node', exitCode: undefined},
    console: {log() {}},
  };
  const body = text.replace(/^import .*;\n/gm, '')
    .replace(/import\.meta\.url/g, JSON.stringify(runnerURL.href));
  await vm.runInNewContext('(async () => {\n' + body + '\n})()', context);
  assert.ok(config, 'the runner must write a Playwright configuration');
  return {config, closed, requested};
}

function coherent(config) {
  const url = new URL(config.use.baseURL);
  const serverURL = config.webServer.url || `http://127.0.0.1:${config.webServer.port}`;
  assert.equal(serverURL, url.origin);
  assert.equal(config.webServer.command, `python -m http.server ${url.port} --bind 127.0.0.1`);
  assert.equal(config.webServer.reuseExistingServer, false);
}

test('P07 browser port control: browser and private server share the same address', async () => {
  coherent((await configuration()).config);
});

test('P07 browser port plant: occupied default port uses the OS-selected free address', async () => {
  for (const port of [49173, 53789]) {
    const {config, requested, closed} = await configuration(source, port);
    coherent(config);
    assert.equal(new URL(config.use.baseURL).port, String(port));
    assert.equal(requested.port, 0);
    assert.equal(requested.host, '127.0.0.1');
    assert.equal(closed, true, 'release the probe before Python binds');
  }
});
