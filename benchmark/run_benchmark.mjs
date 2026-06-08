// allmeta evidence benchmark — drives the SHIPPED Screen code (no re-implementation)
// over labelled SR corpora and reports the numbers the 2026-06-08 review asked for:
//   • active-learning recall@k + WSS@95 vs a random-screening baseline (Cohen TAR sets)
//   • dedup recall on real author-labelled duplicates (Nagtegaal) + a transparent
//     reformatted-title precision/recall stress test (Cohen perturbation protocol)
//   • dedup throughput: blocked (shipped) vs the old O(n^2) brute pass, at scale
//
// Run:  node benchmark/run_benchmark.mjs   (from repo root; needs tests/playwright deps)
// Writes benchmark/results.json and prints a summary table.
import { createServer } from "http";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
// playwright is installed under tests/playwright/node_modules — resolve it from there.
const require = createRequire(import.meta.url);
const { chromium } = require(join(__dirname, "..", "tests", "playwright", "node_modules", "playwright"));
const ROOT = join(__dirname, "..");
const PORT = 8099;

// ---------- tiny static server (same-origin so the app's localStorage/CSP work) ----------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serve() {
  return new Promise((res) => {
    const srv = createServer((req, rep) => {
      try {
        let p = decodeURIComponent(req.url.split("?")[0]);
        if (p.endsWith("/")) p += "index.html";
        const fp = join(ROOT, p);
        const body = readFileSync(fp);
        rep.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
        rep.end(body);
      } catch { rep.writeHead(404); rep.end("404"); }
    });
    srv.listen(PORT, () => res(srv));
  });
}

// ---------- CSV ----------
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
const load = (f) => parseCSV(readFileSync(join(__dirname, "data", f), "utf8"));

// ---------- deterministic PRNG (Node side, for perturbation selection) ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function round(x, n = 4) { return Math.round(x * 10 ** n) / 10 ** n; }

