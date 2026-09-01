# -*- coding: utf-8 -*-
"""Emit outputs/TWENTY_COMPARATORS.json -- the 20 comparators, the 14 independent topics
behind them, and the disposition of all 155 corpus objects.

⛔ WHY A TRACKED FILE ON origin/main AND NOT A BRANCH OR A COMMIT HASH: an artefact another
lane cannot fetch is, for their purposes, an artefact that does not exist. A branch name
resolves differently in every clone and a commit absent from a lane's object store resolves
to nothing at all.

Every row carries: our topic slug, our page filename, the comparator (PMID + DOI), the drug
family, and THE JOIN KEY THAT PRODUCED THE MATCH -- per trial, so a reader can see whether a
pair rests on a registry identifier or on a cited PMID.

Usage: python build_twenty_manifest.py <output_path>
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O          # noqa: E402  cardiology topics
import opencomp_id2 as I2     # noqa: E402  ID topics
import opencomp_k4 as K4      # noqa: E402  k>=4 topics + family map
import opencomp_all as AL     # noqa: E402  remaining k>=2 topics + family fn

PEND = r"F:\claude-temp\pend"
FRAMES = [("cardiology", "opencomp_frame_cardiology.jsonl"),
          ("infectious disease", "opencomp_frame_id24pmid.jsonl"),
          ("k>=4", "opencomp_frame_k4.jsonl"),
          ("all remaining k>=2", "opencomp_frame_all.jsonl")]
RULED = {"nct", "cited_pmid"}
IDX = os.path.join(PEND, "surface_index.json")
ENUM = os.path.join(PEND, "codexjob2", "corpus_topics.json")

EXTRA_FAMILY = {
    "sglt2-hf": "sglt2", "sotagliflozin-hf": "sotagliflozin", "arni-hfref": "arni",
    "iv-iron-hf": "iv-iron", "alirocumab-lipid": "pcsk9",
    "bococizumab-lipid-review": "pcsk9",
    "nirsevimab-infant-rsv-review": "nirsevimab", "lenacapavir-prep": "lenacapavir",
    "lenacapavir-hiv": "lenacapavir",
}


def family(t):
    if t in EXTRA_FAMILY:
        return EXTRA_FAMILY[t]
    if t in K4.FAMILY:
        return K4.FAMILY[t]
    return AL.family(t)


def page_for(idx, topic, ncts):
    """Best-coverage page, same rule the surface gate uses: maximise |ours & page|,
    tie-break on the SMALLEST page. null when no page shares >=2 trials -- which means
    NOT FOUND, not 'no page exists'."""
    mine = set(ncts)
    cand = [(len(mine & set(n)), -len(n), f) for f, n in idx["pages"].items()
            if len(mine & set(n)) >= 2]
    if not cand:
        return None
    cand.sort(reverse=True)
    return cand[0][2]


def fetch_dois(pmids):
    """One efetch, article-own DOI only. Never a reference's."""
    import xml.etree.ElementTree as ET
    from urllib.request import Request, urlopen
    from urllib.parse import quote
    out = {}
    for i in range(0, len(pmids), 100):
        chunk = pmids[i:i + 100]
        u = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
             "?db=pubmed&retmode=xml&id=%s" % quote(",".join(chunk)))
        b = urlopen(Request(u, headers={"User-Agent": "allmeta-opencomp/1.0"}),
                    timeout=180).read()
        for art in ET.fromstring(b).iter("PubmedArticle"):
            pid = (art.findtext(".//PMID") or "").strip()
            doi = None
            for el in art.findall(".//Article/ELocationID"):
                if el.get("EIdType") == "doi" and (el.text or "").strip():
                    doi = el.text.strip()
                    break
            if not doi:
                for aid in art.findall("PubmedData/ArticleIdList/ArticleId"):
                    if aid.get("IdType") == "doi":
                        doi = (aid.text or "").strip()
                        break
            out[pid] = doi
    return out


