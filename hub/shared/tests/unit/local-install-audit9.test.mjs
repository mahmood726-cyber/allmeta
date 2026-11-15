// Lane audit9: local-install's R recipe, executed in R 4.6.0 (metafor 5.2.1, netmeta, mada,
// meta, metasens). The pairwise, netmeta (+netsplit/netheat/netrank) and mada blocks run.
// Defects:
//  1. The Copas block runs metagen(TE, seTE, data = d) after the DTA block has redefined d
//     (TP/FP/FN/TN), so it stops with "object 'TE' not found". It now pools the pairwise
//     block's data (metagen(yi, sei, data = dat)), which runs in R (scratch out/li3.txt).
//  2. install.packages(pkgs) lists four packages that are not on CRAN
//     (available.packages(), cloud.r-project.org, 2026-11-15): CopulaDTA, dmetar, baggr,
//     ipdmeta -- under a heading that calls the list "the CRAN packages allmeta uses".
//  3. "bayesmeta+Stan": bayesmeta does exact numerical integration; it does not use Stan.
//  4. "WebR covers 90% of use cases": an unsourced figure.
//  5. multinma was listed under JAGS; it is a Stan package (bnma is the JAGS one).
//  6. The Copy button put "buttonCopy" on the first line of the clipboard: a stray text node
//     "button" sat before the <button>, and the handler's regex looked for markup inside
//     textContent, so it never matched (Chrome clipboard read, scratch run/copy.cjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('local-install/index.html', ROOT), 'utf8');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('local-install: the Copas block pools a data frame that has the columns it names', () => {
  const i = html.indexOf('Publication bias — Copas');
  assert.ok(i > 0);
  const block = unesc(html.slice(i, html.indexOf('</pre>', i)));
  assert.doesNotMatch(block, /metagen\(TE, seTE, data = d\)/, 'd is the DTA frame at this point');
  assert.match(block, /metagen\(yi, sei, data = dat\)/);
  assert.match(unesc(html), /dat <- data\.frame\(yi = c\(/);   // the frame it uses (control)
});

test('local-install: install.packages(pkgs) lists only packages on CRAN', () => {
  const vec = html.slice(html.indexOf('pkgs <- c('), html.indexOf('install.packages(pkgs'));
  const listed = [...vec.matchAll(/^[^#\n]*$/gm)].join('\n');
  const names = [...listed.matchAll(/"([A-Za-z0-9.]+)"/g)].map(m => m[1]);
  assert.ok(names.includes('metafor') && names.length > 15, names.join(','));
  for (const p of ['CopulaDTA', 'dmetar', 'baggr', 'ipdmeta'])
    assert.ok(!names.includes(p), p + ' is not on CRAN');
});

test('local-install: no unsupported claims (bayesmeta+Stan, "90% of use cases")', () => {
  assert.doesNotMatch(html, /bayesmeta<\/code>\s*\+\s*Stan/);
  assert.doesNotMatch(html, /90% of use cases/);
});

test('local-install: multinma is listed under Stan, not JAGS', () => {
  const jags = html.match(/<h3>JAGS \(for (.*)<\/h3>/)[1];
  const stan = html.match(/<h3>Stan \(for (.*)<\/h3>/)[1];
  assert.doesNotMatch(jags, /multinma/);
  assert.match(stan, /multinma/);
});

test('local-install: the copied script is the code only (no "buttonCopy" first line)', () => {
  assert.match(html, /<pre id="pkg-script"><button class="copy"/);
  const handler = html.slice(html.indexOf('querySelectorAll("button.copy")'));
  assert.match(handler, /querySelectorAll\("button\.copy"\)\.forEach\(x => x\.remove\(\)\)/);
});
