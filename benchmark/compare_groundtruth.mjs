// Build the honest per-dataset head-to-head markdown table:
//   allmeta (new recipe, results_headless.json) vs ASReview's own code
//   (results_asreview_groundtruth.json, NB / ELAS u3). Both measured here with the
//   same WSS@95 definition and continuous (n_query=1) protocol.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(join(__dirname, f), "utf8").replace(/\bNaN\b/g, "null"));
const alm = readJson(process.env.ALM || "results_headless.json");
const asr = readJson("results_asreview_groundtruth.json");
const manifest = JSON.parse(readFileSync(join(__dirname, "data", "corpora", "manifest.json"), "utf8"));

const r3 = (x) => (x == null || Number.isNaN(x)) ? "—" : x.toFixed(3);
let cohenA = [], cohenR = [], allA = [], allR = [], synA = [], synR = [];
const rows = [];
for (const d of manifest.datasets) {
  const a = alm.perDataset[d.id], r = asr.perDataset[d.id];
  if (!a) continue;
  const av = a.WSS_at_95, rv = r ? r.nb_wss95 : null;
  rows.push({ label: d.label, suite: d.suite, N: a.N, prev: a.prevalence, av, rv, d: (rv != null ? av - rv : null) });
  allA.push(av); if (rv != null) allR.push(rv);
  if (d.suite === "Cohen 2006") { cohenA.push(av); if (rv != null) cohenR.push(rv); }
  else { synA.push(av); if (rv != null) synR.push(rv); }
}
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log(`| Dataset | Suite | N | prev | allmeta WSS@95 | ASReview-NB WSS@95 | Δ |`);
console.log(`|---|---|--:|--:|--:|--:|--:|`);
for (const x of rows) {
  const dstr = x.d == null ? "—" : (x.d >= 0 ? "+" : "") + x.d.toFixed(3);
  console.log(`| ${x.label} | ${x.suite === "Cohen 2006" ? "Cohen" : "SYN"} | ${x.N} | ${(x.prev * 100).toFixed(1)}% | ${r3(x.av)} | ${r3(x.rv)} | ${dstr} |`);
}
console.log(`\n**Means** — Cohen-15: allmeta ${r3(mean(cohenA))} vs ASReview ${r3(mean(cohenR))} (Δ ${(mean(cohenA) - mean(cohenR) >= 0 ? "+" : "") + (mean(cohenA) - mean(cohenR)).toFixed(3)})`);
console.log(`SYNERGY-4: allmeta ${r3(mean(synA))} vs ASReview ${r3(mean(synR))}`);
console.log(`All-19: allmeta ${r3(mean(allA))} vs ASReview ${r3(mean(allR))} (Δ ${(mean(allA) - mean(allR) >= 0 ? "+" : "") + (mean(allA) - mean(allR)).toFixed(3)})`);
