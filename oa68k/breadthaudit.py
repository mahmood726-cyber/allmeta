"""BREADTH × LICENCE — does "maximum public" buy a narrower gold set?

Mahmood: "the gold set needs to be as big and broad as possible."
The brief: "breadth and licence will fight each other. If CC-BY concentrates in
certain publishers, then maximum-public and maximum-broad pull apart — the
shareable subset may be venue-skewed in exactly the dimension D3 says matters
most. Measure that overlap and say so. Do not silently let licence availability
choose the sample — that is Pairwise70's exact mechanism."

⭐ THIS SCRIPT EXISTS TO TEST WHETHER RESTRICTING TO CC-BY IS ITSELF A
  CONVENIENCE SAMPLE. Last turn I concluded "restrict to CC-BY/CC0 — 2,891
  metas, 2.9x what we need, problem solved." That conclusion is only safe IF
  the CC-BY subset is not skewed on a dimension that matters. If CC-BY is
  PLOS/BMC-heavy and D3 (nested headers) is PLOS-dominant at 43/80, then a
  CC-BY-only gold set MEASURES PLOS — and I would have chosen the sample by
  what was legally to hand. That is Pairwise70's mechanism, and it would be the
  third time today.

MEASURED, from the article's own JATS (no network, no model):
  licence  <permissions><license><ali:license_ref>   (NISO ALI, publisher's own)
  venue    <publisher-name> / <journal-title>
  era      <pub-date> year

WHAT IT CANNOT DO: it cannot see disease, table idiom, outcome type, geography,
or registry. Those need the MeSH pull (§must_contain) and per-figure parsing.
Their strata are DECLARED in stratadesign.py and asserted at ingest — this
script covers only the two axes readable from the JATS header today.

Run: python breadthaudit.py
Out: breadthaudit.json
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter, defaultdict

import config as C

LICREF = re.compile(r'<ali:license_ref[^>]*>([^<]+)</ali:license_ref>', re.I)
PERMS = re.compile(r"<permissions>.*?</permissions>", re.S | re.I)
PUB = re.compile(r"<publisher-name>([^<]{1,120})</publisher-name>", re.I)
JOUR = re.compile(r"<journal-title>([^<]{1,160})</journal-title>", re.I)
YEAR = re.compile(r"<pub-date[^>]*>.*?<year>(\d{4})</year>", re.S | re.I)


def classify(url: str) -> str:
    u = (url or "").lower()
    if "/publicdomain/zero" in u or "cc0" in u:
        return "CC0"
    m = re.search(r"creativecommons\.org/licenses/([a-z\-]+)/", u)
    if not m:
        return "OTHER"
    return {"by": "CC-BY", "by-sa": "CC-BY-SA", "by-nc": "CC-BY-NC",
            "by-nc-sa": "CC-BY-NC-SA", "by-nd": "CC-BY-ND",
            "by-nc-nd": "CC-BY-NC-ND"}.get(m.group(1), "OTHER")


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def norm_pub(s: str) -> str:
    """Collapse publisher imprints to a family. Conservative and explicit —
    every rule here is a judgment and is listed so a reader can check it."""
    t = (s or "").lower()
    for key, fam in (("public library of science", "PLOS"), ("plos", "PLOS"),
                     ("biomed central", "BMC"), ("springer", "Springer/BMC"),
                     ("bmc", "BMC"), ("nature", "Springer/BMC"),
                     ("elsevier", "Elsevier"), ("wiley", "Wiley"),
                     ("oxford", "OUP"), ("frontiers", "Frontiers"),
                     ("mdpi", "MDPI"), ("bmj", "BMJ"),
                     ("lippincott", "Wolters Kluwer"), ("wolters", "Wolters Kluwer"),
                     ("taylor", "Taylor & Francis"), ("informa", "Taylor & Francis"),
                     ("sage", "SAGE"), ("dove", "Dove/Taylor"),
                     ("american society for microbiology", "ASM"),
                     ("cambridge", "CUP"), ("karger", "Karger"),
                     ("thieme", "Thieme"), ("jmir", "JMIR"),
                     ("hindawi", "Hindawi"), ("wolters kluwer", "Wolters Kluwer")):
        if key in t:
            return fam
    return (s or "UNKNOWN")[:38]


def main():
    metas = set()
    with open(os.path.join(C.DATA, f"harvest.{C.NODE}.jsonl"), encoding="utf-8") as f:
        for ln in f:
            try:
                r = json.loads(ln)
            except Exception:
                continue
            v = r.get("pmcid")
            if v and str(v).startswith("PMC"):
                metas.add(v)
    forest = set()
    with open(os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl"), encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            if r["pmcid"] in metas and any(g["kind"] == "forest" for g in r["figs"]):
                forest.add(r["pmcid"])

    rows = []
    for p in sorted(forest):
        fp = os.path.join(C.DATA, "cache", f"{p}.xml")
        if not os.path.exists(fp):
            continue
        head = open(fp, encoding="utf-8", errors="replace").read(120000)
        pm = PERMS.search(head)
        m = LICREF.search(pm.group(0) if pm else head)
        lic = classify(m.group(1)) if m else "OTHER"
        pub = PUB.search(head)
        jr = JOUR.search(head)
        yr = YEAR.search(head)
        rows.append({"pmcid": p, "licence": lic,
                     "publisher": norm_pub(pub.group(1) if pub else ""),
                     "journal": (jr.group(1) if jr else "UNKNOWN")[:60],
                     "year": int(yr.group(1)) if yr else None})

    SHARE = {"CC-BY", "CC0"}
    n = len(rows)
    pub_share = sum(1 for r in rows if r["licence"] in SHARE)
    out = {"n": n, "shareable": pub_share, "shareable_pct": 100 * pub_share / n}

    print("=" * 78)
    print("BREADTH × LICENCE — is 'restrict to CC-BY' itself a convenience sample?")
    print("=" * 78)
    print(f"\ncandidate corpus: {n:,} OA metas with a forest figure")
    print(f"CC-BY/CC0 (shareable): {pub_share:,} = {100*pub_share/n:.1f}%\n")

    # ---------- AXIS 1: PUBLISHER ------------------------------------------
    print("-" * 78)
    print("AXIS 1 — PUBLISHER.  ⚠️ D3 (nested headers) is PLOS-DOMINANT (43/80).")
    print("  If CC-BY concentrates by venue, a CC-BY gold set MEASURES THAT VENUE.")
    print("-" * 78)
    bypub = defaultdict(lambda: [0, 0])
    for r in rows:
        bypub[r["publisher"]][0] += 1
        if r["licence"] in SHARE:
            bypub[r["publisher"]][1] += 1
    top = sorted(bypub.items(), key=lambda kv: -kv[1][0])[:12]
    print(f"{'publisher':22s} {'all':>6s} {'all%':>6s} {'CC-BY':>6s} {'CCBY%':>6s} "
          f"{'share-of-public':>15s} {'skew':>6s}")
    out["by_publisher"] = {}
    for pub, (tot, sh) in top:
        all_pct = 100 * tot / n
        pub_pct = 100 * sh / pub_share if pub_share else 0
        skew = (pub_pct / all_pct) if all_pct else float("nan")
        flag = "  <<<" if skew >= 1.25 or skew <= 0.75 else ""
        print(f"{pub:22s} {tot:6,d} {all_pct:5.1f}% {sh:6,d} "
              f"{100*sh/tot if tot else 0:5.1f}% {pub_pct:14.1f}% {skew:6.2f}{flag}")
        out["by_publisher"][pub] = {"n_all": tot, "n_shareable": sh,
                                    "pct_of_corpus": all_pct,
                                    "pct_of_public_subset": pub_pct, "skew": skew}
    print("""
  skew = (this publisher's share OF THE PUBLIC SUBSET) / (its share OF THE CORPUS)
  1.00 = the public subset represents this publisher exactly as the corpus does.
  >1   = OVER-represented once you restrict to CC-BY.  <1 = squeezed out.""")

    # ---------- AXIS 2: ERA -------------------------------------------------
    print()
    print("-" * 78)
    print("AXIS 2 — ERA.  ⚠️ Pairwise70's fatal flaw was 2023-25 ONLY.")
    print("-" * 78)
    def bucket(y):
        if y is None:
            return "unknown"
        if y <= 2014:
            return "≤2014"
        if y <= 2019:
            return "2015-19"
        if y <= 2022:
            return "2020-22"
        return "2023-26"
    bye = defaultdict(lambda: [0, 0])
    for r in rows:
        b = bucket(r["year"])
        bye[b][0] += 1
        if r["licence"] in SHARE:
            bye[b][1] += 1
    print(f"{'era':12s} {'all':>6s} {'all%':>6s} {'CC-BY':>6s} {'CCBY%':>6s} "
          f"{'share-of-public':>15s} {'skew':>6s}")
    out["by_era"] = {}
    for b in ("≤2014", "2015-19", "2020-22", "2023-26", "unknown"):
        tot, sh = bye[b]
        if not tot:
            continue
        all_pct = 100 * tot / n
        pub_pct = 100 * sh / pub_share if pub_share else 0
        skew = (pub_pct / all_pct) if all_pct else float("nan")
        flag = "  <<<" if skew >= 1.25 or skew <= 0.75 else ""
        print(f"{b:12s} {tot:6,d} {all_pct:5.1f}% {sh:6,d} "
              f"{100*sh/tot if tot else 0:5.1f}% {pub_pct:14.1f}% {skew:6.2f}{flag}")
        out["by_era"][b] = {"n_all": tot, "n_shareable": sh, "pct_of_corpus": all_pct,
                            "pct_of_public_subset": pub_pct, "skew": skew}

    # ---------- the verdict --------------------------------------------------
    skews = [v["skew"] for v in out["by_publisher"].values() if v["n_all"] >= 100]
    worst = max(skews) if skews else float("nan")
    least = min(skews) if skews else float("nan")
    era_skews = [v["skew"] for v in out["by_era"].values() if v["n_all"] >= 100]
    print(f"""
=============================================================================
⭐ THE ANSWER TO "DO BREADTH AND LICENCE FIGHT EACH OTHER?"
=============================================================================
 PUBLISHER skew across venues with n>=100:  {least:.2f}x  to  {worst:.2f}x
 ERA       skew across buckets with n>=100: {min(era_skews):.2f}x to {max(era_skews):.2f}x

 A skew of 1.00 everywhere would mean restricting to CC-BY costs NOTHING in
 representativeness. The measured spread above is the price of going public,
 in the only two dimensions the JATS header can see today.
""")
    out["verdict"] = {"publisher_skew_min": least, "publisher_skew_max": worst,
                      "era_skew_min": min(era_skews), "era_skew_max": max(era_skews)}

    print("""=============================================================================
⚠️ WHAT THIS DOES NOT MEASURE — the strata that matter MOST are not here (§17)
=============================================================================
 Readable from the JATS header today: publisher, journal, era, licence.
 NOT readable, and NOT measured by this script:
   - DISEASE (malaria/TB/HIV/NCD)  -> needs the MeSH pull. must_contain BLOCKS.
   - TABLE IDIOM (flat / nested / n(%)+header-N / effect+CI-only)
   - OUTCOME TYPE (binary vs continuous) -> D10 made us blind to BINARY; a gold
     set that inherits that blindness is worthless. Must be asserted, not hoped.
   - GEOGRAPHY (African/LMIC)     -> TB is 73% KEY-ABSENT.
   - REGISTRY (NCT vs non-NCT).
 ⇒ Publisher skew is a LOWER BOUND on the total cost of going public. The
   dimensions we cannot see yet could be worse, and disease is the one the
   mission is actually about.
""")
    json.dump(out, open(os.path.join(C.HERE, "breadthaudit.json"), "w",
                        encoding="utf-8"), indent=2)
    print("wrote breadthaudit.json")


if __name__ == "__main__":
    main()