def main(out_path):
    idx = json.load(io.open(IDX, encoding="utf-8"))
    enum = json.load(io.open(ENUM, encoding="utf-8"))
    by_obj = {(t.get("app_id") or t.get("dir")): t for t in enum["topics"]}

    rows, topics_seen, comps, pairs = [], {}, set(), 0
    for frame_label, fn in FRAMES:
        for line in io.open(os.path.join(PEND, fn), encoding="utf-8"):
            r = json.loads(line)
            if not r.get("eligible_comparator"):
                continue
            for t in r["matched_topics"]:
                d = r["overlap_detail"][t]
                keys = {x: d["key_used"][x] for x in d["overlap"]}
                hard = [k for k in keys.values() if k in RULED]
                if not (len(hard) >= 2 and len(hard) / float(d["k"]) >= 0.5):
                    continue
                pairs += 1
                comps.add(r["pmid"])
                ncts = [x[0] for x in
                        (O.OUR_TRIALS.get(t) or I2.TRIALS24.get(t) or [])] or \
                       [x.get("nct") for x in (by_obj.get(t, {}).get("trials") or [])
                        if x.get("nct")]
                if t not in topics_seen:
                    topics_seen[t] = {"topic": t, "family": family(t),
                                      "k": d["k"],
                                      "our_page_filename": page_for(idx, t, ncts),
                                      "our_trials": sorted(set(ncts))}
                rows.append({
                    "our_topic": t,
                    "our_page_filename": topics_seen[t]["our_page_filename"],
                    "drug_family": family(t),
                    "comparator_pmid": r["pmid"],
                    "comparator_doi": None,   # filled below by direct lookup
                    "comparator_journal": r.get("journal"),
                    "comparator_year": r.get("year"),
                    "comparator_title": r.get("title"),
                    "prospero_ids": r.get("prospero_ids"),
                    "frame": frame_label,
                    "our_k": d["k"],
                    "overlap_n": len(d["overlap"]),
                    "overlap_fraction": d["frac"],
                    "join_key_per_trial": keys,
                    "ruled_join_keys_that_qualified": sorted(set(hard)),
                    "all_keys_present_including_non_ruled":
                        sorted(set(keys.values())),
                    "_keys_note":
                        "The pair qualifies on ruled_join_keys_that_qualified ALONE "
                        "(>=2 trials, >=50% of k). all_keys_present may additionally list "
                        "'acronym' for a further trial; the acronym key is NOT ruled and "
                        "carries no weight in whether this pair counts.",
                })

    # ---- disposition of all 155 objects -------------------------------------
    f13 = sorted(set(O.TOPICS) | set(I2.TOPICS24) | set(K4.SEEDS))
    f4 = sorted(AL.S)
    excl = sorted(AL.EXCLUDED)
    klt2 = sorted(n for n, t in by_obj.items()
                  if (t.get("k") or 0) < 2 and n not in f13 and n not in f4
                  and n not in excl)
    disp_sum = len(f13) + len(f4) + len(excl) + len(klt2)

    out = {
        "_what_this_is":
            "The 20 open-access comparators and the 14 independent topics behind them, "
            "plus the disposition of all 155 corpus topic objects. Published as a TRACKED "
            "FILE ON origin/main because an artefact another lane cannot fetch is, for "
            "their purposes, an artefact that does not exist.",
        "_published": "2026-09-01",
        "_selection_rule": "oa68k/OPEN-COMPARATOR-PROTOCOL.md in the allmeta repo, frozen "
                           "at commit fe1f2fd BEFORE the first comparator was retrieved "
                           "and never amended. Join ruled at nct_pmid.",
        "_join": "RULED = nct_pmid. A pair counts iff, restricting to join keys {nct, "
                 "cited_pmid}, >=2 of our trials are identified AND that is >=50% of our "
                 "k. The frozen join would additionally admit a trial ACRONYM, which was "
                 "measured to find MENTIONS rather than INCLUSIONS and was ruled out.",
        "_headline": {
            "comparators_distinct": len(comps),
            "independent_topics": len(topics_seen),
            "drug_families": len(sorted({v["family"] for v in topics_seen.values()})),
            "paper_topic_pairs": pairs,
            "candidates_screened": 6182, "retrieved": 1105, "examined": 442,
        },
        "_read_the_pair_count_carefully":
            "%d comparators produce %d pairs. Summing the four frames gives 21 distinct "
            "comparators; the UNION is 20, because one comparator is eligible in two "
            "frames. THE SUM IS THE WRONG NUMBER. PMID 40998847 alone accounts for three "
            "pairs across three ablation topics -- one paper, ONE DRUG FAMILY, closer to "
            "one demonstration than three." % (len(comps), pairs),
        "_page_filename_null_means":
            "NOT FOUND by the best-coverage page rule (no rendered page shares >=2 of that "
            "topic's trials). It does NOT mean no page exists.",
        "_families": sorted({v["family"] for v in topics_seen.values()}),
        "topics": [topics_seen[t] for t in sorted(topics_seen)],
        "comparators": sorted(rows, key=lambda x: (x["our_topic"], x["comparator_pmid"])),
        "disposition_of_all_155_objects": {
            "framed_in_frames_1_3": {"n": len(f13), "topics": f13},
            "framed_in_frame_4": {"n": len(f4), "topics": f4},
            "excluded_on_their_own_declaration": {"n": len(excl), "detail": AL.EXCLUDED},
            "k_lt_2_arithmetically_impossible": {
                "n": len(klt2),
                "why": "the frozen match rule needs >=2 overlapping trials, so a topic "
                       "with fewer than 2 registrations can never be matched by any "
                       "comparator",
                "topics": klt2},
            "sum": disp_sum,
        },
    }
    if disp_sum != 155:
        raise SystemExit("REFUSING: disposition sums to %d, not 155" % disp_sum)
    # ---- CORRECT DOIs, fetched directly: the frames' doi field is known-wrong ----
    pmids = sorted({r["comparator_pmid"] for r in rows})
    dois = fetch_dois(pmids)
    for r in rows:
        r["comparator_doi"] = dois.get(r["comparator_pmid"])
    out["_doi_provenance"] = (
        "DOIs here are fetched DIRECTLY per PMID from the article's own ELocationID / "
        "PubmedData ArticleIdList. The frame files' `doi` field is KNOWN WRONG for records "
        "whose reference lists carry DOIs: the extractor walked .//ArticleId, which reaches "
        "into ReferenceList, and kept the last match -- so it returned a CITED PAPER's DOI. "
        "Found while checking this manifest; no criterion reads doi, so eligibility is "
        "unaffected. opencomp.py is fixed for future runs.")
    out["_doi_resolved"] = sum(1 for r in rows if r["comparator_doi"])
    out["_doi_unresolved"] = sum(1 for r in rows if not r["comparator_doi"])
    txt = json.dumps(out, ensure_ascii=False, indent=1)
    d = os.path.dirname(out_path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    io.open(out_path, "w", encoding="utf-8", newline="\n").write(txt)
    n = os.path.getsize(out_path)
    if n == 0:
        raise SystemExit("REFUSING: wrote 0 bytes")
    print("wrote %s (%d bytes)" % (out_path, n))
    print("  comparators %d | topics %d | families %d | pairs %d"
          % (len(comps), len(topics_seen), len(out["_families"]), pairs))
    print("  disposition %d + %d + %d + %d = %d"
          % (len(f13), len(f4), len(excl), len(klt2), disp_sum))
    miss = [t for t, v in topics_seen.items() if not v["our_page_filename"]]
    print("  topics with NO page found: %d %s" % (len(miss), miss))


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main(sys.argv[1] if len(sys.argv) > 1
         else os.path.join(PEND, "TWENTY_COMPARATORS.json"))
