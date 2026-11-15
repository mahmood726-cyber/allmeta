// Lane audit9: local-ai claims checked against the repo and a real Chrome load (no Ollama:
// status "Not detected", one ERR_CONNECTION_REFUSED on GET /api/tags, as designed).
//  1. "allmeta apps can call it for ... GRADE justifications": no GRADE page includes
//     shared/localllm.js (only pico, effect-size-converter, rct-extractor do).
//  2. The "Which apps use it?" table omits rct-extractor, the app that requests 2x2 counts.
//  3. "This page's JavaScript calls .../api/generate": this page only calls GET /api/tags;
//     /api/generate is called by the apps through shared/localllm.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
const html = read('local-ai/index.html');
const page = html.slice(0, html.indexOf('<script'));
const pageJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');   // inline scripts

// apps (top-level dirs) whose index.html loads shared/localllm.js
const users = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'local-ai' && existsSync(new URL(d.name + '/index.html', ROOT)))
  .map(d => d.name)
  .filter(n => /shared\/localllm\.js/.test(read(n + '/index.html')));

test('local-ai: every app that loads localllm.js is listed (control: there are some)', () => {
  assert.ok(users.includes('pico') && users.includes('effect-size-converter'), users.join(','));
  for (const u of users) assert.match(page, new RegExp('href="\.\./' + u + '/"'), u + ' not listed');
});

test('local-ai: no claimed use without an app behind it (GRADE)', () => {
  assert.ok(!users.some(u => /grade/i.test(u)));
  assert.doesNotMatch(page, /GRADE justifications/);
});

test('local-ai: the privacy note names the endpoint this page actually calls', () => {
  assert.match(pageJs, /api\/tags/);
  assert.doesNotMatch(pageJs, /api\/generate/);                 // control: page never generates
  assert.doesNotMatch(page, /This page's JavaScript calls <code>http:\/\/127\.0\.0\.1:11434\/api\/generate/);
});
