import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../../../', import.meta.url);
const require = createRequire(new URL('hub/shared/tests/package.json', root));
for (const name of ['linkedom', '@playwright/test', 'playwright']) {
  try { console.log(name + ': available at ' + require.resolve(name)); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; console.log(name + ': unavailable'); }
}
for (const path of ['correlation-ma/validate/MANIFEST.json', 'correlation-ma/validate/MANIFEST-plus.json']) {
  const manifest = JSON.parse(readFileSync(new URL(path, root), 'utf8'));
  for (const f of manifest.files) {
    const url = new URL(path.endsWith('MANIFEST-plus.json') ? f.path : '../../' + f.path, new URL(path, root));
    // The base manifest paths are app-relative; plus paths are validate-relative.
    const actualURL = path.endsWith('MANIFEST-plus.json') ? url : new URL('correlation-ma/' + f.path, root);
    const bytes = readFileSync(actualURL);
    const lf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    const hash = b => createHash('sha256').update(b).digest('hex');
    console.log(JSON.stringify({ manifest: path, file: f.path, rawMatch: hash(bytes) === f.sha256,
      lfMatch: hash(lf) === f.sha256, rawBytes: bytes.length, lfBytes: lf.length, pinnedBytes: f.bytes }));
  }
}
