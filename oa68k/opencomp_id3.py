# -*- coding: utf-8 -*-
"""ID frame, 24 topics, with OUR OWN key table completed: NCT + cited-PMID.

⛔ THE CRITERION IS NOT TOUCHED. `opencomp.py` is imported byte-for-byte; its sha256 is
recorded in the frame provenance. The ruled `nct_pmid` join ALREADY ADMITS `cited_pmid`
(protocol section 5.3) -- we had simply never populated that field for infectious disease.

⭐ WHY FILLING IT NOW IS NOT POST-HOC. The gap was declared IN ADVANCE, in
OPEN-COMPARATOR-ID-ADDENDUM.md, frozen at 7ad2538 BEFORE the first ID frame ran:
    "our ID trial names are descriptive and the SSOT holds no PMIDs, so matching rests on
     NCT identifiers ALONE ... that deficiency is in OUR key table, not in the comparator."
This executes that stated remedy. It does not relax a threshold, reopen the join, or change
what counts as a match -- it supplies a key the frozen rule already names.

⛔ THE ENRICHMENT IS MECHANICAL AND UNCURATED. For each of our trial registrations, PubMed
is asked one frozen query; every returned PMID is recorded; the FIRST is taken as the
trial's report. No PMID is chosen by looking at whether it produces a match, and the full
returned list is written to disk so the choice is auditable.

Free sources only: PubMed E-utilities.

Usage: python opencomp_id3.py
"""
import hashlib
import io
import json
import os
import sys
import time
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O  # noqa: E402
import opencomp_id2 as I2  # noqa: E402

CACHE = os.path.join(O.OUTDIR, "id_trial_pmids.json")
QUERY = '"%s"[Secondary Source ID] OR "%s"[All Fields]'


def enrich(log=print):
    """One frozen query per registration. Every hit recorded; the first taken."""
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 0:
        d = json.load(io.open(CACHE, encoding="utf-8"))
        log("  enrichment cache: %d registrations" % len(d["by_nct"]))
        return d
    ncts = sorted({n for v in I2.TRIALS24.values() for (n, _a, _p) in v})
    by = {}
    for i, n in enumerate(ncts):
        q = QUERY % (n, n)
        st, body = O._get("%s/esearch.fcgi?db=pubmed&retmode=json&retmax=20&term=%s"
                          % (O.EUTILS, quote(q)))
        ids = []
        if st == 200:
            try:
                ids = json.loads(body.decode("utf-8"))["esearchresult"].get("idlist", [])
            except Exception as e:
                log("  %s json error %s" % (n, e))
        by[n] = {"query": q, "n_hits": len(ids), "pmids": ids,
                 "chosen": (ids[0] if ids else None),
                 "chosen_rule": "first PMID returned by the frozen query; NOT selected by "
                                "whether it produces a match"}
        if (i + 1) % 10 == 0 or i + 1 == len(ncts):
            log("  enriched %d/%d  with>=1 pmid %d"
                % (i + 1, len(ncts), sum(1 for v in by.values() if v["chosen"])))
        time.sleep(0.34)
    d = {"built": "2026-08-31", "source": "PubMed E-utilities esearch, free",
         "query_form": QUERY,
         "uncurated": "Every returned PMID is recorded. The FIRST is taken. No PMID was "
                      "chosen by looking at whether it produces a match.",
         "n_registrations": len(ncts), "by_nct": by}
    O.write_verified = getattr(O, "write_verified", None)
    with io.open(CACHE, "w", encoding="utf-8") as f:
        f.write(json.dumps(d, ensure_ascii=False, indent=1))
    if os.path.getsize(CACHE) == 0:
        raise SystemExit("REFUSING: enrichment cache is 0 bytes")
    return d


def main():
    print("specialty      : infectious disease, 24 topics, key table COMPLETED")
    d = enrich()
    by = d["by_nct"]
    filled = {t: [(n, a, (by.get(n) or {}).get("chosen")) for (n, a, _p) in v]
              for t, v in I2.TRIALS24.items()}
    n_tot = sum(len(v) for v in filled.values())
    n_pmid = sum(1 for v in filled.values() for (_n, _a, p) in v if p)
    print("")
    print("KEY TABLE, BEFORE -> AFTER (this is the only thing that changed)")
    print("  registrations                : %d" % n_tot)
    print("  with acronym  before -> after: 0 -> 0   (unchanged; the ruled join ignores acronyms)")
    print("  with PMID     before -> after: 0 -> %d" % n_pmid)
    print("  registrations still keyless  : %d" % (n_tot - n_pmid))
    print("")
    print("SEED TABLE -- seed printed with the topic, before any count exists")
    for t in sorted(I2.TOPICS24):
        pm = sum(1 for (_n, _a, p) in filled[t] if p)
        print("  %-40s k=%d pmids=%d  iv=%s"
              % (t, len(filled[t]), pm, " | ".join(I2.TOPICS24[t]["iv"])[:56]))
    print("")
    builder_sha = hashlib.sha256(io.open(O.__file__, "rb").read()).hexdigest()
    O.TOPICS = I2.TOPICS24
    O.OUR_TRIALS = filled
    O.OUT = os.path.join(O.OUTDIR, "opencomp_frame_id24pmid.jsonl")
    O.PROTOCOL = ("oa68k/OPEN-COMPARATOR-PROTOCOL.md (criteria UNCHANGED, fe1f2fd); key "
                  "table completed with cited-PMIDs per the gap declared in "
                  "OPEN-COMPARATOR-ID-ADDENDUM.md at 7ad2538 BEFORE the first ID frame "
                  "ran; enrichment mechanical and uncurated, see id_trial_pmids.json; "
                  "builder opencomp.py sha256 " + builder_sha)
    print("builder sha256 : %s  (UNEDITED for this run)" % builder_sha)
    print("criteria       : MIN_OVERLAP_N=%d MIN_OVERLAP_FRAC=%.2f -- imported, not set here"
          % (O.MIN_OVERLAP_N, O.MIN_OVERLAP_FRAC))
    print("")
    O.build()


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
