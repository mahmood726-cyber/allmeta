# -*- coding: utf-8 -*-
"""OFFLINE TELL-CHECK. Run BEFORE sample B is spent, because sample B is spent once.

Question: does our side carry any structural marker the comparator's paper cannot -- and,
mirrored, does the comparator carry any marker WE cannot? Either one breaks blinding: a
judge that can identify the human side answers correctly BY ELIMINATION, which is the
same failure wearing the other face.

⛔ No judge is called. This is a scan of both payloads against a frozen marker list.

Usage:
  python tellcheck.py --scan        scan both sides, write the checklist
  python tellcheck.py --strip-test  re-scan after the proposed normalisation
"""
import io
import json
import os
import re
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencompscore as S  # noqa: E402
import surfaceagree as A  # noqa: E402

OUTDIR = r"F:\claude-temp\pend"
RESULT = os.path.join(OUTDIR, "tellcheck.json")
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
UA = {"User-Agent": "allmeta-opencomp/1.0 (research; mailto:mahmood726@gmail.com)"}

# ---- markers that would identify OUR side -------------------------------------
OURS = {
    "brand": r"RapidMeta|LivingMeta|Living\s?Meta",
    "ui_chrome": r"\btheme\b|Submission readiness|\bToggle\b|Skip to content|"
                 r"\bDownload\b|\bExport\b|\bPrint\b|\bCopy\b",
    "pipeline_vocabulary": r"\bestimand\b|\bSSOT\b|provenance layer|handbook conformance|"
                           r"\bP\d{1,2}\b\s|boundary sentence|build stamp|PAGE-STANDARD",
    "schema_field_names": r"\b(?:estimand_id|log_point|log_se|by_outcome|app_id|"
                          r"schema_version|built_utc|assessed_utc|inputs\.trials|"
                          r"arms_not_used|record_kind)\b",
    "json_punctuation": r'\{"|"\s*:\s*[\["\d]|"\]',
    "build_stamp": r"\b\d+\.\d+\.\d+-20\d\d-\d\d-\d\d\b|built_utc|assessed_utc",
    "self_reference": r"this object'?s|this page|this review'?s own|our own rule|"
                      r"THIS OBJECT",
    "caps_emphasis": r"(?:\b[A-Z]{3,}\b[ ,]+){3,}",
}
# ---- markers that would identify THEIR side (answer by elimination) ------------
THEIRS = {
    "doi": r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+",
    "licence_front_matter": r"©|\(c\)\s?20\d\d|The Author\(s\)|Creative Commons|CC[- ]BY",
    "journal_sections": r"Competing interests|Conflicts? of interest|Acknowledge?ments|"
                        r"\bFunding\b|Author contributions|Data availability",
    "affiliations": r"Department of|University of|Correspondence to|"
                    r"\bSchool of Medicine\b|\bHospital\b,",
    "publication_dates": r"Received\s+\d|Accepted\s+\d|Published online|First published",
    "identifiers": r"\bPMC\d{6,}\b|\bPMID\b|Supplementary (?:Table|Material|File)",
    "reference_style": r"\bet al\.",
}


def _text_page(fname):
    p = os.path.join(A.CORPUS, fname)
    raw = io.open(p, encoding="utf-8", errors="replace").read()
    vis = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw)
    vis = re.sub(r"<[^>]+>", " ", vis)
    return re.sub(r"\s+", " ", vis).strip()


def _text_pmc(pmcid):
    cache = os.path.join(OUTDIR, "ft_%s.txt" % pmcid)
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        return io.open(cache, encoding="utf-8").read()
    raw = urlopen(Request("%s/%s/fullTextXML" % (EPMC, pmcid), headers=UA),
                  timeout=180).read().decode("utf-8", "replace")
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", raw)).strip()
    S.write_verified(cache, t)
    return t


def scan(text, markers):
    out = {}
    for name, pat in markers.items():
        hits = re.findall(pat, text or "", re.I if name != "caps_emphasis" else 0)
        out[name] = {"n": len(hits),
                     "examples": sorted({(h if isinstance(h, str) else str(h))[:60]
                                         for h in hits})[:4]}
    return out


