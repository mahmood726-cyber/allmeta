import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { replayEndpoint } from './p16-browser-port.mjs';

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}
async function close(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function availableEndpoint(allocate, occupied) {
  const endpoint = await allocate();
  assert.notEqual(endpoint.port, occupied, 'the replay must not select the occupied server');
  assert.equal(endpoint.baseURL, `http://127.0.0.1:${endpoint.port}`);
  const probe = createServer();
  await listen(probe, endpoint.port);
  await close(probe);
}

test('P16 browser port control: the allocated endpoint can start a loopback server', async () => {
  await availableEndpoint(replayEndpoint);
});

test('P16 browser port plant: an occupied port does not block a separate replay', async () => {
  const occupied = createServer();
  await listen(occupied, 0);
  try {
    await availableEndpoint(replayEndpoint, occupied.address().port);
  } finally {
    await close(occupied);
  }
});

test('P16 browser port plant: the same assertion rejects a fixed-port reconstruction', async () => {
  const occupied = createServer();
  await listen(occupied, 0);
  try {
    const source = readFileSync(new URL('p16-browser-port.mjs', import.meta.url), 'utf8');
    const anchor = "server.listen(0, '127.0.0.1'";
    assert.ok(source.includes(anchor), 'fixed-port plant anchor must exist');
    // Same failure mechanism as historical port 8088, using a port we own.
    const planted = source.replace(anchor, `server.listen(${occupied.address().port}, '127.0.0.1'`);
    const module = await import('data:text/javascript;base64,' + Buffer.from(planted).toString('base64'));
    await assert.rejects(() => availableEndpoint(module.replayEndpoint, occupied.address().port),
      { code: 'EADDRINUSE' });
  } finally {
    await close(occupied);
  }
});
