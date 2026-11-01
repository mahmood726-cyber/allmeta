import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Pinned feat/v2-core exporter source, with only the isolated registration hooks omitted.
// The plant represents the layout regression: appending journal UI to a legacy bar.
const hashes = {"chart-download": "7c21d0236af0515f7d8b424853d1c06f83f9e06327c82fdcadf1018a5fd5d883", "chart-export-auto": "a9c86241bb5b291b42d0a14ba388e952d2126ba5bd9ca747407ac2466543c00d"};
const digest = source => createHash('sha256').update(source).digest('hex');
const legacy = source => source.replace(/  \/\/ Journal presets: begin\n[\s\S]*?  \/\/ Journal presets: end\n/g, '');
for (const [name, hash] of Object.entries(hashes)) {
  test(`${name}: original exporter code stays byte-identical outside registration hooks`, () => {
    const source = readFileSync(new URL(`../../${name}.js`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(digest(legacy(source)), hash);
    const plant = name === 'chart-export-auto'
      ? legacy(source).replace('return bar;', "bar.appendChild(document.createElement('fieldset')); return bar;")
      : legacy(source).replace('target.innerHTML = `', 'target.innerHTML = `<fieldset>Journal preset</fieldset>');
    assert.notEqual(plant, legacy(source), 'The plant must change the legacy DOM code');
    assert.notEqual(digest(plant), hash);
  });
}
