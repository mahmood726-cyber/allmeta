// Confirms that the JS dataset digest (run_js.mjs) equals the Python one (core.dataset_digest, stored in priors/*.json)
// for every registered review.  node h2h/js/check_digests.mjs [data-dir]
import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseCSV } from "../../bench/extract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2] || process.env.H2H_DATA || "E:/screen-h2h-data/synergy_plus_local";
let ok = 0; const bad = [];
for (const f of readdirSync(join(HERE, "..", "priors")).filter((x) => x.endsWith(".json"))) {
  const pri = JSON.parse(readFileSync(join(HERE, "..", "priors", f), "utf8"));
  const rows = parseCSV(readFileSync(join(dataDir, pri.review + ".csv"), "utf8"));
  const h = createHash("sha256");
  for (const r of rows) h.update([r.openalex_id, r.label_included, r.title, r.abstract].join("\x1f") + "\x1e", "utf8");
  const ids = createHash("sha256").update(rows.map((r) => r.openalex_id || "").join("\n"), "utf8").digest("hex");
  if (h.digest("hex") === pri.dataset_sha256 && ids === pri.ids_sha256 && rows.length === pri.N) ok++; else bad.push(pri.review);
}
console.log(`digest parity: ${ok} ok, ${bad.length} mismatched ${JSON.stringify(bad)}`);
process.exit(bad.length ? 1 : 0);
