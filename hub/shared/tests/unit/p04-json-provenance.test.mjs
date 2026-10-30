import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pageUrl = new URL('../../../../nma/index.html', import.meta.url);
const html = readFileSync(pageUrl, 'utf8');
const buildTag = html.match(/<script src="([^"]*\/build-info\.js)"><\/script>/);
assert.ok(buildTag, 'NMA must load the producing build identity');
assert.ok(buildTag.index < html.indexOf('    function onDownloadJson()'));
const buildSource = readFileSync(new URL(buildTag[1], pageUrl), 'utf8');

// Run the actual form and download handlers, with browser I/O replaced in memory.
// The analysis gate is a boundary stub; these tests cover JSON serialization.
function section(start, end) {
  const first = html.indexOf(start), last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing source section: ${start}`);
  return html.slice(first, last);
}
const source = [
  section('    const fields =', '    let _pendingRef'),
  section('    function readState()', '    // CSV labels'),
  section('    function downloadBlob(', '    function slugify('),
  section('    function onDownloadJson()', '    function onReset()'),
].join('\n');
const settings = {
  data: 'Trial 1, Placebo, Drug A, -0.22, 0.12\nTrial 2, Placebo, Drug A, -0.31, 0.14',
  ref: 'Placebo', model: 're', ci: 'hk', dir: 'undesirable', scale: 'exp',
  title: 'Trial "export", with settings',
};
const plain = value => JSON.parse(JSON.stringify(value));

function harness({ loadBuild = true, allowed = true } = {}) {
  const elements = new Map(), downloads = [];
  let blob, gateCalls = 0;
  const context = vm.createContext({
    window: {}, Blob,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { value: '' });
        return elements.get(id);
      },
      createElement(tag) {
        assert.equal(tag, 'a');
        return { click() { downloads.push({ blob, filename: this.download }); } };
      },
      body: { appendChild() {}, removeChild() {} },
    },
    URL: { createObjectURL(value) { blob = value; return 'blob:nma-test'; }, revokeObjectURL() {} },
    setTimeout(fn) { fn(); },
    canExport() { gateCalls++; return allowed; },
    render() {},
    alert(message) { assert.fail(message); },
    FileReader: class {
      readAsText(file) { this.result = file; this.onload(); }
    },
  });
  if (loadBuild) vm.runInContext(buildSource, context);
  vm.runInContext(source, context);
  context.writeState(settings);
  return {
    context, downloads,
    get gateCalls() { return gateCalls; },
    async save() {
      const before = downloads.length;
      context.onDownloadJson();
      assert.equal(downloads.length, before + 1, 'One download per save');
      const download = downloads.at(-1);
      assert.equal(download.filename, 'nma-state.json');
      assert.equal(download.blob.type, 'application/json');
      return JSON.parse(await download.blob.text());
    },
  };
}

test('plant P04-R5: saved JSON includes the loaded version, SHA and build timestamp', async () => {
  const h = harness();
  const build = plain(h.context.window.AlmBuildInfo);
  assert.ok(build.version);
  assert.match(build.sha, /^[0-9a-f]{40}$/);
  assert.ok(Number.isFinite(Date.parse(build.builtAt)));
  const saved = await h.save();
  assert.equal(saved._schema, 'nma-v1');
  assert.deepEqual(saved.producedBy, build);
});

test('plant P04-R5: re-export uses the current build rather than imported provenance', async () => {
  const h = harness();
  const previous = await h.save();
  h.context.onImportJson(JSON.stringify({ ...previous, producedBy: { version: 'stale-import', sha: 'stale-import' } }));
  const current = { ...plain(h.context.window.AlmBuildInfo), version: 'test-next-build',
    sha: '0123456789abcdef0123456789abcdef01234567', shortSha: '0123456', builtAt: '2030-01-02T03:04:05Z' };
  h.context.window.AlmBuildInfo = current;
  const saved = await h.save();
  assert.deepEqual(saved.producedBy, current);
  for (const [key, value] of Object.entries(settings)) assert.equal(saved[key], value);
});

test('control: JSON schema, save time, settings and import round-trip are preserved', async () => {
  for (const loadBuild of [true, false]) {
    const h = harness({ loadBuild });
    const before = Date.now(), saved = await h.save(), after = Date.now();
    assert.equal(saved._schema, 'nma-v1');
    assert.ok(Date.parse(saved._savedAt) >= before && Date.parse(saved._savedAt) <= after);
    for (const [key, value] of Object.entries(settings)) assert.equal(saved[key], value);
    h.context.writeState(Object.fromEntries(Object.keys(settings).map(key => [key, 'changed'])));
    h.context.onImportJson(JSON.stringify(saved));
    assert.deepEqual(plain(h.context.readState()), settings);
  }
});

test('control: a refused export creates no JSON download', () => {
  const h = harness({ allowed: false });
  h.context.onDownloadJson();
  assert.equal(h.gateCalls, 1);
  assert.equal(h.downloads.length, 0);
});
