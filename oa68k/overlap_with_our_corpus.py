# -*- coding: utf-8 -*-
"""Does a topic in OUR store address the same PICO as a candidate from the 40-paper list?

⛔ MATCHED ON THE DECLARED QUESTION, NEVER ON THE KEY. A name is not an identity -- that rule
arrived three times in one night in three costumes, and `ICAGEN_AUTO_FULL` turned out to be
an edoxaban review. Every proposed match therefore prints OUR TOPIC'S DECLARED QUESTION
VERBATIM so a human confirms the PICO rather than trusting my keyword.

⛔ THE MATCH IS A SHORTLIST, NOT AN IDENTITY. It is the Stage-A half of our frozen matcher
and it licenses nothing on its own: treating a shortlist as a match is what once paired a
malaria ACT review with a folic-acid one.

⛔ THE CANDIDATE CONCEPT TERMS BELOW ARE `CLAIMED`. They are derived from a prose DESCRIPTION
of the candidate list, not from any paper -- no title, journal, year or DOI has been supplied
for candidates 2-40, so none of them has been resolved. A candidate row here is a QUERY, not
a verified paper.

⭐ WHY THIS RANKS FIRST: a candidate matching a topic we already hold is a comparator for a
page that EXISTS -- exactly the resource our own retrieval exhausted at ten of.

Usage: python overlap_with_our_corpus.py [out.json]
"""
import io
import json
import os
import re
import sys

SSOT = r"F:\claude-temp\wt\rob-lane\ssot"

# (candidate id, what the list CLAIMS it is, intervention concepts, population concepts)
CANDIDATES = [
    ("#31", "EPA vs EPA+DHA omega-3; own comparison P=.128 while advocating EPA",
     ["icosapent", "eicosapentaenoic", "\\bEPA\\b", "omega-3", "\\bDHA\\b", "fish oil"],
     ["cardiovascular", "triglycerid", "lipid"]),
    ("#32", "SGLT2 inhibitors in transthyretin cardiac amyloidosis",
     ["sglt2", "sodium-glucose", "dapagliflozin", "empagliflozin"],
     ["amyloid", "transthyretin", "\\bATTR\\b"]),
    ("#33", "antiplatelet therapy in stable / chronic coronary disease",
     ["antiplatelet", "aspirin", "clopidogrel", "ticagrelor", "prasugrel"],
     ["stable coronary", "chronic coronary", "coronary artery disease",
      "acute coronary"]),
    ("#34", "coronary stent strategies, network meta-analysis",
     ["stent", "drug-eluting", "bare-metal", "\\bPCI\\b",
      "percutaneous coronary intervention"],
     ["coronary"]),
    ("#35", "pooled sensitivity/specificity across ML models and thresholds",
     ["machine learning", "deep learning", "artificial intelligence", "algorithm"],
     ["sensitivity", "specificity", "diagnostic accuracy"]),
    ("#37", "inclisiran and LDL cholesterol",
     ["inclisiran"], ["LDL", "low-density lipoprotein", "cholesterol",
                      "hypercholesterol"]),
    ("#38", "study-level meta-regression read as patient-level", ["meta-regression"],
     []),
    ("#40", "pooled proportions with definitional heterogeneity (adherence)",
     ["adherence", "persistence", "compliance"], []),
    # --- infectious-disease batch. NAMESPACED ID#n because this batch renumbers from 1 and
    # collides with the first list: "#1" would otherwise denote two different papers.
    ("ID#1", "influenza antivirals; source-data error, CAPSTONE-2 hospitalisations",
     ["baloxavir", "oseltamivir", "zanamivir", "antiviral"], ["influenza"]),
    ("ID#2", "triple-dose rifampin TB; own sensitivity analyses overturn the headline",
     ["rifampi", "rifampin"], ["tuberculosis", "\bTB\b"]),
    ("ID#6", "high-dose rifampicin NMA; nodes by rifampicin vs by drug combination",
     ["rifampi", "rifampin"], ["tuberculosis", "\bTB\b"]),
    ("ID#7", "corticosteroids in HIV-associated TB",
     ["corticosteroid", "dexamethasone", "prednisolone", "steroid"],
     ["tuberculosis", "\bTB\b", "\bHIV\b"]),
    ("ID#10", "ceftolozane/tazobactam vs ceftazidime-avibactam, MDR Pseudomonas",
     ["ceftolozane", "tazobactam", "ceftazidime", "avibactam"],
     ["Pseudomonas", "infection", "intra-abdominal", "urinary"]),
    ("ID#9", "PCP treatment network meta-analysis",
     ["trimethoprim", "sulfamethoxazole", "pentamidine", "atovaquone"],
     ["pneumocystis", "\bPCP\b"]),
]


