#!/usr/bin/env node
// embed.mjs -- embed title+abstract CSV rows with @huggingface/transformers (the same
// library + ONNX weights the browser app uses) and write row-major float32 LE (N x dim).
//
// usage:
//   node embed.mjs --model <hf id> --dtype q8 --device cpu|wasm --prefix "<text prefix or empty>"
//                  --pooling mean|cls --max-tokens 256 --in <csv> --out <file.f32>
//                  [--batch 32] [--revision <sha|branch>] [--model-dir <root of local models>]
//                  [--limit N] [--quiet]
//
// --device cpu   -> onnxruntime-node CPU EP (fast; dev experiments)
// --device wasm  -> onnxruntime-web WASM EP running inside Node (the browser app's backend)
// --revision     -> if omitted, the current commit sha of `main` is resolved from the HF API and
//                   used as the pinned revision (recorded in the sidecar).
// --model-dir    -> load <model-dir>/<model id>/ from disk only (no network), e.g. a local export.
//
// Cache: $TRANSFORMERS_CACHE, else $HF_HOME/transformers-js, else <script dir>/../hf-cache.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { parse } from 'csv-parse/sync';

const require = createRequire(import.meta.url);
const TF_REQUIRE = createRequire(require.resolve('@huggingface/transformers'));
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error(`unexpected argument: ${k}`);
    const key = k.slice(2);
    if (key === 'quiet') { a.quiet = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`missing value for ${k}`);
    a[key] = argv[++i];
  }
  return a;
}
const USAGE = 'usage: node embed.mjs --model <hf id> --dtype q8 --device cpu|wasm --prefix "<prefix or empty>" ' +
  '--pooling mean|cls --max-tokens 256 --in <csv> --out <file.f32> [--batch 32] [--revision <sha>] [--model-dir <dir>] [--limit N]';
let args;
try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message + '\n' + USAGE); process.exit(2); }
for (const req of ['model', 'dtype', 'device', 'prefix', 'pooling', 'max-tokens', 'in', 'out']) {
  if (args[req] === undefined) { console.error(`missing --${req}\n${USAGE}`); process.exit(2); }
}
const MODEL = args.model;
const DTYPE = args.dtype;
const DEVICE = args.device;
const PREFIX = args.prefix;            // may be ''
const POOLING = args.pooling;
const MAX_TOKENS = Number.parseInt(args['max-tokens'], 10);
const BATCH = args.batch !== undefined ? Number.parseInt(args.batch, 10) : 32;
const LIMIT = args.limit !== undefined ? Number.parseInt(args.limit, 10) : null;
const IN = path.resolve(args.in);
const OUT = path.resolve(args.out);
const MODEL_DIR = args['model-dir'] ? path.resolve(args['model-dir']) : null;
if (!['cpu', 'wasm'].includes(DEVICE)) { console.error('--device must be cpu or wasm'); process.exit(2); }
if (!['mean', 'cls'].includes(POOLING)) { console.error('--pooling must be mean or cls'); process.exit(2); }
if (!Number.isInteger(MAX_TOKENS) || MAX_TOKENS < 8) { console.error('--max-tokens must be an integer >= 8'); process.exit(2); }
if (!Number.isInteger(BATCH) || BATCH < 1) { console.error('--batch must be a positive integer'); process.exit(2); }
if (LIMIT !== null && (!Number.isInteger(LIMIT) || LIMIT < 1)) { console.error('--limit must be a positive integer'); process.exit(2); }
const log = (...m) => { if (!args.quiet) console.error(...m); };

const DTYPE_SUFFIX = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4', q4f16: '_q4f16', bnb4: '_bnb4' };
if (!(DTYPE in DTYPE_SUFFIX)) { console.error(`--dtype must be one of ${Object.keys(DTYPE_SUFFIX).join(', ')}`); process.exit(2); }

const CACHE_DIR = process.env.TRANSFORMERS_CACHE
  || (process.env.HF_HOME ? path.join(process.env.HF_HOME, 'transformers-js') : path.resolve(SCRIPT_DIR, '..', 'hf-cache'));

// read "version" from <dir>/package.json without going through package "exports"
function readPkgVersion(dir) {
  for (let d = dir, i = 0; i < 4; i++, d = path.dirname(d)) {
    const p = path.join(d, 'package.json');
    if (fs.existsSync(p)) { const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j.name && j.name.startsWith('onnxruntime')) return j.version; }
  }
  return null;
}
const sha256File = (p) => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

