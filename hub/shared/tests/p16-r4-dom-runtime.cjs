// Pinned DOM dependency for the combined and independent full-page runners.
// Dependencies and caches stay in OS temp; no browser/layout evidence is claimed.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const prefix = path.join(os.tmpdir(), 'allmeta-p16-r4-linkedom-0.18.12');
const packageFile = path.join(prefix, 'node_modules/linkedom/package.json');
if (!fs.existsSync(packageFile)) {
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npm)) throw Error('npm CLI not found beside Node; linkedom replay remains unverified');
  fs.mkdirSync(prefix, { recursive: true });
  execFileSync(process.execPath, [npm, 'install', '--prefix', prefix, '--cache', path.join(prefix, 'cache'),
    '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', 'linkedom@0.18.12'],
  { cwd: prefix, stdio: 'pipe', timeout: 120000 });
}
if (JSON.parse(fs.readFileSync(packageFile, 'utf8')).version !== '0.18.12') throw Error('Wrong linkedom version');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return resolve.call(this, request === 'linkedom' ? path.join(prefix, 'node_modules/linkedom') : request, parent, ...rest);
};
console.log('Full-page replay: Node ' + process.version + ', linkedom 0.18.12');
