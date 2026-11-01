import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLiveServer, withinRoot } from './live-server.mjs';

test('directory URLs allow descendants on Windows and POSIX but reject escape paths', () => {
  for (const [paths, root] of [[path.win32, 'C:\\repo\\wt\\'], [path.posix, '/repo/wt/']]) {
    assert.equal(withinRoot(root, paths.join(root, 'nma-inconsistency/index.html'), paths), true);
    assert.equal(withinRoot(root, paths.join(root, '../TASK.md'), paths), false);
    assert.equal(withinRoot(root, paths.join(root, '../wt-other/index.html'), paths), false);
    // Planted original defect: the duplicated separator rejects a valid file.
    assert.equal(paths.resolve(root, 'nma-inconsistency/index.html').startsWith(root + paths.sep), false);
  }
});

test('export server serves the real app and refuses encoded traversal', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const server = createLiveServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const app of ['nma-inconsistency', 'multivariate-ma', 'rve-meta', 'component-nma']) {
      const response = await fetch(`${base}/${app}/index.html`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<script src="alm-live.js"><\/script>/);
    }
    assert.equal((await fetch(`${base}/..%2fTASK.md`)).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
