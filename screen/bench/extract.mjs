// Verbatim extraction of functions from the SHIPPED Screen app (app/screen/index.html).
//
// Nothing here re-implements Screen: each function / variable statement is located in
// the shipped HTML and its exact source text is copied (by brace / paren matching) into
// a Node `vm` sandbox. The benchmark therefore exercises byte-for-byte the code a
// reviewer runs in the browser. If a name cannot be found, extraction throws, so a
// future edit to the app can never silently fall back to stale code.
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import vm from "vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const APP_HTML = join(__dirname, "..", "app", "screen", "index.html");

export function appSource() {
  const src = readFileSync(APP_HTML, "utf8");
  return { src, sha256: createHash("sha256").update(readFileSync(APP_HTML)).digest("hex") };
}

function extractFunction(src, name) {
  const m = new RegExp("function\\s+" + name + "\\s*\\(").exec(src);
  if (!m) throw new Error("function not found in shipped app: " + name);
  let depth = 0;
  for (let j = src.indexOf("{", m.index); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error("unbalanced braces for " + name);
}

function extractVarStmt(src, name) {
  const m = new RegExp("var\\s+" + name + "\\s*=").exec(src);
  if (!m) throw new Error("var not found in shipped app: " + name);
  let depth = 0, inStr = false, q = "";
  for (let j = src.indexOf("=", m.index) + 1; j < src.length; j++) {
    const c = src[j];
    if (inStr) { if (c === q && src[j - 1] !== "\\") inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === ";" && depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error("no statement end for " + name);
}

// Record-normalisation helpers shared by both benchmarks.
const IMPORT_FUNCS = ["clean", "splitAuthors", "freshId", "dec", "normalizeImported"];

// Active-learning ranker. NOTE: ML_NGRAM_MAX, ML_DF_MAX_FRAC and `dec` were missing from
// allmeta's benchmark/run_headless.mjs, which made it throw a ReferenceError against the
// current app; they are included here. (This harness fix is documented here and in the
// README; it is not described in the paper.)
// mlCollectLabelled / mlTrainOn are the app's Train-button path; they are extracted only so
// bench/test_protocol.mjs can confirm the UI training gate (2 relevant + 2 irrelevant).
export const RANKER = {
  vars: ["_autoId", "ML_STOP", "ML_TF", "ML_MODEL_MODE", "ML_NGRAM_MAX", "ML_NB_ALPHA", "ML_BALANCE_RATIO", "ML_DF_MAX_FRAC"],
  funcs: [...IMPORT_FUNCS, "mlUnigrams", "mlTokenize", "mlText", "mlBuildVocab", "mlVector", "sigmoid",
    "mlSampleWeights", "mlFit", "mlPredict", "_lgamma", "_logChoose", "_phyper", "mlBuscarP",
    "mulberry32", "simulateActiveLearning", "mlCollectLabelled", "mlTrainOn"],
  exports: ["simulateActiveLearning", "normalizeImported", "mlBuildVocab", "mlFit", "mlPredict", "mlBuscarP",
    "mulberry32", "mlTrainOn"],
};

// De-duplication (DOI pass + blocked trigram-Jaccard pass).
export const DEDUP = {
  vars: ["_autoId", "STOP", "DEDUP_T_STRICT"],
  funcs: [...IMPORT_FUNCS, "normTitle", "trigrams", "jaccard", "firstAuthorKey", "dedupCore"],
  exports: ["normalizeImported", "dedupCore"],
};

export function loadShipped(spec) {
  const { src, sha256 } = appSource();
  let code = "'use strict';\n";
  for (const v of spec.vars) code += extractVarStmt(src, v) + "\n";
  for (const f of spec.funcs) code += extractFunction(src, f) + "\n";
  code += "\nmodule.exports = { " + spec.exports.map((e) => e + ": " + e).join(", ") + " };\n";
  const sandbox = { module: { exports: {} }, performance: { now: () => 0 }, Math, Object, Array, String, Number,
    JSON, Set, Float64Array, isFinite, parseInt, parseFloat, RegExp };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "screen_extracted.js" });
  for (const e of spec.exports) if (typeof sandbox.module.exports[e] !== "function") throw new Error("extraction failed: " + e);
  return { api: sandbox.module.exports, appSha256: sha256, extracted: [...spec.vars, ...spec.funcs] };
}

export function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => { const o = {}; header.forEach((h, i) => (o[h] = r[i] ?? "")); return o; });
}
