// Compute sentence embeddings for every labelled SR corpus, for the OPTIONAL
// scientific-text-embedding screening layer (TF-IDF stays the free in-browser
// default). Uses a small local model via transformers.js (fully offline after the
// one-time model download). Writes one gzipped Float32 matrix per dataset to
// benchmark/data/embeddings/<id>.f32.gz  (layout: [int32 N][int32 D][N*D float32]).
//
// Run from benchmark/_embed:  node embed_corpora.mjs            (default MiniLM)
//                             MODEL=Xenova/bge-small-en-v1.5 node embed_corpora.mjs
import { pipeline, env } from "@xenova/transformers";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { gunzipSync, gzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPORA = join(__dirname, "..", "data", "corpora");
const OUT = join(__dirname, "..", "data", "embeddings");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
env.allowLocalModels = false; // pull from HF hub, then cache

const MODEL = process.env.MODEL || "Xenova/all-MiniLM-L6-v2";
const BATCH = Number(process.env.BATCH || 32);

function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => { const o = {}; header.forEach((h, i) => (o[h] = r[i] ?? "")); return o; });
}
const loadGz = (f) => parseCSV(gunzipSync(readFileSync(join(CORPORA, f))).toString("utf8"));

const manifest = JSON.parse(readFileSync(join(CORPORA, "manifest.json"), "utf8"));
console.log(`Embedding model: ${MODEL} (batch ${BATCH})`);
const extractor = await pipeline("feature-extraction", MODEL, { quantized: true });

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
for (const d of manifest.datasets) {
  if (ONLY && !ONLY.has(d.id)) continue;
  const gzf = d.id + ".csv.gz";
  if (!existsSync(join(CORPORA, gzf))) { console.log(`  (skip ${d.id}: not fetched)`); continue; }
  const outf = join(OUT, `${d.id}.f32.gz`);
  if (existsSync(outf) && !process.env.FORCE) { console.log(`  (have ${d.id})`); continue; }
  const recs = loadGz(gzf);
  const texts = recs.map((r) => `${r.title || ""}. ${r.abstract || ""}`.slice(0, 4000));
  const N = texts.length;
  let D = 0, mat = null, written = 0;
  const t0 = Date.now();
  for (let b = 0; b < N; b += BATCH) {
    const chunk = texts.slice(b, b + BATCH);
    const out = await extractor(chunk, { pooling: "mean", normalize: true });
    D = out.dims[out.dims.length - 1];
    if (!mat) mat = new Float32Array(N * D);
    const data = out.data; // Float32, shape [chunk.len, D]
    for (let i = 0; i < chunk.length; i++) for (let j = 0; j < D; j++) mat[(b + i) * D + j] = data[i * D + j];
    written += chunk.length;
    if (b % (BATCH * 20) === 0) process.stdout.write(`\r  ${d.id}: ${written}/${N}   `);
  }
  // header [N][D] then payload
  const head = Buffer.alloc(8); head.writeInt32LE(N, 0); head.writeInt32LE(D, 4);
  const payload = Buffer.from(mat.buffer, mat.byteOffset, mat.byteLength);
  writeFileSync(outf, gzipSync(Buffer.concat([head, payload])));
  console.log(`\r  ${d.id}: ${N} docs × ${D}d  (${((Date.now() - t0) / 1000).toFixed(1)}s)  → ${outf}`);
}
console.log("Embeddings done.");
