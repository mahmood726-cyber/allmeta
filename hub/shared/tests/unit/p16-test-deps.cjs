// Resolve the existing review dependency without reading environment variables,
// installing packages, or changing application/test assertions.
const Module = require('node:module');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
try {
  require.resolve('linkedom');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  const review = Module.createRequire(join(tmpdir(), 'p16-round2-node-deps/package.json'));
  const dependency = review.resolve('linkedom');
  const version = review('linkedom/package.json').version;
  if (version !== '0.18.12') throw Error('Expected existing linkedom 0.18.12; found ' + version);
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return resolve.call(this, request === 'linkedom' ? dependency : request, ...args);
  };
}
