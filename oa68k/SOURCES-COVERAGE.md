# Source coverage — what is reachable, under what licence, what we pulled

pc1 · probed 2026-07-16 · **every count is batch-actual from disk or from the
source's own published total. Nothing here is extrapolated.**

Rule applied throughout: openly-licensed / publicly-downloadable only; robots.txt
and terms checked BEFORE the first fetch; no scraping anything that forbids it;
no credential use beyond the NCBI key. Where a source is reachable but we chose
not to take it, that is stated as a deliberate gap, not omitted.

---

## The table

| # | Source | Reachable | Licence | Records pulled (batch-actual) | Route |
|---|---|---|---|---|---|
| 1 | **AACT / CT.gov** | ✅ yes | public domain (US federal) | **290,724 RCTs**; 46,347 with posted results; **3,587,405 AE rows**; 3,308,734 outcome rows; 2,071,193 registered outcomes | offline 14 GB flat dump, snapshot 2026-04-12 |
| 2 | **PubMed / Europe PMC abstracts** | ✅ yes | metadata open; abstracts per-publisher | **169,792 PMIDs resolved**; 96.1% carry an abstract; **59,119 OA full texts identified** | EPMC REST (EBI), no key needed |
| 3 | **PMC OA full text (JATS)** | ✅ yes | OA subset licences (CC-BY etc., captured per paper) | **~1,900 papers, ~5,000 tables** so far of 58,255 candidates; grinding | NCBI efetch, KEY B |
| 4 | **Drugs@FDA reviews** ⭐ | ✅ **yes, at scale** | **public domain (US federal work)** | **29,212 applications · 80,500 docs · 9,623 reviews (8,325 NDA/BLA)**; 4,483 directly-linked review PDFs; **24 fetched (284 MB)** | FDA's OWN bulk file, then accessdata (robots-allowed) |
| 5 | **EMA EPARs** | ✅ yes | EMA terms: reuse permitted with attribution | **2,321 human medicines** enumerated w/ EPAR URLs (official xlsx); PDF harvest not yet run | official medicines dataset (893 KB xlsx) |
| 6 | **Retraction Watch** | ✅ yes | **CC0** (open via Crossref) | **71,106 records** (65,667 retractions, 3,581 EoC, 1,494 corrections); 33,123 with original PMID → **207 of our trials have a retracted report** | one 65 MB CSV |
| 7 | **Crossref** | ✅ yes | open metadata | 184,542,499 works indexed; **73,610 retraction notices** (probe only) | REST, polite pool |
| 8 | **OpenAlex** | ✅ yes | **CC0** | 319,662,677 works; **74,193 retracted** (probe only) | REST, polite pool |
| 9 | PMC OA supplementary files | ⏳ not yet probed | OA subset | 0 | — |
| 10 | EudraCT / EU CTR · ISRCTN | ⏳ not yet probed | — | 0 | — |
| 11 | WHO ICTRP (incl. PACTR) | ⛔ blocked on a human step | ICTRP terms | 0 | bulk download is Mahmood's to do; ingest to be prepared |
| 12 | PROSPERO | ⏳ not yet probed | — | 0 | — |

---

## 4. Drugs@FDA — the big one, in detail

**Why it mattered most:** Turner 2008's whole result came from FDA review data
being the **less-selected sample** — the regulator sees every trial submitted,
including those that never reached a journal. The reversal answer key has been
N=3 *reconstructions*. If the reviews are pullable, the key can be built from
**real regulatory data**.

**Verdict: reachable at scale, cleanly, with no scraping.**

- **Route:** FDA publishes the whole index itself —
  `https://www.fda.gov/media/89850/download` → `drugsatfda.zip` (6 MB) →
  `ApplicationDocs.txt`, **80,500 rows carrying the exact document URLs**. One
  request to www.fda.gov; never a crawl.
- **Licence:** US federal government work — **public domain**. No gate.
- **Content is real** (verified, BLA125516 Unituxin/dinutuximab statistical
  review): 1.1 MB, **34 pages, text-extractable — not scans**, **20 extractable
  tables**, carrying per-trial efficacy: `p=0.0115`, `p=0.0330`, hazard ratios,
  95% CIs, and a study table with **"# of Subjects per Arm"**.

**robots.txt — the distinction that decided the approach:**

| host | what it says for `User-agent: *` | what we do |
|---|---|---|
| `www.fda.gov` | `Disallow: /` applies **only to `vspider`** (a 2005 bot), *not* to us. But for `*`: **Crawl-Delay: 30**, and **`Disallow: /file/`, `/node/`** | touch **once**, for `/media/89850/download` (not disallowed). Never crawl it. |
| `accessdata.fda.gov` | disallows only some CDER BMIS / CDRH device script paths. **`/drugsatfda_docs/` is ALLOWED**, no crawl-delay | fetch review PDFs here, 1 req/s, single stream |

**Deliberate gap, stated:** of 8,325 NDA/BLA reviews, **4,483 have a direct `.pdf`
URL** in FDA's official file — we take those. The other **3,842 are TOC-only
`.html`** pages that carry `<meta robots="noindex, nofollow">` and follow no
single filename convention (`125516Orig1s000TOC.html` *and*
`020725_creon_toc.html`). Scraping them would be impolite and unreliable, so they
are **deferred and recorded**, not silently dropped.

**Size:** 24 review PDFs = 284 MB (~11 MB each) ⇒ all 4,483 ≈ **49 GB**. Sized,
not assumed; a text-extract-then-discard pass is the obvious answer if disk binds.

**Linkage — the one real gap, with a working solution.** The reviews carry **zero
NCT ids** (measured: none in all 34 pages of the statistical review). They name
trials by **protocol code**. AACT's `id_information` bridges back:

```
ANBL0032  ->  NCT00026312
ANBL0532  ->  NCT00567567          (752,993 ids over 579,768 trials)
```

So the Turner loop closes on real data:
**FDA review → protocol code → NCT → registry results → PMID → published paper.**

---

## 6–8. Integrity layer

Three sources, deliberately **not** collapsed into one `retracted` boolean:
Retraction Watch is curated and carries the **reason**; Crossref sees the
publisher's notice; OpenAlex carries a derived flag. They **disagree**, and the
disagreement is signal — collapsing them would silently inherit one source's
coverage gaps.

**207 distinct trials in our store have a retracted report** (256 links). Only
DERIVED/RESULT links count: a trial that merely *cited* a retracted paper is not
implicated, and letting BACKGROUND links through would smear retraction across
hundreds of innocent trials (60.2% of links are BACKGROUND). Labelled
**"a retracted REPORT of a trial ≠ a retracted trial"** — adjudicate before use.

---

## Honesty boundary

1. **Reachable ≠ pulled.** Rows 5, 7, 8 are *probes*: the totals are the
   source's own published counts, and we have pulled 0 records from them. Row 4
   is 24 of 4,483 PDFs. Do not read a probe total as a holding.
2. **The DTA corpus is a candidate set**, not a DTA set (MeSH
   "Sensitivity and Specificity" also indexes bioinformatics tool papers).
   Harvest count ≠ 2×2 count.
3. **Registry confidence = copy-fidelity**, not truth of the registry value.
4. **FDA protocol-code links are candidates** — a code match is evidence, not a
   verdict; every link carries its evidence string for adjudication.
5. Nothing here is extrapolated to a corpus total. Where a rate is quoted, the
   n it came from is quoted with it.