// ---------------------------------------------------------------- backend selection
// For wasm we hand transformers.js the onnxruntime-web module through the documented
// globalThis[Symbol.for('onnxruntime')] hook, so it takes its web code path (wasm EP).
let wasmInfo = null;
if (DEVICE === 'wasm') {
  // resolve onnxruntime-web exactly as @huggingface/transformers resolves it
  const ortWebDir = path.resolve(path.dirname(TF_REQUIRE.resolve('onnxruntime-web')), '..');
  // ort.node.min.mjs is onnxruntime-web's Node entry; it runs the same WASM kernels as the browser.
  const ort = await import(pathToFileURL(path.join(ortWebDir, 'dist', 'ort.node.min.mjs')).href);
  const ortMod = ort.default ?? ort;
  ortMod.env.wasm.wasmPaths = pathToFileURL(path.join(ortWebDir, 'dist') + path.sep).href;
  if (args['wasm-threads']) ortMod.env.wasm.numThreads = Number.parseInt(args['wasm-threads'], 10);
  globalThis[Symbol.for('onnxruntime')] = ortMod;
  const wasmFile = path.join(ortWebDir, 'dist', 'ort-wasm-simd-threaded.wasm');
  wasmInfo = {
    onnxruntime_web_version: readPkgVersion(ortWebDir),
    wasm_file: path.basename(wasmFile),
    wasm_sha256: fs.existsSync(wasmFile) ? await sha256File(wasmFile) : null,
    numThreads: ortMod.env.wasm.numThreads ?? null,
  };
}

const T = await import('@huggingface/transformers');
const { pipeline, env } = T;
env.cacheDir = CACHE_DIR;
if (MODEL_DIR) {
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = MODEL_DIR + path.sep;
} else {
  env.allowLocalModels = false;   // never let a stray local folder shadow the hub model
  env.allowRemoteModels = true;
}

