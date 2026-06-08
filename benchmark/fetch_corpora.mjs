// Fetch labelled SR-screening corpora for the allmeta evidence benchmark.
//
// Sources (all CC0 / CC-BY / OHSU custom-open, redistributed for reproducibility):
//   • Cohen 2006 — the canonical 15-review TAR drug-class benchmark (OHSU custom open).
//   • A cross-domain subset of the ASReview SYNERGY collection (CC-BY) so the
//     reported WSS@95 distribution is not drug-class-only.
//
// Stored GZIPPED under benchmark/data/corpora/<id>.csv.gz to keep the repo small
// (abstract-heavy CSVs compress ~4x). run_benchmark.mjs reads them via zlib.
//
// Run:  node benchmark/fetch_corpora.mjs            (network required; ~60 MB raw -> ~16 MB gz)
//       node benchmark/fetch_corpora.mjs --cohen    (Cohen suite only)
import { gzipSync } from "zlib";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "data", "corpora");
const BASE = "https://raw.githubusercontent.com/asreview/systematic-review-datasets/metadata-v1-final/datasets";

const COHEN = [
  "ACEInhibitors", "ADHD", "Antihistamines", "AtypicalAntipsychotics", "BetaBlockers",
  "CalciumChannelBlockers", "Estrogens", "NSAIDS", "Opiods", "OralHypoglycemics",
  "ProtonPumpInhibitors", "SkeletalMuscleRelaxants", "Statins", "Triptans", "UrinaryIncontinence",
].map((t) => ({
  id: "cohen_" + t.toLowerCase(),
  url: `${BASE}/Cohen_2006/output/online/${t}.csv`,
  label: "Cohen " + t.replace(/([a-z])([A-Z])/g, "$1 $2"),
  topic: t, license: "OHSU custom open license", suite: "Cohen 2006",
}));

// Cross-domain SYNERGY subset (CC-BY 4.0). Mid-size, medical-leaning, to show the
// classifier generalises past drug-class reviews. Largest (>7k) skipped to bound repo size.
const SYNERGY = [
  { id: "appenzeller_herzog_2020", file: "Appenzeller-Herzog_2020", label: "Appenzeller-Herzog 2020 (Wilson disease)", topic: "Wilson disease" },
  { id: "kwok_2020", file: "Kwok_2020", label: "Kwok 2020 (virus metagenomics)", topic: "Virus metagenomics" },
  { id: "wolters_2018", file: "Wolters_2018", label: "Wolters 2018 (CHD & dementia)", topic: "Dementia" },
  { id: "bos_2018", file: "Bos_2018", label: "Bos 2018 (small-vessel disease & dementia)", topic: "Dementia" },
].map((d) => ({ ...d, url: `${BASE}/${d.file}/output/${d.file}.csv`, license: "CC-BY 4.0", suite: "SYNERGY" }));

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
  return await r.text();
}

// minimal CSV row counter that respects quotes (for the manifest stats only)
function quickStats(text) {
  // header has label_included; count rows where the trailing-ish label_included==1.
  // We do a tolerant parse: split into records honouring quotes, find the column.
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
  const header = (rows.shift() || []).map((h) => h.trim());
  const li = header.indexOf("label_included");
  const data = rows.filter((r) => r.length > 1);
  let pos = 0;
  if (li >= 0) for (const r of data) if (String(r[li]).trim() === "1") pos++;
  return { n: data.length, pos };
}

async function main() {
  const cohenOnly = process.argv.includes("--cohen");
  const targets = cohenOnly ? COHEN : COHEN.concat(SYNERGY);
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const t of targets) {
    process.stdout.write(`fetching ${t.id} … `);
    try {
      const text = await fetchText(t.url);
      const st = quickStats(text);
      const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
      writeFileSync(join(OUT, t.id + ".csv.gz"), gz);
      manifest.push({ id: t.id, label: t.label, topic: t.topic, license: t.license, suite: t.suite, url: t.url, n: st.n, relevant: st.pos, prevalence: st.n ? +(st.pos / st.n).toFixed(4) : 0, gz_bytes: gz.length });
      console.log(`N=${st.n}, relevant=${st.pos} (${(100 * st.pos / st.n).toFixed(1)}%), ${(gz.length / 1024).toFixed(0)} KB gz`);
    } catch (e) {
      console.log("FAILED: " + e.message);
    }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ generated: "by benchmark/fetch_corpora.mjs", count: manifest.length, datasets: manifest }, null, 2));
  const totalGz = manifest.reduce((a, m) => a + m.gz_bytes, 0);
  console.log(`\nWrote ${manifest.length} corpora to ${OUT} (${(totalGz / 1048576).toFixed(1)} MB gz total).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
