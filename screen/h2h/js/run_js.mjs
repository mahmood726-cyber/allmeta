// Node driver for rank-core.js (the exact file the browser app loads) on one review, with the shared priors.
//   node h2h/js/run_js.mjs --review Donners_2021 --config u4 --priors h2h/priors --data-dir E:/.../synergy_plus_local \
//        [--emb-dir E:/.../emb/<model> --emb-w 1 --emb-onnx-sha256 <sha>] [--retrain-every 1] [--seeds 101,202] \
//        --out results/screen/Donners_2021.json
// Without --heldout-ok the review must be listed in sets/dev.txt (DEV exploration only); with --heldout-ok it must be
// a registered held-out review (the frozen candidate's single held-out run). Missing manifests are an error.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { parseCSV } from "../../bench/extract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes("--" + k);
const die = (code, msg) => { console.error(msg); process.exit(code); };
const review = arg("review"), out = arg("out"), cfgName = arg("config", "u4");
const priorsDir = arg("priors", join(HERE, "..", "priors"));
const dataDir = arg("data-dir", process.env.H2H_DATA || "E:/screen-h2h-data/synergy_plus_local");
const rankFile = arg("rank-core", join(HERE, "rank-core.js"));
if (!review || !out) die(2, "usage: --review K --out F [--config u4] [--emb-dir D --emb-w W]");

const readSet = (f) => readFileSync(join(HERE, "..", "sets", f), "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
const dev = new Set(readSet("dev.txt"));
const heldout = new Set([...readSet("primary_plus_devoverlap.txt"), ...readSet("official_test16.txt")]);
if (flag("heldout-ok")) { if (!heldout.has(review)) die(3, `${review} is not a registered held-out review`); }
else if (!dev.has(review)) die(3, `refusing ${review}: DEV exploration is restricted to sets/dev.txt`);

const src = readFileSync(rankFile, "utf8");
const rankSha = createHash("sha256").update(src).digest("hex");
if (arg("expect-rank-sha256") && arg("expect-rank-sha256") !== rankSha) die(5, "rank-core.js differs from the frozen candidate");
const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx, { filename: "rank-core.js" });
const SR = ctx.ScreenRank;

const csvBuf = readFileSync(join(dataDir, review + ".csv"));
const csvSha = createHash("sha256").update(csvBuf).digest("hex");
const rows = parseCSV(csvBuf.toString("utf8"));
const pri = JSON.parse(readFileSync(join(priorsDir, review + ".json"), "utf8"));
// the same digests core.py computes: ordered IDs, and ordered (id, label, title, abstract) tuples
const idSha = createHash("sha256").update(rows.map((r) => r.openalex_id || "").join("\n"), "utf8").digest("hex");
const dh = createHash("sha256");
for (const r of rows) dh.update([r.openalex_id, r.label_included, r.title, r.abstract].join("\x1f") + "\x1e", "utf8");
const dsSha = dh.digest("hex");
if (pri.ids_sha256 !== idSha) die(4, "row order differs from the priors file");
if (pri.dataset_sha256 !== dsSha) die(4, "dataset content differs from the registered digest");
const badLab = rows.filter((r) => !["0", "1"].includes(String(r.label_included).trim()));
if (badLab.length) die(4, `label_included outside {0,1} in ${badLab.length} rows`);
if (rows.some((r) => !String(r.openalex_id || "").trim())) die(4, "every record needs an openalex_id");
const labels = Int8Array.from(rows.map((r) => (String(r.label_included).trim() === "1" ? 1 : 0)));
const docs = rows.map((r) => (r.title || "") + " " + (r.abstract || ""));

const U4 = SR.ELAS_U4;
const cfg = { C: Number(arg("C", U4.C)), ratio: Number(arg("ratio", U4.ratio)), retrainEvery: Number(arg("retrain-every", "1")) };
let t0 = Date.now();
const tfOpts = { ngram: [1, Number(arg("ngram-max", U4.ngram[1]))], minDf: Number(arg("min-df", U4.minDf)),
  maxDf: Number(arg("max-df", U4.maxDf)), sublinear: arg("sublinear", String(U4.sublinear)) === "true" };
cfg.tfidf = tfOpts;
let X = SR.tfidf(docs, tfOpts);
const embDir = arg("emb-dir");
let embMeta = null, embSha = null;
if (embDir) {
  embMeta = JSON.parse(readFileSync(join(embDir, review + ".f32.json"), "utf8"));
  const buf = readFileSync(join(embDir, review + ".f32"));
  embSha = createHash("sha256").update(buf).digest("hex");
  if (embMeta.N !== rows.length) die(6, "embedding N mismatch");
  if (embMeta.input_csv_sha256 !== csvSha) die(6, "embeddings were computed from a different CSV");
  if (arg("emb-onnx-sha256") && embMeta.onnx_sha256 !== arg("emb-onnx-sha256")) die(6, "embedding model weights differ from the frozen ones");
  const E = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (E.length !== embMeta.N * embMeta.dim) die(6, "embedding file size mismatch");
  X = cfgName.startsWith("emb") ? SR.appendDense({ rows: X.rows.map(() => ({ idx: new Int32Array(0), val: new Float64Array(0) })), dim: 0 }, E, embMeta.dim, 1)
    : SR.appendDense(X, E, embMeta.dim, Number(arg("emb-w", "1")));
}
const featSec = (Date.now() - t0) / 1000;
const seeds = arg("seeds", "101,202,303,404,505,606,707,808,909,1010").split(",");
const runs = {};
for (const s of seeds) {
  const errors = []; // PROTOCOL 8: one retry from scratch, then recorded as failed (never dropped)
  for (let attempt = 1; attempt <= 2 && !runs[s]; attempt++) {
    t0 = Date.now();
    try {
      const order = SR.simulate(X, labels, pri.priors[s], { ...cfg, seed: 1 });
      if (JSON.stringify(order.slice(0, pri.priors[s].length)) !== JSON.stringify(pri.priors[s])) throw new Error("did not start from the shared starting records");
      runs[s] = { order, seconds: (Date.now() - t0) / 1000, attempts: attempt, errors };
      console.log(`[screen ${cfgName}] ${review} seed ${s} n=${order.length} (${runs[s].seconds}s)`);
    } catch (e) { errors.push(`attempt ${attempt}: ${e && e.message}`); }
  }
  if (!runs[s]) { runs[s] = { failed: true, attempts: 2, errors }; console.log(`[screen ${cfgName}] ${review} seed ${s} FAILED twice`); }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ tool: "screen", config: cfgName, cfg, review, ids_sha256: idSha, dataset_sha256: dsSha,
  rank_core_sha256: rankSha, emb: embMeta, emb_sha256: embSha, feature_seconds: featSec, node: process.version, runs }));
