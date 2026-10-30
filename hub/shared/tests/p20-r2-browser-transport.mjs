// Select an unused loopback port; never reuse an unrelated server on port 8088.
import assert from 'node:assert/strict';
import { createServer } from 'node:net';

export function retargetSpec(source, origin) {
  const url = 'http://localhost:8088/effect-size-converter/index.html';
  assert.equal(source.split(url).length, 2, 'expected exactly one converter URL');
  return source.replace(url, `${origin}/effect-size-converter/index.html`);
}

export async function browserTransport(source) {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  return { port, origin, source: retargetSpec(source, origin) };
}
