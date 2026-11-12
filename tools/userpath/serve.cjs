// serve.cjs <root> <port> — static server for a worktree; /r-shiny/* is proxied
// from the live site (same bytes users get) and cached on C:.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), https = require("https");
const root = path.resolve(process.argv[2]), port = +process.argv[3] || 8765;
const LIVE = "https://mahmood726-cyber.github.io/allmeta";
const CACHE = process.env.RSHINY_CACHE || require("path").join(require("os").tmpdir(), "allmeta-rshiny-cache");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".tgz": "application/octet-stream", ".gz": "application/octet-stream" };
function send(res, code, body, type) { res.writeHead(code, { "Content-Type": type || "text/plain", "Cache-Control": "no-store" }); res.end(body); }
function fetchLive(u, cb) {
  https.get(u, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return fetchLive(new URL(r.headers.location, u).href, cb);
    const bufs = []; r.on("data", (d) => bufs.push(d)); r.on("end", () => cb(r.statusCode, Buffer.concat(bufs)));
  }).on("error", (e) => cb(502, Buffer.from(String(e))));
}
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const ext = path.extname(p);
  if (p.startsWith("/r-shiny/")) {
    const c = path.join(CACHE, p);
    if (fs.existsSync(c)) return send(res, 200, fs.readFileSync(c), types[ext]);
    return fetchLive(LIVE + p, (code, body) => {
      if (code === 200) { fs.mkdirSync(path.dirname(c), { recursive: true }); fs.writeFileSync(c, body); }
      send(res, code, body, types[ext]);
    });
  }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, "not found");
  send(res, 200, fs.readFileSync(f), types[ext]);
}).listen(port, "127.0.0.1", () => console.log("serving " + root + " on " + port));
