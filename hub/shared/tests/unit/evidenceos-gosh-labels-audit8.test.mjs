// Lane audit8: label defects found by reproducing the displayed numbers.
//  evidenceos: every summary count in data/report.json recounts from its 97 trial records and
//  12 OpenAlex records (independent recount, scratch out/eos.txt). But the tiles were crossed:
//  "OA publication candidates" showed publication_candidates (12, all records) and
//  "OpenAlex records screened" showed oa_publication_candidates (11, is_oa only).
//  gosh-metareg: every number matches metafor::rma(mods = ~mod, method = "DL") over all 848
//  subsets (median beta 0.008733163, sd 0.001165131; 200 random fits to 2e-15), but the page
//  description said it scatters "R²"; the plot is beta against residual I².
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

test('evidenceos: each tile label sits on the count it names', () => {
  const html = read('evidenceos/index.html');
  const js = read('evidenceos/app.js');
  const report = JSON.parse(read('evidenceos/data/report.json'));
  const label = id => (html.match(new RegExp('<span>([^<]+)</span><strong id="' + id + '"')) || [])[1];
  const field = id => (js.match(new RegExp('setText\\("' + id + '", summary\\.(\\w+)\\)')) || [])[1];
  const pubs = report.publications;
  const tiles = ['metric-publications', 'metric-oa'].map(id => [label(id), report.summary[field(id)]]);
  const want = { 'OA publication candidates': pubs.filter(p => p.is_oa).length, 'OpenAlex records screened': pubs.length };
  assert.equal(want['OA publication candidates'], 11);
  assert.equal(want['OpenAlex records screened'], 12);
  for (const [lab, val] of tiles) assert.equal(val, want[lab], `${lab} shows ${val}`);
});

test('gosh-metareg: the description names what the plot shows (residual I², not R²)', () => {
  const html = read('gosh-metareg/index.html');
  const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.doesNotMatch(desc, /R²/, desc);
  assert.match(desc, /I²/, desc);
  assert.match(html, /Residual I²/);   // the plot axis (control)
});
