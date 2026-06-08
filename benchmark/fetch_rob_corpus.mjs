// Fetch the RoBBR labelled Risk-of-Bias corpus for the allmeta /rob/ benchmark.
//
// Source: RoBBR — Risk of Bias Benchmark (arXiv:2411.18831, EMNLP 2025 main).
//   https://huggingface.co/datasets/RoBBR-Benchmark/RoBBR   (License: CC-BY-NC 4.0)
// Redistributed for non-commercial research reproducibility, with attribution.
// See benchmark/data/rob/SOURCE.md.
//
// The 99-record RobotReviewer subset is committed (gzipped) so the headline
// head-to-head reproduces offline. The larger train/full-test sets are
// git-ignored and fetched here on demand.
//
// Run:  node benchmark/fetch_rob_corpus.mjs           (all: train + full test + RR subset)
//       node benchmark/fetch_rob_corpus.mjs --subset  (RR subset only)
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "data", "rob");
const BASE = "https://huggingface.co/datasets/RoBBR-Benchmark/RoBBR/resolve/main";

const FILES = [
  { name: "Main_task_Cochrane_test_RobotReviewer_subset.json", always: true },
  { name: "Main_task_Cochrane_test.json", always: false },
  { name: "Main_task_Cochrane_train.json", always: false },
];

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
  return await r.text();
}

async function main() {
  const subsetOnly = process.argv.includes("--subset");
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  for (const f of FILES) {
    if (subsetOnly && !f.always) continue;
    process.stdout.write(`fetching ${f.name} … `);
    try {
      const text = await fetchJSON(`${BASE}/${f.name}`);
      writeFileSync(join(OUT, f.name), text);
      const parsed = JSON.parse(text);
      const n = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      console.log(`${n} records, ${(text.length / 1048576).toFixed(1)} MB`);
    } catch (e) {
      console.log("FAILED: " + e.message);
    }
  }
  console.log(`\nDone. Files in ${OUT}. (CC-BY-NC 4.0 — see SOURCE.md.)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