# ---- the proposed normalisation ------------------------------------------------
def normalise_ours(t):
    t = re.sub(OURS["brand"], " ", t, flags=re.I)
    t = re.sub(OURS["ui_chrome"], " ", t, flags=re.I)
    t = re.sub(OURS["schema_field_names"], " ", t, flags=re.I)
    t = re.sub(OURS["build_stamp"], " ", t, flags=re.I)
    t = re.sub(OURS["json_punctuation"], " ", t)
    return re.sub(r"\s+", " ", t)


def normalise_theirs(t):
    t = re.sub(THEIRS["doi"], " ", t)
    t = re.sub(THEIRS["licence_front_matter"], " ", t, flags=re.I)
    t = re.sub(THEIRS["identifiers"], " ", t, flags=re.I)
    t = re.sub(THEIRS["publication_dates"], " ", t, flags=re.I)
    t = re.sub(THEIRS["affiliations"], " ", t, flags=re.I)
    return re.sub(r"\s+", " ", t)


def run(strip=False, log=print):
    sa = json.load(io.open(A.RESULT, encoding="utf-8"))
    pairs = {p["pair_id"]: p for p in
             (json.loads(l) for l in io.open(S.PAIRS, encoding="utf-8") if l.strip())}
    use = [r for r in sa["pairs"]
           if "nct_pmid" in r["join_tiers"] and r["surface_agreement"] == "OK"]
    per_topic_page = {t: v["page_that_describes_it"] for t, v in sa["per_topic"].items()}
    rows = []
    for r in use:
        p = pairs[r["pair_id"]]
        ours = _text_page(per_topic_page[p["topic"]])
        theirs = _text_pmc(p["comparator_pmcid"])
        if strip:
            ours, theirs = normalise_ours(ours), normalise_theirs(theirs)
        rows.append({"pair_id": r["pair_id"], "topic": p["topic"],
                     "our_chars": len(ours), "their_chars": len(theirs),
                     "ours": scan(ours, OURS), "theirs": scan(theirs, THEIRS)})
        log("  %-28s ours %7d ch  theirs %7d ch" % (r["pair_id"], len(ours), len(theirs)))

    agg = {"ours": {}, "theirs": {}}
    for side, markers in (("ours", OURS), ("theirs", THEIRS)):
        for name in markers:
            hit_rows = [x for x in rows if x[side][name]["n"] > 0]
            agg[side][name] = {
                "pairs_with_marker": len(hit_rows), "pairs": len(rows),
                "total_hits": sum(x[side][name]["n"] for x in rows),
                "example": next((e for x in hit_rows for e in x[side][name]["examples"]),
                                None)}
    out = {"scan": "strip-test" if strip else "raw", "pairs_scanned": len(rows),
           "our_object": "the SERVED page's reader-visible text -- NOT the SSOT "
                         "`manuscript` key, which is not what we serve",
           "aggregate": agg, "rows": rows}
    key = "tellcheck_strip.json" if strip else "tellcheck.json"
    n = S.write_verified(os.path.join(OUTDIR, key), json.dumps(out, ensure_ascii=False,
                                                              indent=1))
    log("")
    log("%-24s %-22s %s" % ("MARKER", "OUR SIDE", "THEIR SIDE"))
    for name in OURS:
        a = agg["ours"][name]
        log("  %-22s %2d/%d pairs, %4d hits" % (name, a["pairs_with_marker"], a["pairs"],
                                                a["total_hits"]))
    log("")
    for name in THEIRS:
        b = agg["theirs"][name]
        log("  %-22s %2d/%d pairs, %4d hits   (THEIR side)"
            % (name, b["pairs_with_marker"], b["pairs"], b["total_hits"]))
    log("wrote %s (%d bytes)" % (key, n))
    return out


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    run(strip="--strip-test" in sys.argv)