async function main() {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/screen/index.html`);
  await page.waitForFunction(() => !!window.__almScreenpro);

  const results = { generatedNote: "Drives shipped /screen/index.html via window.__almScreenpro", classifier: {}, dedup: {}, perf: {} };

  const PERF_ONLY = !!process.env.PERF_ONLY;
  // ===== 1. Active-learning recall / WSS@95 on Cohen TAR corpora =====
  for (const [name, file, batch] of (PERF_ONLY ? [] : [["Cohen ACE-Inhibitors", "cohen_ace_inhibitors.csv", 100], ["Cohen Triptans", "cohen_triptans.csv", 50]])) {
    const recs = load(file).map((r, i) => ({
      id: "r" + i, title: r.title || "", abstract: r.abstract || "", keywords: [],
      gold: String(r.label_included).trim() === "1" ? 1 : 0,
    }));
    const out = await page.evaluate(({ recs, batch }) => window.__almScreenpro.simulateActiveLearning({ records: recs, batch }), { recs, batch });
    const randomWss = 0; // random screening yields WSS@95 ≈ 0 by definition
    results.classifier[file] = {
      label: name, N: out.N, relevant: out.totalPos, prevalence: round(out.prevalence),
      batch: out.batch, seed: out.seed,
      WSS_at_95: round(out.wss95), WSS_at_100: round(out.wss100),
      recall_at_10pct: round(out.recallAt10pct), recall_at_20pct: round(out.recallAt20pct), recall_at_50pct: round(out.recallAt50pct),
      screened_to_95pct_recall: out.screenedAt95, screened_to_100pct_recall: out.screenedAt100,
      random_baseline_WSS_at_95: randomWss,
    };
    console.log(`\n[classifier] ${name}: N=${out.N}, relevant=${out.totalPos} (${(out.prevalence * 100).toFixed(1)}%)`);
    console.log(`  WSS@95 = ${round(out.wss95)}  (screened ${out.screenedAt95}/${out.N} to reach 95% recall)`);
    console.log(`  recall@10% = ${round(out.recallAt10pct)}, recall@20% = ${round(out.recallAt20pct)}`);
  }

  // ===== 2a. Dedup recall on Nagtegaal author-labelled duplicates =====
  if (!PERF_ONLY) {
    const raw = load("nagtegaal_2019.csv");
    const recs = raw.map((r) => ({ id: r.record_id, title: r.title || "", abstract: r.abstract || "", doi: "" }));
    // gold pairs: a row whose duplicate_record_id points at another row -> the two are dups
    const goldDupIds = new Set(), idset = new Set(recs.map((r) => r.id));
    for (const r of raw) {
      const dup = String(r.duplicate_record_id || "").trim();
      if (dup && idset.has(dup) && dup !== r.record_id) goldDupIds.add(r.record_id); // r is the redundant copy
    }
    const flagged = await page.evaluate((recs) => { window.__almScreenpro.setState({ records: recs }); return window.__almScreenpro.dupIds(); }, recs);
    const flaggedSet = new Set(flagged);
    let hit = 0; for (const g of goldDupIds) if (flaggedSet.has(g)) hit++;
    const recall = goldDupIds.size ? hit / goldDupIds.size : null;
    const falsePos = flagged.filter((id) => !goldDupIds.has(id)).length;
    results.dedup.nagtegaal_gold = {
      records: recs.length, gold_duplicate_copies: goldDupIds.size, detected: hit,
      recall: recall == null ? null : round(recall), total_flagged: flagged.length,
      flagged_not_in_gold: falsePos,
      note: "Corpus already deduplicated by authors; 'flagged_not_in_gold' are extra near-duplicate titles the title pass caught, not necessarily errors.",
    };
    console.log(`\n[dedup] Nagtegaal gold: recall ${hit}/${goldDupIds.size} = ${recall == null ? "n/a" : round(recall)}; ${flagged.length} total flagged`);
  }

  // ===== 2b. Reformatted-title precision/recall (Cohen ACE perturbation protocol) =====
  if (!PERF_ONLY) {
    const base = load("cohen_ace_inhibitors.csv").slice(0, 1200).map((r, i) => ({
      id: "o" + i, title: r.title || "", abstract: (r.abstract || "").slice(0, 400),
      authors: (r.authors || "").split(";").map((s) => s.trim()).filter(Boolean), year: r.year || "", doi: "10.0/orig" + i,
    })).filter((r) => r.title.length > 25);
    const rng = mulberry32(20260608);
    // pick 200 originals, make a "second database" copy with: DOI dropped, title
    // reformatted (lowercased, punctuation stripped, trailing clause truncated).
    const K = 200, chosen = [];
    const idxs = base.map((_, i) => i);
    for (let s = idxs.length - 1; s > 0; s--) { const j = Math.floor(rng() * (s + 1)); [idxs[s], idxs[j]] = [idxs[j], idxs[s]]; }
    const dupCopies = [];
    for (let i = 0; i < K && i < idxs.length; i++) {
      const o = base[idxs[i]]; chosen.push(o.id);
      let t = o.title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      const words = t.split(" "); if (words.length > 6) t = words.slice(0, Math.max(6, words.length - 2)).join(" "); // truncate a trailing clause
      dupCopies.push({ id: "dup" + i, _origin: o.id, title: t, abstract: o.abstract, authors: o.authors, year: o.year, doi: "" });
    }
    const all = base.concat(dupCopies);
    const flagged = await page.evaluate((recs) => { window.__almScreenpro.setState({ records: recs }); return window.__almScreenpro.dupIds(); }, all);
    const flaggedSet = new Set(flagged);
    let tp = 0; for (const d of dupCopies) if (flaggedSet.has(d.id)) tp++;          // recall over injected dups
    const fn = K - tp;
    // precision: of all flagged records, how many are an injected duplicate copy?
    const dupIdSet = new Set(dupCopies.map((d) => d.id));
    const fp = flagged.filter((id) => !dupIdSet.has(id)).length;
    const recall = tp / K, precision = flagged.length ? tp / flagged.length : 0, f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
    results.dedup.cohen_perturbation = {
      originals: base.length, injected_reformatted_duplicates: K,
      detected: tp, missed: fn, recall: round(recall),
      total_flagged: flagged.length, false_positives: fp, precision: round(precision), f1: round(f1),
      protocol: "200 random Cohen ACE records re-imported with DOI dropped + title lowercased/de-punctuated/truncated; tests the title pass on reformatted, different-DOI duplicates.",
    };
    console.log(`\n[dedup] Cohen reformatted-title: recall ${tp}/${K} = ${round(recall)}, precision ${round(precision)}, F1 ${round(f1)} (${fp} false positives)`);
  }

  // ===== 3. Dedup throughput: blocked (shipped) vs brute O(n^2) =====
  {
    // synthetic corpus with a controlled duplicate rate so both passes do real work.
    // Realistic-diversity corpus: titles drawn from a large pseudo-vocabulary so
    // blocking keys are well distributed (real titles have thousands of distinct
    // tokens), with ~9% near-duplicate copies. This is the scenario where the
    // O(n^2) brute pass explodes but blocking stays near-linear.
    function makeCorpus(n) {
      const VOCAB = Math.max(3000, n / 4);
      const rng = mulberry32(99 + n);
      const recs = []; let lastTitle = "";
      for (let i = 0; i < n; i++) {
        const dup = i % 11 === 0 && i > 0 && lastTitle;
        if (dup) { recs.push({ id: "x" + i, title: lastTitle + " .", abstract: "", doi: "" }); continue; }
        const len = 8 + Math.floor(rng() * 5); const ws = [];
        for (let k = 0; k < len; k++) ws.push("w" + Math.floor(rng() * VOCAB));
        lastTitle = ws.join(" ") + " s" + i;   // unique suffix keeps non-dup titles distinct
        recs.push({ id: "x" + i, title: lastTitle, abstract: "", doi: "10.5/d" + i });
      }
      return recs;
    }
    const perf = [];
    for (const n of [2000, 10000, 50000, 100000]) {
      const corpus = makeCorpus(n);
      const t = await page.evaluate((recs) => {
        window.__almScreenpro.setState({ records: recs });
        const t0 = performance.now(); const info = window.__almScreenpro.dedupBlocked(); const t1 = performance.now();
        let brute = null;
        if (recs.length <= 12000) { const b0 = performance.now(); window.__almScreenpro.dedupBrute(); brute = performance.now() - b0; }
        return { blockedMs: t1 - t0, blockedComparisons: info.comparisons, blockedMerges: info.merges, bruteMs: brute };
      }, corpus);
      perf.push({ n, blocked_ms: Math.round(t.blockedMs), blocked_comparisons: t.blockedComparisons, blocked_merges: t.blockedMerges, brute_ms: t.bruteMs == null ? null : Math.round(t.bruteMs) });
      console.log(`\n[perf] n=${n}: blocked ${Math.round(t.blockedMs)}ms (${t.blockedComparisons} comparisons, ${t.blockedMerges} merges)` + (t.bruteMs != null ? `, brute ${Math.round(t.bruteMs)}ms` : ", brute skipped (O(n^2) too slow)"));
    }
    results.perf.dedup = perf;
  }

  // ===== 4. Blocked-vs-brute parity on a realistic medium corpus =====
  if (!PERF_ONLY) {
    const recs = load("nagtegaal_2019.csv").slice(0, 1500).map((r) => ({ id: r.record_id, title: r.title || "", abstract: "", doi: "" }));
    const cmp = await page.evaluate((recs) => {
      window.__almScreenpro.setState({ records: recs }); window.__almScreenpro.dedupBlocked();
      const blocked = new Set(window.__almScreenpro.dupIds());
      window.__almScreenpro.setState({ records: recs }); window.__almScreenpro.dedupBrute();
      const brute = new Set(window.__almScreenpro.dupIds());
      let inBoth = 0, blockedOnly = 0, bruteOnly = 0;
      blocked.forEach((id) => (brute.has(id) ? inBoth++ : blockedOnly++));
      brute.forEach((id) => { if (!blocked.has(id)) bruteOnly++; });
      return { blocked: blocked.size, brute: brute.size, inBoth, blockedOnly, bruteOnly };
    }, recs);
    results.dedup.blocked_vs_brute_parity = { ...cmp, brute_recovered_by_blocked: cmp.brute ? round((cmp.brute - cmp.bruteOnly) / cmp.brute) : 1 };
    console.log(`\n[parity] blocked vs brute (strict pass): brute=${cmp.brute}, blocked=${cmp.blocked}, brute-merges missed by blocking=${cmp.bruteOnly}`);
  }

  if (!PERF_ONLY) {
    writeFileSync(join(__dirname, "results.json"), JSON.stringify(results, null, 2));
    console.log(`\nWrote ${join(__dirname, "results.json")}`);
  }
  await browser.close();
  srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
