import fs from 'node:fs';
import path from 'node:path';

function loadIndexHtml() {
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  return fs.readFileSync(htmlPath, 'utf8');
}

describe('index.html Structure', () => {
  test('does not contain duplicate id attributes', () => {
    const html = loadIndexHtml();
    const ids = [...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(match => match[1]);
    const seen = new Set();
    const duplicates = new Set();

    ids.forEach(id => {
      if (seen.has(id)) {
        duplicates.add(id);
      } else {
        seen.add(id);
      }
    });

    expect([...duplicates]).toEqual([]);
  });

  test('CDN scripts include integrity and crossorigin attributes', () => {
    const html = loadIndexHtml();
    expect(html).toMatch(/<script[^>]+chart\.umd\.min\.js[^>]+integrity="sha384-[^"]+"[^>]+crossorigin="anonymous"[^>]*><\/script>/);
    expect(html).toMatch(/<script[^>]+docx@7\.1\.0\/build\/index\.js[^>]+integrity="sha384-[^"]+"[^>]+crossorigin="anonymous"[^>]*><\/script>/);
  });

  test('app.js is loaded with defer', () => {
    const html = loadIndexHtml();
    expect(html).toMatch(/<script\s+src="app\.js"\s+defer><\/script>/);
  });
});
