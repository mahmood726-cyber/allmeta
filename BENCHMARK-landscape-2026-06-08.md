# allmeta vs the full SR-tool landscape — honest capability matrix (2026-06-08)

> **What this is.** A truth-first comparison of allmeta's **Search / Screen / Extract /
> Design** apps (plus its meta-analysis suite incl. **RapidMeta / Pairwise**) against the
> 30+ tools researchers actually use for screening, AI discovery, extraction/RoB and
> meta-analysis. Companion to the *measured* [`BENCHMARK-sr-pipeline.md`](BENCHMARK-sr-pipeline.md)
> (allmeta's own numbers, reproducible via `node benchmark/run_benchmark.mjs`).
>
> **Evidence basis for every cell:**
> **[m]** measured here (allmeta, driving shipped code) ·
> **[d]** documented in the competitor's own published paper/docs ·
> **[o]** observed (public product behaviour) ·
> **[?]** unknown / not publicly published.
>
> **No competitor number is fabricated.** Where a vendor has not published a metric, the
> cell is `[?]`, not a guess. allmeta's own numbers are the [m] cells from the pipeline
> benchmark; competitor numbers are tagged [d] with the source named in §2/§7.

---

## 1. The honest one-line summary

allmeta is a **free, fully-local, open-source, reproducible, single-file integrated
pipeline** (Design → Search → Screen → Extract → 88-app meta-analysis). On the axes that
flow from that architecture — **cost, privacy/data-ownership, reproducibility,
open-source, breadth of statistical synthesis, and having the *whole* pipeline in one
free place** — it wins or ties the entire field. On the axes that flow from **scale,
neural models, large-team workflow, regulatory support, and large published validation
cohorts**, the incumbents (Covidence, DistillerSR, Elicit, ASReview, RevMan) still lead.

---

## 2. Active-learning screening — the head-to-head that matters most

This is the cell the 2026-06-08 review told us *"not to market until benchmarked."* It now
is, on the **canonical Cohen et al. 2006** TAR benchmark. WSS@95 = work saved over random
sampling at 95 % recall (random ≈ 0; higher is better).

| Tool | Published WSS@95 | Dataset | Basis |
|---|---|---|---|
| **allmeta Screen** | **0.67** (ACE-Inhibitors) · **0.41** (Triptans) | Cohen 2006 | **[m]** |
| Cohen 2006 original SVM | **0.566** (ACE) · 0.27 mean over 15 reviews | Cohen 2006 | [d] |
| SWIFT-Active Screener (Howard 2020) | ~**0.55** mean (95 % recall at ~40 % screened) · ~0.61 on sets ≥5 k refs | 26 review sets | [d] |
| **ASReview** (van de Schoot 2021) | **0.83 mean, range 0.67–0.92** | benchmark collection incl. Cohen | [d] |
| Abstrackr (Wallace 2010/12) | uses Cohen WSS; ≈ SVM-baseline class | author datasets | [d]/[?] |
| EPPI-Reviewer (priority screening) | active-learning present; no single WSS@95 headline published | — | [?] |
| Rayyan (5-star AI rating) | no published WSS@95 | — | [?] |
| Covidence / DistillerSR / Nested Knowledge | ML-assist present; WSS@95 not publicly benchmarked per-dataset | — | [?] |

**Honest reading of this table (the crux of the whole report):**

- allmeta's **0.67 on Cohen ACE beats Cohen's own 2006 SVM baseline (0.566)** and is
  **above SWIFT's published mean (~0.55)** and around its large-set figure (~0.61).
- allmeta's 0.67 sits at the **very bottom of ASReview's published range (0.67–0.92)** and
  is **well below ASReview's mean of 0.83** on overlapping benchmarks. **ASReview wins
  active-learning recall** — it is the field's most-validated open AL engine, and we say so.
- allmeta's **Triptans 0.41 is below the field** — reported, not hidden. Sparse/small
  corpora are where the lightweight logistic classifier gives up the most ground.

> **Verdict:** allmeta active-learning is **competitive and measured**, not leading.
> It beats the original SVM benchmark and SWIFT's mean; it loses to ASReview's average and
> to ASReview's best models. That is the honest position.

---

## 2b. Automated risk-of-bias — the second head-to-head (vs RobotReviewer)

The `/rob/` app (added 2026-06-08) auto-**suggests** per-domain RoB judgments from
study text and was measured against the **RoBBR** gold corpus (Lou et al., EMNLP 2025;
Cochrane review authors' RoB-1 judgments; CC-BY-NC). The decisive comparison is the
**RobotReviewer subset** RoBBR uses in its own Table 8 — the four RR-assessable domains,
binary judgment (low vs high/unclear), metric **Macro-F1**.

| Model | Avg Macro-F1 | AllocConceal (n=32) | BlindOutcome (n=19) | BlindPart (n=18) | RandSeq (n=30) | Basis |
| --- | --- | --- | --- | --- | --- | --- |
| **allmeta /rob/** (free deterministic) | **62.6** | 60.0 | 45.7 | **73.4** | **71.3** | **[m]** |
| RobotReviewer (Marshall 2016, SVM/CNN) | 56.7 ± 8.4 | **75.0** | 39.1 | 43.8 | 68.9 | [d] |
| Logistic Regression (Dias 2025) | 53.1 ± 9.7 | 71.9 | 50.4 | 51.8 | 38.4 | [d] |
| SVM (Dias 2025) | 44.8 ± 8.6 | 45.9 | 55.2 | 41.9 | 36.0 | [d] |
| GPT-4o (CoT, zero-shot) | 65.6 ± 8.5 | 83.6 | 59.1 | 41.9 | 77.8 | [d] |
| Claude Sonnet-3.5 (CoT) | 67.5 ± 8.4 | 77.0 | 82.5 | 41.9 | 68.8 | [d] |

On the full 6-domain Cochrane test (793 records used): avg Macro-F1 **60.9** [m]; per-domain
sequence 76.1, allocation 67.4, blinding-participants 69.3, blinding-outcome 55.1,
incomplete-data 47.9, selective-reporting 49.7. The last two are genuinely hard from text
(RobotReviewer doesn't even attempt them) and we report the weak numbers, not hide them.

**Honest reading:**

- allmeta **beats RobotReviewer overall (62.6 vs 56.7)** and on **3 of the 4 domains** RR
  assesses. The RoBBR authors note these domains hinge on "superficial keywords" (e.g.
  "opaque envelope", "random number generator") — exactly what a transparent phrase model
  exploits, so the win is expected rather than surprising.
- allmeta **loses allocation concealment (60 vs 75)** — RR's deep training on tens of
  thousands of CDSR examples still wins where concealment language is subtle.
- allmeta is **below frontier LLMs** (GPT-4o 65.6, Sonnet-3.5 67.5). A free, offline,
  zero-cost browser engine that lands between the established ML tool and paid LLMs — and
  never finalises a judgment without reviewer confirmation — is the honest position.
- Rules are derived from the Cochrane Handbook, **not fitted to the test labels** (calibrated
  on the RoBBR train split only); train→test numbers track closely, so no overfitting.

> **Verdict:** on the automated-RoB head-to-head, allmeta **beats RobotReviewer and ties the
> traditional-ML field, while trailing frontier LLMs**. Reproduce: `node benchmark/run_rob_benchmark.mjs`.

---

## 3. Master capability matrix (tools as rows, criteria as columns)

Cells are terse with an evidence tag. `Y`=strong, `~`=partial/limited, `N`=absent.
"allmeta" row is the reference; everything else is documented public knowledge.

### 3a. Screening / full-SR-workflow tools

| Tool | Search/recall | Dedup | T&A + active-learning | Full-text | Extraction | RoB | Meta-analysis | PRISMA | Collab | Scale | Cost | Privacy/local | Open-source |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **allmeta** | expansion+TF-IDF+snowball [m,t] | F1 .95 reformatted / .64 real-gold [m] | WSS .67/.41 [m] | ~ structured [o] | free deterministic + BYO-agent [m,t] | **automated /rob/ (beats RobotReviewer 62.6 vs 56.7) + manual RoB2/ROBINS/QUADAS** [m] | **88 apps, R-verified** [m] | flow+checklist apps [o] | async file-merge+κ [t] | **100k client-side ~6 s** [m] | **Free** [o] | **Fully local, no telemetry** [o] | **Yes (MIT)** [o] |
| Rayyan | keyword+AI rating [d] | Y built-in [d] | 5-star AI rating [d] | ~ [d] | N | N | N | flow export [d] | **live, blind, conflict** [d] | cloud [d] | Freemium (~$8–50/mo) [d] | Cloud [d] | No [d] |
| Covidence | import only [d] | Y [d] | limited ML [d] | **Y, 2-reviewer** [d] | **Y (2×2, custom)** [d] | **Y (RoB form)** [d] | exports to RevMan [d] | **Y (PRISMA)** [d] | **Y, enterprise** [d] | cloud [d] | Paid (inst. $$) [d] | Cloud [d] | No [d] |
| DistillerSR | ~ [d] | Y [d] | **Y (DAISY classifiers)** [d] | **Y** [d] | **Y, configurable** [d] | **Y** [d] | ~ export [d] | **Y, audit/21 CFR** [d] | **Y, enterprise** [d] | **cloud, very large** [d] | Paid ($$$) [d] | Cloud [d] | No [d] |
| EPPI-Reviewer | ~ [d] | Y multi-field [d] | **Y (SVM priority)** [d] | **Y** [d] | **Y, coding** [d] | ~ [d] | **built-in MA** [d] | Y [d] | Y [d] | cloud [d] | Paid (~£10–40/mo) [d] | Cloud [d] | No [d] |
| **ASReview** | N (BYO records) [d] | N [d] | **Y — best published WSS .83** [d] | N [d] | N [d] | N | N | N | N | local, large [d] | **Free** [d] | **Local** [d] | **Yes** [d] |
| Abstrackr | N [d] | N | **Y (active-learning)** [d] | N | N | N | N | N | ~ [d] | cloud [d] | **Free** [d] | Cloud (open) [d] | **Yes** [d] |
| SWIFT-ActiveScreener | ~ [d] | ~ [d] | **Y + recall estimator** [d] | ~ [d] | N | N | N | ~ [d] | Y [d] | **cloud, ≥5k strong** [d] | Paid [d] | Cloud [d] | No [d] |
| SR-Accelerator (Bond) | **Polyglot translate** [d] | **Y (Deduplicator)** [d] | N (toolbox) [d] | ~ (RevMan) [d] | ~ [d] | N | N | ~ [d] | ~ [d] | cloud [d] | **Free** [d] | Cloud [d] | ~ (some) [d] |
| CADIMA | ~ [d] | Y [d] | ~ (no strong AL) [d] | **Y** [d] | **Y** [d] | ~ [d] | N | **Y** [d] | Y [d] | cloud [d] | **Free** [d] | Cloud (EU) [d] | ~ [d] |
| Nested Knowledge | ~ semantic [d] | Y [d] | **Y (smart tags)** [d] | **Y** [d] | **Y** [d] | ~ [d] | **Y (Nest MA)** [d] | Y [d] | **Y** [d] | cloud [d] | Paid [d] | Cloud [d] | No [d] |
| SysRev | ~ [d] | ~ [d] | **Y (ML+crowd)** [d] | Y [d] | **Y** [d] | N | N | ~ [d] | **Y crowd** [d] | cloud [d] | Freemium [d] | Cloud [d] | ~ [d] |

### 3b. AI discovery / extraction tools

| Tool | Search/recall | Extraction | Synthesis | Meta-analysis | Cost | Privacy/local | Open-source |
|---|---|---|---|---|---|---|---|
| **allmeta Search+Extract** | expansion+TF-IDF+snowball, **no neural index** [m,t] | free deterministic, **feeds pooling bus** [m,t] | hands to 88 MA apps [o] | **Yes, native** [m] | **Free** | **Local** | **Yes** |
| **Elicit** | **neural over ~125M papers** [d] | **LLM table extraction** [d] | **LLM summarisation** [d] | N (no pooling) [d] | Freemium (~$10–49/mo) [d] | Cloud+LLM [d] | No [d] |
| Consensus | **neural ~200M papers** [d] | ~ claims [d] | **GPT synthesis** [d] | N [d] | Freemium [d] | Cloud+LLM [d] | No [d] |
| scite | citation-context search [d] | citation stance (support/contrast) [d] | ~ [d] | N [d] | Paid (~$20/mo) [d] | Cloud [d] | No [d] |
| Research Rabbit | **citation-network discovery** [d] | N | N | N | **Free** [d] | Cloud [d] | No [d] |
| Connected Papers | **citation-graph map** [d] | N | N | N | Freemium [d] | Cloud [d] | No [d] |
| SciSpace | semantic + chat-PDF [d] | **extraction tables** [d] | **chat synthesis** [d] | N | Freemium [d] | Cloud+LLM [d] | No [d] |
| Scholarcy | N (per-paper) [d] | **summary/flashcard extract** [d] | ~ [d] | N | Freemium/paid [d] | Cloud [d] | No [d] |

### 3c. RoB / automated extraction & meta-analysis tools

| Tool | RoB | Extraction | Meta-analysis breadth | Reproducibility | Cost | Privacy/local | Open-source |
|---|---|---|---|---|---|---|---|
| **allmeta** | **automated /rob/ — 62.6 Macro-F1, beats RobotReviewer 56.7 on RoBBR** [m] + manual RoB2/ROBINS-I/-E/QUADAS-2 apps [o] | free deterministic + BYO-agent [m] | **NMA, DTA, Bayesian, dose-resp, RVE, IPD, TSA…** R-verified [m] | **R-parity tests, downloadable .R** [m] | **Free** | **Local** | **Yes** |
| **RobotReviewer** | **automated ML RoB from PDF** [d] | PICO extraction [d] | N | open model [d] | **Free** [d] | self-host option [d] | **Yes** [d] |
| **Trialstreamer** | **auto RoB cue from abstracts** [d] | **auto PICO + N + design** [d] | N | open [d] | **Free** [d] | cloud/open [d] | **Yes** [d] |
| Laser AI | ~ [d] | **AI extraction + living** [d] | ~ [d] | [?] | Paid [d] | Cloud [d] | No [d] |
| **RevMan / RevMan Web** | **Y (Cochrane RoB)** [d] | 2×2 entry [d] | **pairwise + forest + SoF/GRADE (established standard)** [d] | manual [d] | Free (Cochrane authors) [d] | Cloud/installed [d] | No [d] |
| Meta-Essentials | N | manual [d] | basic pairwise (Excel) [d] | spreadsheet [d] | **Free** [d] | Local (Excel) [d] | ~ [d] |
| JBI SUMARI | **Y** [d] | **Y** [d] | pairwise + **meta-aggregation + economic** [d] | [?] | Paid [d] | Cloud [d] | No [d] |
| CMA / Stata / R metafor | N (stats only) | manual | **very broad (R/Stata)** [d] | scriptable (R/Stata) [d] | Paid (CMA/Stata) / Free (R) | Local | R: Yes |

---

## 4. Where allmeta WINS, TIES, and LOSES (criterion by criterion)

| Criterion | allmeta vs field | Honest call |
|---|---|---|
| **Cost** | Free vs Covidence/DistillerSR/Elicit/SWIFT/EPPI all paid | **WIN** — only ASReview, Abstrackr, CADIMA, SR-Accelerator, Meta-Essentials, RobotReviewer, Trialstreamer, R are also free; allmeta is the only *free + full pipeline*. |
| **Privacy / data-ownership** | Fully local, no telemetry, single file | **WIN** (ties ASReview/Meta-Essentials/R for locality; beats every cloud tool). Records never leave the browser. |
| **Reproducibility / open-source** | MIT, R-parity tests, downloadable `.R`, deterministic | **WIN** — strongest provability in the field; no commercial incumbent ships a public R-parity suite. |
| **Integrated free pipeline** | Design→Search→Screen→Extract→Synthesis in one place | **WIN** — Covidence/DistillerSR integrate but are paid + no MA; ASReview/Elicit do one stage each. |
| **Meta-analysis breadth** | 88 apps incl. NMA/DTA/Bayesian/dose-resp/RVE/TSA | **WIN** on breadth & verification vs RevMan/CMA/SUMARI; **but RevMan is the established institutional standard** (Cochrane, GRADE/SoF integration, reviewer familiarity). |
| **Scale (dedup)** | 100k records client-side in ~6 s [m] | **WIN/TIE** — closes the old >50k loss; cloud tools scale higher but server-side. |
| **Dedup recall/precision** | F1 0.95 reformatted, 0.64 real-gold [m] | **TIE** — measured-strong; EPPI/Rayyan multi-field dedup mature but not publicly benchmarked head-to-head. |
| **Active-learning screening** | WSS@95 0.67 ACE / 0.41 Triptans [m] | **TIE/LOSS** — beats Cohen-SVM & SWIFT mean; **loses to ASReview's 0.83 mean**. Competitive, not leading. |
| **Semantic / neural recall** | expansion + TF-IDF + snowball, no neural index | **LOSS** — **Elicit/Consensus's neural index over 125–200M papers wins raw recall.** Narrowed, not erased. |
| **Data-extraction accuracy (messy full text)** | free deterministic first-pass + BYO-agent handoff | **LOSS on raw accuracy** to Elicit/LaserAI LLM extraction; **WIN on free+reproducible+feeds-pooling**. |
| **Automated RoB** | structured manual forms (RoB2/ROBINS/QUADAS) | **LOSS** — **RobotReviewer/Trialstreamer auto-assess RoB from PDFs/abstracts;** allmeta's RoB is manual data entry. |
| **Full-text screening workflow** | partial/structured | **LOSS** — Covidence/DistillerSR/EPPI have mature 2-reviewer full-text + reconciliation. |
| **Real-time collaboration** | async file-merge + conflict flags + κ [t] | **LOSS** — Rayyan/Covidence/DistillerSR offer live multi-user, blinding, audit trails. |
| **Enterprise support / compliance** | none (it's a free static site) | **LOSS** — DistillerSR (21 CFR, regulator-grade), Covidence (Cochrane support) own this. |
| **Large published validation cohort** | 2 Cohen corpora measured | **LOSS** — ASReview/SWIFT have multi-dataset peer-reviewed validations; allmeta's evidence is honest but small. |

---

## 5. Positioning verdict (who should use what)

**allmeta is best for** the independent researcher, student, clinician, or methods-focused
team who needs a **free, private, reproducible end-to-end review** and values **statistical
breadth and provable correctness** above team logistics — especially anyone who must keep
records **off the cloud** (sensitive/embargoed data, no-budget institution), wants the
**whole Design→Search→Screen→Extract→meta-analysis chain in one place**, and will do the
synthesis themselves. It is uniquely strong as the **only free tool that also carries an
R-verified 88-app meta-analysis suite**, and its local-agent / BYO-key AI keeps data
private while still offering automation.

**Pick a competitor when** your priority is one of allmeta's honest losses: choose
**ASReview** if maximal, peer-validated active-learning recall is the goal (its 0.83 mean
WSS@95 leads, and it's also free/local); **Covidence or DistillerSR** for a large team
needing live collaboration, mature full-text reconciliation, audit trails and
vendor/regulatory support (DistillerSR for 21 CFR / pharma); **Elicit or Consensus** when
you need neural semantic recall over 100M+ papers and best-effort LLM extraction;
**RobotReviewer/Trialstreamer** when you want auto PICO extraction at population scale, or
the best available automated *allocation-concealment* call (RR still wins that one domain
75 vs 60) — though for RoB overall allmeta's `/rob/` now beats RobotReviewer on the RoBBR
head-to-head (62.6 vs 56.7 Macro-F1); and **RevMan** when institutional/Cochrane
familiarity and the established GRADE/SoF forest-plot standard matter more than method
breadth. In short: **allmeta wins on cost, privacy, reproducibility, breadth, integration
and now automated-RoB overall; the incumbents win on neural recall, allocation-concealment
detection, large-team workflow, regulatory support, and the single most-validated
active-learning engine.**

---

## 6. Reproducibility of this report

- allmeta `[m]` cells: `node benchmark/run_benchmark.mjs` → `benchmark/results.json`
  (Cohen ACE WSS@95 0.6705, Triptans 0.412; dedup F1 0.948 reformatted / 0.636 real-gold;
  100k dedup 5,820 ms). See [`BENCHMARK-sr-pipeline.md`](BENCHMARK-sr-pipeline.md).
- Competitor `[d]` cells trace to: Cohen et al. 2006 (WSS metric, ACE SVM 0.566);
  van de Schoot et al. 2021 *Nature Machine Intelligence* / asreview-insights (WSS@95 mean
  0.83, range 0.67–0.92); Howard et al. 2020 *Environment International* (SWIFT-Active
  Screener: 95 % recall at ~40 % screened, ~34 % on ≥5 k-ref sets); plus each vendor's
  public product documentation. `[?]` = not publicly published; not estimated.
