"""Stage F1 — locate forest-plot figures in already-harvested JATS.

The premise (SIXTYEIGHTK-PLAN R4, measured): OA meta characteristics tables carry
the included-study list, arm sizes and the pooled estimate, but the **per-trial
2x2 event counts live in the forest-plot images**. Text extraction cannot reach
them. Before spending a single vision token we must answer one question honestly:

    how many harvested metas actually have a forest plot we can locate at all?

That coverage number is the first gate. This module answers it from the cache
alone — no network, no model — so it is cheap, deterministic and re-runnable.

WHY XML PARSING, NOT REGEX. The obvious probe is `re.search(r'<fig\\b', xml)`.
It is wrong: `\\b` matches between "fig" and the hyphen of `<fig-count count="2"/>`,
so every paper in the corpus reports a figure whether or not it has one. Measured
here: that regex hits on articles whose real `<fig>` count is zero. `<fig-count>`
lives in `<counts>` metadata and is not a figure. We parse the tree and match the
tag exactly.

CLASSIFICATION IS CAPTION-BASED AND DELIBERATELY CONSERVATIVE. A forest plot is
identified from positive caption/label evidence ("forest plot", "meta-analysis
of", "pooled ... random-effects", risk-ratio wording). We would rather MISS a
forest plot than hand the vision layer a CONSORT diagram or a PRISMA flowchart
and let it hallucinate rows out of it. Every figure keeps its raw caption so the
classifier can be re-tuned against a hand-checked sample without a re-scan.

FIELD NAMING IS A CORRECTNESS ISSUE. This field is `locator_recorded`, NOT
`retrievable`. It records only that we wrote a candidate asset locator (the PMC
`bin/` path for that PMCID + filename) — and that locator is now MEASURED TO 404
(see figfetch.py: the bin/ route is dead and the OA package tree is deprecated;
bytes come from a CDN URL carrying opaque hashes that must be resolved per
article). Calling it `retrievable` claimed a capability we do not have from the
JATS alone, exactly the overclaim the 68k plan's R3 rename guarded against.
Availability is not acquisition; `figfetch` records whether bytes actually landed.

Run:  python figscan.py --limit 500        # scan cached JATS, write ledger
      python figscan.py --summary         # coverage counts, batch-actual
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import date

import config as C

FIG_LEDGER = os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl")

# PMC serves OA article assets under this path, keyed by PMCID + the graphic
# href filename from the JATS. This is a locator, not a promise of bytes.
PMC_ASSET = "https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/bin/{fname}"

# --- Positive evidence for "this figure is a forest plot".
# Ordered most- to least-specific; `forest plot` alone is near-conclusive.
_FOREST_STRONG = re.compile(
    r"forest[\s\-]?plot", re.I)
_FOREST_WEAK = re.compile(
    r"(?:pooled|meta[\s\-]?analy\w+|random[\s\-]effects?|fixed[\s\-]effects?)"
    r"[^.]{0,80}?"
    r"(?:risk\s+ratio|odds\s+ratio|risk\s+difference|mean\s+difference|"
    r"hazard\s+ratio|\bRR\b|\bOR\b|\bSMD\b|\bWMD\b|\bHR\b|effect\s+size)",
    re.I)

# --- Negative evidence: figure kinds that are NOT forest plots but often sit in
# the same paper and would waste vision calls (or worse, produce fabricated rows).
_NOT_FOREST = re.compile(
    r"(?:PRISMA|CONSORT|flow[\s\-]?(?:chart|diagram)|"
    r"funnel[\s\-]?plot|"          # bias plot: no per-study 2x2
    r"risk[\s\-]of[\s\-]bias|traffic[\s\-]light|"
    r"study[\s\-]selection|search[\s\-]strateg|"
    r"galbraith|radial[\s\-]plot|L'Abbe|labbe|"
    r"SROC|ROC[\s\-]curve|"        # DTA summary curve: not per-study 2x2 either
    r"trial[\s\-]sequential|"
    r"GRADE|evidence[\s\-]profile|"
    r"network[\s\-](?:plot|graph|geometry)|"
    r"bubble[\s\-]plot|"
    r"kaplan[\s\-]?meier|survival[\s\-]curve|"
    r"world[\s\-]map|geograph)", re.I)


def _text(el) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def classify(caption: str, label: str) -> tuple[str, str]:
    """(kind, why). kind in {forest, forest_maybe, not_forest, unknown}.

    Precision-first, mirroring dta_detect.py's stance: refuse to guess. A caption
    with no positive evidence returns `unknown`, NOT `not_forest` — absence of
    evidence in a terse caption ("Fig 3.") is not evidence of absence, and the
    two must not be conflated in the coverage number.
    """
    blob = f"{label} {caption}".strip()
    if not blob:
        return "unknown", "empty caption"
    # Negative evidence wins over WEAK positive: a funnel plot's caption very
    # often names the pooled outcome too ("Funnel plot of the pooled odds
    # ratio"), which the weak pattern would otherwise call a forest plot.
    neg = _NOT_FOREST.search(blob)
    if _FOREST_STRONG.search(blob):
        # ...but not over STRONG: "Forest plot ... risk of bias" is still a
        # forest plot. Explicit naming beats co-occurrence.
        return "forest", "caption names a forest plot"
    if neg:
        return "not_forest", f"caption names {neg.group(0).lower()}"
    if _FOREST_WEAK.search(blob):
        return "forest_maybe", "caption pairs a pooling method with an effect measure"
    return "unknown", "no positive forest evidence in caption"


def scan_xml(pmcid: str, xml_bytes: bytes) -> list[dict]:
    """Every <fig> in one article, classified, with an asset locator."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    out: list[dict] = []
    for el in root.iter():
        # Exact tag match. `<fig-count>` is metadata, not a figure — see module
        # docstring; the naive `<fig\b` regex counts it as one.
        if el.tag.split("}")[-1] != "fig":
            continue
        label = caption = ""
        for ch in el:
            t = ch.tag.split("}")[-1]
            if t == "label":
                label = _text(ch)
            elif t == "caption":
                caption = _text(ch)
        hrefs = []
        for g in el.iter():
            if g.tag.split("}")[-1] not in ("graphic", "inline-graphic"):
                continue
            for k, v in g.attrib.items():
                if k.split("}")[-1] == "href" and v:
                    hrefs.append(v)
        kind, why = classify(caption, label)
        fid = el.get("id") or ""
        # A graphic href may already carry an extension or not; PMC serves the
        # asset under bin/<href> and the JATS href is the authoritative name.
        assets = [PMC_ASSET.format(pmcid=pmcid, fname=h) for h in hrefs]
        out.append({
            "pmcid": pmcid, "fig_id": fid, "label": label, "caption": caption,
            "kind": kind, "why": why,
            "graphic_hrefs": hrefs,
            "assets": assets,
            "locator_recorded": bool(assets),
        })
    return out