def load_store():
    out = []
    for d in sorted(os.listdir(SSOT)):
        f = os.path.join(SSOT, d, d + ".json")
        if not os.path.isfile(f):
            continue
        j = json.load(io.open(f, encoding="utf-8"))
        q = j.get("question")
        q = q if isinstance(q, str) else json.dumps(q, ensure_ascii=False) if q else None
        t = j.get("title")
        t = t if isinstance(t, str) else None
        ncts = sorted({x.get("nct") for x in ((j.get("inputs") or {}).get("trials") or [])
                       if x.get("nct")})
        live = 0
        r = (j.get("results") or {}).get("by_outcome") or {}
        for o in (r.values() if isinstance(r, dict) else r):
            if isinstance(o, dict):
                p = o.get("pooled") or {}
                if isinstance(p, dict) and p.get("point") is not None \
                        and not p.get("withdrawn"):
                    live += 1
        out.append({"topic": d, "title": t, "question": q, "k": len(ncts),
                    "live_pooled_outcomes": live})
    return out


def hits(pats, text):
    if not pats:
        return []
    return sorted({p for p in pats if re.search(p, text or "", re.I)})


def main(out_path):
    store = load_store()
    rows = []
    for cid, claim, ivs, pops in CANDIDATES:
        matches = []
        for s in store:
            hay = " ".join(x for x in (s["title"], s["question"], s["topic"]) if x)
            iv_hit = hits(ivs, hay)
            pop_hit = hits(pops, hay) if pops else ["(no population term required)"]
            if iv_hit and pop_hit:
                matches.append({
                    "our_topic_key": s["topic"],
                    "our_declared_question_VERBATIM": (s["question"] or
                                                       "(no question field on the object)"),
                    "our_title": s["title"],
                    "k": s["k"], "live_pooled_outcomes": s["live_pooled_outcomes"],
                    "hostable_now": s["live_pooled_outcomes"] > 0 and s["k"] >= 2,
                    "intervention_terms_hit": iv_hit,
                    "population_terms_hit": pop_hit,
                })
        matches.sort(key=lambda m: (not m["hostable_now"], -m["k"]))
        rows.append({
            "candidate": cid,
            "what_the_list_CLAIMS_it_is": {"value": claim, "grade": "CLAIMED"},
            "paper_resolved": {"value": False, "grade": "MEASURED",
                               "why": "no title, journal, year or DOI was supplied for "
                                      "this candidate; nothing has been resolved"},
            "n_shortlisted_store_topics": len(matches),
            "shortlisted": matches[:6],
            "⛔_status": "SHORTLIST ONLY -- read our declared question above and confirm the "
                        "PICO by hand. This licenses nothing.",
        })

    live = sum(1 for s in store if s["live_pooled_outcomes"] > 0)
    out = {
        "_what_this_is": "Overlap between a described 40-candidate list and OUR store, "
                         "matched on the DECLARED QUESTION rather than the topic key.",
        "_generated": "2026-09-02",
        "⛔_every_candidate_is_CLAIMED": "No candidate has been resolved: titles, journals, "
                                        "years and DOIs were never supplied for #2-#40. "
                                        "Each candidate row is a QUERY, not a paper.",
        "⛔_matching_is_a_shortlist": "This is the Stage-A half of our frozen matcher. A "
                                     "shortlist licenses nothing; the confirmed match in "
                                     "our protocol requires trial-identifier overlap from "
                                     "the comparator's own retrieved full text.",
        "⛔_a_name_is_not_an_identity": "Matched on title+question+key TOGETHER and the "
                                       "declared question is printed verbatim for every "
                                       "proposed match, because ICAGEN_AUTO_FULL turned "
                                       "out to be an edoxaban review.",
        "store_topics": len(store),
        "store_topics_with_a_live_pooled_estimate": live,
        "_hostable_now_means": "the store topic has k>=2 AND at least one live pooled "
                               "estimate, so it could host a comparison today. Topics "
                               "without one cannot, at any comparator quality.",
        "candidates": rows,
    }
    txt = json.dumps(out, ensure_ascii=False, indent=1)
    io.open(out_path, "w", encoding="utf-8", newline="\n").write(txt)
    if os.path.getsize(out_path) == 0:
        raise SystemExit("REFUSING: wrote 0 bytes")
    print("wrote %s (%d bytes)" % (out_path, os.path.getsize(out_path)))
    print("store topics %d, of which live %d" % (len(store), live))
    print("")
    for r in rows:
        print("%-5s %-58s shortlisted=%d" % (r["candidate"],
                                             r["what_the_list_CLAIMS_it_is"]["value"][:58],
                                             r["n_shortlisted_store_topics"]))
        for m in r["shortlisted"][:3]:
            print("        %-42s k=%-3d live=%-2d hostable=%s"
                  % (m["our_topic_key"][:42], m["k"], m["live_pooled_outcomes"],
                     m["hostable_now"]))
    return out


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main(sys.argv[1] if len(sys.argv) > 1
         else r"F:\claude-temp\pend\OVERLAP_WITH_OUR_CORPUS.json")
