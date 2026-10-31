import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('browser evidence setup removes the whole old matrix without touching unrelated artifacts', () => {
  const source = readFileSync(new URL('../features-figpresets.spec.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('test.beforeAll(() => {');
  assert.notEqual(start, -1);
  const end = source.indexOf('\n});', start) + 4;
  const setup = source.slice(start, end);
  const evidenceDir = new URL('file:///fixture/rchecks-out/figpresets/');
  const files = ['provenance.csv'];
  for (const app of ['proportion-ma', 'heterogeneity', 'nma'])
    for (const preset of ['f1000', 'bmj']) for (const format of ['svg', 'png', 'tiff', 'pdf']) {
      const file = `${app}-${preset}.${format}`; files.push(file, file + '.csv');
    }
  for (const file of ['control-custom.png', 'control-custom.svg', 'control-custom.pdf', 'plant-custom.png'])
    files.push(file, file + '.csv');
  assert.equal(files.length, 57);
  const stalePdf = new URL('heterogeneity-bmj.pdf', evidenceDir).href;
  function run(plant) {
    const disk = new Set([...files.map(file => new URL(file, evidenceDir).href), 'file:///fixture/reference.png']);
    vm.runInNewContext(setup, {
      URL, evidenceDir, apps: { 'proportion-ma': '', heterogeneity: '', nma: '' },
      test: { beforeAll: fn => fn() },
      rmSync(url, options) {
        assert.equal(options.recursive, undefined, 'only named evidence files may be removed');
        assert.ok(files.includes(url.href.slice(evidenceDir.href.length)));
        if (!plant) disk.delete(url.href);
      }
    });
    return disk;
  }
  assert.deepEqual([...run(false)], ['file:///fixture/reference.png']);
  // Plant the old behavior: a canceled PDF export leaves yesterday's PDF usable by R.
  assert.equal(run(true).has(stalePdf), true);
  assert.equal(run(false).has(stalePdf), false);
});
