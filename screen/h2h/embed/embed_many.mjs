#!/usr/bin/env node
// embed_many.mjs -- embed many CSVs with ONE model via embed.mjs, skipping outputs that already
// exist (an output counts as done only if <name>.f32 AND <name>.f32.json both exist).
//
// usage:
//   node embed_many.mjs --model <hf id> --dtype q8 --device cpu|wasm --prefix "<prefix or empty>"
//        --pooling mean|cls --max-tokens 256 --out-dir <dir>
//        (--in-dir <dir of *.csv> | --list <txt, one csv path per line> | <csv> <csv> ...)
//        [--batch 32] [--revision <sha>] [--model-dir <dir>] [--force]
//        [--csv-dir <dir> (for --list files holding bare review names)] [--forbid <names.txt>]
//
// The model revision is resolved ONCE (HF API, main) and passed to every child, so all CSVs in
// a run use the same weights. Each CSV runs in its own `node embed.mjs` process.
// Exit code: 0 if every CSV is done (embedded now or skipped), 1 if any failed.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opts = {}; const files = [];
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--force') { opts.force = true; continue; }
  if (k.startsWith('--')) {
    if (i + 1 >= argv.length) { console.error(`missing value for ${k}`); process.exit(2); }
    opts[k.slice(2)] = argv[++i];
  } else files.push(k);
}
for (const req of ['model', 'dtype', 'device', 'prefix', 'pooling', 'max-tokens', 'out-dir']) {
  if (opts[req] === undefined) { console.error(`missing --${req}`); process.exit(2); }
}
if (opts['in-dir']) {
  for (const f of fs.readdirSync(opts['in-dir']).sort()) if (f.toLowerCase().endsWith('.csv')) files.push(path.join(opts['in-dir'], f));
}
if (opts.list) {
  // lines: CSV paths, or bare review names resolved as <--csv-dir>/<name>.csv; '#' = comment
  for (let line of fs.readFileSync(opts.list, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/\.csv$/i.test(line)) {
      if (!opts['csv-dir']) { console.error(`--list entry '${line}' is a bare name; pass --csv-dir`); process.exit(2); }
      line = path.join(opts['csv-dir'], line + '.csv');
    }
    files.push(line);
  }
}
if (files.length === 0) { console.error('no input CSVs'); process.exit(2); }
// --forbid <txt>: review names (CSV basename without .csv; '#' comments) that must never be
// embedded. The whole run is refused if any input matches; an empty list is also refused.
if (opts.forbid) {
  const bad = new Set(fs.readFileSync(opts.forbid, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  if (bad.size === 0) { console.error(`--forbid list ${opts.forbid} is empty; refusing`); process.exit(2); }
  const hit = files.filter((f) => bad.has(path.basename(f).replace(/\.csv$/i, '')));
  if (hit.length) { console.error(`REFUSED: inputs on the forbidden list:\n  ${hit.join('\n  ')}`); process.exit(5); }
}
const missing = files.filter((f) => !fs.existsSync(f));
if (missing.length) { console.error(`input CSVs not found:\n  ${missing.join('\n  ')}`); process.exit(2); }

let revision = opts.revision;
if (!revision && !opts['model-dir']) {
  const r = await fetch(`https://huggingface.co/api/models/${opts.model}/revision/main`);
  if (!r.ok) { console.error(`cannot resolve revision (HTTP ${r.status}); pass --revision <sha>`); process.exit(3); }
  revision = (await r.json()).sha;
}
const outDir = path.resolve(opts['out-dir']);
fs.mkdirSync(outDir, { recursive: true });

const passthrough = ['model', 'dtype', 'device', 'prefix', 'pooling', 'max-tokens', 'batch', 'model-dir'];
const summary = { done: [], skipped: [], failed: [] };
for (const [i, csv] of files.entries()) {
  const out = path.join(outDir, path.basename(csv).replace(/\.csv$/i, '') + '.f32');
  if (!opts.force && fs.existsSync(out) && fs.existsSync(out + '.json')) {
    console.error(`[${i + 1}/${files.length}] skip (exists) ${out}`); summary.skipped.push(csv); continue;
  }
  const childArgs = [path.join(SCRIPT_DIR, 'embed.mjs')];
  for (const k of passthrough) if (opts[k] !== undefined) childArgs.push(`--${k}`, opts[k]);
  if (revision) childArgs.push('--revision', revision);
  childArgs.push('--in', csv, '--out', out, '--quiet');
  console.error(`[${i + 1}/${files.length}] ${csv}`);
  const r = spawnSync(process.execPath, childArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status === 0 && fs.existsSync(out) && fs.existsSync(out + '.json')) {
    const meta = JSON.parse(fs.readFileSync(out + '.json', 'utf8'));
    console.error(`    ok N=${meta.N} dim=${meta.dim} ${meta.docs_per_s} docs/s`);
    summary.done.push(csv);
  } else {
    console.error(`    FAILED (exit ${r.status}${r.error ? ', ' + r.error.message : ''})`);
    summary.failed.push(csv);
  }
}
console.error(`embedded ${summary.done.length}, skipped ${summary.skipped.length}, failed ${summary.failed.length} of ${files.length}`);
if (summary.failed.length) console.error(`failed:\n  ${summary.failed.join('\n  ')}`);
process.exitCode = summary.failed.length ? 1 : 0;
