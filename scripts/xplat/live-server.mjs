import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

export function withinRoot(root, filename, paths = path) {
  // fileURLToPath(directoryURL) retains a trailing separator. String-prefix
  // checks that append another separator reject every file on Windows.
  const relative = paths.relative(paths.resolve(root), paths.resolve(filename));
  return relative !== '..' && !relative.startsWith('..' + paths.sep) && !paths.isAbsolute(relative);
}

export function createLiveServer(root) {
  const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
    '.json':'application/json', '.css':'text/css', '.wasm':'application/wasm' };
  return createServer(async (req, res) => {
    try {
      const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!withinRoot(root, filename)) { res.writeHead(403).end(); return; }
      const target = (await stat(filename)).isDirectory() ? path.join(filename, 'index.html') : filename;
      const bytes = await readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' }).end(bytes);
    } catch { res.writeHead(404).end(); }
  });
}
