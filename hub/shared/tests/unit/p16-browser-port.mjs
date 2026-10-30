import { createServer } from 'node:net';

// Ask the OS for a free loopback port. Playwright still refuses reuse if another
// process claims it before Python starts, so it cannot test an unrelated tree.
export async function replayEndpoint() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return { port, baseURL: `http://127.0.0.1:${port}` };
}