def _cached() -> list[str]:
    return sorted(glob.glob(os.path.join(C.CACHE, "*.xml")))


def _done() -> set:
    got = set()
    if os.path.exists(FIG_LEDGER):
        with open(FIG_LEDGER, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                try:
                    got.add(json.loads(ln)["pmcid"])
                except Exception:
                    continue
    return got


def run(limit: int | None) -> dict:
    files = _cached()
    done = _done()
    today = date.today().isoformat()
    n_new = n_fig = 0
    with open(FIG_LEDGER, "a", encoding="utf-8") as out:
        for p in files:
            pmcid = os.path.splitext(os.path.basename(p))[0]
            if pmcid in done:
                continue
            if limit is not None and n_new >= limit:
                break
            try:
                figs = scan_xml(pmcid, open(p, "rb").read())
            except Exception as e:
                figs = []
                rec_err = str(e)[:200]
            else:
                rec_err = None
            counts: dict[str, int] = {}
            for f in figs:
                counts[f["kind"]] = counts.get(f["kind"], 0) + 1
            out.write(json.dumps({
                "pmcid": pmcid, "scanned_at": today, "n_figs": len(figs),
                "by_kind": counts, "error": rec_err,
                "figs": figs,
            }) + "\n")
            n_new += 1
            n_fig += len(figs)
        out.flush()
        os.fsync(out.fileno())
    return {"scanned_now": n_new, "figures_found": n_fig,
            "cached_articles": len(files), "already_done": len(done)}


def summary() -> dict:
    if not os.path.exists(FIG_LEDGER):
        raise FileNotFoundError("no figscan ledger — run `python figscan.py` first")
    arts = 0
    with_any_fig = 0
    kind_tot: dict[str, int] = {}
    arts_with_forest = 0
    arts_with_forest_retrievable = 0
    forest_retrievable = 0
    with open(FIG_LEDGER, encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            arts += 1
            if r["n_figs"]:
                with_any_fig += 1
            for k, v in (r.get("by_kind") or {}).items():
                kind_tot[k] = kind_tot.get(k, 0) + v
            fo = [x for x in r["figs"] if x["kind"] == "forest"]
            if fo:
                arts_with_forest += 1
                ret = [x for x in fo if x["locator_recorded"]]
                if ret:
                    arts_with_forest_retrievable += 1
                forest_retrievable += len(ret)
    return {
        "articles_scanned": arts,
        "articles_with_any_figure": with_any_fig,
        "figures_by_kind": kind_tot,
        "articles_with_a_forest_plot": arts_with_forest,
        "articles_with_forest_plot_and_a_locator": arts_with_forest_retrievable,
        "forest_figures_with_a_locator": forest_retrievable,
        "note": ("batch-actual over the cached articles only. A locator is NOT "
                 "retrievability: the bin/ locator 404s and bytes come from a "
                 "per-article-resolved CDN URL (see figfetch). "
                 "`unknown` kind = caption carried no positive forest evidence; "
                 "it is not a claim the figure is not a forest plot."),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()
    if not a.summary:
        print(json.dumps(run(a.limit), indent=2))
    print(json.dumps(summary(), indent=2))