// ---------------------------------------------------------------- revision pinning
let revision = args.revision ?? null;
let revisionSource = revision ? 'cli' : null;
if (!MODEL_DIR && !revision) {
  try {
    const r = await fetch(`https://huggingface.co/api/models/${MODEL}/revision/main`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (typeof j.sha !== 'string' || !/^[0-9a-f]{40}$/.test(j.sha)) throw new Error('no sha in API response');
    revision = j.sha; revisionSource = 'hf-api main@resolve-time';
  } catch (e) {
    // Offline: fall back to an already-cached pinned revision if exactly one exists.
    const cached = fs.existsSync(path.join(CACHE_DIR, MODEL))
      ? fs.readdirSync(path.join(CACHE_DIR, MODEL)).filter((d) => /^[0-9a-f]{40}$/.test(d)) : [];
    if (cached.length === 1) { revision = cached[0]; revisionSource = 'cache (offline)'; }
    else { console.error(`cannot resolve revision for ${MODEL} (${e.message}); pass --revision <sha>`); process.exit(3); }
  }
}
if (MODEL_DIR) {
  revision = 'main'; // ignored for local files
  const metaP = path.join(MODEL_DIR, MODEL, 'export_provenance.json');
  revisionSource = fs.existsSync(metaP) ? `local export (see ${path.relative(MODEL_DIR, metaP)})` : 'local';
}

// ---------------------------------------------------------------- read CSV
const csvBuf = fs.readFileSync(IN);
const csvSha = crypto.createHash('sha256').update(csvBuf).digest('hex');
let records = parse(csvBuf, { columns: true, bom: true, skip_empty_lines: false, relax_column_count: false });
if (records.length === 0) { console.error(`no rows in ${IN}`); process.exit(4); }
if (!('title' in records[0]) || !('abstract' in records[0])) {
  console.error(`CSV must have columns title, abstract; got: ${Object.keys(records[0]).join(', ')}`); process.exit(4);
}
const nTotal = records.length;
if (LIMIT !== null) records = records.slice(0, LIMIT);
const texts = records.map((r) => PREFIX + (r.title ?? '') + '. ' + (r.abstract ?? ''));
const N = texts.length;
log(`[embed] ${MODEL} rev=${revision} dtype=${DTYPE} device=${DEVICE} pooling=${POOLING} max=${MAX_TOKENS} N=${N}${LIMIT ? ` (of ${nTotal})` : ''}`);

// ---------------------------------------------------------------- model
const tLoad0 = performance.now();
const extractor = await pipeline('feature-extraction', MODEL, {
  dtype: DTYPE,
  // In wasm mode transformers.js sees an injected runtime (globalThis[Symbol.for('onnxruntime')])
  // and keeps an empty device list; 'auto' maps to that empty list, so no executionProviders are
  // passed and onnxruntime-web uses its default (and only Node-registered) backend: wasm.
  device: DEVICE === 'cpu' ? 'cpu' : 'auto',
  revision, cache_dir: CACHE_DIR,
});
const loadSeconds = (performance.now() - tLoad0) / 1000;
// The feature-extraction pipeline truncates at tokenizer.model_max_length; set it to --max-tokens.
const tokenizerMax = extractor.tokenizer.model_max_length;
extractor.tokenizer.model_max_length = MAX_TOKENS;

const onnxRel = `onnx/model${DTYPE_SUFFIX[DTYPE]}.onnx`;
const onnxPath = MODEL_DIR
  ? path.join(MODEL_DIR, MODEL, onnxRel)
  : path.join(CACHE_DIR, MODEL, revision, onnxRel);
const onnxExists = fs.existsSync(onnxPath);
const onnxSha = onnxExists ? await sha256File(onnxPath) : null;
const onnxBytes = onnxExists ? fs.statSync(onnxPath).size : null;

// ---------------------------------------------------------------- embed
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const tmpOut = OUT + `.partial.${process.pid}`; // per-process: two runners may race on one output
const fd = fs.openSync(tmpOut, 'w');
let dim = null;
// Count rows longer than --max-tokens (diagnostic only; done before timing starts).
let nTruncated = 0;
for (const t of texts) if (extractor.tokenizer.encode(t).length > MAX_TOKENS) nTruncated++;
const t0 = performance.now();
for (let s = 0; s < N; s += BATCH) {
  const batch = texts.slice(s, s + BATCH);
  const out = await extractor(batch, { pooling: POOLING, normalize: true });
  if (out.dims.length !== 2 || out.dims[0] !== batch.length) throw new Error(`unexpected output dims ${out.dims}`);
  if (dim === null) dim = out.dims[1];
  else if (dim !== out.dims[1]) throw new Error('dim changed between batches');
  const f32 = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
  for (let k = 0; k < f32.length; k++) if (!Number.isFinite(f32[k])) throw new Error(`non-finite value in batch at ${s}`);
  // Float32Array buffers are little-endian on x86/arm; assert to be safe.
  const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
  fs.writeSync(fd, buf);
  if (!args.quiet && (s / BATCH) % 10 === 0) {
    const el = (performance.now() - t0) / 1000;
    log(`  ${Math.min(s + BATCH, N)}/${N}  ${(Math.min(s + BATCH, N) / el).toFixed(1)} docs/s`);
  }
}
fs.closeSync(fd);
const seconds = (performance.now() - t0) / 1000;
if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('big-endian host: output would not be LE');
const expectBytes = N * dim * 4;
const gotBytes = fs.statSync(tmpOut).size;
if (gotBytes !== expectBytes) throw new Error(`size mismatch ${gotBytes} != ${expectBytes}`);
fs.renameSync(tmpOut, OUT);

const sidecar = {
  model: MODEL,
  model_source: MODEL_DIR ? 'local' : 'huggingface.co',
  revision,
  revision_source: revisionSource,
  onnx_file: onnxRel,
  onnx_sha256: onnxSha,
  onnx_bytes: onnxBytes,
  dtype: DTYPE,
  device: DEVICE,
  pooling: POOLING,
  normalize: true,
  prefix: PREFIX,
  text_template: '<prefix> + title + ". " + abstract',
  maxTokens: MAX_TOKENS,
  tokenizer_model_max_length_original: tokenizerMax ?? null,
  n_truncated: nTruncated,
  dim,
  N,
  N_csv_total: nTotal,
  limit: LIMIT,
  batch: BATCH,
  input_csv: IN,
  input_csv_sha256: csvSha,
  output: OUT,
  format: 'float32 little-endian, row-major (N x dim), rows in CSV order',
  seconds: Number(seconds.toFixed(3)),
  load_seconds: Number(loadSeconds.toFixed(3)),
  docs_per_s: Number((N / seconds).toFixed(2)),
  transformers_version: env.version,
  onnxruntime: DEVICE === 'wasm' ? wasmInfo : { onnxruntime_node_version: readPkgVersion(path.dirname(TF_REQUIRE.resolve('onnxruntime-node'))) },
  node_version: process.version,
  platform: `${process.platform}-${process.arch}`,
  created: new Date().toISOString(),
};
fs.writeFileSync(OUT + '.json', JSON.stringify(sidecar, null, 2));
log(`[embed] wrote ${OUT} (${N} x ${dim}) in ${seconds.toFixed(1)}s = ${sidecar.docs_per_s} docs/s; truncated ${nTruncated}/${N}`);
